import { compileRobotsText, type CrawlerRules } from "@trybyte/robotstxt-parser";
import { ROBOTS_RESTRICTION_TOKENS } from "vrc-packages-network/identity";
import type { Platform } from "vrc-packages-network/node";
import {
  robotsResultAllowsMissingFile,
  type OriginRobotsSnapshot
} from "vrc-packages-network/robots";
import {
  SteeringProfileSchema,
  SuppressedTargetSchema,
  findMatchingSuppressedTarget,
  steeringProfileMatches,
  type SourcePurpose,
  type SteeringProfile,
  type SuppressedTarget
} from "../../../domain/access/steering_profile.ts";
import { CoordinatorConflict, type NodePrincipal } from "../../../domain/ports/stores.ts";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  JobRow,
  SteeringProfileRow,
  SuppressedTargetRow
} from "../definitions.ts";

export const CRAWL_JOB_LEASE_MS = 120 * 1000;
export const MAX_ROBOTS_MATCHER_CACHE_ENTRIES = 256;

export interface OperatorAuditLogRow {
  action_id: number;
  entity_type: "node" | "lead" | "job" | "profile" | "suppressed_target" | "app" | "system";
  entity_id: string;
  actor: string;
  action: string;
  reason: string;
  occurred_at: string;
}

/**
 * Module-scope bounded LRU cache storing compiled immutable RFC 9309 matchers across requests.
 * Keys incorporate immutable origin + snapshot identity so no request-mutable state leaks.
 */
export class RobotsMatcherCache {
  private readonly entries = new Map<string, readonly CrawlerRules[]>();

  constructor(private readonly maxEntries = MAX_ROBOTS_MATCHER_CACHE_ENTRIES) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): readonly CrawlerRules[] | undefined {
    const existing = this.entries.get(key);
    if (!existing) return undefined;
    this.entries.delete(key);
    this.entries.set(key, existing);
    return existing;
  }

  set(key: string, matchers: readonly CrawlerRules[]): void {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else {
      while (this.entries.size >= this.maxEntries) {
        const oldestKey = this.entries.keys().next().value;
        if (oldestKey === undefined) break;
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, matchers);
  }

  evictOrigin(origin: string): void {
    const prefix = `${origin}::`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const sharedRobotsMatcherCache = new RobotsMatcherCache(MAX_ROBOTS_MATCHER_CACHE_ENTRIES);

export function buildRobotsCacheKey(
  origin: string,
  snapshotId: string,
  statusCode: number,
  fetchedAt: string | null
): string {
  return `${origin}::${snapshotId}::${statusCode}::${fetchedAt ?? ""}`;
}

export class D1PlaneContext {
  constructor(
    readonly db: D1Database,
    readonly now: () => number = Date.now,
    readonly robotsMatcherCache: RobotsMatcherCache = sharedRobotsMatcherCache
  ) {}

  steeringProfileFromRow(row: SteeringProfileRow): SteeringProfile {
    return SteeringProfileSchema.parse({
      profileId: row.profile_id,
      platform: row.platform,
      hostMatchMode: row.host_match_mode,
      hostPattern: row.host_pattern,
      pathScope: row.path_scope,
      queryMode: row.query_mode,
      queryScope: row.query_scope,
      method: row.method,
      purpose: row.purpose,
      autoPromote: row.auto_promote === 1,
      recrawlIntervalMs: row.recrawl_interval_ms,
      minDelayMs: row.min_delay_ms,
      maxPaginationDepth: row.max_pagination_depth,
      expiresAt: row.expires_at,
      reviewReference: row.review_reference,
      reason: row.reason,
      retainClasses: JSON.parse(row.retain_classes_json),
      publishClasses: JSON.parse(row.publish_classes_json),
      createdAt: row.created_at,
      disabledAt: row.disabled_at
    });
  }

  suppressedTargetFromRow(row: SuppressedTargetRow): SuppressedTarget {
    return SuppressedTargetSchema.parse({
      target: row.target,
      scope: row.scope,
      reason: row.reason,
      suppressedAt: row.suppressed_at
    });
  }

  async assertCurrentPrincipal(principal: NodePrincipal): Promise<void> {
    const current = await this.db
      .prepare("SELECT 1 FROM nodes WHERE node_id=? AND token_hash=? AND revoked_at IS NULL")
      .bind(principal.nodeId, principal.credentialVersion)
      .first();
    if (!current) throw new CoordinatorConflict("Node credential changed or revoked", 403);
  }

  async loadSuppressedTargets(): Promise<SuppressedTarget[]> {
    const res = await this.db
      .prepare("SELECT target, scope, reason, suppressed_at FROM suppressed_targets")
      .all<SuppressedTargetRow>();
    return (res.results || []).map((row) => this.suppressedTargetFromRow(row));
  }

  async loadActiveSteeringProfiles(
    platform?: Platform,
    purpose?: SourcePurpose
  ): Promise<SteeringProfile[]> {
    const nowIso = new Date(this.now()).toISOString();
    const conditions = ["disabled_at IS NULL", "expires_at>?"];
    const params: unknown[] = [nowIso];
    if (platform) {
      conditions.push("platform=?");
      params.push(platform);
    }
    if (purpose) {
      conditions.push("purpose=?");
      params.push(purpose);
    }
    const res = await this.db
      .prepare(
        `SELECT * FROM steering_profiles
         WHERE ${conditions.join(" AND ")}
         ORDER BY
           CASE host_match_mode
             WHEN 'exact' THEN 0
             WHEN 'wildcard_subdomain' THEN 1
             ELSE 2
           END ASC,
           length(path_scope) DESC,
           created_at ASC,
           profile_id ASC`
      )
      .bind(...params)
      .all<SteeringProfileRow>();
    return (res.results || []).map((row) => this.steeringProfileFromRow(row));
  }

  async activeSteeringProfileForTarget(
    platform: Platform,
    target: string,
    purpose: SourcePurpose,
    profileCache?: Map<string, SteeringProfile[]>
  ): Promise<SteeringProfile | null> {
    const nowMs = this.now();
    const cacheKey = `${platform}:${purpose}`;
    let profiles: SteeringProfile[];
    if (profileCache && profileCache.has(cacheKey)) {
      profiles = profileCache.get(cacheKey)!;
    } else {
      profiles = await this.loadActiveSteeringProfiles(platform, purpose);
      if (profileCache) profileCache.set(cacheKey, profiles);
    }
    for (const profile of profiles) {
      if (steeringProfileMatches(profile, platform, target, purpose, nowMs)) {
        return profile;
      }
    }
    return null;
  }

  robotsAllows(input: {
    origin: string;
    robots_snapshot_id: string | null;
    robots_status_code: number | null;
    robots_body: string | null;
    robots_fetched_at: string | null;
    url: string;
  }): boolean {
    if (input.robots_status_code === null || !input.robots_snapshot_id) {
      return false;
    }
    if (robotsResultAllowsMissingFile(input.robots_status_code)) {
      return true;
    }
    if (input.robots_status_code < 200 || input.robots_status_code >= 300) {
      return false;
    }
    const cacheKey = buildRobotsCacheKey(
      input.origin,
      input.robots_snapshot_id,
      input.robots_status_code,
      input.robots_fetched_at
    );
    let matchers = this.robotsMatcherCache.get(cacheKey);
    if (!matchers) {
      const rules = compileRobotsText(input.robots_body ?? "", { policy: "rfc9309" });
      matchers = Object.freeze(ROBOTS_RESTRICTION_TOKENS.map((token) => rules.forCrawler(token)));
      this.robotsMatcherCache.set(cacheKey, matchers);
    }
    return matchers.every((matcher) => matcher.isAllowed(input.url));
  }

  async executeBatchChunked<T = unknown>(
    statements: D1PreparedStatement[],
    chunkSize = 50
  ): Promise<D1Result<T>[]> {
    if (statements.length === 0) return [];
    if (statements.length <= chunkSize) {
      return (await this.db.batch(statements)) as D1Result<T>[];
    }
    const results: D1Result<T>[] = [];
    for (let i = 0; i < statements.length; i += chunkSize) {
      const chunk = statements.slice(i, i + chunkSize);
      const res = (await this.db.batch(chunk)) as D1Result<T>[];
      results.push(...res);
    }
    return results;
  }

  async approvedDueProfileDelayForOrigin(
    origin: string,
    nowIso: string,
    profileCache?: Map<string, SteeringProfile[]>,
    suppressedCache?: SuppressedTarget[]
  ): Promise<number | null> {
    const res = await this.db
      .prepare(
        `SELECT * FROM crawl_jobs
         WHERE origin=? AND state!='blocked' AND next_fetch_at<=?`
      )
      .bind(origin, nowIso)
      .all<JobRow>();
    const rows = res.results || [];
    if (rows.length === 0) return null;

    const suppressedTargets = suppressedCache ?? (await this.loadSuppressedTargets());
    const localProfileCache = profileCache ?? new Map<string, SteeringProfile[]>();
    let delay: number | null = null;

    for (const job of rows) {
      if (findMatchingSuppressedTarget(job.url, suppressedTargets)) continue;
      const profile = await this.activeSteeringProfileForTarget(
        job.platform,
        job.url,
        job.job_purpose,
        localProfileCache
      );
      if (profile) {
        delay = Math.max(delay ?? 0, profile.minDelayMs);
      }
    }
    return delay;
  }

  /**
   * Builds atomic robots update statements preserving deterministic SQL statement order:
   * Statement 1 clears `crawl_jobs.robots_deferred_until` WHILE `origin_state.refresh_lease_id` is still active;
   * Statement 2 saves the snapshot and clears `refresh_lease_id`.
   */
  robotsSnapshotStatements(
    parsed: OriginRobotsSnapshot,
    nowMs: number,
    expectedLease?: { leaseId: string; nowIso: string }
  ): D1PreparedStatement[] {
    this.robotsMatcherCache.evictOrigin(parsed.origin);

    const fetchedAt = new Date(nowMs).toISOString();
    const ttlMs =
      (parsed.statusCode >= 200 && parsed.statusCode < 300) || robotsResultAllowsMissingFile(parsed.statusCode)
        ? 24 * 60 * 60 * 1000
        : 60 * 60 * 1000;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    const snapshotId = crypto.randomUUID();

    if (expectedLease) {
      return [
        this.db
          .prepare(
            `UPDATE crawl_jobs
             SET next_fetch_at=?, robots_deferred_until=NULL
             WHERE origin=?
               AND robots_deferred_until IS NOT NULL
               AND state IN ('pending','done','backoff')
               AND EXISTS (
                 SELECT 1 FROM origin_state o
                 WHERE o.origin=? AND o.refresh_lease_id=? AND o.refresh_lease_expires_at>?
               )`
          )
          .bind(fetchedAt, parsed.origin, parsed.origin, expectedLease.leaseId, expectedLease.nowIso),
        this.db
          .prepare(
            `UPDATE origin_state
             SET robots_snapshot_id=?,
                 robots_status_code=?,
                 robots_body=?,
                 robots_fetched_at=?,
                 robots_expires_at=?,
                 refresh_lease_id=NULL,
                 refresh_lease_expires_at=NULL
             WHERE origin=? AND refresh_lease_id=? AND refresh_lease_expires_at>?`
          )
          .bind(
            snapshotId,
            parsed.statusCode,
            parsed.body,
            fetchedAt,
            expiresAt,
            parsed.origin,
            expectedLease.leaseId,
            expectedLease.nowIso
          )
      ];
    }

    return [
      this.db
        .prepare(
          `UPDATE crawl_jobs
           SET next_fetch_at=?, robots_deferred_until=NULL
           WHERE origin=? AND robots_deferred_until IS NOT NULL AND state IN ('pending','done','backoff')`
        )
        .bind(fetchedAt, parsed.origin),
      this.db
        .prepare(
          `INSERT INTO origin_state(
             origin, next_allowed_at, min_delay_ms,
             robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at
           ) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(origin) DO UPDATE SET
             robots_snapshot_id=excluded.robots_snapshot_id,
             robots_status_code=excluded.robots_status_code,
             robots_body=excluded.robots_body,
             robots_fetched_at=excluded.robots_fetched_at,
             robots_expires_at=excluded.robots_expires_at`
        )
        .bind(
          parsed.origin,
          fetchedAt,
          1000,
          snapshotId,
          parsed.statusCode,
          parsed.body,
          fetchedAt,
          expiresAt
        )
    ];
  }
}
