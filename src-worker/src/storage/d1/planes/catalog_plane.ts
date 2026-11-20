import {
  encodeCatalogCursor,
  decodeCatalogCursor,
  encodeCatalogDeltaCursor,
  CatalogSearchRequestSchema,
  type CatalogCursor,
  type CatalogPackage,
  type CatalogIdentityLink,
  type PackageFront,
  type CatalogDelta,
  type CatalogDeltaCursor,
  type ContentRating,
  type CatalogSearchRequest,
  type CatalogSearchResponse
} from "vrc-packages-api";
import { STOREFRONT_PLATFORMS, type Platform } from "vrc-packages-network/node";
import { cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import type { DesktopToolEvidence } from "../../../domain/classification/taxonomy.ts";
import type { AvatarCompatibility } from "../../../domain/classification/avatar_compatibility.ts";
import type {
  CanonicalUmbrella,
  CanonicalLifecycle,
  EvidenceKind,
  LinkReviewState,
  CanonicalPackage,
  IdentityLink
} from "../definitions.ts";
import { D1PlaneContext } from "./shared_context.ts";

export class CatalogPlane {
  constructor(private readonly ctx: D1PlaneContext) {}

  async getCatalogEpoch(): Promise<string> {
    const row = await this.ctx.db
      .prepare("SELECT value FROM coordinator_meta WHERE key='catalog_epoch'")
      .first<{ value: string }>();
    if (row) return row.value;
    const initial = "epoch-d1-" + crypto.randomUUID();
    await this.ctx.db
      .prepare("INSERT OR IGNORE INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?)")
      .bind(initial)
      .run();
    const stored = await this.ctx.db
      .prepare("SELECT value FROM coordinator_meta WHERE key='catalog_epoch'")
      .first<{ value: string }>();
    if (!stored) throw new Error("Catalog epoch initialization failed");
    return stored.value;
  }

  async resetCatalogEpoch(): Promise<string> {
    const next = "epoch-d1-" + crypto.randomUUID();
    await this.ctx.db
      .prepare(
        "INSERT INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      )
      .bind(next)
      .run();
    return next;
  }

  async buildCatalogPackagesBatch(
    pkgRows: Array<{
      canonical_id: string;
      umbrella: string;
      category: string;
      lifecycle: string;
      display_name: string;
      vpm_id: string | null;
      created_at: string;
      updated_at: string;
      published_at?: string | null;
      timestamp_confidence?: string | null;
      content_rating?: string | null;
    }>
  ): Promise<CatalogPackage[]> {
    if (pkgRows.length === 0) return [];
    const canonicalIds = pkgRows.map((p) => p.canonical_id);
    const placeholders = canonicalIds.map(() => "?").join(",");

    const linkRes = await this.ctx.db
      .prepare(
        `SELECT il.link_id, il.canonical_id, il.source_key, il.evidence_kind, il.confidence, il.created_at,
        sap.publish_classes_json
      FROM identity_links il
      LEFT JOIN (
        SELECT sv.source_key, sap_inner.publish_classes_json
        FROM source_versions sv
        JOIN source_access_profiles sap_inner ON sv.source_profile_id = sap_inner.profile_id
        WHERE sv.version_no = (
          SELECT MAX(sv2.version_no) FROM source_versions sv2 WHERE sv2.source_key = sv.source_key
        )
      ) sap ON il.source_key = sap.source_key
      WHERE il.canonical_id IN (${placeholders}) AND il.review_state='accepted'
      ORDER BY il.created_at ASC`
      )
      .bind(...canonicalIds)
      .all<{
        link_id: string;
        canonical_id: string;
        source_key: string;
        evidence_kind: string;
        confidence: number;
        created_at: string;
        publish_classes_json: string | null;
      }>();
    const linksByCanonical = new Map<string, CatalogIdentityLink[]>();
    const canonicalHasLinks = new Set<string>();
    const canonicalHasPublishableLink = new Set<string>();
    for (const l of linkRes.results || []) {
      canonicalHasLinks.add(l.canonical_id);
      let canPublish = true;
      if (l.publish_classes_json !== null && l.publish_classes_json !== undefined) {
        try {
          const parsed = JSON.parse(l.publish_classes_json);
          canPublish = Array.isArray(parsed) && parsed.length > 0 && parsed.includes("normalized_facts");
        } catch {
          canPublish = false;
        }
      }
      if (canPublish) {
        canonicalHasPublishableLink.add(l.canonical_id);
        const list = linksByCanonical.get(l.canonical_id) || [];
        list.push({
          linkId: l.link_id,
          sourceKey: l.source_key,
          evidenceKind: l.evidence_kind as CatalogIdentityLink["evidenceKind"],
          confidence: l.confidence,
          createdAt: l.created_at
        });
        linksByCanonical.set(l.canonical_id, list);
      }
    }

    const frontRes = await this.ctx.db
      .prepare(
        `SELECT pf.front_id, pf.canonical_id, pf.source_key, pf.platform, pf.storefront_url, pf.price, pf.currency, pf.availability, pf.observed_at,
        sap.publish_classes_json
      FROM package_fronts pf
      LEFT JOIN (
        SELECT sv.source_key, sap_inner.publish_classes_json
        FROM source_versions sv
        JOIN source_access_profiles sap_inner ON sv.source_profile_id = sap_inner.profile_id
        WHERE sv.version_no = (
          SELECT MAX(sv2.version_no) FROM source_versions sv2 WHERE sv2.source_key = sv.source_key
        )
      ) sap ON pf.source_key = sap.source_key
      WHERE pf.canonical_id IN (${placeholders})
        AND EXISTS (
          SELECT 1 FROM identity_links il
          WHERE il.canonical_id = pf.canonical_id
            AND il.source_key = pf.source_key
            AND il.review_state = 'accepted'
        )
      ORDER BY pf.observed_at ASC, pf.front_id ASC`
      )
      .bind(...canonicalIds)
      .all<{
        front_id: string;
        canonical_id: string;
        source_key: string;
        platform: string;
        storefront_url: string;
        price: number | null;
        currency: string | null;
        availability: string;
        observed_at: string;
        publish_classes_json: string | null;
      }>();
    const frontsByCanonical = new Map<string, PackageFront[]>();
    for (const f of frontRes.results || []) {
      let canPublish = true;
      if (f.publish_classes_json !== null && f.publish_classes_json !== undefined) {
        try {
          const parsed = JSON.parse(f.publish_classes_json);
          canPublish = Array.isArray(parsed) && parsed.length > 0 && parsed.includes("normalized_facts");
        } catch {
          canPublish = false;
        }
      }
      if (canPublish) {
        const list = frontsByCanonical.get(f.canonical_id) || [];
        list.push({
          frontId: f.front_id,
          canonicalId: f.canonical_id,
          sourceKey: f.source_key,
          platform: f.platform as PackageFront["platform"],
          storefrontUrl: f.storefront_url,
          price: f.price,
          currency: f.currency,
          availability: f.availability as PackageFront["availability"],
          observedAt: f.observed_at
        });
        frontsByCanonical.set(f.canonical_id, list);
      }
    }

    return pkgRows
      .filter((pkg) => !canonicalHasLinks.has(pkg.canonical_id) || canonicalHasPublishableLink.has(pkg.canonical_id))
      .map((pkg) => ({
        canonicalId: pkg.canonical_id,
        umbrella: pkg.umbrella as CatalogPackage["umbrella"],
        category: pkg.category,
        lifecycle: pkg.lifecycle as CatalogPackage["lifecycle"],
        displayName: pkg.display_name,
        vpmId: pkg.vpm_id,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
        publishedAt: pkg.published_at ?? null,
        timestampConfidence: (pkg.timestamp_confidence as CatalogPackage["timestampConfidence"]) ?? null,
        contentRating: (pkg.content_rating as CatalogPackage["contentRating"]) || "general",
        acceptedLinks: linksByCanonical.get(pkg.canonical_id) || [],
        fronts: frontsByCanonical.get(pkg.canonical_id) || []
      }));
  }

  async listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options: { includeAllRatings?: boolean } = {}
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Catalog limit must be 1..100");
    const conditions: string[] = ["p.content_rating != 'prohibited'"];
    const params: (string | number)[] = [];
    if (!options.includeAllRatings) {
      conditions.push("p.content_rating = 'general'");
    }
    if (cursor) {
      conditions.push("(p.created_at, p.canonical_id) < (?, ?)");
      params.push(cursor.createdAt, cursor.canonicalId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    params.push(limit + 1);
    const pkgRes = await this.ctx.db
      .prepare(
        `SELECT p.canonical_id, p.umbrella, p.category, p.lifecycle, p.display_name, p.vpm_id, p.created_at, p.updated_at, p.published_at, p.timestamp_confidence, p.content_rating FROM canonical_packages p ${where}
      ORDER BY p.created_at DESC, p.canonical_id DESC LIMIT ?`
      )
      .bind(...params)
      .all<{
        canonical_id: string;
        umbrella: string;
        category: string;
        lifecycle: string;
        display_name: string;
        vpm_id: string | null;
        created_at: string;
        updated_at: string;
        published_at?: string | null;
        timestamp_confidence?: string | null;
        content_rating?: string | null;
      }>();
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
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (cursor) {
      conditions.push("(d.updated_at, d.canonical_id) > (?, ?)");
      params.push(cursor.updatedAt, cursor.canonicalId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);
    const query = `SELECT d.canonical_id, d.umbrella, d.category, d.lifecycle, d.display_name, d.vpm_id, d.created_at, d.updated_at, d.published_at, d.timestamp_confidence, d.content_rating, d.delta_action FROM (
      SELECT p.canonical_id, p.umbrella, p.category, p.lifecycle, p.display_name, p.vpm_id, p.created_at, p.updated_at, p.published_at, p.timestamp_confidence, p.content_rating,
        CASE WHEN p.lifecycle = 'delisted' THEN 'delist' ELSE 'upsert' END AS delta_action
      FROM canonical_packages p WHERE p.content_rating = 'general'
      UNION ALL
      SELECT t.canonical_id, NULL AS umbrella, NULL AS category, 'delisted' AS lifecycle, '' AS display_name, NULL AS vpm_id, '' AS created_at, t.recorded_at AS updated_at, NULL AS published_at, NULL AS timestamp_confidence, 'general' AS content_rating, 'delist' AS delta_action
      FROM catalog_tombstones t
      WHERE NOT EXISTS (
        SELECT 1 FROM canonical_packages p
        WHERE p.canonical_id = t.canonical_id
          AND p.updated_at = t.recorded_at
          AND p.lifecycle = 'delisted'
          AND p.content_rating = 'general'
      )
    ) d ${where}
    ORDER BY d.updated_at ASC, d.canonical_id ASC LIMIT ?`;
    const pkgRes = await this.ctx.db
      .prepare(query)
      .bind(...params)
      .all<{
        canonical_id: string;
        umbrella: string | null;
        category: string | null;
        lifecycle: string;
        display_name: string;
        vpm_id: string | null;
        created_at: string;
        updated_at: string;
        published_at?: string | null;
        timestamp_confidence?: string | null;
        content_rating?: string | null;
        delta_action: "upsert" | "delist";
      }>();
    const pkgRows = pkgRes.results || [];
    const visible = pkgRows.slice(0, limit);
    const last = visible.at(-1);
    const nonDelisted = visible.filter((p) => p.delta_action !== "delist");
    const builtPackages = await this.buildCatalogPackagesBatch(nonDelisted as any);
    const packageMap = new Map(builtPackages.map((p) => [p.canonicalId, p]));
    const deltas: CatalogDelta[] = [];
    for (const pkg of visible) {
      if (pkg.delta_action === "delist") {
        deltas.push({
          action: "delist",
          canonicalId: pkg.canonical_id,
          updatedAt: pkg.updated_at
        });
      } else {
        const item = packageMap.get(pkg.canonical_id);
        if (item) {
          deltas.push({
            action: "upsert",
            canonicalId: pkg.canonical_id,
            updatedAt: pkg.updated_at,
            package: item
          });
        } else {
          deltas.push({
            action: "delist",
            canonicalId: pkg.canonical_id,
            updatedAt: pkg.updated_at
          });
        }
      }
    }
    return {
      epoch,
      deltas,
      nextCursor:
        pkgRows.length > limit && last
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
    const conditions = ["p.lifecycle != 'delisted'"];
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
      conditions.push("EXISTS (SELECT 1 FROM package_fronts pf WHERE pf.canonical_id = p.canonical_id AND pf.platform = ?)");
      params.push(parsed.platform);
    }
    if (parsed.query && parsed.query.trim()) {
      const term = `%${parsed.query.trim()}%`;
      conditions.push("(p.display_name LIKE ? OR p.category LIKE ? OR p.vpm_id LIKE ?)");
      params.push(term, term, term);
    }

    if (parsed.tags && parsed.tags.length > 0) {
      for (const tag of parsed.tags) {
        const cleanTag = tag.trim().toLowerCase();
        if (!cleanTag) continue;
        const tagPattern = `%${cleanTag}%`;
        conditions.push(`(
          p.category LIKE ? OR
          p.umbrella = ? OR
          EXISTS (
            SELECT 1 FROM identity_links il
            JOIN avatar_compatibilities ac ON ac.source_key = il.source_key
            WHERE il.canonical_id = p.canonical_id AND il.review_state = 'accepted'
              AND (ac.target_avatar_base LIKE ? OR ac.scope LIKE ?)
          ) OR
          p.display_name LIKE ?
        )`);
        params.push(tagPattern, cleanTag, tagPattern, tagPattern, tagPattern);
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
      .prepare(`SELECT COUNT(*) as total FROM canonical_packages p WHERE ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();

    const orderClause = hasKeywordQuery
      ? "ORDER BY p.created_at DESC, p.canonical_id DESC"
      : "ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.canonical_id DESC";

    const queryParams = [...params, limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT p.canonical_id, p.umbrella, p.category, p.lifecycle, p.display_name, p.vpm_id, p.created_at, p.updated_at, p.published_at, p.timestamp_confidence, p.content_rating
      FROM canonical_packages p
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ?`
      )
      .bind(...queryParams)
      .all<{
        canonical_id: string;
        umbrella: string;
        category: string;
        lifecycle: string;
        display_name: string;
        vpm_id: string | null;
        created_at: string;
        updated_at: string;
        published_at: string | null;
        timestamp_confidence: string | null;
        content_rating: string | null;
      }>();

    const rows = res.results || [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1);

    const items: CatalogPackage[] = await this.buildCatalogPackagesBatch(visible);

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
    latestVersionNo?: number;
    goneAt?: string | null;
  }): Promise<void> {
    await this.ctx.db
      .prepare(
        `INSERT INTO source_items (source_key, platform, source_url, latest_digest, latest_version_no, gone_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        platform = excluded.platform,
        source_url = excluded.source_url,
        latest_digest = excluded.latest_digest,
        latest_version_no = excluded.latest_version_no,
        gone_at = excluded.gone_at`
      )
      .bind(
        item.sourceKey,
        item.platform,
        item.sourceUrl,
        item.latestDigest,
        item.latestVersionNo ?? 1,
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
    vpmId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string | null;
    timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
    contentRating?: ContentRating | null;
  }): Promise<
    CanonicalPackage & {
      publishedAt?: string | null;
      timestampConfidence?: string | null;
      contentRating?: ContentRating;
    }
  > {
    const now = new Date(this.ctx.now()).toISOString();
    const createdAt = pkg.createdAt ?? now;
    const updatedAt = pkg.updatedAt ?? now;
    const vpmId = pkg.vpmId ?? null;
    const publishedAt = pkg.publishedAt ?? null;
    const timestampConfidence = pkg.timestampConfidence ?? (publishedAt ? "confirmed" : null);
    const contentRating = pkg.contentRating ?? "general";
    const existing = await this.ctx.db
      .prepare("SELECT content_rating FROM canonical_packages WHERE canonical_id = ?")
      .bind(pkg.canonicalId)
      .first<{ content_rating: string }>();
    await this.ctx.db
      .prepare(
        `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, published_at, timestamp_confidence, content_rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        umbrella = excluded.umbrella,
        category = excluded.category,
        lifecycle = excluded.lifecycle,
        display_name = excluded.display_name,
        vpm_id = COALESCE(excluded.vpm_id, canonical_packages.vpm_id),
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
        pkg.displayName,
        vpmId,
        createdAt,
        updatedAt,
        publishedAt,
        timestampConfidence,
        contentRating
      )
      .run();
    if (existing && existing.content_rating === "general" && contentRating !== "general") {
      await this.ctx.db
        .prepare("INSERT OR IGNORE INTO catalog_tombstones (canonical_id, reason, recorded_at) VALUES (?, 'rating_withdrawn', ?)")
        .bind(pkg.canonicalId, updatedAt)
        .run();
    }
    const result = await this.getCanonicalPackage(pkg.canonicalId);
    return result!;
  }

  async getCanonicalPackage(
    canonicalId: string
  ): Promise<
    | (CanonicalPackage & {
        publishedAt?: string | null;
        timestampConfidence?: string | null;
        contentRating?: ContentRating;
      })
    | null
  > {
    const row = await this.ctx.db
      .prepare(
        "SELECT canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, published_at, timestamp_confidence, content_rating FROM canonical_packages WHERE canonical_id = ?"
      )
      .bind(canonicalId)
      .first<{
        canonical_id: string;
        umbrella: CanonicalUmbrella;
        category: string;
        lifecycle: CanonicalLifecycle;
        display_name: string;
        vpm_id: string | null;
        created_at: string;
        updated_at: string;
        published_at: string | null;
        timestamp_confidence: string | null;
        content_rating: string | null;
      }>();
    if (!row) return null;
    return {
      canonicalId: row.canonical_id,
      umbrella: row.umbrella,
      category: row.category,
      lifecycle: row.lifecycle,
      displayName: row.display_name,
      vpmId: row.vpm_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      timestampConfidence: row.timestamp_confidence as "confirmed" | "inferred" | "observed" | null,
      contentRating: (row.content_rating as ContentRating) || "general"
    };
  }

  async createIdentityLink(link: {
    linkId?: string;
    sourceKey: string;
    canonicalId: string;
    evidenceKind: EvidenceKind;
    confidence: number;
    reviewState?: LinkReviewState;
    createdAt?: string;
    reviewedAt?: string | null;
  }): Promise<IdentityLink> {
    if (link.confidence < 0.0 || link.confidence > 1.0) {
      throw new RangeError("confidence must be between 0.0 and 1.0");
    }
    const linkId = link.linkId ?? crypto.randomUUID();
    const now = new Date(this.ctx.now()).toISOString();
    const createdAt = link.createdAt ?? now;
    const reviewState = link.reviewState ?? "provisional";
    const reviewedAt = link.reviewedAt ?? (reviewState !== "provisional" ? now : null);
    await this.ctx.db
      .prepare(
        `INSERT INTO identity_links (link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(linkId, link.sourceKey, link.canonicalId, link.evidenceKind, link.confidence, reviewState, createdAt, reviewedAt)
      .run();

    if (reviewState === "accepted" || reviewState === "provisional") {
      await this.syncPackageFrontFromSourceItem(link.canonicalId, link.sourceKey);
    }

    return {
      linkId,
      sourceKey: link.sourceKey,
      canonicalId: link.canonicalId,
      evidenceKind: link.evidenceKind,
      confidence: link.confidence,
      reviewState,
      createdAt,
      reviewedAt
    };
  }

  async getIdentityLinksForCanonical(canonicalId: string): Promise<IdentityLink[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at, reviewed_at
      FROM identity_links WHERE canonical_id = ? ORDER BY created_at ASC, link_id ASC`
      )
      .bind(canonicalId)
      .all<{
        link_id: string;
        source_key: string;
        canonical_id: string;
        evidence_kind: EvidenceKind;
        confidence: number;
        review_state: LinkReviewState;
        created_at: string;
        reviewed_at: string | null;
      }>();
    return (res.results || []).map((row) => ({
      linkId: row.link_id,
      sourceKey: row.source_key,
      canonicalId: row.canonical_id,
      evidenceKind: row.evidence_kind,
      confidence: row.confidence,
      reviewState: row.review_state,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at
    }));
  }

  async getIdentityLinksForSourceItem(sourceKey: string): Promise<IdentityLink[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at, reviewed_at
      FROM identity_links WHERE source_key = ? ORDER BY created_at ASC, link_id ASC`
      )
      .bind(sourceKey)
      .all<{
        link_id: string;
        source_key: string;
        canonical_id: string;
        evidence_kind: EvidenceKind;
        confidence: number;
        review_state: LinkReviewState;
        created_at: string;
        reviewed_at: string | null;
      }>();
    return (res.results || []).map((row) => ({
      linkId: row.link_id,
      sourceKey: row.source_key,
      canonicalId: row.canonical_id,
      evidenceKind: row.evidence_kind,
      confidence: row.confidence,
      reviewState: row.review_state,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at
    }));
  }

  async updateIdentityLinkReview(linkId: string, reviewState: LinkReviewState): Promise<boolean> {
    const now = new Date(this.ctx.now()).toISOString();
    const res = await this.ctx.db
      .prepare("UPDATE identity_links SET review_state = ?, reviewed_at = ? WHERE link_id = ?")
      .bind(reviewState, now, linkId)
      .run();
    return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }

  async deleteIdentityLink(linkId: string): Promise<boolean> {
    const res = await this.ctx.db.prepare("DELETE FROM identity_links WHERE link_id = ?").bind(linkId).run();
    return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
  }

  async listAvatarCompatibilities(sourceKey: string): Promise<AvatarCompatibility[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT compatibility_id, source_key, target_avatar_base, scope, confidence, evidence_source
      FROM avatar_compatibilities
      WHERE source_key = ?
      ORDER BY target_avatar_base ASC`
      )
      .bind(sourceKey)
      .all<{
        compatibility_id: string;
        source_key: string;
        target_avatar_base: string;
        scope: "named_base" | "universal" | "uncertain";
        confidence: "creator_declared" | "keyword_inferred" | "unverified";
        evidence_source: string;
      }>();
    const rows = res.results || [];
    return rows.map((r) => ({
      compatibilityId: r.compatibility_id,
      itemKey: r.source_key,
      targetAvatarBase: r.target_avatar_base,
      scope: r.scope,
      confidence: r.confidence,
      evidenceSource: r.evidence_source
    }));
  }

  async recordDesktopToolEvidence(evidence: DesktopToolEvidence & { confidence: number }): Promise<void> {
    const now = new Date(this.ctx.now()).toISOString();
    await this.ctx.db
      .prepare(
        `INSERT INTO desktop_tool_evidence
        (canonical_id, tool_subtype, supported_os, particular_vrchat_target, evidence_url, publisher_claim, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        tool_subtype = excluded.tool_subtype,
        supported_os = excluded.supported_os,
        particular_vrchat_target = excluded.particular_vrchat_target,
        evidence_url = excluded.evidence_url,
        publisher_claim = excluded.publisher_claim,
        confidence = excluded.confidence`
      )
      .bind(
        evidence.canonicalId,
        evidence.toolSubtype,
        JSON.stringify(evidence.supportedOS),
        evidence.particularVRChatTarget ? 1 : 0,
        evidence.evidenceUrl,
        evidence.publisherClaim,
        evidence.confidence,
        now
      )
      .run();
  }

  async getDesktopToolEvidence(canonicalId: string): Promise<(DesktopToolEvidence & { confidence: number }) | null> {
    const row = await this.ctx.db
      .prepare(
        `SELECT canonical_id, tool_subtype, supported_os, particular_vrchat_target, evidence_url, publisher_claim, confidence, created_at
      FROM desktop_tool_evidence
      WHERE canonical_id = ?`
      )
      .bind(canonicalId)
      .first<{
        canonical_id: string;
        tool_subtype: DesktopToolEvidence["toolSubtype"];
        supported_os: string;
        particular_vrchat_target: number;
        evidence_url: string;
        publisher_claim: string;
        confidence: number;
        created_at: string;
      }>();

    if (!row) return null;

    let supportedOS: DesktopToolEvidence["supportedOS"] = ["windows"];
    try {
      supportedOS = JSON.parse(row.supported_os);
    } catch {
      supportedOS = ["windows"];
    }

    return {
      canonicalId: row.canonical_id,
      toolSubtype: row.tool_subtype,
      supportedOS,
      particularVRChatTarget: row.particular_vrchat_target === 1,
      evidenceUrl: row.evidence_url,
      publisherClaim: row.publisher_claim,
      confidence: row.confidence
    };
  }

  async deleteCanonicalPackage(canonicalId: string): Promise<boolean> {
    const existing = await this.ctx.db
      .prepare("SELECT canonical_id, content_rating FROM canonical_packages WHERE canonical_id = ?")
      .bind(canonicalId)
      .first<{ canonical_id: string; content_rating: string }>();

    await this.ctx.db.prepare("DELETE FROM identity_links WHERE canonical_id = ?").bind(canonicalId).run();
    const res = await this.ctx.db.prepare("DELETE FROM canonical_packages WHERE canonical_id = ?").bind(canonicalId).run();
    const deleted = ((res.meta as any)?.changes ?? 0) > 0;
    if (deleted && existing && existing.content_rating === "general") {
      const now = new Date(this.ctx.now()).toISOString();
      await this.ctx.db
        .prepare("INSERT OR IGNORE INTO catalog_tombstones (canonical_id, reason, recorded_at) VALUES (?, 'deleted', ?)")
        .bind(canonicalId, now)
        .run();
    }
    return deleted;
  }

  async upsertPackageFront(front: {
    frontId?: string;
    canonicalId: string;
    sourceKey: string;
    platform: Platform;
    storefrontUrl: string;
    price?: number | null;
    currency?: string | null;
    availability?: "available" | "delisted" | "unknown";
    observedAt?: string;
  }): Promise<PackageFront> {
    const frontId = front.frontId ?? crypto.randomUUID();
    const now = new Date(this.ctx.now()).toISOString();
    const observedAt = front.observedAt ?? now;
    const availability = front.availability ?? "available";
    const price = front.price ?? null;
    const currency = front.currency ?? null;

    await this.ctx.db
      .prepare(
        `INSERT INTO package_fronts
        (front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id, source_key) DO UPDATE SET
        platform = excluded.platform,
        storefront_url = excluded.storefront_url,
        price = excluded.price,
        currency = excluded.currency,
        availability = excluded.availability,
        observed_at = excluded.observed_at`
      )
      .bind(
        frontId,
        front.canonicalId,
        front.sourceKey,
        front.platform,
        front.storefrontUrl,
        price,
        currency,
        availability,
        observedAt
      )
      .run();

    const row = await this.ctx.db
      .prepare(
        `SELECT front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at
      FROM package_fronts WHERE canonical_id = ? AND source_key = ?`
      )
      .bind(front.canonicalId, front.sourceKey)
      .first<{
        front_id: string;
        canonical_id: string;
        source_key: string;
        platform: Platform;
        storefront_url: string;
        price: number | null;
        currency: string | null;
        availability: "available" | "delisted" | "unknown";
        observed_at: string;
      }>();

    return {
      frontId: row!.front_id,
      canonicalId: row!.canonical_id,
      sourceKey: row!.source_key,
      platform: row!.platform,
      storefrontUrl: row!.storefront_url,
      price: row!.price,
      currency: row!.currency,
      availability: row!.availability,
      observedAt: row!.observed_at
    };
  }

  async getPackageFrontsForCanonical(canonicalId: string): Promise<PackageFront[]> {
    const res = await this.ctx.db
      .prepare(
        `SELECT front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at
      FROM package_fronts WHERE canonical_id = ?
      ORDER BY observed_at ASC, front_id ASC`
      )
      .bind(canonicalId)
      .all<{
        front_id: string;
        canonical_id: string;
        source_key: string;
        platform: Platform;
        storefront_url: string;
        price: number | null;
        currency: string | null;
        availability: "available" | "delisted" | "unknown";
        observed_at: string;
      }>();
    const rows = res.results || [];
    return rows.map((r) => ({
      frontId: r.front_id,
      canonicalId: r.canonical_id,
      sourceKey: r.source_key,
      platform: r.platform,
      storefrontUrl: r.storefront_url,
      price: r.price,
      currency: r.currency,
      availability: r.availability,
      observedAt: r.observed_at
    }));
  }

  async deletePackageFront(frontId: string): Promise<boolean> {
    const res = await this.ctx.db.prepare("DELETE FROM package_fronts WHERE front_id = ?").bind(frontId).run();
    return ((res.meta as any)?.changes ?? 0) > 0;
  }

  private async syncPackageFrontFromSourceItem(canonicalId: string, sourceKey: string): Promise<void> {
    const item = await this.ctx.db
      .prepare(
        `SELECT si.platform, si.source_url, si.gone_at, sv.payload_json, sv.observed_at
      FROM source_items si
      LEFT JOIN source_versions sv ON sv.source_key = si.source_key AND sv.version_no = si.latest_version_no
      WHERE si.source_key = ?`
      )
      .bind(sourceKey)
      .first<{
        platform: Platform;
        source_url: string;
        gone_at: string | null;
        payload_json: string | null;
        observed_at: string | null;
      }>();

    if (!item) return;
    const isStorefront = STOREFRONT_PLATFORMS.has(item.platform);
    let price: number | null = null;
    let currency: string | null = null;
    let availability: "available" | "delisted" | "unknown" = item.gone_at ? "delisted" : "available";
    let storefrontUrl = item.source_url;

    if (item.payload_json) {
      try {
        const parsed = JSON.parse(item.payload_json);
        if (parsed.price !== undefined) price = parsed.price;
        if (parsed.currency !== undefined) currency = parsed.currency;
        if (parsed.availability !== undefined) availability = parsed.availability;
        if (parsed.storefrontUrl) storefrontUrl = parsed.storefrontUrl;
      } catch {}
    }

    if (isStorefront || price !== null) {
      await this.upsertPackageFront({
        canonicalId,
        sourceKey,
        platform: item.platform,
        storefrontUrl: cleanTrackingParams(storefrontUrl),
        price,
        currency,
        availability,
        observedAt: item.observed_at ?? new Date(this.ctx.now()).toISOString()
      });
    }
  }
}
