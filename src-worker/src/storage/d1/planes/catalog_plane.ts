import {
  CatalogSearchRequestSchema,
  encodeCatalogCursor,
  encodeCatalogDeltaCursor,
  decodeCatalogCursor,
  type CatalogCursor,
  type CatalogDelta,
  type CatalogDeltaCursor,
  type CatalogListingSource,
  type CatalogPackage,
  type CatalogRelation,
  type CatalogSearchRequest,
  type CatalogSearchResponse,
  type ContentRating,
  type VerificationStatus
} from "vrc-packages-api";
import type { Platform } from "vrc-packages-network/node";
import { cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import {
  normalizeQualityFlags,
  normalizeTags
} from "../../../domain/classification/taxonomy.ts";
import type {
  CanonicalLifecycle,
  CanonicalUmbrella,
  EvidenceKind,
  LinkReviewState,
  ListingRelation,
  ListingSource
} from "../definitions.ts";
import { D1PlaneContext } from "./shared_context.ts";

interface CatalogPackageDbRow {
  canonical_id: string;
  umbrella: CanonicalUmbrella;
  category: string;
  lifecycle: CanonicalLifecycle;
  tombstone_reason: string | null;
  display_name: string;
  owner_key: string | null;
  owner_name: string | null;
  verification_status: VerificationStatus;
  verified_by_app_id: string | null;
  vpm_id: string | null;
  vpm_latest_version: string | null;
  vpm_repo_url: string | null;
  summary: string | null;
  tags_json: string;
  quality_flags_json: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  timestamp_confidence: CatalogPackage["timestampConfidence"] | null;
  content_rating: ContentRating | null;
}

const CATALOG_PACKAGE_SELECT_COLS = `
  p.canonical_id, p.umbrella, p.category, p.lifecycle, p.tombstone_reason,
  p.display_name, p.owner_key, p.owner_name, p.verification_status, p.verified_by_app_id,
  p.vpm_id, p.vpm_latest_version, p.vpm_repo_url,
  p.summary, p.tags_json, p.quality_flags_json,
  p.created_at, p.updated_at, p.published_at, p.timestamp_confidence, p.content_rating
`;

export class CatalogPlane {
  constructor(private readonly ctx: D1PlaneContext) {}

  async getCatalogEpoch(): Promise<string> {
    const row = await this.ctx.db
      .prepare("SELECT value FROM coordinator_meta WHERE key = 'catalog_epoch'")
      .first<{ value: string }>();
    if (row) return row.value;
    const initial = "epoch-d1-" + crypto.randomUUID();
    await this.ctx.db
      .prepare("INSERT OR IGNORE INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?)")
      .bind(initial)
      .run();
    const stored = await this.ctx.db
      .prepare("SELECT value FROM coordinator_meta WHERE key = 'catalog_epoch'")
      .first<{ value: string }>();
    if (!stored) throw new Error("Catalog epoch initialization failed");
    return stored.value;
  }

  async resetCatalogEpoch(): Promise<string> {
    const next = "epoch-d1-" + crypto.randomUUID();
    await this.ctx.db
      .prepare(
        "INSERT INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .bind(next)
      .run();
    return next;
  }

  private parseJsonArray(raw: string): string[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  private parsePublishClasses(raw: string | null): { allowsFacts: boolean; allowsProse: boolean } {
    if (raw === null || raw === undefined) {
      return { allowsFacts: true, allowsProse: true };
    }
    const classes = this.parseJsonArray(raw);
    return {
      allowsFacts: classes.includes("normalized_facts"),
      allowsProse: classes.includes("creator_prose")
    };
  }

  async buildCatalogPackagesBatch(pkgRows: CatalogPackageDbRow[]): Promise<CatalogPackage[]> {
    if (pkgRows.length === 0) return [];
    const canonicalIds = pkgRows.map((row) => row.canonical_id);
    const placeholders = canonicalIds.map(() => "?").join(",");

    const [sourcesRes, relationsRes] = await Promise.all([
      this.ctx.db
        .prepare(
          `SELECT ls.source_link_id, ls.canonical_id, ls.source_key, ls.platform, ls.storefront_url,
                  ls.evidence_kind, ls.confidence, ls.review_state, ls.price, ls.currency,
                  ls.availability, ls.observed_at, ls.reviewed_at, sp.publish_classes_json
           FROM listing_sources ls
           LEFT JOIN source_items si ON si.source_key = ls.source_key
           LEFT JOIN steering_profiles sp ON sp.profile_id = si.steering_profile_id
           WHERE ls.canonical_id IN (${placeholders}) AND ls.review_state = 'accepted'
           ORDER BY ls.observed_at ASC, ls.source_link_id ASC`
        )
        .bind(...canonicalIds)
        .all<{
          source_link_id: string;
          canonical_id: string;
          source_key: string;
          platform: Platform;
          storefront_url: string;
          evidence_kind: EvidenceKind;
          confidence: number;
          review_state: LinkReviewState;
          price: number | null;
          currency: string | null;
          availability: "available" | "delisted" | "unknown";
          observed_at: string;
          reviewed_at: string | null;
          publish_classes_json: string | null;
        }>(),
      this.ctx.db
        .prepare(
          `SELECT relation_id, source_canonical_id, target_canonical_id, target_avatar_base,
                  relation_type, scope, confidence, evidence_source, feedback_up_count, feedback_down_count
           FROM listing_relations
           WHERE source_canonical_id IN (${placeholders})
           ORDER BY created_at ASC, relation_id ASC`
        )
        .bind(...canonicalIds)
        .all<{
          relation_id: string;
          source_canonical_id: string;
          target_canonical_id: string | null;
          target_avatar_base: string | null;
          relation_type: CatalogRelation["relationType"];
          scope: CatalogRelation["scope"];
          confidence: number;
          evidence_source: string;
          feedback_up_count: number;
          feedback_down_count: number;
        }>()
    ]);

    const sourcesByCanonical = new Map<string, CatalogListingSource[]>();
    const canonicalHasAnyAcceptedSource = new Set<string>();
    const canonicalHasPublishableSource = new Set<string>();
    const canonicalAllowsProse = new Set<string>();

    for (const row of sourcesRes.results || []) {
      canonicalHasAnyAcceptedSource.add(row.canonical_id);
      const { allowsFacts, allowsProse } = this.parsePublishClasses(row.publish_classes_json);
      if (!allowsFacts) continue;

      canonicalHasPublishableSource.add(row.canonical_id);
      if (allowsProse) {
        canonicalAllowsProse.add(row.canonical_id);
      }

      const list = sourcesByCanonical.get(row.canonical_id) || [];
      list.push({
        sourceLinkId: row.source_link_id,
        sourceKey: row.source_key,
        platform: row.platform,
        storefrontUrl: row.storefront_url,
        evidenceKind: row.evidence_kind,
        confidence: row.confidence,
        reviewState: row.review_state,
        price: row.price,
        currency: row.currency,
        availability: row.availability,
        observedAt: row.observed_at,
        reviewedAt: row.reviewed_at
      });
      sourcesByCanonical.set(row.canonical_id, list);
    }

    const relationsByCanonical = new Map<string, CatalogRelation[]>();
    for (const rel of relationsRes.results || []) {
      const list = relationsByCanonical.get(rel.source_canonical_id) || [];
      list.push({
        relationId: rel.relation_id,
        sourceCanonicalId: rel.source_canonical_id,
        targetCanonicalId: rel.target_canonical_id,
        targetAvatarBase: rel.target_avatar_base,
        relationType: rel.relation_type,
        scope: rel.scope,
        confidence: rel.confidence,
        evidenceSource: rel.evidence_source,
        feedbackUpCount: rel.feedback_up_count ?? 0,
        feedbackDownCount: rel.feedback_down_count ?? 0
      });
      relationsByCanonical.set(rel.source_canonical_id, list);
    }

    return pkgRows
      .filter(
        (pkg) =>
          !canonicalHasAnyAcceptedSource.has(pkg.canonical_id) ||
          canonicalHasPublishableSource.has(pkg.canonical_id)
      )
      .map((pkg) => {
        const allowSummary =
          !canonicalHasAnyAcceptedSource.has(pkg.canonical_id) ||
          canonicalAllowsProse.has(pkg.canonical_id);
        return {
          canonicalId: pkg.canonical_id,
          umbrella: pkg.umbrella,
          category: pkg.category,
          lifecycle: pkg.lifecycle,
          displayName: pkg.display_name,
          ownerKey: pkg.owner_key ?? null,
          ownerName: pkg.owner_name ?? null,
          verificationStatus: pkg.verification_status ?? "unverified",
          verifiedByAppId: pkg.verified_by_app_id ?? null,
          vpmId: pkg.vpm_id,
          vpmLatestVersion: pkg.vpm_latest_version ?? null,
          vpmRepoUrl: pkg.vpm_repo_url ?? null,
          summary: allowSummary ? (pkg.summary ?? null) : null,
          tags: normalizeTags(this.parseJsonArray(pkg.tags_json)),
          qualityFlags: normalizeQualityFlags(this.parseJsonArray(pkg.quality_flags_json)),
          createdAt: pkg.created_at,
          updatedAt: pkg.updated_at,
          publishedAt: pkg.published_at ?? null,
          timestampConfidence: pkg.timestamp_confidence ?? null,
          contentRating: pkg.content_rating || "general",
          sources: sourcesByCanonical.get(pkg.canonical_id) || [],
          relations: relationsByCanonical.get(pkg.canonical_id) || []
        };
      });
  }

  async listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options: { includeAllRatings?: boolean } = {}
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Catalog limit must be 1..100");
    const conditions: string[] = ["p.content_rating != 'prohibited'", "p.lifecycle != 'deleted'"];
    const params: (string | number)[] = [];
    if (!options.includeAllRatings) {
      conditions.push("p.content_rating = 'general'");
      conditions.push("p.lifecycle != 'delisted'");
    }
    if (cursor) {
      conditions.push("(p.created_at, p.canonical_id) < (?, ?)");
      params.push(cursor.createdAt, cursor.canonicalId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    params.push(limit + 1);

    const pkgRes = await this.ctx.db
      .prepare(
        `SELECT ${CATALOG_PACKAGE_SELECT_COLS}
         FROM canonical_packages p
         ${where}
         ORDER BY p.created_at DESC, p.canonical_id DESC
         LIMIT ?`
      )
      .bind(...params)
      .all<CatalogPackageDbRow>();

    const pkgRows = pkgRes.results || [];
    const visible = pkgRows.slice(0, limit);
    const last = visible.at(-1);
    const packages = await this.buildCatalogPackagesBatch(visible);

    return {
      packages,
      nextCursor:
        pkgRows.length > limit && last
          ? encodeCatalogCursor({ createdAt: last.created_at, canonicalId: last.canonical_id })
          : null
    };
  }

  async listCatalogDeltasPage(
    limit: number,
    cursor: CatalogDeltaCursor | null
  ): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Catalog limit must be 1..100");
    const epoch = await this.getCatalogEpoch();
    const conditions: string[] = [
      "(p.content_rating = 'general' OR p.tombstone_reason = 'rating_withdrawn')"
    ];
    const params: (string | number)[] = [];
    if (cursor) {
      conditions.push("(p.updated_at, p.canonical_id) > (?, ?)");
      params.push(cursor.updatedAt, cursor.canonicalId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT ${CATALOG_PACKAGE_SELECT_COLS}
         FROM canonical_packages p
         ${where}
         ORDER BY p.updated_at ASC, p.canonical_id ASC
         LIMIT ?`
      )
      .bind(...params)
      .all<CatalogPackageDbRow>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const upsertCandidates = visible.filter(
      (row) =>
        row.content_rating === "general" &&
        row.lifecycle !== "delisted" &&
        row.lifecycle !== "deleted" &&
        row.tombstone_reason === null
    );
    const builtPackages = await this.buildCatalogPackagesBatch(upsertCandidates);
    const packageMap = new Map(builtPackages.map((pkg) => [pkg.canonicalId, pkg]));

    const deltas: CatalogDelta[] = [];
    for (const row of visible) {
      const isTombstone =
        row.lifecycle === "delisted" ||
        row.lifecycle === "deleted" ||
        row.tombstone_reason !== null ||
        row.content_rating !== "general";
      if (isTombstone) {
        deltas.push({
          action: "delist",
          canonicalId: row.canonical_id,
          updatedAt: row.updated_at
        });
        continue;
      }

      const built = packageMap.get(row.canonical_id);
      if (built) {
        deltas.push({
          action: "upsert",
          canonicalId: row.canonical_id,
          updatedAt: row.updated_at,
          package: built
        });
      } else {
        deltas.push({
          action: "delist",
          canonicalId: row.canonical_id,
          updatedAt: row.updated_at
        });
      }
    }

    return {
      epoch,
      deltas,
      nextCursor:
        rows.length > limit && last
          ? encodeCatalogDeltaCursor({ updatedAt: last.updated_at, canonicalId: last.canonical_id })
          : null
    };
  }

  async searchCatalogPackages(
    input: CatalogSearchRequest,
    options: { isAgeVerified?: boolean } = {}
  ): Promise<CatalogSearchResponse> {
    const parsed = CatalogSearchRequestSchema.parse(input);
    const limit = Math.min(Math.max(parsed.limit ?? 50, 1), 100);
    const conditions = ["p.lifecycle NOT IN ('delisted', 'deleted')"];
    const params: (string | number)[] = [];

    if (!options.isAgeVerified) {
      conditions.push("p.content_rating = 'general'");
    } else {
      conditions.push("p.content_rating != 'prohibited'");
      if (parsed.rating) {
        if (parsed.rating === "prohibited") {
          return {
            schemaVersion: 1,
            items: [],
            nextCursor: null,
            totalEstimated: 0
          };
        }
        conditions.push("p.content_rating = ?");
        params.push(parsed.rating);
      }
    }

    if (parsed.umbrella) {
      conditions.push("p.umbrella = ?");
      params.push(parsed.umbrella);
    }
    if (parsed.category) {
      conditions.push("p.category = ?");
      params.push(parsed.category);
    }
    if (parsed.platform) {
      conditions.push(
        "EXISTS (SELECT 1 FROM listing_sources ls WHERE ls.canonical_id = p.canonical_id AND ls.review_state = 'accepted' AND ls.platform = ?)"
      );
      params.push(parsed.platform);
    }
    if (parsed.query && parsed.query.trim()) {
      const term = `%${parsed.query.trim()}%`;
      conditions.push("(p.display_name LIKE ? OR p.category LIKE ? OR p.vpm_id LIKE ? OR p.owner_name LIKE ?)");
      params.push(term, term, term, term);
    }

    if (parsed.tags && parsed.tags.length > 0) {
      for (const tag of parsed.tags) {
        const cleanTag = tag.trim().toLowerCase();
        if (!cleanTag) continue;
        const tagPattern = `%${cleanTag}%`;
        conditions.push(`(
          p.category LIKE ? OR
          p.umbrella = ? OR
          LOWER(p.tags_json) LIKE ? OR
          EXISTS (
            SELECT 1 FROM listing_relations lr
            WHERE lr.source_canonical_id = p.canonical_id
              AND (LOWER(lr.target_avatar_base) LIKE ? OR lr.scope LIKE ?)
          ) OR
          p.display_name LIKE ?
        )`);
        params.push(tagPattern, cleanTag, tagPattern, tagPattern, tagPattern, tagPattern);
      }
    }

    const hasKeywordQuery = Boolean(parsed.query && parsed.query.trim());

    if (parsed.cursor) {
      const decoded = decodeCatalogCursor(parsed.cursor);
      if (decoded) {
        if (!hasKeywordQuery) {
          conditions.push(
            "(COALESCE(p.published_at, p.created_at) < ? OR (COALESCE(p.published_at, p.created_at) = ? AND p.canonical_id < ?))"
          );
          params.push(decoded.createdAt, decoded.createdAt, decoded.canonicalId);
        } else {
          conditions.push("(p.created_at < ? OR (p.created_at = ? AND p.canonical_id < ?))");
          params.push(decoded.createdAt, decoded.createdAt, decoded.canonicalId);
        }
      }
    }

    const whereClause = conditions.join(" AND ");
    const countRes = await this.ctx.db
      .prepare(`SELECT COUNT(*) AS total FROM canonical_packages p WHERE ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();

    const orderClause = hasKeywordQuery
      ? "ORDER BY p.created_at DESC, p.canonical_id DESC"
      : "ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.canonical_id DESC";

    const queryParams = [...params, limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT ${CATALOG_PACKAGE_SELECT_COLS}
         FROM canonical_packages p
         WHERE ${whereClause}
         ${orderClause}
         LIMIT ?`
      )
      .bind(...queryParams)
      .all<CatalogPackageDbRow>();

    const rows = res.results || [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1);

    const items = await this.buildCatalogPackagesBatch(visible);

    const nextCursor =
      hasMore && last
        ? encodeCatalogCursor({
            createdAt: !hasKeywordQuery ? last.published_at || last.created_at : last.created_at,
            canonicalId: last.canonical_id
          })
        : null;

    return {
      schemaVersion: 1,
      items,
      nextCursor,
      totalEstimated: countRes?.total ?? 0
    };
  }

  async upsertSourceItem(item: {
    sourceKey: string;
    platform: Platform;
    sourceUrl: string;
    latestDigest: string;
    payloadJson?: string;
    observedAt?: string;
    complete?: boolean;
    issuesJson?: string;
    steeringProfileId?: string | null;
    goneAt?: string | null;
  }): Promise<void> {
    const observedAt = item.observedAt ?? new Date(this.ctx.now()).toISOString();
    await this.ctx.db
      .prepare(
        `INSERT INTO source_items (
           source_key, platform, source_url, latest_digest, payload_json, observed_at,
           complete, issues_json, steering_profile_id, gone_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_key) DO UPDATE SET
           platform = excluded.platform,
           source_url = excluded.source_url,
           latest_digest = excluded.latest_digest,
           payload_json = excluded.payload_json,
           observed_at = excluded.observed_at,
           complete = excluded.complete,
           issues_json = excluded.issues_json,
           steering_profile_id = COALESCE(excluded.steering_profile_id, source_items.steering_profile_id),
           gone_at = excluded.gone_at`
      )
      .bind(
        item.sourceKey,
        item.platform,
        item.sourceUrl,
        item.latestDigest,
        item.payloadJson ?? "{}",
        observedAt,
        item.complete === false ? 0 : 1,
        item.issuesJson ?? "[]",
        item.steeringProfileId ?? null,
        item.goneAt ?? null
      )
      .run();
  }

  async upsertCanonicalPackage(pkg: {
    canonicalId: string;
    umbrella: CanonicalUmbrella;
    category: string;
    lifecycle: CanonicalLifecycle;
    displayName: string;
    ownerKey?: string | null;
    ownerName?: string | null;
    verificationStatus?: VerificationStatus;
    verifiedByAppId?: string | null;
    vpmId?: string | null;
    vpmLatestVersion?: string | null;
    vpmRepoUrl?: string | null;
    summary?: string | null;
    tags?: string[];
    qualityFlags?: string[];
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string | null;
    timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
    contentRating?: ContentRating | null;
  }): Promise<CatalogPackage> {
    const now = new Date(this.ctx.now()).toISOString();
    const createdAt = pkg.createdAt ?? now;
    const updatedAt = pkg.updatedAt ?? now;
    const publishedAt = pkg.publishedAt ?? null;
    const timestampConfidence = pkg.timestampConfidence ?? (publishedAt ? "confirmed" : null);
    const contentRating = pkg.contentRating ?? "general";

    const existing = await this.ctx.db
      .prepare("SELECT content_rating FROM canonical_packages WHERE canonical_id = ?")
      .bind(pkg.canonicalId)
      .first<{ content_rating: string }>();

    const tombstoneReason =
      existing && existing.content_rating === "general" && contentRating !== "general"
        ? "rating_withdrawn"
        : pkg.lifecycle === "deleted"
          ? "deleted"
          : pkg.lifecycle === "delisted"
            ? "delisted"
            : null;

    await this.ctx.db
      .prepare(
        `INSERT INTO canonical_packages(
           canonical_id, umbrella, category, lifecycle, tombstone_reason,
           display_name, owner_key, owner_name,
           verification_status, verified_by_app_id,
           vpm_id, vpm_latest_version, vpm_repo_url,
           summary, tags_json, quality_flags_json, attributes_json,
           created_at, updated_at, published_at, timestamp_confidence, content_rating
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
         ON CONFLICT(canonical_id) DO UPDATE SET
           umbrella = excluded.umbrella,
           category = excluded.category,
           lifecycle = excluded.lifecycle,
           tombstone_reason = excluded.tombstone_reason,
           display_name = excluded.display_name,
           owner_key = COALESCE(excluded.owner_key, canonical_packages.owner_key),
           owner_name = COALESCE(excluded.owner_name, canonical_packages.owner_name),
           verification_status = COALESCE(excluded.verification_status, canonical_packages.verification_status),
           verified_by_app_id = COALESCE(excluded.verified_by_app_id, canonical_packages.verified_by_app_id),
           vpm_id = COALESCE(excluded.vpm_id, canonical_packages.vpm_id),
           vpm_latest_version = COALESCE(excluded.vpm_latest_version, canonical_packages.vpm_latest_version),
           vpm_repo_url = COALESCE(excluded.vpm_repo_url, canonical_packages.vpm_repo_url),
           summary = COALESCE(excluded.summary, canonical_packages.summary),
           tags_json = CASE WHEN excluded.tags_json != '[]' THEN excluded.tags_json ELSE canonical_packages.tags_json END,
           quality_flags_json = excluded.quality_flags_json,
           updated_at = excluded.updated_at,
           published_at = COALESCE(excluded.published_at, canonical_packages.published_at),
           timestamp_confidence = COALESCE(excluded.timestamp_confidence, canonical_packages.timestamp_confidence),
           content_rating = excluded.content_rating`
      )
      .bind(
        pkg.canonicalId,
        pkg.umbrella,
        pkg.category,
        pkg.lifecycle,
        tombstoneReason,
        pkg.displayName,
        pkg.ownerKey ?? null,
        pkg.ownerName ?? null,
        pkg.verificationStatus ?? "unverified",
        pkg.verifiedByAppId ?? null,
        pkg.vpmId ?? null,
        pkg.vpmLatestVersion ?? null,
        pkg.vpmRepoUrl ?? null,
        pkg.summary ?? null,
        JSON.stringify(normalizeTags(pkg.tags)),
        JSON.stringify(normalizeQualityFlags(pkg.qualityFlags)),
        createdAt,
        updatedAt,
        publishedAt,
        timestampConfidence,
        contentRating
      )
      .run();

    const result = await this.getCanonicalPackage(pkg.canonicalId);
    return result!;
  }

  async getCanonicalPackage(canonicalId: string): Promise<CatalogPackage | null> {
    const row = await this.ctx.db
      .prepare(`SELECT ${CATALOG_PACKAGE_SELECT_COLS} FROM canonical_packages p WHERE p.canonical_id = ?`)
      .bind(canonicalId)
      .first<CatalogPackageDbRow>();
    if (!row) return null;
    const built = await this.buildCatalogPackagesBatch([row]);
    return built[0] ?? null;
  }

  async deleteCanonicalPackage(canonicalId: string, actor = "operator-api", reason = "Package deleted"): Promise<boolean> {
    const existing = await this.ctx.db
      .prepare("SELECT canonical_id, content_rating, lifecycle FROM canonical_packages WHERE canonical_id = ?")
      .bind(canonicalId)
      .first<{ canonical_id: string; content_rating: string; lifecycle: string }>();
    if (!existing) return false;

    const nowIso = new Date(this.ctx.now()).toISOString();
    if (existing.content_rating === "general") {
      await this.ctx.db.batch([
        this.ctx.db.prepare("DELETE FROM listing_sources WHERE canonical_id = ?").bind(canonicalId),
        this.ctx.db.prepare("DELETE FROM listing_relations WHERE source_canonical_id = ?").bind(canonicalId),
        this.ctx.db
          .prepare(
            `UPDATE canonical_packages
             SET lifecycle = 'deleted',
                 tombstone_reason = 'deleted',
                 owner_key = NULL,
                 owner_name = NULL,
                 summary = NULL,
                 tags_json = '[]',
                 attributes_json = '{}',
                 updated_at = ?
             WHERE canonical_id = ?`
          )
          .bind(nowIso, canonicalId),
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             VALUES ('system', ?, ?, 'delete_package', ?, ?)`
          )
          .bind(canonicalId, actor, reason.trim().slice(0, 300), nowIso)
      ]);
      return true;
    }

    const res = await this.ctx.db.prepare("DELETE FROM canonical_packages WHERE canonical_id = ?").bind(canonicalId).run();
    return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }

  async upsertListingSource(source: {
    sourceLinkId?: string;
    canonicalId: string;
    sourceKey: string;
    platform: Platform;
    storefrontUrl: string;
    evidenceKind: EvidenceKind;
    confidence: number;
    reviewState?: LinkReviewState;
    price?: number | null;
    currency?: string | null;
    availability?: "available" | "delisted" | "unknown";
    observedAt?: string;
    reviewedAt?: string | null;
  }): Promise<ListingSource> {
    if (source.confidence < 0.0 || source.confidence > 1.0) {
      throw new RangeError("confidence must be between 0.0 and 1.0");
    }
    const sourceLinkId = source.sourceLinkId ?? crypto.randomUUID();
    const nowIso = new Date(this.ctx.now()).toISOString();
    const observedAt = source.observedAt ?? nowIso;
    const reviewState = source.reviewState ?? "provisional";
    const reviewedAt = source.reviewedAt ?? (reviewState !== "provisional" ? nowIso : null);
    const storefrontUrl = cleanTrackingParams(source.storefrontUrl);
    const availability = source.availability ?? "available";

    await this.ctx.db
      .prepare(
        `INSERT INTO listing_sources(
           source_link_id, canonical_id, source_key, platform, storefront_url,
           evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(canonical_id, source_key) DO UPDATE SET
           platform = excluded.platform,
           storefront_url = excluded.storefront_url,
           evidence_kind = excluded.evidence_kind,
           confidence = excluded.confidence,
           review_state = excluded.review_state,
           price = excluded.price,
           currency = excluded.currency,
           availability = excluded.availability,
           observed_at = excluded.observed_at,
           reviewed_at = excluded.reviewed_at`
      )
      .bind(
        sourceLinkId,
        source.canonicalId,
        source.sourceKey,
        source.platform,
        storefrontUrl,
        source.evidenceKind,
        source.confidence,
        reviewState,
        source.price ?? null,
        source.currency ?? null,
        availability,
        observedAt,
        reviewedAt
      )
      .run();

    const row = await this.ctx.db
      .prepare("SELECT * FROM listing_sources WHERE canonical_id = ? AND source_key = ?")
      .bind(source.canonicalId, source.sourceKey)
      .first<{
        source_link_id: string;
        canonical_id: string;
        source_key: string;
        platform: Platform;
        storefront_url: string;
        evidence_kind: EvidenceKind;
        confidence: number;
        review_state: LinkReviewState;
        price: number | null;
        currency: string | null;
        availability: "available" | "delisted" | "unknown";
        observed_at: string;
        reviewed_at: string | null;
      }>();

    return {
      sourceLinkId: row!.source_link_id,
      canonicalId: row!.canonical_id,
      sourceKey: row!.source_key,
      platform: row!.platform,
      storefrontUrl: row!.storefront_url,
      evidenceKind: row!.evidence_kind,
      confidence: row!.confidence,
      reviewState: row!.review_state,
      price: row!.price,
      currency: row!.currency,
      availability: row!.availability,
      observedAt: row!.observed_at,
      reviewedAt: row!.reviewed_at
    };
  }

  async getListingSourcesForCanonical(canonicalId: string): Promise<ListingSource[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT source_link_id, canonical_id, source_key, platform, storefront_url,
                evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
         FROM listing_sources WHERE canonical_id = ? ORDER BY observed_at ASC, source_link_id ASC`
      )
      .bind(canonicalId)
      .all<{
        source_link_id: string;
        canonical_id: string;
        source_key: string;
        platform: Platform;
        storefront_url: string;
        evidence_kind: EvidenceKind;
        confidence: number;
        review_state: LinkReviewState;
        price: number | null;
        currency: string | null;
        availability: "available" | "delisted" | "unknown";
        observed_at: string;
        reviewed_at: string | null;
      }>();
    return (res.results || []).map((row) => ({
      sourceLinkId: row.source_link_id,
      canonicalId: row.canonical_id,
      sourceKey: row.source_key,
      platform: row.platform,
      storefrontUrl: row.storefront_url,
      evidenceKind: row.evidence_kind,
      confidence: row.confidence,
      reviewState: row.review_state,
      price: row.price,
      currency: row.currency,
      availability: row.availability,
      observedAt: row.observed_at,
      reviewedAt: row.reviewed_at
    }));
  }

  async listRelationsForCanonical(canonicalId: string): Promise<ListingRelation[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT relation_id, source_key, source_canonical_id, target_canonical_id, target_avatar_base,
                relation_type, scope, confidence, evidence_source, feedback_up_count, feedback_down_count, created_at, updated_at
         FROM listing_relations WHERE source_canonical_id = ? ORDER BY created_at ASC, relation_id ASC`
      )
      .bind(canonicalId)
      .all<{
        relation_id: string;
        source_key: string;
        source_canonical_id: string;
        target_canonical_id: string | null;
        target_avatar_base: string | null;
        relation_type: ListingRelation["relationType"];
        scope: ListingRelation["scope"];
        confidence: number;
        evidence_source: string;
        feedback_up_count: number;
        feedback_down_count: number;
        created_at: string;
        updated_at: string;
      }>();
    return (res.results || []).map((row) => ({
      relationId: row.relation_id,
      sourceKey: row.source_key,
      sourceCanonicalId: row.source_canonical_id,
      targetCanonicalId: row.target_canonical_id,
      targetAvatarBase: row.target_avatar_base,
      relationType: row.relation_type,
      scope: row.scope,
      confidence: row.confidence,
      evidenceSource: row.evidence_source,
      feedbackUpCount: row.feedback_up_count ?? 0,
      feedbackDownCount: row.feedback_down_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}
