import {
  PROTOCOL_VERSION,
  STOREFRONT_PLATFORMS,
  observationMatchesPlatform,
  type BatchResultReceipt,
  type BatchResultRequest,
  type BatchResultResponse,
  type DiscoveryLead,
  type Observation,
  type ResultRequest,
  type ResultResponse
} from "vrc-packages-network/node";
import { cleanTitle, cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import {
  boothItemIdentity,
  classifyOutboundLeadKind,
  isBoothBrowseTarget,
  isShopifyProductSitemapTarget,
  normalizeGitHubApiUrl,
  normalizeGitHubRepositoryUrl,
  resolveDiscoveryLeadTarget,
  shopifyProductLead
} from "vrc-packages-network/source-targets";
import { compareVpmVersions, isVpmVersion } from "vrc-packages-network/vpm-version";
import {
  findMatchingSuppressedTarget,
  normalizeTargetHost,
  steeringProfileMatches,
  type SteeringProfile,
  type SuppressedTarget
} from "../../../domain/access/steering_profile.ts";
import {
  deriveCategoryFromTags,
  deriveUmbrellaFromTags,
  normalizeAvatarCompatibilities,
  normalizeDesktopToolEvidence,
  normalizeOwnerKey,
  normalizeOwnerName,
  normalizeQualityFlags,
  normalizeTags,
  type CatalogQualityFlag
} from "../../../domain/classification/taxonomy.ts";
import { CoordinatorConflict, type NodePrincipal } from "../../../domain/ports/stores.ts";
import { sha256Hex } from "../../../domain/security/crypto_primitives.ts";
import type { D1PreparedStatement, JobRow } from "../definitions.ts";
import type { SeedJobOptions } from "./operator_plane.ts";
import { D1PlaneContext } from "./shared_context.ts";

const TEMPORARY_FAILURE_RETRY_MS = 15 * 60 * 1000;
const BLOCKED_BACKOFF_MS = 3 * 24 * 60 * 60 * 1000;
const GONE_RECRAWL_MS = 24 * 60 * 60 * 1000;

export class ObservationPlane {
  constructor(
    private readonly ctx: D1PlaneContext,
    private readonly approveLeadFn: (
      leadKey: string,
      minDelayMs: number | undefined,
      actor: string,
      reason: string
    ) => Promise<string>,
    private readonly seedJobFn: (url: string, platform: JobRow["platform"], options?: SeedJobOptions) => Promise<string>
  ) {}

  private extractLatestVpmVersion(observation: Observation): string | null {
    const candidates: string[] = [];
    if (observation.release && isVpmVersion(observation.release.version)) {
      candidates.push(observation.release.version);
    }
    if (observation.releases) {
      for (const rel of observation.releases) {
        if (isVpmVersion(rel.version)) candidates.push(rel.version);
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => compareVpmVersions(b, a));
    return candidates[0] ?? null;
  }

  private collectObservationQualityFlags(
    platform: JobRow["platform"],
    observation: Observation
  ): CatalogQualityFlag[] {
    const flags = new Set<CatalogQualityFlag>(normalizeQualityFlags(observation.qualityFlags));
    if (platform === "vpm") {
      const hasDirect = observation.release !== undefined;
      const hasListing = observation.releases !== undefined && observation.releases.length > 0;
      if (!hasDirect && !hasListing) {
        flags.add("missing_release");
      } else {
        const allReleases = [
          ...(observation.release ? [observation.release] : []),
          ...(observation.releases ?? [])
        ];
        if (allReleases.some((rel) => !rel.zipSha256)) {
          flags.add("missing_zip_sha256");
        }
      }
    }
    return [...flags].slice(0, 10);
  }

  private collectVpmDependencies(observation: Observation): Array<{ depId: string; range: string }> {
    const deps = new Map<string, string>();
    const addRanges = (ranges?: Record<string, string>) => {
      if (!ranges) return;
      for (const [depId, range] of Object.entries(ranges)) {
        const cleanId = depId.trim();
        if (cleanId && !deps.has(cleanId)) {
          deps.set(cleanId, range);
        }
      }
    };
    if (observation.release) {
      addRanges(observation.release.dependencyRanges);
    } else if (observation.releases && observation.releases.length > 0) {
      const sorted = [...observation.releases].sort((a, b) => compareVpmVersions(b.version, a.version));
      addRanges(sorted[0]?.dependencyRanges);
    }
    return [...deps.entries()].slice(0, 50).map(([depId, range]) => ({ depId, range }));
  }

  async submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    const requestDigest = await sha256Hex(JSON.stringify(request));
    await this.ctx.assertCurrentPrincipal(principal);

    const prior = await this.ctx.db
      .prepare("SELECT job_id, node_id, idempotency_key, request_digest, response_json FROM job_results WHERE lease_id = ?")
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
      return { ...(JSON.parse(prior.response_json) as ResultResponse), duplicate: true };
    }

    const job = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(request.jobId).first<JobRow>();
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
    if (
      job.state !== "leased" ||
      job.claimed_by !== principal.nodeId ||
      job.lease_id !== request.leaseId ||
      !job.lease_expires_at ||
      job.lease_expires_at <= nowIso
    ) {
      throw new CoordinatorConflict("Node does not hold a live lease for this job", 403);
    }

    const suppressedTargets = await this.ctx.loadSuppressedTargets();
    if (findMatchingSuppressedTarget(job.url, suppressedTargets)) {
      throw new CoordinatorConflict("Target has been suppressed", 403);
    }

    const sourceProfile = await this.ctx.activeSteeringProfileForTarget(job.platform, job.url, job.job_purpose);
    if (!sourceProfile) {
      throw new CoordinatorConflict("Steering profile no longer authorizes this job", 403);
    }

    const originRobots = await this.ctx.db
      .prepare(
        `SELECT robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at
         FROM origin_state WHERE origin = ?`
      )
      .bind(job.origin)
      .first<{
        robots_snapshot_id: string | null;
        robots_status_code: number | null;
        robots_body: string | null;
        robots_fetched_at: string | null;
        robots_expires_at: string | null;
      }>();
    if (
      !originRobots ||
      !originRobots.robots_expires_at ||
      originRobots.robots_expires_at <= nowIso ||
      !this.ctx.robotsAllows({
        origin: job.origin,
        robots_snapshot_id: originRobots.robots_snapshot_id,
        robots_status_code: originRobots.robots_status_code,
        robots_body: originRobots.robots_body,
        robots_fetched_at: originRobots.robots_fetched_at,
        url: job.url
      })
    ) {
      throw new CoordinatorConflict("Origin robots policy no longer allows this job", 403);
    }

    const outcome = request.outcome;

    // Fast path for conditional HTTP 304 (`unchanged`): update only `crawl_jobs`, `origin_state`, and `job_results`.
    if (outcome.kind === "unchanged") {
      const nextFetchAt = new Date(nowMs + job.recrawl_interval_ms).toISOString();
      const response: ResultResponse = {
        schemaVersion: PROTOCOL_VERSION,
        status: "accepted",
        jobId: job.job_id,
        duplicate: false,
        sourceVersionCreated: false
      };
      await this.ctx.executeBatchChunked([
        this.ctx.db
          .prepare(
            `UPDATE crawl_jobs
             SET state = 'done', next_fetch_at = ?, claimed_by = NULL, lease_id = NULL, lease_expires_at = NULL
             WHERE job_id = ?`
          )
          .bind(nextFetchAt, job.job_id),
        this.ctx.db
          .prepare(
            `UPDATE origin_state
             SET active_job_id = NULL, lease_expires_at = NULL, next_allowed_at = MAX(next_allowed_at, ?)
             WHERE origin = ? AND active_job_id = ?`
          )
          .bind(nowIso, job.origin, job.job_id),
        this.ctx.db
          .prepare(
            `INSERT INTO job_results(lease_id, job_id, node_id, idempotency_key, request_digest, response_json, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            request.leaseId,
            job.job_id,
            principal.nodeId,
            request.idempotencyKey,
            requestDigest,
            JSON.stringify(response),
            nowIso
          )
      ]);
      return response;
    }

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
      throw new CoordinatorConflict("Steering profile does not permit retaining normalized evidence", 403);
    }
    if (
      observations.some((observation) => observation.summary.length > 0) &&
      !sourceProfile.retainClasses.includes("creator_prose")
    ) {
      throw new CoordinatorConflict("Steering profile does not permit retaining creator prose", 403);
    }
    if (new Set(observations.map((observation) => observation.sourceItemKey)).size !== observations.length) {
      throw new CoordinatorConflict("Result batch contains duplicate source identities");
    }

    let sourceVersionCreated = false;
    const batchStmts: D1PreparedStatement[] = [];
    const seenLeadKeys = new Set<string>();
    const pendingOutboundLeads: Array<{ kind: DiscoveryLead["kind"]; url: string; leadKey: string }> = [];

    for (const observation of observations) {
      const sourceKey = `${job.platform}:${job.url}:${observation.sourceItemKey}`;
      const payload = JSON.stringify(observation);
      const digest = await sha256Hex(payload);
      const itemIssues =
        outcome.kind === "partial_batch"
          ? outcome.issues.filter((issue) => issue.sourceItemKey === observation.sourceItemKey)
          : [];
      const complete = outcome.kind !== "partial_batch" || itemIssues.length === 0;

      const previous = await this.ctx.db
        .prepare("SELECT latest_digest, complete, gone_at FROM source_items WHERE source_key = ?")
        .bind(sourceKey)
        .first<{ latest_digest: string; complete: number; gone_at: string | null }>();

      const changedOrUpgraded =
        !previous || previous.latest_digest !== digest || (complete && previous.complete === 0);
      if (changedOrUpgraded) {
        sourceVersionCreated = true;
      }

      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO source_items(
               source_key, platform, source_url, latest_digest, payload_json, observed_at,
               complete, issues_json, contributor_node_id, submission_lease_id, steering_profile_id, gone_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(source_key) DO UPDATE SET
               source_url = excluded.source_url,
               latest_digest = excluded.latest_digest,
               payload_json = excluded.payload_json,
               observed_at = excluded.observed_at,
               complete = excluded.complete,
               issues_json = excluded.issues_json,
               contributor_node_id = excluded.contributor_node_id,
               submission_lease_id = excluded.submission_lease_id,
               steering_profile_id = excluded.steering_profile_id,
               gone_at = CASE WHEN excluded.complete = 1 THEN NULL ELSE source_items.gone_at END`
          )
          .bind(
            sourceKey,
            job.platform,
            job.url,
            digest,
            payload,
            nowIso,
            complete ? 1 : 0,
            JSON.stringify(itemIssues),
            principal.nodeId,
            request.leaseId,
            sourceProfile.profileId
          )
      );

      // Gate non-VRChat items out of canonical projection while retaining source_items audit rows for funnel conservation.
      if (observation.vrchatRelevance && !observation.vrchatRelevance.isRelevant) {
        continue;
      }

      const displayTitle = cleanTitle(observation.title);
      const ownerKey = normalizeOwnerKey(observation.ownerKey);
      const ownerName = normalizeOwnerName(observation.ownerName ?? observation.author);
      const normalizedTags = normalizeTags(observation.platformTags);
      const qualityFlags = this.collectObservationQualityFlags(job.platform, observation);
      const desktopEvidence = normalizeDesktopToolEvidence(observation.desktopToolEvidence);
      const publishedSummary =
        sourceProfile.publishClasses.includes("creator_prose") && observation.summary.trim().length > 0
          ? observation.summary.trim().slice(0, 1024)
          : null;
      const attributesJson = desktopEvidence ? JSON.stringify({ desktopToolEvidence: desktopEvidence }) : "{}";

      const linkedCanonicalIds = new Set<string>();
      const highConfidenceCanonicalIds = new Set<string>();

      const existingSourcesRes = await this.ctx.db
        .prepare(
          `SELECT canonical_id FROM listing_sources
           WHERE source_key = ? AND review_state IN ('accepted', 'provisional')`
        )
        .bind(sourceKey)
        .all<{ canonical_id: string }>();
      const existingCanonicalSet = new Set((existingSourcesRes.results || []).map((row) => row.canonical_id));
      for (const cid of existingCanonicalSet) {
        linkedCanonicalIds.add(cid);
      }

      if (job.platform === "vpm" && complete) {
        const vpmId = observation.sourceItemKey;
        const vpmLatestVersion = this.extractLatestVpmVersion(observation);
        const vpmRepoUrl = cleanTrackingParams(job.url);
        const umbrella = deriveUmbrellaFromTags(normalizedTags, "tools");
        const category = deriveCategoryFromTags(normalizedTags, "vpm_package");

        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO canonical_packages(
                 canonical_id, umbrella, category, lifecycle, tombstone_reason,
                 display_name, owner_key, owner_name,
                 verification_status, verified_by_app_id,
                 vpm_id, vpm_latest_version, vpm_repo_url,
                 summary, tags_json, quality_flags_json, attributes_json,
                 created_at, updated_at, published_at, timestamp_confidence, content_rating
               ) VALUES (?, ?, ?, 'active', NULL, ?, ?, ?, 'unverified', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'general')
               ON CONFLICT(canonical_id) DO UPDATE SET
                 display_name = excluded.display_name,
                 owner_key = COALESCE(excluded.owner_key, canonical_packages.owner_key),
                 owner_name = COALESCE(excluded.owner_name, canonical_packages.owner_name),
                 vpm_id = COALESCE(excluded.vpm_id, canonical_packages.vpm_id),
                 vpm_latest_version = COALESCE(excluded.vpm_latest_version, canonical_packages.vpm_latest_version),
                 vpm_repo_url = COALESCE(excluded.vpm_repo_url, canonical_packages.vpm_repo_url),
                 summary = COALESCE(excluded.summary, canonical_packages.summary),
                 tags_json = CASE WHEN excluded.tags_json != '[]' THEN excluded.tags_json ELSE canonical_packages.tags_json END,
                 quality_flags_json = excluded.quality_flags_json,
                 attributes_json = CASE WHEN excluded.attributes_json != '{}' THEN excluded.attributes_json ELSE canonical_packages.attributes_json END,
                 updated_at = excluded.updated_at`
            )
            .bind(
              vpmId,
              umbrella,
              category,
              displayTitle,
              ownerKey,
              ownerName,
              vpmId,
              vpmLatestVersion,
              vpmRepoUrl,
              publishedSummary,
              JSON.stringify(normalizedTags),
              JSON.stringify(qualityFlags),
              attributesJson,
              nowIso,
              nowIso
            ),
          this.ctx.db
            .prepare(
              `INSERT INTO listing_sources(
                 source_link_id, canonical_id, source_key, platform, storefront_url,
                 evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
               ) VALUES (?, ?, ?, 'vpm', ?, 'vpm_id', 1.0, 'accepted', NULL, NULL, 'available', ?, ?)
               ON CONFLICT(canonical_id, source_key) DO UPDATE SET
                 storefront_url = excluded.storefront_url,
                 availability = 'available',
                 observed_at = excluded.observed_at`
            )
            .bind(crypto.randomUUID(), vpmId, sourceKey, vpmRepoUrl, nowIso, nowIso)
        );
        linkedCanonicalIds.add(vpmId);

        for (const outbound of observation.outboundLinks) {
          const targetUrl = new URL(outbound).href;
          if (findMatchingSuppressedTarget(targetUrl, suppressedTargets)) continue;
          const targetHost = normalizeTargetHost(targetUrl);
          const leadKind = classifyOutboundLeadKind(targetUrl);
          if (!leadKind || !targetHost) continue;

          const identity = [job.url, vpmId, leadKind, targetUrl, vpmId];
          const leadKey = await sha256Hex(JSON.stringify(identity));
          if (!seenLeadKeys.has(leadKey)) {
            seenLeadKeys.add(leadKey);
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT INTO source_leads(
                     lead_key, discovered_from_url, discovered_from_job_id, discovered_from_item_key,
                     kind, target_url, target_host, claimed_package_id, status,
                     first_seen_at, last_seen_at, first_seen_node_id, first_seen_lease_id, first_seen_profile_id,
                     last_seen_node_id, last_seen_lease_id, last_seen_profile_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(lead_key) DO UPDATE SET
                     target_host = excluded.target_host,
                     last_seen_at = excluded.last_seen_at,
                     last_seen_node_id = excluded.last_seen_node_id,
                     last_seen_lease_id = excluded.last_seen_lease_id,
                     last_seen_profile_id = excluded.last_seen_profile_id`
                )
                .bind(
                  leadKey,
                  job.url,
                  job.job_id,
                  vpmId,
                  leadKind,
                  targetUrl,
                  targetHost,
                  vpmId,
                  nowIso,
                  nowIso,
                  principal.nodeId,
                  request.leaseId,
                  sourceProfile.profileId,
                  principal.nodeId,
                  request.leaseId,
                  sourceProfile.profileId
                )
            );
            pendingOutboundLeads.push({ kind: leadKind, url: targetUrl, leadKey });
          }
        }
      }

      if (job.platform === "github" && complete) {
        const normalizedHtmlUrl = normalizeGitHubRepositoryUrl(job.url)?.toLowerCase();
        if (normalizedHtmlUrl) {
          const linkedRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT ls.canonical_id
               FROM source_leads sl
               JOIN listing_sources ls ON (
                 (sl.discovered_from_item_key IS NOT NULL AND (
                   ls.canonical_id = sl.discovered_from_item_key
                   OR ls.source_key = sl.discovered_from_item_key
                   OR ls.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
                 ))
                 OR (sl.claimed_package_id IS NOT NULL AND ls.canonical_id = sl.claimed_package_id)
               )
               WHERE sl.kind = 'github_repository'
                 AND LOWER(RTRIM(CASE WHEN RTRIM(sl.target_url, '/') LIKE '%.git' THEN SUBSTR(RTRIM(sl.target_url, '/'), 1, LENGTH(RTRIM(sl.target_url, '/')) - 4) ELSE RTRIM(sl.target_url, '/') END, '/')) = ?
                 AND ls.review_state = 'accepted'
                 AND ls.evidence_kind = 'vpm_id'`
            )
            .bind(normalizedHtmlUrl)
            .all<{ canonical_id: string }>();

          const ghRepoUrl = normalizeGitHubRepositoryUrl(job.url) ?? job.url;
          for (const { canonical_id } of linkedRes.results || []) {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT OR IGNORE INTO listing_sources(
                     source_link_id, canonical_id, source_key, platform, storefront_url,
                     evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
                   ) VALUES (?, ?, ?, 'github', ?, 'repository_match', 0.7, 'provisional', NULL, NULL, 'available', ?, NULL)`
                )
                .bind(crypto.randomUUID(), canonical_id, sourceKey, ghRepoUrl, nowIso)
            );
            linkedCanonicalIds.add(canonical_id);
          }
        }
      }

      if (isStorefront) {
        for (const outbound of observation.outboundLinks) {
          const normalizedOutbound = new URL(outbound).href;
          const matchesRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT ls.canonical_id
               FROM listing_sources ls
               JOIN source_items si ON si.source_key = ls.source_key
               WHERE si.source_url = ? AND ls.review_state IN ('accepted', 'provisional')`
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
                `SELECT DISTINCT ls.canonical_id
                 FROM listing_sources ls
                 JOIN source_items si ON si.source_key = ls.source_key
                 WHERE si.platform = 'github' AND LOWER(RTRIM(si.source_url, '/')) = ?
                   AND ls.review_state IN ('accepted', 'provisional')`
              )
              .bind(apiGhUrl)
              .all<{ canonical_id: string }>();
            for (const { canonical_id } of ghMatchesRes.results || []) {
              linkedCanonicalIds.add(canonical_id);
            }
          }

          const leadMatchesRes = await this.ctx.db
            .prepare(
              `SELECT DISTINCT ls.canonical_id
               FROM source_leads sl
               JOIN listing_sources ls ON (
                 (sl.discovered_from_item_key IS NOT NULL AND (
                   ls.canonical_id = sl.discovered_from_item_key
                   OR ls.source_key = sl.discovered_from_item_key
                   OR ls.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
                 ))
                 OR (sl.claimed_package_id IS NOT NULL AND ls.canonical_id = sl.claimed_package_id)
               )
               WHERE sl.target_url = ? AND ls.review_state IN ('accepted', 'provisional')`
            )
            .bind(normalizedOutbound)
            .all<{ canonical_id: string }>();
          for (const { canonical_id } of leadMatchesRes.results || []) {
            linkedCanonicalIds.add(canonical_id);
          }
        }

        const jobLeadMatchesRes = await this.ctx.db
          .prepare(
            `SELECT DISTINCT ls.canonical_id, sl.status AS lead_status
             FROM source_leads sl
             JOIN listing_sources ls ON (
               (sl.discovered_from_item_key IS NOT NULL AND (
                 ls.canonical_id = sl.discovered_from_item_key
                 OR ls.source_key = sl.discovered_from_item_key
                 OR ls.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
               ))
               OR (sl.claimed_package_id IS NOT NULL AND ls.canonical_id = sl.claimed_package_id)
             )
             WHERE sl.target_url = ? AND ls.review_state IN ('accepted', 'provisional')`
          )
          .bind(job.url)
          .all<{ canonical_id: string; lead_status: string }>();
        for (const r of jobLeadMatchesRes.results || []) {
          linkedCanonicalIds.add(r.canonical_id);
          if (r.lead_status === "approved") {
            highConfidenceCanonicalIds.add(r.canonical_id);
          }
        }
      }

      if (isStorefront && complete && linkedCanonicalIds.size === 0) {
        const canonicalId = observation.sourceItemKey;
        const umbrella = desktopEvidence && desktopEvidence.particularVRChatTarget
          ? "tools"
          : deriveUmbrellaFromTags(normalizedTags, "assets");
        const category = deriveCategoryFromTags(
          normalizedTags,
          desktopEvidence && desktopEvidence.particularVRChatTarget
            ? desktopEvidence.toolSubtype
            : "storefront_package"
        );
        const storefrontUrl = cleanTrackingParams(observation.storefrontUrl ?? job.url);
        const price = observation.price ?? null;
        const currency = observation.currency ?? null;
        const availability = observation.availability ?? "available";

        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO canonical_packages(
                 canonical_id, umbrella, category, lifecycle, tombstone_reason,
                 display_name, owner_key, owner_name,
                 verification_status, verified_by_app_id,
                 vpm_id, vpm_latest_version, vpm_repo_url,
                 summary, tags_json, quality_flags_json, attributes_json,
                 created_at, updated_at, published_at, timestamp_confidence, content_rating
               ) VALUES (?, ?, ?, 'active', NULL, ?, ?, ?, 'unverified', NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, 'general')
               ON CONFLICT(canonical_id) DO UPDATE SET
                 display_name = excluded.display_name,
                 owner_key = COALESCE(excluded.owner_key, canonical_packages.owner_key),
                 owner_name = COALESCE(excluded.owner_name, canonical_packages.owner_name),
                 summary = COALESCE(excluded.summary, canonical_packages.summary),
                 tags_json = CASE WHEN excluded.tags_json != '[]' THEN excluded.tags_json ELSE canonical_packages.tags_json END,
                 quality_flags_json = excluded.quality_flags_json,
                 attributes_json = CASE WHEN excluded.attributes_json != '{}' THEN excluded.attributes_json ELSE canonical_packages.attributes_json END,
                 updated_at = excluded.updated_at`
            )
            .bind(
              canonicalId,
              umbrella,
              category,
              displayTitle,
              ownerKey,
              ownerName,
              publishedSummary,
              JSON.stringify(normalizedTags),
              JSON.stringify(qualityFlags),
              attributesJson,
              nowIso,
              nowIso
            ),
          this.ctx.db
            .prepare(
              `INSERT INTO listing_sources(
                 source_link_id, canonical_id, source_key, platform, storefront_url,
                 evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
               ) VALUES (?, ?, ?, ?, ?, 'cross_storefront_link', 1.0, 'accepted', ?, ?, ?, ?, ?)
               ON CONFLICT(canonical_id, source_key) DO UPDATE SET
                 platform = excluded.platform,
                 storefront_url = excluded.storefront_url,
                 price = excluded.price,
                 currency = excluded.currency,
                 availability = excluded.availability,
                 observed_at = excluded.observed_at`
            )
            .bind(crypto.randomUUID(), canonicalId, sourceKey, job.platform, storefrontUrl, price, currency, availability, nowIso, nowIso)
        );
        linkedCanonicalIds.add(canonicalId);
      } else if (isStorefront) {
        const storefrontUrl = cleanTrackingParams(observation.storefrontUrl ?? job.url);
        const price = observation.price ?? null;
        const currency = observation.currency ?? null;
        const availability = observation.availability ?? "available";

        for (const canonicalId of linkedCanonicalIds) {
          const isHighConfidence = highConfidenceCanonicalIds.has(canonicalId);
          const alreadyLinked =
            existingCanonicalSet.has(canonicalId) || canonicalId === observation.sourceItemKey;
          if (!alreadyLinked) {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `INSERT INTO listing_sources(
                     source_link_id, canonical_id, source_key, platform, storefront_url,
                     evidence_kind, confidence, review_state, price, currency, availability, observed_at, reviewed_at
                   ) VALUES (?, ?, ?, ?, ?, 'cross_storefront_link', ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(canonical_id, source_key) DO UPDATE SET
                     platform = excluded.platform,
                     storefront_url = excluded.storefront_url,
                     price = excluded.price,
                     currency = excluded.currency,
                     availability = excluded.availability,
                     observed_at = excluded.observed_at`
                )
                .bind(
                  crypto.randomUUID(),
                  canonicalId,
                  sourceKey,
                  job.platform,
                  storefrontUrl,
                  isHighConfidence ? 0.95 : 0.8,
                  isHighConfidence ? "accepted" : "provisional",
                  price,
                  currency,
                  availability,
                  nowIso,
                  isHighConfidence ? nowIso : null
                )
            );
          } else {
            batchStmts.push(
              this.ctx.db
                .prepare(
                  `UPDATE listing_sources
                   SET platform = ?,
                       storefront_url = ?,
                       price = ?,
                       currency = ?,
                       availability = ?,
                       observed_at = ?,
                       confidence = CASE WHEN ? = 1 AND review_state = 'provisional' THEN 0.95 ELSE confidence END,
                       review_state = CASE WHEN ? = 1 AND review_state = 'provisional' THEN 'accepted' ELSE review_state END,
                       reviewed_at = CASE WHEN ? = 1 AND review_state = 'provisional' THEN ? ELSE reviewed_at END
                   WHERE canonical_id = ? AND source_key = ?`
                )
                .bind(
                  job.platform,
                  storefrontUrl,
                  price,
                  currency,
                  availability,
                  nowIso,
                  isHighConfidence ? 1 : 0,
                  isHighConfidence ? 1 : 0,
                  isHighConfidence ? 1 : 0,
                  nowIso,
                  canonicalId,
                  sourceKey
                )
            );
          }
        }
      }

      if (desktopEvidence && linkedCanonicalIds.size > 0) {
        for (const canonicalId of linkedCanonicalIds) {
          batchStmts.push(
            this.ctx.db
              .prepare(
                `UPDATE canonical_packages
                 SET attributes_json = json_set(COALESCE(NULLIF(attributes_json, ''), '{}'), '$.desktopToolEvidence', json(?)),
                     updated_at = ?
                 WHERE canonical_id = ?`
              )
              .bind(JSON.stringify(desktopEvidence), nowIso, canonicalId)
          );
        }
      }

      const avatarRelations = normalizeAvatarCompatibilities(observation.avatarCompatibilities);
      const vpmDeps = job.platform === "vpm" && complete ? this.collectVpmDependencies(observation) : [];

      for (const canonicalId of linkedCanonicalIds) {
        if (avatarRelations.length > 0 || vpmDeps.length > 0) {
          const existingRelRes = await this.ctx.db
            .prepare(
              `SELECT relation_id, target_canonical_id, target_avatar_base, relation_type
               FROM listing_relations
               WHERE source_key = ? AND source_canonical_id = ?`
            )
            .bind(sourceKey, canonicalId)
            .all<{
              relation_id: string;
              target_canonical_id: string | null;
              target_avatar_base: string | null;
              relation_type: string;
            }>();
          const existingRels = existingRelRes.results || [];

          const seenAvatarBases = new Set<string>();
          for (const rel of avatarRelations) {
            seenAvatarBases.add(rel.targetAvatarBase);
            const matched = existingRels.find(
              (r) => r.relation_type === "compatible_with_avatar" && r.target_avatar_base === rel.targetAvatarBase
            );
            if (matched) {
              batchStmts.push(
                this.ctx.db
                  .prepare(
                    `UPDATE listing_relations
                     SET scope = ?, confidence = ?, evidence_source = ?, updated_at = ?
                     WHERE relation_id = ?`
                  )
                  .bind(rel.scope, rel.confidence, rel.evidenceSource, nowIso, matched.relation_id)
              );
            } else {
              batchStmts.push(
                this.ctx.db
                  .prepare(
                    `INSERT INTO listing_relations(
                       relation_id, source_key, source_canonical_id, target_canonical_id, target_avatar_base,
                       relation_type, scope, confidence, evidence_source, feedback_up_count, feedback_down_count, created_at, updated_at
                     ) VALUES (?, ?, ?, NULL, ?, 'compatible_with_avatar', ?, ?, ?, 0, 0, ?, ?)`
                  )
                  .bind(
                    crypto.randomUUID(),
                    sourceKey,
                    canonicalId,
                    rel.targetAvatarBase,
                    rel.scope,
                    rel.confidence,
                    rel.evidenceSource,
                    nowIso,
                    nowIso
                  )
              );
            }
          }

          for (const existing of existingRels) {
            if (
              existing.relation_type === "compatible_with_avatar" &&
              existing.target_avatar_base &&
              !seenAvatarBases.has(existing.target_avatar_base)
            ) {
              batchStmts.push(
                this.ctx.db.prepare("DELETE FROM listing_relations WHERE relation_id = ?").bind(existing.relation_id)
              );
            }
          }

          const seenDeps = new Set<string>();
          for (const dep of vpmDeps) {
            seenDeps.add(dep.depId);
            const matched = existingRels.find(
              (r) => r.relation_type === "depends_on" && r.target_canonical_id === dep.depId
            );
            if (!matched) {
              batchStmts.push(
                this.ctx.db
                  .prepare(
                    `INSERT INTO listing_relations(
                       relation_id, source_key, source_canonical_id, target_canonical_id, target_avatar_base,
                       relation_type, scope, confidence, evidence_source, feedback_up_count, feedback_down_count, created_at, updated_at
                     ) VALUES (?, ?, ?, ?, NULL, 'depends_on', 'exact', 0.9, 'vpm_manifest', 0, 0, ?, ?)`
                  )
                  .bind(crypto.randomUUID(), sourceKey, canonicalId, dep.depId, nowIso, nowIso)
              );
            }
          }

          for (const existing of existingRels) {
            if (
              existing.relation_type === "depends_on" &&
              existing.target_canonical_id &&
              !seenDeps.has(existing.target_canonical_id)
            ) {
              batchStmts.push(
                this.ctx.db.prepare("DELETE FROM listing_relations WHERE relation_id = ?").bind(existing.relation_id)
              );
            }
          }
        }
      }
    }

    if (outcome.kind === "partial_batch") {
      const observedKeys = new Set(observations.map((obs) => obs.sourceItemKey));
      for (const issue of outcome.issues) {
        if (observedKeys.has(issue.sourceItemKey)) continue;
        const sourceKey = `${job.platform}:${job.url}:${issue.sourceItemKey}`;
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO source_items(
                 source_key, platform, source_url, latest_digest, payload_json, observed_at,
                 complete, issues_json, contributor_node_id, submission_lease_id, steering_profile_id, gone_at
               ) VALUES (?, ?, ?, ?, '{}', ?, 0, ?, ?, ?, ?, NULL)
               ON CONFLICT(source_key) DO UPDATE SET
                 observed_at = excluded.observed_at,
                 complete = 0,
                 issues_json = excluded.issues_json,
                 contributor_node_id = excluded.contributor_node_id,
                 submission_lease_id = excluded.submission_lease_id,
                 steering_profile_id = excluded.steering_profile_id`
            )
            .bind(
              sourceKey,
              job.platform,
              job.url,
              await sha256Hex(JSON.stringify(issue)),
              nowIso,
              JSON.stringify([issue]),
              principal.nodeId,
              request.leaseId,
              sourceProfile.profileId
            )
        );
      }
    }

    if (outcome.kind === "gone") {
      const currentItemsRes = await this.ctx.db
        .prepare("SELECT source_key FROM source_items WHERE platform = ? AND source_url = ? AND gone_at IS NULL")
        .bind(job.platform, job.url)
        .all<{ source_key: string }>();
      for (const item of currentItemsRes.results || []) {
        batchStmts.push(
          this.ctx.db.prepare("UPDATE source_items SET gone_at = ? WHERE source_key = ?").bind(nowIso, item.source_key),
          this.ctx.db
            .prepare("UPDATE listing_sources SET availability = 'delisted', observed_at = ? WHERE source_key = ?")
            .bind(nowIso, item.source_key),
          this.ctx.db
            .prepare(
              `UPDATE canonical_packages
               SET lifecycle = 'delisted', tombstone_reason = 'delisted', updated_at = ?
               WHERE canonical_id IN (SELECT canonical_id FROM listing_sources WHERE source_key = ?)
                 AND vpm_id IS NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM listing_sources ls2
                   WHERE ls2.canonical_id = canonical_packages.canonical_id
                     AND ls2.review_state = 'accepted'
                     AND ls2.availability = 'available'
                 )`
            )
            .bind(nowIso, item.source_key)
        );
      }
    }

    const discoveryLeads: Array<{ lead: { kind: "vpm_listing" | "github_repository" | "release_zip" | "creator_profile" | "publisher_site" | "storefront_product"; url: string; discoveredFromItemKey?: string; claimedPackageId?: string }; leadKey: string; targetHost: string }> = [];
    if (outcome.kind === "discovery") {
      for (const reportedLead of outcome.leads) {
        const normalizedUrl = new URL(reportedLead.url).href;
        if (findMatchingSuppressedTarget(normalizedUrl, suppressedTargets)) continue;
        const targetHost = normalizeTargetHost(normalizedUrl);
        if (!targetHost) continue;
        const identity = reportedLead.discoveredFromItemKey
          ? [job.url, reportedLead.discoveredFromItemKey, reportedLead.kind, normalizedUrl, reportedLead.claimedPackageId || null]
          : [job.url, reportedLead.kind, normalizedUrl, reportedLead.claimedPackageId || null];
        const leadKey = await sha256Hex(JSON.stringify(identity));
        if (seenLeadKeys.has(leadKey)) continue;
        seenLeadKeys.add(leadKey);
        discoveryLeads.push({
          lead: { ...reportedLead, url: normalizedUrl },
          leadKey,
          targetHost
        });
      }

      for (const { lead, leadKey, targetHost } of discoveryLeads) {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO source_leads(
                 lead_key, discovered_from_url, discovered_from_job_id, discovered_from_item_key,
                 kind, target_url, target_host, claimed_package_id, status,
                 first_seen_at, last_seen_at, first_seen_node_id, first_seen_lease_id, first_seen_profile_id,
                 last_seen_node_id, last_seen_lease_id, last_seen_profile_id
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(lead_key) DO UPDATE SET
                 target_host = excluded.target_host,
                 last_seen_at = excluded.last_seen_at,
                 last_seen_node_id = excluded.last_seen_node_id,
                 last_seen_lease_id = excluded.last_seen_lease_id,
                 last_seen_profile_id = excluded.last_seen_profile_id`
            )
            .bind(
              leadKey,
              job.url,
              job.job_id,
              lead.discoveredFromItemKey || null,
              lead.kind,
              lead.url,
              targetHost,
              lead.claimedPackageId || null,
              nowIso,
              nowIso,
              principal.nodeId,
              request.leaseId,
              sourceProfile.profileId,
              principal.nodeId,
              request.leaseId,
              sourceProfile.profileId
            )
        );
      }

      if (
        outcome.nextPageLead &&
        sourceProfile.queryMode === "pagination" &&
        job.pagination_depth + 1 <= sourceProfile.maxPaginationDepth &&
        !findMatchingSuppressedTarget(outcome.nextPageLead, suppressedTargets) &&
        steeringProfileMatches(sourceProfile, job.platform, outcome.nextPageLead, job.job_purpose, nowMs)
      ) {
        const nextUrl = new URL(outcome.nextPageLead);
        batchStmts.push(
          this.ctx.db
            .prepare(
              `INSERT OR IGNORE INTO crawl_jobs(
                 job_id, platform, url, origin, state, priority_lane, recrawl_interval_ms, pagination_depth,
                 next_fetch_at, created_at, steering_profile_id, job_purpose
               ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              crypto.randomUUID(),
              job.platform,
              nextUrl.href,
              nextUrl.origin,
              job.priority_lane,
              job.recrawl_interval_ms,
              job.pagination_depth + 1,
              nowIso,
              nowIso,
              sourceProfile.profileId,
              job.job_purpose
            )
        );
      }
    }

    let state: JobRow["state"] = "done";
    let nextFetchAt = new Date(
      nowMs + (outcome.kind === "gone" ? GONE_RECRAWL_MS : job.recrawl_interval_ms)
    ).toISOString();

    if (outcome.kind === "rate_limited") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + outcome.retryAfterSeconds * 1000).toISOString();
    } else if (outcome.kind === "temporary_failure") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + TEMPORARY_FAILURE_RETRY_MS).toISOString();
    } else if (outcome.kind === "blocked") {
      state = "blocked";
      nextFetchAt = new Date(nowMs + BLOCKED_BACKOFF_MS).toISOString();
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
        .prepare(
          `UPDATE crawl_jobs
           SET state = ?, next_fetch_at = ?, claimed_by = NULL, lease_id = NULL, lease_expires_at = NULL
           WHERE job_id = ?`
        )
        .bind(state, nextFetchAt, job.job_id),
      this.ctx.db
        .prepare(
          `UPDATE origin_state
           SET active_job_id = NULL,
               lease_expires_at = NULL,
               next_allowed_at = MAX(next_allowed_at, ?)
           WHERE origin = ? AND active_job_id = ?`
        )
        .bind(outcome.kind === "rate_limited" || outcome.kind === "blocked" ? nextFetchAt : nowIso, job.origin, job.job_id),
      this.ctx.db
        .prepare(
          `INSERT INTO job_results(lease_id, job_id, node_id, idempotency_key, request_digest, response_json, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          request.leaseId,
          job.job_id,
          principal.nodeId,
          request.idempotencyKey,
          requestDigest,
          JSON.stringify(response),
          nowIso
        )
    );

    if (batchStmts.length > 0) {
      await this.ctx.executeBatchChunked(batchStmts);
    }

    const leadsToConsider = [
      ...discoveryLeads.map((entry) => ({ kind: entry.lead.kind, url: entry.lead.url, leadKey: entry.leadKey })),
      ...pendingOutboundLeads
    ];
    if (leadsToConsider.length > 0) {
      const autoProfiles = (await this.ctx.loadActiveSteeringProfiles()).filter((p) => p.autoPromote);
      if (autoProfiles.length > 0) {
        await this.tryAutoPromoteLeads(leadsToConsider, autoProfiles, suppressedTargets, nowMs, nowIso);
      }
    }

    return response;
  }

  private async tryAutoPromoteLeads(
    leads: ReadonlyArray<{ kind: DiscoveryLead["kind"]; url: string; leadKey: string }>,
    autoProfiles: readonly SteeringProfile[],
    suppressedTargets: readonly SuppressedTarget[],
    nowMs: number,
    nowIso: string
  ): Promise<number> {
    let promoted = 0;
    for (const candidate of leads) {
      const statusRow = await this.ctx.db
        .prepare("SELECT status FROM source_leads WHERE lead_key = ?")
        .bind(candidate.leadKey)
        .first<{ status: string }>();
      if (statusRow?.status !== "pending_review") continue;

      const resolved = resolveDiscoveryLeadTarget(candidate.kind, candidate.url);
      if (!resolved) continue;
      if (findMatchingSuppressedTarget(resolved.url, suppressedTargets)) continue;

      const matchedProfile = autoProfiles.find((profile) =>
        steeringProfileMatches(profile, resolved.platform, resolved.url, resolved.purpose, nowMs)
      );
      if (!matchedProfile) continue;

      try {
        if (resolved.url !== candidate.url && resolved.platform === "github") {
          // Non-canonical GitHub HTML URL resolved to REST API target: seed directly with resolved API URL
          await this.seedJobFn(resolved.url, resolved.platform, {
            minDelayMs: Math.max(matchedProfile.minDelayMs, resolved.minDelayMs),
            purpose: resolved.purpose,
            priorityLane: 2,
            recrawlIntervalMs: matchedProfile.recrawlIntervalMs,
            steeringProfileId: matchedProfile.profileId,
            audit: {
              actor: `auto-profile:${matchedProfile.profileId}`,
              reason: "Matched active steering profile with autoPromote enabled",
              leadKey: candidate.leadKey
            }
          });
        } else {
          await this.approveLeadFn(
            candidate.leadKey,
            Math.max(matchedProfile.minDelayMs, resolved.minDelayMs),
            `auto-profile:${matchedProfile.profileId}`,
            "Matched active steering profile with autoPromote enabled"
          );
        }
        promoted += 1;
      } catch (cause) {
        await this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             VALUES ('profile', ?, 'coordinator', 'promotion_failed', ?, ?)`
          )
          .bind(
            matchedProfile.profileId,
            cause instanceof Error ? cause.message.slice(0, 300) : "Unknown promotion failure",
            nowIso
          )
          .run();
      }
    }
    return promoted;
  }

  async retryPendingAutoPromotions(limit = 20): Promise<number> {
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    const hasAutoPromote = await this.ctx.db
      .prepare(
        `SELECT 1 FROM steering_profiles
         WHERE auto_promote = 1 AND disabled_at IS NULL AND expires_at > ? LIMIT 1`
      )
      .bind(nowIso)
      .first();
    if (!hasAutoPromote) return 0;

    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const [autoProfiles, suppressedTargets, pendingRes] = await Promise.all([
      this.ctx.loadActiveSteeringProfiles().then((profiles) => profiles.filter((p) => p.autoPromote)),
      this.ctx.loadSuppressedTargets(),
      this.ctx.db
        .prepare(
          `SELECT lead_key, kind, target_url AS url FROM source_leads
           WHERE status = 'pending_review'
           ORDER BY last_seen_at DESC, lead_key ASC
           LIMIT ?`
        )
        .bind(boundedLimit)
        .all<{ lead_key: string; kind: DiscoveryLead["kind"]; url: string }>()
    ]);

    const rows = pendingRes.results || [];
    if (rows.length === 0 || autoProfiles.length === 0) return 0;

    return this.tryAutoPromoteLeads(
      rows.map((row) => ({ kind: row.kind, url: row.url, leadKey: row.lead_key })),
      autoProfiles,
      suppressedTargets,
      nowMs,
      nowIso
    );
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
