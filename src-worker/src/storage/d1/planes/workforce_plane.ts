import type { PriorityLane } from "vrc-packages-api";
import { isIp, isPrivateOrReservedIp } from "vrc-packages-network/ip-policy";
import {
  PROTOCOL_VERSION,
  PlatformSchema,
  type ClaimRequest,
  type ClaimResponse,
  type CrawlJob,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type Platform
} from "vrc-packages-network/node";
import { OriginRobotsSnapshotSchema, ROBOTS_REFRESH_LEASE_MS } from "vrc-packages-network/robots";
import { isItchSearchUrl } from "vrc-packages-network/source-paths";
import {
  githubApiRepositoryIdentity,
  isSellfyProductTarget,
  isShopifyProductSitemapTarget,
  shopifyProductLead
} from "vrc-packages-network/source-targets";
import {
  findMatchingSuppressedTarget,
  steeringProfileMatches,
  type SourcePurpose,
  type SteeringProfile
} from "../../../domain/access/steering_profile.ts";
import { CoordinatorConflict, type NodePrincipal } from "../../../domain/ports/stores.ts";
import { isValidNodeCredentialToken, parseCapabilityToken } from "../../../domain/security/capability_token.ts";
import { sha256Hex, timingSafeEqual } from "../../../domain/security/crypto_primitives.ts";
import type { D1PreparedStatement, JobRow } from "../definitions.ts";
import type { SeedJobOptions } from "./operator_plane.ts";
import { CRAWL_JOB_LEASE_MS, D1PlaneContext } from "./shared_context.ts";

const DEFAULT_DISCOVERY_RECRAWL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_VPM_RECRAWL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_METADATA_RECRAWL_MS = 24 * 60 * 60 * 1000;
const MAX_CLAIM_SCAN_PAGES = 3;
const CLAIM_PAGE_SIZE = 100;

export function defaultRecrawlIntervalMs(platform: Platform, purpose: SourcePurpose): number {
  if (purpose === "discovery") return DEFAULT_DISCOVERY_RECRAWL_MS;
  if (platform === "vpm") return DEFAULT_VPM_RECRAWL_MS;
  return DEFAULT_METADATA_RECRAWL_MS;
}

export function defaultPriorityLane(platform: Platform, purpose: SourcePurpose): PriorityLane {
  if (platform === "vpm") return 1;
  if (purpose === "discovery") return 2;
  return 3;
}

export class WorkforcePlane {
  constructor(private readonly ctx: D1PlaneContext) {}

  private parseStoredCapabilities(raw: string): Platform[] | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const caps: Platform[] = [];
      for (const item of parsed) {
        const checked = PlatformSchema.safeParse(item);
        if (!checked.success) return null;
        caps.push(checked.data);
      }
      return caps;
    } catch {
      return null;
    }
  }

  async authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> {
    if (!isValidNodeCredentialToken(bearer)) return null;
    const row = await this.ctx.db
      .prepare("SELECT token_hash, capabilities_json, revoked_at FROM nodes WHERE node_id = ?")
      .bind(nodeId)
      .first<{ token_hash: string; capabilities_json: string; revoked_at: string | null }>();
    if (!row || row.revoked_at) return null;

    const suppliedHash = await sha256Hex(bearer);
    if (!timingSafeEqual(suppliedHash, row.token_hash)) return null;

    const storedCapabilities = this.parseStoredCapabilities(row.capabilities_json);
    const parsed = parseCapabilityToken(bearer);
    if (!storedCapabilities || !parsed) return null;

    const parsedSet = new Set(parsed.capabilities);
    const storedSet = new Set(storedCapabilities);
    if (parsedSet.size !== storedSet.size || [...parsedSet].some((cap) => !storedSet.has(cap))) {
      return null;
    }

    return {
      nodeId,
      capabilities: storedCapabilities,
      credentialVersion: row.token_hash
    };
  }

  async heartbeat(request: HeartbeatRequest, principal: NodePrincipal): Promise<HeartbeatResponse> {
    if (
      request.nodeId !== principal.nodeId ||
      request.capabilities.some((capability) => !principal.capabilities.includes(capability))
    ) {
      throw new CoordinatorConflict("Node identity or capability mismatch", 403);
    }
    await this.ctx.assertCurrentPrincipal(principal);

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    if (request.state === "fetching") {
      const live = await this.ctx.db
        .prepare(
          `SELECT * FROM crawl_jobs
           WHERE job_id = ? AND claimed_by = ? AND lease_id = ?
             AND state = 'leased' AND lease_expires_at > ?`
        )
        .bind(request.activeJobId, principal.nodeId, request.activeLeaseId, nowIso)
        .first<JobRow>();
      if (!live) {
        throw new CoordinatorConflict("Node does not hold an authorized active job", 403);
      }
      const suppressedTargets = await this.ctx.loadSuppressedTargets();
      if (findMatchingSuppressedTarget(live.url, suppressedTargets)) {
        throw new CoordinatorConflict("Target has been suppressed", 403);
      }
      const profile = await this.ctx.activeSteeringProfileForTarget(live.platform, live.url, live.job_purpose);
      if (!profile) {
        throw new CoordinatorConflict("Steering profile no longer authorizes this job", 403);
      }
    }

    const result = await this.ctx.db
      .prepare(
        `UPDATE nodes
         SET last_seen_at = ?, state = ?, active_job_id = ?
         WHERE node_id = ? AND token_hash = ? AND revoked_at IS NULL`
      )
      .bind(nowIso, request.state, request.state === "fetching" ? request.activeJobId : null, principal.nodeId, principal.credentialVersion)
      .run();
    if ((result.meta as { changes?: number } | undefined)?.changes !== 1) {
      throw new CoordinatorConflict("Node credential changed or revoked", 403);
    }

    return { schemaVersion: PROTOCOL_VERSION, status: "alive", serverTime: nowIso };
  }

  /**
   * Claims 1..10 eligible jobs ordered strictly by `priority_lane ASC, next_fetch_at ASC`
   * with fair per-origin skipping across `MAX_CLAIM_SCAN_PAGES` pages.
   */
  async claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    if (request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Capability not granted to node", 403);
    }
    await this.ctx.assertCurrentPrincipal(principal);

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    const maxJobs = Math.max(1, Math.min(request.maxJobs ?? 1, 10));

    const placeholders = request.capabilities.map(() => "?").join(",");
    const baseEligibleSql = `FROM crawl_jobs j
      JOIN origin_state o ON o.origin = j.origin
      WHERE j.platform IN (${placeholders})
        AND j.next_fetch_at <= ?
        AND (j.state IN ('pending', 'done', 'backoff') OR (j.state = 'leased' AND j.lease_expires_at <= ?))
        AND o.next_allowed_at <= ?
        AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
        AND o.robots_expires_at IS NOT NULL
        AND o.robots_expires_at > ?
        AND (o.refresh_lease_expires_at IS NULL OR o.refresh_lease_expires_at <= ?)`;
    const baseBindParams = (at: string) => [...request.capabilities, at, at, at, at, at, at];

    const selectQuery = `SELECT j.*,
        o.robots_snapshot_id, o.robots_status_code, o.robots_body, o.robots_fetched_at, o.robots_expires_at,
        o.active_job_id AS origin_active_job_id, o.lease_expires_at AS origin_lease_expires_at,
        o.next_allowed_at AS origin_next_allowed_at, o.min_delay_ms AS origin_min_delay_ms
      ${baseEligibleSql}
      ORDER BY j.priority_lane ASC, j.next_fetch_at ASC, j.created_at ASC, j.job_id ASC
      LIMIT ${CLAIM_PAGE_SIZE} OFFSET ?`;

    const [suppressedTargets] = await Promise.all([this.ctx.loadSuppressedTargets()]);
    const profileCache = new Map<string, SteeringProfile[]>();
    const leasedJobs: CrawlJob[] = [];
    const skippedOrReservedOrigins = new Set<string>();

    let offset = 0;
    for (let page = 0; page < MAX_CLAIM_SCAN_PAGES; page++) {
      const res = await this.ctx.db
        .prepare(selectQuery)
        .bind(...baseBindParams(nowIso), offset)
        .all<
          JobRow & {
            robots_snapshot_id: string | null;
            robots_status_code: number | null;
            robots_body: string | null;
            robots_fetched_at: string | null;
            robots_expires_at: string;
            origin_active_job_id: string | null;
            origin_lease_expires_at: string | null;
            origin_next_allowed_at: string;
            origin_min_delay_ms: number;
          }
        >();

      const candidates = res.results || [];
      if (candidates.length === 0) break;

      const removedJobIds = new Set<string>();
      const removedOrigins = new Set<string>();

      for (const job of candidates) {
        if (skippedOrReservedOrigins.has(job.origin)) continue;

        if (findMatchingSuppressedTarget(job.url, suppressedTargets)) {
          await this.ctx.db
            .prepare(
              `UPDATE crawl_jobs
               SET state = 'blocked', claimed_by = NULL, lease_id = NULL, lease_expires_at = NULL
               WHERE job_id = ? AND state != 'blocked'`
            )
            .bind(job.job_id)
            .run();
          removedJobIds.add(job.job_id);
          continue;
        }

        const profile = await this.ctx.activeSteeringProfileForTarget(
          job.platform,
          job.url,
          job.job_purpose,
          profileCache
        );
        if (!profile) {
          continue;
        }

        if (
          !this.ctx.robotsAllows({
            origin: job.origin,
            robots_snapshot_id: job.robots_snapshot_id,
            robots_status_code: job.robots_status_code,
            robots_body: job.robots_body,
            robots_fetched_at: job.robots_fetched_at,
            url: job.url
          })
        ) {
          const deferNow = new Date(this.ctx.now()).toISOString();
          await this.ctx.db
            .prepare(
              `UPDATE crawl_jobs
               SET next_fetch_at = ?,
                   robots_deferred_until = ?,
                   state = CASE WHEN state = 'leased' THEN 'pending' ELSE state END,
                   claimed_by = NULL,
                   lease_id = NULL,
                   lease_expires_at = NULL
               WHERE job_id = ?
                 AND EXISTS (
                   SELECT 1 FROM origin_state o
                   WHERE o.origin = ? AND o.robots_snapshot_id = ? AND o.robots_expires_at > ?
                 )`
            )
            .bind(
              job.robots_expires_at,
              job.robots_expires_at,
              job.job_id,
              job.origin,
              job.robots_snapshot_id,
              deferNow
            )
            .run();
          removedJobIds.add(job.job_id);
          continue;
        }

        const reservationMs = this.ctx.now();
        const reservationIso = new Date(reservationMs).toISOString();
        const leaseExpiresIso = new Date(reservationMs + CRAWL_JOB_LEASE_MS).toISOString();
        const leaseId = crypto.randomUUID();
        const effectiveDelay = Math.max(job.origin_min_delay_ms, profile.minDelayMs);
        const nextAllowedIso = new Date(reservationMs + effectiveDelay).toISOString();

        const reservation = await this.ctx.db.batch([
          this.ctx.db
            .prepare(
              `UPDATE crawl_jobs
               SET state = 'leased',
                   claimed_by = ?,
                   lease_id = ?,
                   lease_expires_at = ?,
                   steering_profile_id = ?
               WHERE job_id = ?
                 AND next_fetch_at <= ?
                 AND (state IN ('pending', 'done', 'backoff') OR (state = 'leased' AND lease_expires_at <= ?))
                 AND EXISTS (
                   SELECT 1 FROM origin_state o
                   WHERE o.origin = ?
                     AND o.robots_snapshot_id = ?
                     AND o.robots_expires_at > ?
                     AND (o.refresh_lease_expires_at IS NULL OR o.refresh_lease_expires_at <= ?)
                     AND o.next_allowed_at <= ?
                     AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
                     AND o.min_delay_ms = ?
                 )
                 AND EXISTS (
                   SELECT 1 FROM steering_profiles sp
                   WHERE sp.profile_id = ? AND sp.disabled_at IS NULL AND sp.expires_at > ?
                 )
                 AND EXISTS (
                   SELECT 1 FROM nodes n
                   WHERE n.node_id = ? AND n.token_hash = ? AND n.revoked_at IS NULL
                 )`
            )
            .bind(
              principal.nodeId,
              leaseId,
              leaseExpiresIso,
              profile.profileId,
              job.job_id,
              reservationIso,
              reservationIso,
              job.origin,
              job.robots_snapshot_id,
              reservationIso,
              reservationIso,
              reservationIso,
              reservationIso,
              job.origin_min_delay_ms,
              profile.profileId,
              reservationIso,
              principal.nodeId,
              principal.credentialVersion
            ),
          this.ctx.db
            .prepare(
              `UPDATE origin_state
               SET active_job_id = ?, lease_expires_at = ?, next_allowed_at = ?
               WHERE origin = ?
                 AND EXISTS (
                   SELECT 1 FROM crawl_jobs j
                   WHERE j.job_id = ? AND j.state = 'leased' AND j.lease_id = ? AND j.claimed_by = ?
                 )`
            )
            .bind(job.job_id, leaseExpiresIso, nextAllowedIso, job.origin, job.job_id, leaseId, principal.nodeId)
        ]);

        if ((reservation[0]?.meta as { changes?: number } | undefined)?.changes !== 1) {
          skippedOrReservedOrigins.add(job.origin);
          // Re-check whether the competing writer took the entire origin or only mutated this job row.
          const originStillEligible = await this.ctx.db
            .prepare(
              `SELECT 1 FROM origin_state
               WHERE origin = ?
                 AND next_allowed_at <= ?
                 AND (active_job_id IS NULL OR lease_expires_at <= ?)
                 AND robots_expires_at IS NOT NULL
                 AND robots_expires_at > ?
                 AND (refresh_lease_expires_at IS NULL OR refresh_lease_expires_at <= ?)`
            )
            .bind(job.origin, nowIso, nowIso, nowIso, nowIso)
            .first();
          if (!originStillEligible) {
            removedOrigins.add(job.origin);
          } else {
            const jobStillEligible = await this.ctx.db
              .prepare(
                `SELECT 1 FROM crawl_jobs
                 WHERE job_id = ?
                   AND next_fetch_at <= ?
                   AND (state IN ('pending', 'done', 'backoff') OR (state = 'leased' AND lease_expires_at <= ?))`
              )
              .bind(job.job_id, nowIso, nowIso)
              .first();
            if (!jobStillEligible) {
              removedJobIds.add(job.job_id);
            }
          }
          continue;
        }

        skippedOrReservedOrigins.add(job.origin);
        removedOrigins.add(job.origin);
        leasedJobs.push({
          jobId: job.job_id,
          leaseId,
          platform: job.platform,
          purpose: job.job_purpose,
          url: job.url,
          origin: job.origin,
          leaseExpiresAt: leaseExpiresIso,
          retainClasses: profile.retainClasses,
          etag: job.etag,
          lastModified: job.last_modified,
          priorityLane: job.priority_lane,
          paginationDepth: job.pagination_depth,
          maxPaginationDepth: profile.maxPaginationDepth
        });

        if (leasedJobs.length >= maxJobs) {
          return {
            schemaVersion: PROTOCOL_VERSION,
            status: "leased",
            job: leasedJobs[0],
            jobs: leasedJobs
          };
        }
      }

      if (candidates.length < CLAIM_PAGE_SIZE) break;
      let unremovedOnPage = 0;
      for (const candidate of candidates) {
        if (!removedJobIds.has(candidate.job_id) && !removedOrigins.has(candidate.origin)) {
          unremovedOnPage += 1;
        }
      }
      offset += unremovedOnPage;
    }

    if (leasedJobs.length > 0) {
      return {
        schemaVersion: PROTOCOL_VERSION,
        status: "leased",
        job: leasedJobs[0],
        jobs: leasedJobs
      };
    }
    return { schemaVersion: PROTOCOL_VERSION, status: "empty", retryAfterMs: 5000 };
  }

  async seedJob(url: string, platform: Platform, options: SeedJobOptions = {}): Promise<string> {
    const purpose: SourcePurpose = options.purpose ?? "metadata";
    const minDelayMs = options.minDelayMs ?? 1000;
    const audit = options.audit;

    if (
      audit &&
      (!audit.actor.trim() || audit.actor.length > 100 || !audit.reason.trim() || audit.reason.length > 300)
    ) {
      throw new Error("Seed audit actor and reason required");
    }
    if (audit?.leadKey !== undefined && !/^[a-f0-9]{64}$/.test(audit.leadKey)) {
      throw new Error("Invalid approval lead key");
    }

    PlatformSchema.parse(platform);
    if (purpose !== "metadata" && purpose !== "discovery") throw new Error("Invalid job purpose");

    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Crawl jobs require HTTPS");
    if (isItchSearchUrl(parsed.href)) throw new Error("itch.io /search is disallowed by published robots rules");
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (parsed.port && parsed.port !== "443") ||
      hostname.endsWith(".") ||
      hostname.toLowerCase() === "localhost" ||
      (isIp(hostname) && isPrivateOrReservedIp(hostname))
    ) {
      throw new Error("Crawl job target must be public credential-free HTTPS on port 443");
    }
    if (
      (platform === "github" || parsed.hostname === "api.github.com") &&
      (platform !== "github" || !githubApiRepositoryIdentity(parsed.href))
    ) {
      throw new Error("GitHub jobs require a public REST repository metadata endpoint");
    }
    if (platform === "shopify") {
      if (purpose === "discovery" && !isShopifyProductSitemapTarget(parsed.href)) {
        throw new Error("Shopify discovery jobs require an exact product-sitemap discovery URL");
      }
      if (purpose === "metadata" && !shopifyProductLead(parsed.href, parsed.origin)) {
        throw new Error("Shopify metadata jobs require an exact merchant product URL");
      }
    }
    if (platform === "sellfy" && purpose === "metadata" && !isSellfyProductTarget(parsed.href)) {
      throw new Error("Sellfy metadata jobs require an exact product URL");
    }
    if (!Number.isInteger(minDelayMs) || minDelayMs < 0 || minDelayMs > 86_400_000) {
      throw new Error("Invalid origin delay");
    }

    const effectiveMinDelayMs = platform === "github" ? Math.max(minDelayMs, 60_000) : minDelayMs;
    const priorityLane = options.priorityLane ?? defaultPriorityLane(platform, purpose);
    const recrawlIntervalMs = options.recrawlIntervalMs ?? defaultRecrawlIntervalMs(platform, purpose);
    const paginationDepth = options.paginationDepth ?? 0;
    const origin = parsed.origin;
    const nowIso = new Date(this.ctx.now()).toISOString();
    const id = crypto.randomUUID();

    const suppressedTargets = await this.ctx.loadSuppressedTargets();
    if (findMatchingSuppressedTarget(parsed.href, suppressedTargets)) {
      throw new Error("URL is suppressed and cannot be reseeded");
    }

    const leadGuardSql = `(? IS NULL OR EXISTS (
      SELECT 1 FROM source_leads WHERE lead_key = ? AND status IN ('pending_review', 'approved')
    ))`;
    const leadGuardParams = [audit?.leadKey ?? null, audit?.leadKey ?? null];

    const batchStmts: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `INSERT OR IGNORE INTO crawl_jobs(
             job_id, platform, url, origin, state, priority_lane, recrawl_interval_ms, pagination_depth,
             next_fetch_at, created_at, steering_profile_id, job_purpose
           )
           SELECT ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?
           WHERE ${leadGuardSql}`
        )
        .bind(
          id,
          platform,
          parsed.href,
          origin,
          priorityLane,
          recrawlIntervalMs,
          paginationDepth,
          nowIso,
          nowIso,
          options.steeringProfileId ?? null,
          purpose,
          ...leadGuardParams
        ),
      this.ctx.db
        .prepare(
          `INSERT OR IGNORE INTO origin_state(origin, active_job_id, lease_expires_at, next_allowed_at, min_delay_ms)
           SELECT ?, NULL, NULL, ?, ?
           WHERE EXISTS (SELECT 1 FROM crawl_jobs WHERE url = ? AND platform = ? AND job_purpose = ?)
             AND ${leadGuardSql}`
        )
        .bind(origin, nowIso, effectiveMinDelayMs, parsed.href, platform, purpose, ...leadGuardParams),
      this.ctx.db
        .prepare(
          `UPDATE origin_state
           SET min_delay_ms = MAX(min_delay_ms, ?)
           WHERE origin = ?
             AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url = ? AND platform = ? AND job_purpose = ?)
             AND ${leadGuardSql}`
        )
        .bind(effectiveMinDelayMs, origin, parsed.href, platform, purpose, ...leadGuardParams)
    ];

    if (audit?.leadKey !== undefined) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             SELECT 'lead', lead_key, ?, 'approve_lead', ?, ?
             FROM source_leads
             WHERE lead_key = ? AND status = 'pending_review'
               AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url = ? AND platform = ? AND job_purpose = ?)`
          )
          .bind(audit.actor, audit.reason.trim(), nowIso, audit.leadKey, parsed.href, platform, purpose),
        this.ctx.db
          .prepare(
            `UPDATE source_leads SET status = 'approved'
             WHERE lead_key = ? AND status = 'pending_review'
               AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url = ? AND platform = ? AND job_purpose = ?)`
          )
          .bind(audit.leadKey, parsed.href, platform, purpose)
      );
    } else if (audit) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             SELECT 'job', job_id, ?, 'seed', ?, ?
             FROM crawl_jobs
             WHERE url = ? AND platform = ? AND job_purpose = ?`
          )
          .bind(audit.actor, audit.reason.trim(), nowIso, parsed.href, platform, purpose)
      );
    }

    await this.ctx.executeBatchChunked(batchStmts);

    const stored = await this.ctx.db
      .prepare(
        `SELECT job_id, platform, job_purpose,
                (? IS NULL OR EXISTS (SELECT 1 FROM source_leads WHERE lead_key = ? AND status IN ('pending_review', 'approved'))) AS lead_active
         FROM (SELECT 1)
         LEFT JOIN crawl_jobs ON url = ?`
      )
      .bind(audit?.leadKey ?? null, audit?.leadKey ?? null, parsed.href)
      .first<{
        job_id: string | null;
        platform: Platform | null;
        job_purpose: SourcePurpose | null;
        lead_active: number;
      }>();

    if (stored && !stored.lead_active) throw new Error("Lead is no longer eligible for approval");
    if (!stored?.job_id) throw new Error("Job insertion failed");
    if (stored.platform !== platform) throw new Error("Existing job has a different reviewed platform");
    if (stored.job_purpose !== purpose) throw new Error("Existing job has a different reviewed purpose");
    return stored.job_id;
  }

  /**
   * Claims an expired or missing robots refresh lease constrained by node capabilities
   * and ordered round-robin across `refresh_lease_expires_at` and `robots_fetched_at` so contended origins do not starve others.
   */
  async claimDueRobotsRefresh(capabilities?: readonly Platform[]): Promise<{ origin: string; leaseId: string } | null> {
    const allowedPlatforms =
      capabilities && capabilities.length > 0 ? [...new Set(capabilities)] : [...PlatformSchema.options];
    if (allowedPlatforms.length === 0) return null;

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    const placeholders = allowedPlatforms.map(() => "?").join(",");

    const dueOriginsRes = await this.ctx.db
      .prepare(
        `SELECT DISTINCT o.origin
         FROM origin_state o
         JOIN crawl_jobs j ON j.origin = o.origin
         WHERE j.platform IN (${placeholders})
           AND j.state != 'blocked'
           AND j.next_fetch_at <= ?
           AND o.next_allowed_at <= ?
           AND (o.robots_expires_at IS NULL OR o.robots_expires_at <= ?)
           AND (o.refresh_lease_expires_at IS NULL OR o.refresh_lease_expires_at <= ?)
           AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
         ORDER BY COALESCE(o.refresh_lease_expires_at, o.robots_fetched_at, '') ASC, o.origin ASC
         LIMIT 50`
      )
      .bind(...allowedPlatforms, nowIso, nowIso, nowIso, nowIso, nowIso)
      .all<{ origin: string }>();

    const candidates = dueOriginsRes.results || [];
    if (candidates.length === 0) return null;

    const suppressedTargets = await this.ctx.loadSuppressedTargets();
    const profileCache = new Map<string, SteeringProfile[]>();

    for (const candidate of candidates) {
      const originJobsRes = await this.ctx.db
        .prepare(
          `SELECT platform, url, job_purpose FROM crawl_jobs
           WHERE origin = ? AND platform IN (${placeholders}) AND state != 'blocked' AND next_fetch_at <= ?`
        )
        .bind(candidate.origin, ...allowedPlatforms, nowIso)
        .all<{ platform: Platform; url: string; job_purpose: SourcePurpose }>();

      let maxDelay: number | null = null;
      for (const job of originJobsRes.results || []) {
        if (findMatchingSuppressedTarget(job.url, suppressedTargets)) continue;
        const profile = await this.ctx.activeSteeringProfileForTarget(
          job.platform,
          job.url,
          job.job_purpose,
          profileCache
        );
        if (profile) {
          maxDelay = Math.max(maxDelay ?? 0, profile.minDelayMs);
        }
      }

      if (maxDelay === null) continue;
      const leaseId = await this.reserveRobotsRefresh(candidate.origin, maxDelay);
      if (leaseId) return { origin: candidate.origin, leaseId };
    }

    return null;
  }

  async reserveRobotsRefresh(origin: string, approvedDelayOverride?: number): Promise<string | null> {
    OriginRobotsSnapshotSchema.parse({ origin, statusCode: 599, body: "" });
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    const approvedDelay =
      approvedDelayOverride ?? (await this.ctx.approvedDueProfileDelayForOrigin(origin, nowIso));
    if (approvedDelay === null) return null;

    const originRow = await this.ctx.db
      .prepare("SELECT min_delay_ms FROM origin_state WHERE origin = ?")
      .bind(origin)
      .first<{ min_delay_ms: number }>();
    if (!originRow) return null;

    const effectiveDelay = Math.max(originRow.min_delay_ms, approvedDelay);
    const nextAllowedIso = new Date(nowMs + effectiveDelay).toISOString();
    const leaseExpiresIso = new Date(nowMs + ROBOTS_REFRESH_LEASE_MS).toISOString();
    const leaseId = crypto.randomUUID();

    const result = await this.ctx.db
      .prepare(
        `UPDATE origin_state
         SET refresh_lease_id = ?,
             refresh_lease_expires_at = ?,
             next_allowed_at = MAX(next_allowed_at, ?)
         WHERE origin = ?
           AND next_allowed_at <= ?
           AND (active_job_id IS NULL OR lease_expires_at <= ?)
           AND (robots_expires_at IS NULL OR robots_expires_at <= ?)
           AND (refresh_lease_expires_at IS NULL OR refresh_lease_expires_at <= ?)`
      )
      .bind(leaseId, leaseExpiresIso, nextAllowedIso, origin, nowIso, nowIso, nowIso, nowIso)
      .run();

    return (result.meta as { changes?: number } | undefined)?.changes === 1 ? leaseId : null;
  }

  async releaseRobotsRefresh(origin: string, leaseId: string): Promise<boolean> {
    const result = await this.ctx.db
      .prepare(
        `UPDATE origin_state
         SET refresh_lease_id = NULL, refresh_lease_expires_at = NULL
         WHERE origin = ? AND refresh_lease_id = ?`
      )
      .bind(origin, leaseId)
      .run();
    return ((result.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
  }

  async completeRobotsRefresh(origin: string, leaseId: string, statusCode: number, body = ""): Promise<boolean> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    const dueDelay = await this.ctx.approvedDueProfileDelayForOrigin(parsed.origin, nowIso);
    if (dueDelay === null) return false;

    const stmts = this.ctx.robotsSnapshotStatements(parsed, nowMs, { leaseId, nowIso });
    const results = await this.ctx.db.batch(stmts);
    // Statement index 1 is `UPDATE origin_state WHERE refresh_lease_id = ?` (Statement 0 unblocks deferred crawl_jobs).
    return ((results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
  }

  async recordRobotsSnapshot(origin: string, statusCode: number, body = ""): Promise<void> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    await this.ctx.db.batch(this.ctx.robotsSnapshotStatements(parsed, this.ctx.now()));
  }
}
