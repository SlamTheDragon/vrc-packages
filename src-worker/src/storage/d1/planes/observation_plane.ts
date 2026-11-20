import {
  PROTOCOL_VERSION,
  STOREFRONT_PLATFORMS,
  observationMatchesPlatform,
  type ResultRequest,
  type ResultResponse,
  type BatchResultRequest,
  type BatchResultResponse,
  type BatchResultReceipt
} from "vrc-packages-network/node";
import {
  isBoothBrowseTarget,
  boothItemIdentity,
  isShopifyProductSitemapTarget,
  shopifyProductLead,
  classifyOutboundLeadKind,
  normalizeGitHubRepositoryUrl,
  normalizeGitHubApiUrl
} from "vrc-packages-network/source-targets";
import { cleanTitle, cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import { CoordinatorConflict, type NodePrincipal } from "../../../domain/ports/stores.ts";
import { sha256Hex } from "../../../domain/security/crypto_primitives.ts";
import {
  deriveCategoryFromTags,
  deriveUmbrellaFromTags,
  classifyDesktopTool,
  inferSupportedOS
} from "../../../domain/classification/taxonomy.ts";
import { extractAvatarCompatibility } from "../../../domain/classification/avatar_compatibility.ts";
import type { D1PreparedStatement, JobRow } from "../definitions.ts";
import { D1PlaneContext } from "./shared_context.ts";

export class ObservationPlane {
  constructor(
    private readonly ctx: D1PlaneContext,
    private readonly approveDiscoveryLeadFn: (
      leadKey: string,
      minDelayMs?: number,
      actor?: string,
      reason?: string,
      sourceRuleId?: string
    ) => Promise<string>
  ) {}

  async submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    const nowMs = this.ctx.now();
    const now = new Date(nowMs).toISOString();
    const requestDigest = await sha256Hex(JSON.stringify(request));
    await this.ctx.assertCurrentPrincipal(principal);

    const prior = await this.ctx.db
      .prepare("SELECT job_id,node_id,idempotency_key,request_digest,response_json FROM job_results WHERE lease_id=?")
      .bind(request.leaseId)
      .first<{
        job_id: string;
        node_id: string;
        idempotency_key: string;
        request_digest: string;
        response_json: string;
      }>();
    if (prior) {
      if (
        prior.job_id !== request.jobId ||
        prior.node_id !== principal.nodeId ||
        prior.idempotency_key !== request.idempotencyKey ||
        prior.request_digest !== requestDigest
      ) {
        throw new CoordinatorConflict("Job already submitted with a different identity or key");
      }
      return { ...JSON.parse(prior.response_json), duplicate: true } as ResultResponse;
    }

    const job = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id=?").bind(request.jobId).first<JobRow>();
    if (!job) throw new CoordinatorConflict("Job not found", 404);
    if (!principal.capabilities.includes(job.platform)) {
      throw new CoordinatorConflict("Capability not granted to node", 403);
    }
    if (request.outcome.kind === "batch" && job.platform !== "vpm") {
      throw new CoordinatorConflict("Multi-item batches require a VPM job");
    }
    if (request.outcome.kind === "partial_batch" && job.platform !== "vpm") {
      throw new CoordinatorConflict("Listing diagnostics require a VPM job");
    }
    if (job.source_rule_id) {
      const activeRule = await this.ctx.db
        .prepare("SELECT 1 FROM lead_autoqueue_rules WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?")
        .bind(job.source_rule_id, now)
        .first();
      if (!activeRule) {
        throw new CoordinatorConflict("Auto-queue rule no longer authorizes this job", 403);
      }
    }
    if (
      job.state !== "leased" ||
      job.claimed_by !== principal.nodeId ||
      job.lease_id !== request.leaseId ||
      !job.lease_expires_at ||
      job.lease_expires_at <= now
    ) {
      throw new CoordinatorConflict("Node does not hold a live lease for this job", 403);
    }
    const sourceProfile = await this.ctx.leaseProfileAllowsJob(job);
    if (!sourceProfile) throw new CoordinatorConflict("Source profile no longer authorizes this job", 403);
    const robots = await this.ctx.db
      .prepare(
        `SELECT snapshot_id AS robots_snapshot_id,status_code AS robots_status_code,
      body AS robots_body,expires_at AS robots_expires_at FROM origin_robots WHERE origin=?`
      )
      .bind(job.origin)
      .first<{
        robots_snapshot_id: string;
        robots_status_code: number;
        robots_body: string;
        robots_expires_at: string;
      }>();
    if (!robots || robots.robots_expires_at <= now || !this.ctx.robotsAllows({ ...job, ...robots })) {
      throw new CoordinatorConflict("Origin robots policy no longer allows this job", 403);
    }

    let sourceVersionCreated = false;
    const outcome = request.outcome;
    if (job.platform === "booth" && job.job_purpose === "discovery") {
      if (
        !isBoothBrowseTarget(job.url) ||
        outcome.kind === "changed" ||
        outcome.kind === "batch" ||
        outcome.kind === "partial_batch"
      ) {
        throw new CoordinatorConflict("BOOTH browse jobs can report leads, not product observations");
      }
      if (
        outcome.kind === "discovery" &&
        outcome.leads.some((lead) => {
          const id = boothItemIdentity(lead.url);
          return (
            lead.kind !== "storefront_product" ||
            !id ||
            lead.url !== `https://booth.pm/ja/items/${id}` ||
            lead.discoveredFromItemKey !== undefined ||
            lead.claimedPackageId !== undefined
          );
        })
      ) {
        throw new CoordinatorConflict("BOOTH browse leads require canonical BOOTH product URLs");
      }
    }
    if (job.platform === "shopify" && job.job_purpose === "discovery") {
      if (
        !isShopifyProductSitemapTarget(job.url) ||
        outcome.kind === "changed" ||
        outcome.kind === "batch" ||
        outcome.kind === "partial_batch"
      ) {
        throw new CoordinatorConflict("Shopify product sitemap jobs can report leads, not product observations");
      }
      if (
        outcome.kind === "discovery" &&
        outcome.leads.some(
          (lead) =>
            lead.kind !== "storefront_product" ||
            !shopifyProductLead(lead.url, job.origin) ||
            lead.discoveredFromItemKey !== undefined ||
            lead.claimedPackageId !== undefined
        )
      ) {
        throw new CoordinatorConflict("Shopify sitemap leads require same-origin product URLs");
      }
    }
    if (job.platform === "curated" && job.job_purpose === "discovery") {
      if (outcome.kind === "changed" || outcome.kind === "batch" || outcome.kind === "partial_batch") {
        throw new CoordinatorConflict("Curated discovery jobs report discovery leads, not product observations");
      }
    }

    const observations =
      outcome.kind === "changed"
        ? [outcome.observation]
        : outcome.kind === "batch" || outcome.kind === "partial_batch"
        ? outcome.observations
        : [];
    if (observations.some((observation) => !observationMatchesPlatform(job.platform, observation))) {
      throw new CoordinatorConflict("Release evidence does not match the leased platform");
    }
    if (observations.some((observation) => !cleanTitle(observation.title))) {
      throw new CoordinatorConflict("Observation requires a nonempty catalog title");
    }
    const isStorefront = STOREFRONT_PLATFORMS.has(job.platform);
    if (isStorefront) {
      const target = new URL(job.url);
      const sourceItemKey = `${target.host}${target.pathname}`;
      if (observations.some((observation) => observation.sourceItemKey !== sourceItemKey)) {
        throw new CoordinatorConflict("Storefront identity does not match the assigned source");
      }
      if (
        observations.some(
          (observation) =>
            observation.storefrontUrl !== undefined &&
            cleanTrackingParams(observation.storefrontUrl) !== cleanTrackingParams(target.href)
        )
      ) {
        throw new CoordinatorConflict("Storefront URL does not match the assigned source");
      }
    } else if (
      observations.some(
        (observation) =>
          observation.price !== undefined ||
          observation.currency !== undefined ||
          observation.availability !== undefined ||
          observation.storefrontUrl !== undefined
      )
    ) {
      throw new CoordinatorConflict("Storefront fields require a storefront source");
    }
    if (
      (observations.length > 0 || outcome.kind === "discovery" || outcome.kind === "partial_batch") &&
      !sourceProfile.retainClasses.includes("normalized_facts")
    ) {
      throw new CoordinatorConflict("Source profile does not permit retaining normalized evidence", 403);
    }
    if (
      observations.some((observation) => observation.summary.length > 0) &&
      !sourceProfile.retainClasses.includes("creator_prose")
    ) {
      throw new CoordinatorConflict("Source profile does not permit retaining creator prose", 403);
    }
    if (new Set(observations.map((observation) => observation.sourceItemKey)).size !== observations.length) {
      throw new CoordinatorConflict("Result batch contains duplicate source identities");
    }

    const batchStmts: D1PreparedStatement[] = [];

    for (const observation of observations) {
      const sourceKey = `${job.platform}:${job.url}:${observation.sourceItemKey}`;
      let versionId: string | null = null;
      const payload = JSON.stringify(observation);
      const digest = await sha256Hex(payload);
      const complete =
        outcome.kind !== "partial_batch" ||
        !outcome.issues.some((issue) => issue.sourceItemKey === observation.sourceItemKey);
      const previous = await this.ctx.db
        .prepare(
          `SELECT i.latest_digest,i.latest_version_no,i.gone_at,v.complete
        FROM source_items i JOIN source_versions v ON v.source_key=i.source_key AND v.version_no=i.latest_version_no
        WHERE i.source_key=?`
        )
        .bind(sourceKey)
        .first<{ latest_digest: string; latest_version_no: number; gone_at: string | null; complete: number }>();

      if (!previous || previous.latest_digest !== digest || (complete && previous.complete === 0)) {
        const versionNo = (previous?.latest_version_no || 0) + 1;
        versionId = crypto.randomUUID();
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO source_items(source_key,platform,source_url,latest_digest,latest_version_no)
            VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_url=excluded.source_url,
              latest_digest=excluded.latest_digest,latest_version_no=excluded.latest_version_no,
              gone_at=CASE WHEN ? THEN NULL ELSE source_items.gone_at END`
            )
            .bind(sourceKey, job.platform, job.url, digest, versionNo, complete ? 1 : 0),
          this.ctx.db
            .prepare(
              `INSERT INTO source_versions
            (version_id,source_key,version_no,digest,payload_json,observed_at,complete,
              contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)`
            )
            .bind(
              versionId,
              sourceKey,
              versionNo,
              digest,
              payload,
              now,
              complete ? 1 : 0,
              principal.nodeId,
              request.leaseId,
              sourceProfile.profileId
            )
        );
        sourceVersionCreated = true;
      } else {
        batchStmts.push(
          this.ctx.db
            .prepare("UPDATE source_items SET source_url=?,gone_at=CASE WHEN ? THEN NULL ELSE gone_at END WHERE source_key=?")
            .bind(job.url, complete ? 1 : 0, sourceKey)
        );
      }

      const avatarCompatibilities = extractAvatarCompatibility(
        observation.title,
        observation.summary,
        observation.outboundLinks,
        observation.platformTags ?? [],
        observation.sourceItemKey
      );
      for (const compat of avatarCompatibilities) {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT OR REPLACE INTO avatar_compatibilities
            (compatibility_id, source_key, target_avatar_base, scope, confidence, evidence_source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              compat.compatibilityId,
              sourceKey,
              compat.targetAvatarBase,
              compat.scope,
              compat.confidence,
              compat.evidenceSource,
              now
            )
        );
      }

      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,?,?,?,?,?,?,?)`
          )
          .bind(
            job.job_id,
            sourceKey,
            previous?.gone_at && complete ? "restored" : versionId ? "changed" : "unchanged",
            now,
            versionId,
            principal.nodeId,
            request.leaseId,
            sourceProfile.profileId
          )
      );

      if (job.platform === "vpm" && complete) {
        const vpmId = observation.sourceItemKey;
        const umbrella = deriveUmbrellaFromTags(observation.platformTags, "tools");
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO canonical_packages
            (canonical_id,umbrella,category,lifecycle,display_name,vpm_id,created_at,updated_at,published_at,timestamp_confidence)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(canonical_id) DO UPDATE SET
              display_name=excluded.display_name,
              vpm_id=COALESCE(excluded.vpm_id,canonical_packages.vpm_id),
              updated_at=excluded.updated_at`
            )
            .bind(
              vpmId,
              umbrella,
              deriveCategoryFromTags(observation.platformTags, "vpm_package"),
              "active",
              cleanTitle(observation.title),
              vpmId,
              now,
              now,
              null,
              null
            ),
          this.ctx.db
            .prepare(
              `INSERT OR IGNORE INTO identity_links
            (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
            VALUES (?,?,?,'vpm_id',1.0,'accepted',?,?)`
            )
            .bind(crypto.randomUUID(), sourceKey, vpmId, now, now)
        );

        for (const outbound of observation.outboundLinks) {
          const targetUrl = new URL(outbound).href;
          const leadKind = classifyOutboundLeadKind(targetUrl);
          if (leadKind) {
            const identity = [job.url, vpmId, leadKind, targetUrl, vpmId];
            const leadKey = await sha256Hex(JSON.stringify(identity));
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT INTO source_leads
                (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,
                  kind,target_url,claimed_package_id,status,
                  first_seen_at,last_seen_at,first_seen_node_id,first_seen_lease_id,first_seen_profile_id,
                  last_seen_node_id,last_seen_lease_id,last_seen_profile_id)
                VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?,?,?)
                ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
                  last_seen_node_id=excluded.last_seen_node_id,last_seen_lease_id=excluded.last_seen_lease_id,
                  last_seen_profile_id=excluded.last_seen_profile_id`
                )
                .bind(
                  leadKey,
                  job.url,
                  job.job_id,
                  vpmId,
                  leadKind,
                  targetUrl,
                  vpmId,
                  now,
                  now,
                  principal.nodeId,
                  request.leaseId,
                  sourceProfile.profileId,
                  principal.nodeId,
                  request.leaseId,
                  sourceProfile.profileId
                )
            );
          }
        }
      }

      if (job.platform === "github" && complete) {
        const normalizedHtmlUrl = normalizeGitHubRepositoryUrl(job.url)?.toLowerCase();
        if (normalizedHtmlUrl) {
          const linkedRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT il.canonical_id
            FROM source_leads sl
            JOIN identity_links il ON (
              (sl.discovered_from_item_key IS NOT NULL AND (
                il.canonical_id = sl.discovered_from_item_key
                OR il.source_key = sl.discovered_from_item_key
                OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
              ))
              OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
            )
            WHERE sl.kind = 'github_repository'
              AND LOWER(RTRIM(CASE WHEN RTRIM(sl.target_url, '/') LIKE '%.git' THEN SUBSTR(RTRIM(sl.target_url, '/'), 1, LENGTH(RTRIM(sl.target_url, '/')) - 4) ELSE RTRIM(sl.target_url, '/') END, '/')) = ?
              AND il.review_state = 'accepted'
              AND il.evidence_kind = 'vpm_id'`
            )
            .bind(normalizedHtmlUrl)
            .all<{ canonical_id: string }>();
          const linkedCanonicals = linkedRes.results || [];
          for (const { canonical_id } of linkedCanonicals) {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT OR IGNORE INTO identity_links
                (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at)
                VALUES (?,?,?,'repository_match',0.7,'provisional',?)`
                )
                .bind(crypto.randomUUID(), sourceKey, canonical_id, now)
            );
          }
        }
      }

      const linkedCanonicalIds = new Set<string>();
      const highConfidenceCanonicalIds = new Set<string>();
      const existingLinksRes = await this.ctx.db
        .prepare(
          `SELECT canonical_id FROM identity_links
        WHERE source_key = ? AND review_state IN ('accepted', 'provisional')`
        )
        .bind(sourceKey)
        .all<{ canonical_id: string }>();
      for (const { canonical_id } of existingLinksRes.results || []) {
        linkedCanonicalIds.add(canonical_id);
      }

      if (isStorefront) {
        for (const outbound of observation.outboundLinks) {
          const normalizedOutbound = new URL(outbound).href;
          const matchesRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT il.canonical_id
            FROM identity_links il
            JOIN source_items si ON si.source_key = il.source_key
            WHERE si.source_url = ?
              AND il.review_state IN ('accepted', 'provisional')`
            )
            .bind(normalizedOutbound)
            .all<{ canonical_id: string }>();
          for (const { canonical_id } of matchesRes.results || []) {
            linkedCanonicalIds.add(canonical_id);
          }

          const apiGhUrl = normalizeGitHubApiUrl(normalizedOutbound)?.toLowerCase();
          if (apiGhUrl) {
            const ghMatchesRes = await this.ctx.db
              .prepare(
                `SELECT DISTINCT il.canonical_id
              FROM identity_links il
              JOIN source_items si ON si.source_key = il.source_key
              WHERE si.platform = 'github' AND LOWER(RTRIM(si.source_url, '/')) = ?
                AND il.review_state IN ('accepted', 'provisional')`
              )
              .bind(apiGhUrl)
              .all<{ canonical_id: string }>();
            for (const { canonical_id } of ghMatchesRes.results || []) {
              linkedCanonicalIds.add(canonical_id);
            }
          }

          const leadMatchesRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT il.canonical_id
            FROM source_leads sl
            JOIN identity_links il ON (
              (sl.discovered_from_item_key IS NOT NULL AND (
                il.canonical_id = sl.discovered_from_item_key
                OR il.source_key = sl.discovered_from_item_key
                OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
              ))
              OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
            )
            WHERE sl.target_url = ?
              AND il.review_state IN ('accepted', 'provisional')`
            )
            .bind(normalizedOutbound)
            .all<{ canonical_id: string }>();
          for (const { canonical_id } of leadMatchesRes.results || []) {
            linkedCanonicalIds.add(canonical_id);
          }
        }

        const normalizedJobUrl = job.url;
        const jobLeadMatchesRes = await this.ctx.db
          .prepare(
            `SELECT DISTINCT il.canonical_id, sl.discovered_from_item_key, sl.claimed_package_id, sl.status as lead_status
          FROM source_leads sl
          JOIN identity_links il ON (
            (sl.discovered_from_item_key IS NOT NULL AND (
              il.canonical_id = sl.discovered_from_item_key
              OR il.source_key = sl.discovered_from_item_key
              OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
            ))
            OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
          )
          WHERE sl.target_url = ?
            AND il.review_state IN ('accepted', 'provisional')`
          )
          .bind(normalizedJobUrl)
          .all<{
            canonical_id: string;
            discovered_from_item_key: string | null;
            claimed_package_id: string | null;
            lead_status: string;
          }>();
        for (const r of jobLeadMatchesRes.results || []) {
          linkedCanonicalIds.add(r.canonical_id);
          if (r.lead_status === "approved") {
            highConfidenceCanonicalIds.add(r.canonical_id);
          }
        }
      }

      if (isStorefront && complete && job.platform !== "vpm" && linkedCanonicalIds.size === 0) {
        const canonicalId = observation.sourceItemKey;
        const desktopClassification = classifyDesktopTool(
          observation.title,
          observation.summary,
          observation.outboundLinks,
          observation.platformTags ?? []
        );
        const umbrella =
          desktopClassification.isDesktopTool && desktopClassification.confidence >= 0.8
            ? "tools"
            : deriveUmbrellaFromTags(observation.platformTags, "assets");
        const category = deriveCategoryFromTags(
          observation.platformTags,
          desktopClassification.isDesktopTool &&
            desktopClassification.confidence >= 0.8 &&
            desktopClassification.subtype
            ? desktopClassification.subtype
            : "storefront_package"
        );
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO canonical_packages
            (canonical_id,umbrella,category,lifecycle,display_name,vpm_id,created_at,updated_at,published_at,timestamp_confidence)
            VALUES (?,?,?,?,?,NULL,?,?,?,?)
            ON CONFLICT(canonical_id) DO UPDATE SET
              display_name=excluded.display_name,
              updated_at=excluded.updated_at`
            )
            .bind(canonicalId, umbrella, category, "active", cleanTitle(observation.title), now, now, null, null),
          this.ctx.db
            .prepare(
              `INSERT OR IGNORE INTO identity_links
            (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
            VALUES (?,?,?,'cross_storefront_link',1.0,'accepted',?,?)`
            )
            .bind(crypto.randomUUID(), sourceKey, canonicalId, now, now)
        );
        linkedCanonicalIds.add(canonicalId);
      }

      for (const canonicalId of linkedCanonicalIds) {
        if (isStorefront) {
          const isHighConfidence = highConfidenceCanonicalIds.has(canonicalId);
          const alreadyLinked =
            (existingLinksRes.results || []).some((r) => r.canonical_id === canonicalId) ||
            canonicalId === observation.sourceItemKey;
          if (!alreadyLinked) {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT OR IGNORE INTO identity_links
                (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
                VALUES (?,?,?,'cross_storefront_link',?,?,?,?)`
                )
                .bind(
                  crypto.randomUUID(),
                  sourceKey,
                  canonicalId,
                  isHighConfidence ? 0.95 : 0.8,
                  isHighConfidence ? "accepted" : "provisional",
                  now,
                  isHighConfidence ? now : null
                )
            );
          } else if (isHighConfidence) {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `UPDATE identity_links
                SET review_state='accepted', confidence=0.95, reviewed_at=?
                WHERE source_key=? AND canonical_id=? AND review_state='provisional'`
                )
                .bind(now, sourceKey, canonicalId)
            );
          }

          const storefrontUrl = cleanTrackingParams(job.url);
          const frontId = crypto.randomUUID();
          const price = observation.price ?? null;
          const currency = observation.currency ?? null;
          const availability = observation.availability ?? "available";

          batchStmts.push(
            this.ctx.db
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
              .bind(frontId, canonicalId, sourceKey, job.platform, storefrontUrl, price, currency, availability, now)
          );
        }
      }

      const desktopClassification = classifyDesktopTool(
        observation.title,
        observation.summary,
        observation.outboundLinks,
        observation.platformTags ?? []
      );
      if (desktopClassification.isDesktopTool && desktopClassification.confidence >= 0.8 && desktopClassification.subtype) {
        const evidenceUrl =
          (observation as any).storefrontUrl ||
          observation.outboundLinks[0] ||
          `https://github.com/${observation.sourceItemKey}`;
        const publisherClaim = observation.summary || observation.title;
        const supportedOS = inferSupportedOS(
          `${observation.title} ${observation.summary} ${(observation.platformTags ?? []).join(" ")}`
        );
        for (const canonicalId of await (async () => {
          const targetCanonicalIds = new Set<string>(linkedCanonicalIds);
          const standalonePkg = await this.ctx.db
            .prepare("SELECT canonical_id FROM canonical_packages WHERE canonical_id = ?")
            .bind(observation.sourceItemKey)
            .first<{ canonical_id: string }>();
          if (standalonePkg) {
            targetCanonicalIds.add(standalonePkg.canonical_id);
          }
          return targetCanonicalIds;
        })()) {
          batchStmts.push(
            this.ctx.db
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
                canonicalId,
                desktopClassification.subtype,
                JSON.stringify(supportedOS),
                1,
                evidenceUrl,
                publisherClaim,
                desktopClassification.confidence,
                now
              )
          );
        }
      }
    }

    if (outcome.kind === "gone") {
      const currentItemsRes = await this.ctx.db
        .prepare("SELECT source_key FROM source_items WHERE platform=? AND source_url=? AND gone_at IS NULL")
        .bind(job.platform, job.url)
        .all<{ source_key: string }>();
      const currentItems = currentItemsRes.results || [];
      for (const item of currentItems) {
        batchStmts.push(
          this.ctx.db.prepare("UPDATE source_items SET gone_at=? WHERE source_key=?").bind(now, item.source_key),
          this.ctx.db
            .prepare("UPDATE package_fronts SET availability='delisted', observed_at=? WHERE source_key=?")
            .bind(now, item.source_key),
          this.ctx.db
            .prepare(
              `UPDATE canonical_packages SET lifecycle='delisted', updated_at=?
            WHERE canonical_id IN (SELECT canonical_id FROM package_fronts WHERE source_key=?)
              AND vpm_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM package_fronts pf2 WHERE pf2.canonical_id = canonical_packages.canonical_id AND pf2.availability = 'available')`
            )
            .bind(now, item.source_key),
          this.ctx.db
            .prepare(
              `INSERT INTO source_events
            (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,'gone',?,NULL,?,?,?)`
            )
            .bind(job.job_id, item.source_key, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
        );
      }
    }

    if (outcome.kind === "partial_batch") {
      for (const issue of outcome.issues) {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO source_issues
            (job_id,source_item_key,version_key,code,observed_at,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?)`
            )
            .bind(
              job.job_id,
              issue.sourceItemKey,
              issue.version || null,
              issue.code,
              now,
              principal.nodeId,
              request.leaseId,
              sourceProfile.profileId
            )
        );
      }
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,'incomplete_listing',?,NULL,?,?,?)`
          )
          .bind(job.job_id, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
      );
    }

    if (observations.length === 0 && outcome.kind !== "partial_batch") {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,?,?,NULL,?,?,?)`
          )
          .bind(job.job_id, outcome.kind, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
      );
    }

    const discoveryLeads =
      outcome.kind === "discovery"
        ? await Promise.all(
            outcome.leads.map(async (reportedLead) => {
              const lead = { ...reportedLead, url: new URL(reportedLead.url).href };
              const identity = lead.discoveredFromItemKey
                ? [job.url, lead.discoveredFromItemKey, lead.kind, lead.url, lead.claimedPackageId || null]
                : [job.url, lead.kind, lead.url, lead.claimedPackageId || null];
              return { lead, leadKey: await sha256Hex(JSON.stringify(identity)) };
            })
          )
        : [];
    for (const { lead, leadKey } of discoveryLeads) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,
          kind,target_url,claimed_package_id,status,
          first_seen_at,last_seen_at,first_seen_node_id,first_seen_lease_id,first_seen_profile_id,
          last_seen_node_id,last_seen_lease_id,last_seen_profile_id)
        VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?,?,?)
        ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
          last_seen_node_id=excluded.last_seen_node_id,last_seen_lease_id=excluded.last_seen_lease_id,
          last_seen_profile_id=excluded.last_seen_profile_id`
          )
          .bind(
            leadKey,
            job.url,
            job.job_id,
            lead.discoveredFromItemKey || null,
            lead.kind,
            lead.url,
            lead.claimedPackageId || null,
            now,
            now,
            principal.nodeId,
            request.leaseId,
            sourceProfile.profileId,
            principal.nodeId,
            request.leaseId,
            sourceProfile.profileId
          )
      );
    }

    let state = "done";
    let nextFetchAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
    if (outcome.kind === "rate_limited") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + outcome.retryAfterSeconds * 1000).toISOString();
    } else if (outcome.kind === "temporary_failure") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + 15 * 60 * 1000).toISOString();
    } else if (outcome.kind === "blocked") {
      state = "blocked";
      nextFetchAt = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
    }

    const response: ResultResponse = {
      schemaVersion: PROTOCOL_VERSION,
      status: "accepted",
      jobId: job.job_id,
      duplicate: false,
      sourceVersionCreated
    };

    batchStmts.push(
      this.ctx.db
        .prepare("UPDATE crawl_jobs SET state=?,next_fetch_at=?,claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?")
        .bind(state, nextFetchAt, job.job_id),
      this.ctx.db
        .prepare(
          `UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL,
        next_allowed_at=MAX(next_allowed_at,?) WHERE origin=? AND active_job_id=?`
        )
        .bind(outcome.kind === "rate_limited" || outcome.kind === "blocked" ? nextFetchAt : now, job.origin, job.job_id),
      this.ctx.db
        .prepare(
          "INSERT INTO job_results(lease_id,job_id,node_id,idempotency_key,request_digest,response_json,submitted_at) VALUES (?,?,?,?,?,?,?)"
        )
        .bind(
          request.leaseId,
          job.job_id,
          principal.nodeId,
          request.idempotencyKey,
          requestDigest,
          JSON.stringify(response),
          now
        )
    );

    if (batchStmts.length > 0) {
      await this.ctx.executeBatchChunked(batchStmts);
    }

    if (outcome.kind === "discovery") {
      for (const { lead, leadKey } of discoveryLeads) {
        const status = await this.ctx.db
          .prepare("SELECT status FROM source_leads WHERE lead_key=?")
          .bind(leadKey)
          .first<{ status: string }>();
        if (status?.status === "pending_review") {
          const rule = await this.ctx.activeAutoQueueRuleForLead(lead.kind, lead.url);
          if (rule) {
            try {
              await this.approveDiscoveryLeadFn(
                leadKey,
                rule.minDelayMs,
                `auto-rule:${rule.ruleId}`,
                "Matched reviewed auto-queue rule",
                rule.ruleId
              );
            } catch (cause) {
              await this.ctx.db
                .prepare(
                  `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
                VALUES ('rule',?,'coordinator','promotion_failed',?,?)`
                )
                .bind(rule.ruleId, cause instanceof Error ? cause.message.slice(0, 300) : "Unknown promotion failure", now)
                .run();
            }
          }
        }
      }
    }

    return response;
  }

  async submitBatch(request: BatchResultRequest, principal: NodePrincipal): Promise<BatchResultResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    const receipts: BatchResultReceipt[] = [];
    for (const item of request.results) {
      try {
        const res = await this.submit(
          {
            schemaVersion: request.schemaVersion,
            nodeId: request.nodeId,
            jobId: item.jobId,
            leaseId: item.leaseId,
            idempotencyKey: item.idempotencyKey,
            outcome: item.outcome
          },
          principal
        );
        receipts.push({
          status: "accepted",
          jobId: item.jobId,
          duplicate: res.duplicate,
          sourceVersionCreated: res.sourceVersionCreated
        });
      } catch (error) {
        if (error instanceof CoordinatorConflict) {
          const isLeaseExpired =
            error.status === 403 && error.message === "Node does not hold a live lease for this job";
          const isTerminal = error.status === 403 || error.status === 404;
          const code = isLeaseExpired
            ? "lease_expired"
            : error.status === 403
            ? "forbidden"
            : error.status === 404
            ? "not_found"
            : "conflict";
          receipts.push({
            status: "rejected",
            jobId: item.jobId,
            terminal: isTerminal,
            error: error.message,
            code
          });
        } else {
          receipts.push({
            status: "rejected",
            jobId: item.jobId,
            terminal: false,
            error: error instanceof Error ? error.message : "Internal error",
            code: "internal_error"
          });
        }
      }
    }
    return {
      schemaVersion: PROTOCOL_VERSION,
      receipts
    };
  }
}
