import {
  EnqueueJobRequestSchema,
  OperatorJobStateSchema,
  encodeOperatorJobCursor,
  type EnqueueJobRequest,
  type OperatorJobState,
  type OperatorJobRecord,
  type OperatorJobCursor
} from "vrc-packages-api";
import { isIp, isPrivateOrReservedIp } from "vrc-packages-network/ip-policy";
import {
  PROTOCOL_VERSION,
  PlatformSchema,
  type Platform,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type ClaimRequest,
  type ClaimResponse,
  type CrawlJob
} from "vrc-packages-network/node";
import {
  OriginRobotsSnapshotSchema,
  ROBOTS_REFRESH_LEASE_MS
} from "vrc-packages-network/robots";
import { isItchSearchUrl } from "vrc-packages-network/source-paths";
import {
  githubApiRepositoryIdentity,
  isShopifyProductSitemapTarget,
  shopifyProductLead,
  isSellfyProductTarget
} from "vrc-packages-network/source-targets";
import type { SourcePurpose } from "../../../domain/access/source_access_profile.ts";
import { CoordinatorConflict, type NodePrincipal } from "../../../domain/ports/stores.ts";
import { parseCapabilityToken, isCapabilityToken } from "../../../domain/security/capability_token.ts";
import { sha256Hex, timingSafeEqual } from "../../../domain/security/crypto_primitives.ts";
import { DEFAULT_SEED_JOBS, DEFAULT_APPROVED_SOURCE_PROFILES } from "../../default_seeds.ts";
import { D1_SCHEMA_SQL } from "../utils.ts";
import type { JobRow, SourceAccessProfileRow } from "../definitions.ts";
import { D1PlaneContext, CRAWL_JOB_LEASE_MS, approvedRobotsJobDelaySql } from "./shared_context.ts";

export class WorkforcePlane {
  constructor(
    private readonly ctx: D1PlaneContext,
    private readonly createProfileFn: (input: any, actor: string) => Promise<any>
  ) {}

  async seedInitialJobs(): Promise<void> {
    for (const job of DEFAULT_SEED_JOBS) {
      const existing = await this.ctx.db
        .prepare(
          `SELECT 1 FROM crawl_jobs WHERE url=?
        UNION ALL SELECT 1 FROM suppressed_urls WHERE url=? LIMIT 1`
        )
        .bind(job.url, job.url)
        .first();
      if (!existing) await this.seedJob(job.url, job.platform, job.minDelayMs, undefined, job.purpose);
    }
  }

  async seedInitialProfiles(actor: string = "system-bootstrap"): Promise<void> {
    const nowMs = this.ctx.now();
    for (const p of DEFAULT_APPROVED_SOURCE_PROFILES) {
      const expiresAt = new Date(nowMs + p.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
      const existing = await this.ctx.db
        .prepare(
          `SELECT 1 FROM source_access_profiles
        WHERE platform=? AND origin=? AND path_scope=? AND purpose=? AND disabled_at IS NULL AND expires_at>? LIMIT 1`
        )
        .bind(p.platform, p.origin, p.pathScope, p.purpose, new Date(nowMs).toISOString())
        .first();
      if (!existing) {
        await this.createProfileFn(
          {
            schemaVersion: 1,
            platform: p.platform,
            origin: p.origin,
            pathScope: p.pathScope,
            method: p.method,
            purpose: p.purpose,
            minDelayMs: p.minDelayMs,
            expiresAt,
            reviewReference: p.reviewReference,
            reason: p.reason,
            retainClasses: p.retainClasses,
            publishClasses: p.publishClasses
          },
          actor
        );
      }
    }
  }

  async initSchema(autoSeed: boolean = false): Promise<void> {
    await this.ctx.db.exec(D1_SCHEMA_SQL);
    if (autoSeed) {
      await this.seedInitialJobs();
    }
  }

  async authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> {
    const row = await this.ctx.db
      .prepare("SELECT token_hash,capabilities_json,revoked_at FROM node_credentials WHERE node_id = ?")
      .bind(nodeId)
      .first<{ token_hash: string; capabilities_json: string; revoked_at: string | null }>();
    if (!row || row.revoked_at) return null;

    const suppliedHash = await sha256Hex(bearer);
    if (!timingSafeEqual(suppliedHash, row.token_hash)) return null;

    const storedCapabilities = JSON.parse(row.capabilities_json) as Platform[];
    if (!isCapabilityToken(bearer)) return null;
    const parsed = parseCapabilityToken(bearer);
    if (!parsed) return null;
    const parsedSet = new Set(parsed.capabilities);
    const storedSet = new Set(storedCapabilities);
    if (parsedSet.size !== storedSet.size || [...parsedSet].some((c) => !storedSet.has(c))) {
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
    if (request.state === "fetching") {
      const now = new Date(this.ctx.now()).toISOString();
      const live = await this.ctx.db
        .prepare(
          `SELECT * FROM crawl_jobs WHERE job_id=? AND claimed_by=? AND lease_id=?
        AND state='leased' AND lease_expires_at>?
        AND (source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules r
          WHERE r.rule_id=source_rule_id AND r.disabled_at IS NULL AND r.expires_at>?))`
        )
        .bind(request.activeJobId, principal.nodeId, request.activeLeaseId, now, now)
        .first<JobRow>();
      if (!live || !(await this.ctx.leaseProfileAllowsJob(live))) {
        throw new CoordinatorConflict("Node does not hold an authorized active job", 403);
      }
    }
    const now = new Date(this.ctx.now()).toISOString();
    await this.ctx.db
      .prepare(
        `INSERT INTO node_heartbeats(node_id,last_seen_at,state,active_job_id) VALUES (?,?,?,?)
      ON CONFLICT(node_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,
        state=excluded.state,active_job_id=excluded.active_job_id`
      )
      .bind(principal.nodeId, now, request.state, request.state === "fetching" ? request.activeJobId : null)
      .run();
    return { schemaVersion: PROTOCOL_VERSION, status: "alive" as const, serverTime: now };
  }

  async claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    if (request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Capability not granted to node", 403);
    }
    const nowMs = this.ctx.now();
    const now = new Date(nowMs).toISOString();
    await this.ctx.assertCurrentPrincipal(principal);

    const placeholders = request.capabilities.map(() => "?").join(",");
    const eligibleFrom = `FROM crawl_jobs j
      JOIN origin_leases o ON o.origin = j.origin
      JOIN origin_robots r ON r.origin = j.origin AND r.expires_at > ?
        AND (r.refresh_lease_expires_at IS NULL OR r.refresh_lease_expires_at <= ?)
      WHERE j.platform IN (${placeholders})
        AND j.next_fetch_at <= ?
        AND (j.state IN ('pending','done','backoff') OR (j.state='leased' AND j.lease_expires_at <= ?))
        AND o.next_allowed_at <= ?
        AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
        AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
          WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?))
        AND EXISTS (SELECT 1 FROM source_access_profiles p
          WHERE p.platform=j.platform AND p.origin=j.origin AND p.purpose=j.job_purpose
            AND p.disabled_at IS NULL AND p.expires_at>?
            AND instr(j.url,'#')=0 AND
            ((p.query_scope IS NOT NULL AND
                j.url=p.origin||p.path_scope||'?'||p.query_scope) OR
              (p.query_scope IS NULL AND instr(j.url,'?')=0 AND
                (j.url=p.origin||p.path_scope OR
                  (substr(p.path_scope,-1)='/' AND
                    substr(j.url,1,length(p.origin||p.path_scope))=p.origin||p.path_scope)))))
    `;
    const eligibilityParams = (at: string) => [at, at, ...request.capabilities, at, at, at, at, at, at];
    const query = `SELECT j.*,r.snapshot_id AS robots_snapshot_id,r.status_code AS robots_status_code,
      r.body AS robots_body,r.expires_at AS robots_expires_at ${eligibleFrom}
      ORDER BY j.next_fetch_at ASC, j.created_at ASC, j.job_id ASC LIMIT 100 OFFSET ?`;

    const maxJobs = Math.max(1, Math.min(request.maxJobs ?? 1, 10));
    const leasedJobs: CrawlJob[] = [];
    const reservedOrigins = new Set<string>();
    const profileCache = new Map<string, SourceAccessProfileRow[]>();

    const MAX_CLAIM_SCAN_PAGES = 3;
    let pagesScanned = 0;
    let offset = 0;
    for (;;) {
      if (pagesScanned++ >= MAX_CLAIM_SCAN_PAGES) break;
      const bindParams = [...eligibilityParams(now), offset];
      const res = await this.ctx.db
        .prepare(query)
        .bind(...bindParams)
        .all<
          JobRow & {
            robots_snapshot_id: string;
            robots_status_code: number;
            robots_body: string;
            robots_expires_at: string;
          }
        >();
      const candidates = res.results || [];
      if (candidates.length === 0) break;
      let deferred = false;
      for (const job of candidates) {
        if (reservedOrigins.has(job.origin)) continue;
        const profile = await this.ctx.activeSourceAccessProfileForTarget(
          job.platform,
          job.url,
          job.job_purpose,
          profileCache
        );
        if (!profile) continue;
        if (!this.ctx.robotsAllows(job)) {
          await this.ctx.db
            .prepare(
              `UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=?,
            state=CASE WHEN state='leased' THEN 'pending' ELSE state END,
            claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=? AND job_id IN (
              SELECT j.job_id ${eligibleFrom} AND j.job_id=? AND r.snapshot_id=?)`
            )
            .bind(
              job.robots_expires_at,
              job.robots_expires_at,
              job.job_id,
              ...eligibilityParams(new Date(this.ctx.now()).toISOString()),
              job.job_id,
              job.robots_snapshot_id
            )
            .run();
          deferred = true;
          continue;
        }
        const lease = await this.ctx.db
          .prepare("SELECT * FROM origin_leases WHERE origin = ?")
          .bind(job.origin)
          .first<{
            active_job_id: string | null;
            lease_expires_at: string | null;
            next_allowed_at: string;
            min_delay_ms: number;
          }>();
        if (!lease) continue;
        if (
          lease.next_allowed_at > now ||
          (lease.active_job_id && lease.lease_expires_at && lease.lease_expires_at > now)
        ) {
          continue;
        }
        const reservationMs = this.ctx.now();
        const reservationTime = new Date(reservationMs).toISOString();
        const expires = new Date(reservationMs + CRAWL_JOB_LEASE_MS).toISOString();
        const leaseId = crypto.randomUUID();
        const nextAllowed = new Date(reservationMs + Math.max(lease.min_delay_ms, profile.minDelayMs)).toISOString();

        const reservation = await this.ctx.db.batch([
          this.ctx.db
            .prepare(
              `UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,
            lease_expires_at=?,lease_profile_id=? WHERE job_id=? AND job_id IN (
              SELECT j.job_id ${eligibleFrom} AND j.job_id=? AND r.snapshot_id=? AND o.min_delay_ms=?
                AND EXISTS (SELECT 1 FROM source_access_profiles p WHERE p.profile_id=?
                  AND p.disabled_at IS NULL AND p.expires_at>?)
                AND EXISTS (SELECT 1 FROM node_credentials c WHERE c.node_id=?
                  AND c.token_hash=? AND c.revoked_at IS NULL))`
            )
            .bind(
              principal.nodeId,
              leaseId,
              expires,
              profile.profileId,
              job.job_id,
              ...eligibilityParams(reservationTime),
              job.job_id,
              job.robots_snapshot_id,
              lease.min_delay_ms,
              profile.profileId,
              reservationTime,
              principal.nodeId,
              principal.credentialVersion
            ),
          this.ctx.db
            .prepare(
              `UPDATE origin_leases SET active_job_id=?,lease_expires_at=?,next_allowed_at=?
            WHERE origin=? AND EXISTS (SELECT 1 FROM crawl_jobs j WHERE j.job_id=?
              AND j.state='leased' AND j.lease_id=? AND j.claimed_by=?)`
            )
            .bind(job.job_id, expires, nextAllowed, job.origin, job.job_id, leaseId, principal.nodeId)
        ]);
        if ((reservation[0]?.meta as { changes?: number } | undefined)?.changes !== 1) continue;
        reservedOrigins.add(job.origin);
        leasedJobs.push({
          jobId: job.job_id,
          leaseId,
          platform: job.platform,
          purpose: job.job_purpose,
          url: job.url,
          origin: job.origin,
          leaseExpiresAt: expires,
          retainClasses: profile.retainClasses,
          etag: job.etag,
          lastModified: job.last_modified
        });
        if (leasedJobs.length >= maxJobs) {
          return {
            schemaVersion: PROTOCOL_VERSION,
            status: "leased" as const,
            job: leasedJobs[0],
            jobs: leasedJobs
          };
        }
      }
      if (deferred) offset = 0;
      else offset += candidates.length;
    }
    if (leasedJobs.length > 0) {
      return {
        schemaVersion: PROTOCOL_VERSION,
        status: "leased" as const,
        job: leasedJobs[0],
        jobs: leasedJobs
      };
    }
    return { schemaVersion: PROTOCOL_VERSION, status: "empty" as const, retryAfterMs: 5000 };
  }

  async enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> {
    const parsed = EnqueueJobRequestSchema.parse(input);
    return this.seedJob(parsed.url, parsed.platform, parsed.minDelayMs, undefined, parsed.purpose, {
      actor,
      reason: parsed.reason
    });
  }

  async listJobsPage(
    filters?: { state?: OperatorJobState; platform?: Platform },
    limit = 100,
    cursor: OperatorJobCursor | null = null
  ): Promise<{ jobs: OperatorJobRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Job limit must be 1..100");
    if (filters?.state !== undefined) OperatorJobStateSchema.parse(filters.state);
    if (filters?.platform !== undefined) PlatformSchema.parse(filters.platform);

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filters?.state !== undefined) {
      conditions.push("state = ?");
      params.push(filters.state);
    }
    if (filters?.platform !== undefined) {
      conditions.push("platform = ?");
      params.push(filters.platform);
    }
    if (cursor) {
      conditions.push("(created_at, job_id) < (?, ?)");
      params.push(cursor.createdAt, cursor.jobId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT job_id, platform, url, origin, state, job_purpose, next_fetch_at,
          claimed_by, lease_expires_at, created_at, robots_deferred_until, source_rule_id, lease_profile_id
      FROM crawl_jobs
      ${where}
      ORDER BY created_at DESC, job_id DESC
      LIMIT ?`
      )
      .bind(...params)
      .all<{
        job_id: string;
        platform: Platform;
        url: string;
        origin: string;
        state: OperatorJobState;
        job_purpose: SourcePurpose;
        next_fetch_at: string;
        claimed_by: string | null;
        lease_expires_at: string | null;
        created_at: string;
        robots_deferred_until: string | null;
        source_rule_id: string | null;
        lease_profile_id: string | null;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const jobs: OperatorJobRecord[] = visible.map((row) => ({
      jobId: row.job_id,
      platform: row.platform,
      url: row.url,
      origin: row.origin,
      state: row.state,
      purpose: row.job_purpose,
      nextFetchAt: row.next_fetch_at,
      claimedBy: row.claimed_by ?? null,
      leaseExpiresAt: row.lease_expires_at ?? null,
      createdAt: row.created_at,
      robotsDeferredUntil: row.robots_deferred_until ?? null,
      sourceRuleId: row.source_rule_id ?? null,
      leaseProfileId: row.lease_profile_id ?? null
    }));
    const last = jobs.at(-1);

    return {
      jobs,
      nextCursor:
        rows.length > limit && last
          ? encodeOperatorJobCursor({ createdAt: last.createdAt, jobId: last.jobId })
          : null
    };
  }

  async seedJob(
    url: string,
    platform: Platform,
    minDelayMs = 1000,
    sourceRuleId?: string,
    purpose: SourcePurpose = "metadata",
    audit?: { actor: string; reason: string; leadKey?: string }
  ): Promise<string> {
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
    if (!Number.isInteger(minDelayMs) || minDelayMs < 0 || minDelayMs > 86400000) {
      throw new Error("Invalid origin delay");
    }
    const effectiveMinDelayMs = platform === "github" ? Math.max(minDelayMs, 60000) : minDelayMs;
    const origin = parsed.origin;
    const now = new Date(this.ctx.now()).toISOString();
    const id = crypto.randomUUID();

    const suppressed = await this.ctx.db
      .prepare("SELECT 1 FROM suppressed_urls WHERE url=?")
      .bind(parsed.href)
      .first();
    if (suppressed) {
      throw new Error("URL is suppressed and cannot be reseeded");
    }
    if (sourceRuleId) {
      const activeRule = await this.ctx.db
        .prepare("SELECT 1 FROM lead_autoqueue_rules WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?")
        .bind(sourceRuleId, now)
        .first();
      if (!activeRule) {
        throw new Error("Auto-queue rule is no longer active");
      }
    }

    const authoritySql = `NOT EXISTS (SELECT 1 FROM suppressed_urls WHERE url=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM source_leads
        WHERE lead_key=? AND status IN ('pending_review','approved')))`;
    const authorityParams = [
      parsed.href,
      sourceRuleId || null,
      sourceRuleId || null,
      now,
      audit?.leadKey ?? null,
      audit?.leadKey ?? null
    ];
    const batchStmts = [
      this.ctx.db
        .prepare(
          `INSERT OR IGNORE INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at,source_rule_id,job_purpose)
        SELECT ?,?,?,?,'pending',?,?,?,? WHERE ${authoritySql}`
        )
        .bind(id, platform, parsed.href, origin, now, now, sourceRuleId || null, purpose, ...authorityParams),
      this.ctx.db
        .prepare(
          `INSERT OR IGNORE INTO origin_leases(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms)
        SELECT ?,NULL,NULL,?,? WHERE EXISTS
        (SELECT 1 FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=?) AND ${authoritySql}`
        )
        .bind(origin, now, effectiveMinDelayMs, parsed.href, platform, purpose, ...authorityParams),
      this.ctx.db
        .prepare(
          `UPDATE origin_leases SET min_delay_ms = MAX(min_delay_ms, ?) WHERE origin = ?
        AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=?) AND ${authoritySql}`
        )
        .bind(effectiveMinDelayMs, origin, parsed.href, platform, purpose, ...authorityParams)
    ];
    if (sourceRuleId) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `UPDATE crawl_jobs SET source_rule_id=?
          WHERE url=? AND platform=? AND job_purpose=? AND source_rule_id IS NOT NULL AND ${authoritySql}`
          )
          .bind(sourceRuleId, parsed.href, platform, purpose, ...authorityParams)
      );
    }
    if (audit?.leadKey !== undefined) {
      const matchingJob = `EXISTS (SELECT 1 FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=?)`;
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
          SELECT 'lead',lead_key,?,'approve_lead',?,? FROM source_leads
          WHERE lead_key=? AND status='pending_review' AND ${matchingJob} AND ${authoritySql}`
          )
          .bind(
            audit.actor,
            audit.reason.trim(),
            now,
            audit.leadKey,
            parsed.href,
            platform,
            purpose,
            ...authorityParams
          ),
        this.ctx.db
          .prepare(
            `UPDATE source_leads SET status='approved'
          WHERE lead_key=? AND status='pending_review' AND ${matchingJob} AND ${authoritySql}`
          )
          .bind(audit.leadKey, parsed.href, platform, purpose, ...authorityParams)
      );
    } else if (audit) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        SELECT 'job',job_id,?,'seed',?,? FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=? AND ${authoritySql}`
          )
          .bind(audit.actor, audit.reason.trim(), now, parsed.href, platform, purpose, ...authorityParams)
      );
    }
    await this.ctx.executeBatchChunked(batchStmts);

    const stored = await this.ctx.db
      .prepare(
        `SELECT job_id,platform,job_purpose,
      EXISTS (SELECT 1 FROM suppressed_urls WHERE url=?) AS suppressed,
      (? IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?)) AS rule_active,
      (? IS NULL OR EXISTS (SELECT 1 FROM source_leads
        WHERE lead_key=? AND status IN ('pending_review','approved'))) AS lead_active
      FROM (SELECT 1) LEFT JOIN crawl_jobs ON url=?`
      )
      .bind(...authorityParams, parsed.href)
      .first<{
        job_id: string | null;
        platform: Platform | null;
        job_purpose: SourcePurpose | null;
        suppressed: number;
        rule_active: number;
        lead_active: number;
      }>();
    if (stored?.suppressed) throw new Error("URL is suppressed and cannot be reseeded");
    if (stored && !stored.rule_active) throw new Error("Auto-queue rule is no longer active");
    if (stored && !stored.lead_active) throw new Error("Lead is no longer eligible for approval");
    if (!stored?.job_id) throw new Error("Job insertion failed");
    if (stored.platform !== platform) throw new Error("Existing job has a different reviewed platform");
    if (stored.job_purpose !== purpose) throw new Error("Existing job has a different reviewed purpose");
    return stored.job_id;
  }

  async claimDueRobotsRefresh(): Promise<{ origin: string; leaseId: string } | null> {
    const nowMs = this.ctx.now();
    const now = new Date(nowMs).toISOString();
    const delay = approvedRobotsJobDelaySql("o.origin", "?1");
    const due = await this.ctx.db
      .prepare(
        `SELECT o.origin FROM origin_leases o
      LEFT JOIN origin_robots r ON r.origin=o.origin
      WHERE o.next_allowed_at<=?1 AND (r.origin IS NULL OR r.expires_at IS NULL OR r.expires_at<=?1)
        AND (r.refresh_lease_expires_at IS NULL OR r.refresh_lease_expires_at<=?1)
        AND (o.active_job_id IS NULL OR o.lease_expires_at<=?1)
        AND EXISTS (SELECT 1 FROM crawl_jobs j WHERE j.origin=o.origin
          AND j.state!='blocked' AND j.next_fetch_at<=?1
          AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
            WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?1)))
        AND ${delay} IS NOT NULL
      ORDER BY o.origin ASC LIMIT 1`
      )
      .bind(now)
      .first<{ origin: string }>();
    if (!due) return null;
    const leaseId = await this.reserveRobotsRefresh(due.origin);
    return leaseId ? { origin: due.origin, leaseId } : null;
  }

  async reserveRobotsRefresh(origin: string): Promise<string | null> {
    OriginRobotsSnapshotSchema.parse({ origin, statusCode: 599, body: "" });
    const nowMs = this.ctx.now();
    const now = new Date(nowMs).toISOString();
    const expires = new Date(nowMs + ROBOTS_REFRESH_LEASE_MS).toISOString();
    const leaseId = crypto.randomUUID();
    const delay = approvedRobotsJobDelaySql("?1", "?2");
    const results = await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO origin_robots(origin,refresh_lease_id,refresh_lease_expires_at)
        SELECT o.origin,?3,?4 FROM origin_leases o WHERE o.origin=?1 AND o.next_allowed_at<=?2
          AND (o.active_job_id IS NULL OR o.lease_expires_at<=?2)
          AND NOT EXISTS (SELECT 1 FROM origin_robots r WHERE r.origin=o.origin AND r.expires_at>?2)
          AND ${delay} IS NOT NULL
        ON CONFLICT(origin) DO UPDATE SET refresh_lease_id=excluded.refresh_lease_id,refresh_lease_expires_at=excluded.refresh_lease_expires_at
          WHERE origin_robots.refresh_lease_expires_at IS NULL OR origin_robots.refresh_lease_expires_at<=?2`
        )
        .bind(origin, now, leaseId, expires),
      this.ctx.db
        .prepare(
          `UPDATE origin_leases SET next_allowed_at=MAX(next_allowed_at,
        strftime('%Y-%m-%dT%H:%M:%fZ',julianday(?2)+MAX(min_delay_ms,${delay})/86400000.0))
        WHERE origin=?1 AND EXISTS (SELECT 1 FROM origin_robots r
          WHERE r.origin=?1 AND r.refresh_lease_id=?3 AND r.refresh_lease_expires_at>?2)`
        )
        .bind(origin, now, leaseId)
    ]);
    return ((results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0) === 1 ? leaseId : null;
  }

  async releaseRobotsRefresh(origin: string, leaseId: string): Promise<boolean> {
    const results = await this.ctx.db.batch([
      this.ctx.db
        .prepare("DELETE FROM origin_robots WHERE origin=? AND refresh_lease_id=? AND snapshot_id IS NULL")
        .bind(origin, leaseId),
      this.ctx.db
        .prepare(
          "UPDATE origin_robots SET refresh_lease_id=NULL, refresh_lease_expires_at=NULL WHERE origin=? AND refresh_lease_id=? AND snapshot_id IS NOT NULL"
        )
        .bind(origin, leaseId)
    ]);
    const delChanges = (results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0;
    const updChanges = (results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0;
    return delChanges + updChanges === 1;
  }

  async completeRobotsRefresh(origin: string, leaseId: string, statusCode: number, body = ""): Promise<boolean> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    const nowMs = this.ctx.now();
    const now = new Date(nowMs).toISOString();
    const guardFor = (offset: number) => `EXISTS (SELECT 1 FROM origin_robots r
      WHERE r.origin=?${offset + 1} AND r.refresh_lease_id=?${offset + 2} AND r.refresh_lease_expires_at>?${offset + 3})
      AND ${approvedRobotsJobDelaySql(`?${offset + 1}`, `?${offset + 3}`)} IS NOT NULL`;
    const results = await this.ctx.db.batch([
      ...this.ctx.robotsSnapshotStatements(parsed, nowMs, guardFor, [origin, leaseId, now], true)
    ]);
    const completed = ((results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
    if (completed) this.ctx.robotsMatchers.delete(parsed.origin);
    return completed;
  }

  async recordRobotsSnapshot(origin: string, statusCode: number, body = ""): Promise<void> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    await this.ctx.db.batch(this.ctx.robotsSnapshotStatements(parsed, this.ctx.now()));
    this.ctx.robotsMatchers.delete(parsed.origin);
  }
}
