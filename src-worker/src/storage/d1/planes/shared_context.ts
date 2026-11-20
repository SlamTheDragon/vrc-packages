import type { CrawlerRules } from "@trybyte/robotstxt-parser";
import { compileRobotsText } from "@trybyte/robotstxt-parser";
import {
  AutoQueueRuleSchema,
  type AutoQueueRule
} from "vrc-packages-api";
import { ROBOTS_RESTRICTION_TOKENS } from "vrc-packages-network/identity";
import type { Platform } from "vrc-packages-network/node";
import {
  robotsResultAllowsMissingFile,
  type OriginRobotsSnapshot
} from "vrc-packages-network/robots";
import {
  SourceAccessProfileSchema,
  sourceAccessProfileMatches,
  type SourceAccessProfile,
  type SourcePurpose
} from "../../../domain/access/source_access_profile.ts";
import {
  CoordinatorConflict,
  type NodePrincipal
} from "../../../domain/ports/stores.ts";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  JobRow,
  AutoQueueRuleRow,
  SourceAccessProfileRow
} from "../definitions.ts";

export const CRAWL_JOB_LEASE_MS = 120 * 1000;

export interface OperatorAuditLogRow {
  action_id: number;
  entity_type: "node" | "lead" | "job" | "rule" | "profile" | "app";
  entity_id: string;
  actor: string;
  action: string;
  reason: string;
  occurred_at: string;
}

/** SQL predicates are repeated inside atomic writes, not just candidate reads. */
export function approvedRobotsJobDelaySql(origin: string, now: string): string {
  return `(SELECT MAX(p.min_delay_ms) FROM crawl_jobs j JOIN source_access_profiles p
    ON p.platform=j.platform AND p.origin=j.origin AND p.purpose=j.job_purpose
    WHERE j.origin=${origin} AND j.next_fetch_at<=${now}
      AND (j.state IN ('pending','done','backoff') OR (j.state='leased' AND j.lease_expires_at<=${now}))
      AND NOT EXISTS (SELECT 1 FROM suppressed_urls s WHERE s.url=j.url)
      AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
        WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>${now}))
      AND p.disabled_at IS NULL AND p.expires_at>${now} AND instr(j.url,'#')=0
      AND ((p.query_scope IS NOT NULL AND j.url=p.origin||p.path_scope||'?'||p.query_scope)
        OR (p.query_scope IS NULL AND instr(j.url,'?')=0 AND
          (j.url=p.origin||p.path_scope OR (substr(p.path_scope,-1)='/' AND
            substr(j.url,1,length(p.origin||p.path_scope))=p.origin||p.path_scope)))))`;
}

export class D1PlaneContext {
  readonly robotsMatchers = new Map<string, { snapshotId: string; matchers: readonly CrawlerRules[] }>();

  constructor(
    readonly db: D1Database,
    readonly now: () => number = Date.now
  ) {}

  autoQueueRuleFromRow(row: AutoQueueRuleRow): AutoQueueRule {
    return AutoQueueRuleSchema.parse({
      ruleId: row.rule_id,
      leadKind: row.lead_kind,
      origin: row.origin,
      pathScope: row.path_scope,
      minDelayMs: row.min_delay_ms,
      expiresAt: row.expires_at,
      reviewReference: row.review_reference,
      reason: row.reason,
      createdAt: row.created_at,
      disabledAt: row.disabled_at
    });
  }

  sourceAccessProfileFromRow(row: SourceAccessProfileRow): SourceAccessProfile {
    return SourceAccessProfileSchema.parse({
      schemaVersion: 1,
      profileId: row.profile_id,
      platform: row.platform,
      origin: row.origin,
      pathScope: row.path_scope,
      exactQuery: row.query_scope ?? undefined,
      method: row.method,
      purpose: row.purpose,
      minDelayMs: row.min_delay_ms,
      expiresAt: row.expires_at,
      reviewReference: row.review_reference,
      reason: row.reason,
      retainClasses: JSON.parse(row.retain_classes_json),
      publishClasses: JSON.parse(row.publish_classes_json),
      createdAt: row.created_at,
      disabledAt: row.disabled_at
    });
  }

  async assertCurrentPrincipal(principal: NodePrincipal): Promise<void> {
    const current = await this.db
      .prepare("SELECT 1 FROM node_credentials WHERE node_id=? AND token_hash=? AND revoked_at IS NULL")
      .bind(principal.nodeId, principal.credentialVersion)
      .first();
    if (!current) throw new CoordinatorConflict("Node credential changed or revoked", 403);
  }

  async leaseProfileAllowsJob(job: JobRow): Promise<SourceAccessProfile | null> {
    if (!job.lease_profile_id) return null;
    const row = await this.db
      .prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(job.lease_profile_id)
      .first<SourceAccessProfileRow>();
    if (!row) return null;
    const profile = this.sourceAccessProfileFromRow(row);
    return sourceAccessProfileMatches(profile, job.platform, job.url, job.job_purpose, this.now())
      ? profile
      : null;
  }

  robotsAllows(job: JobRow & { robots_snapshot_id: string; robots_status_code: number; robots_body: string }): boolean {
    if (robotsResultAllowsMissingFile(job.robots_status_code)) return true;
    if (job.robots_status_code < 200 || job.robots_status_code >= 300) return false;
    let cached = this.robotsMatchers.get(job.origin);
    if (!cached || cached.snapshotId !== job.robots_snapshot_id) {
      const rules = compileRobotsText(job.robots_body, { policy: "rfc9309" });
      cached = {
        snapshotId: job.robots_snapshot_id,
        matchers: ROBOTS_RESTRICTION_TOKENS.map((token) => rules.forCrawler(token))
      };
      this.robotsMatchers.set(job.origin, cached);
    }
    return cached.matchers.every((matcher) => matcher.isAllowed(job.url));
  }

  async executeBatchChunked<T = unknown>(statements: D1PreparedStatement[], chunkSize = 50): Promise<D1Result<T>[]> {
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

  async activeSourceAccessProfileForTarget(
    platform: Platform,
    target: string,
    purpose: SourcePurpose,
    cache?: Map<string, SourceAccessProfileRow[]>
  ): Promise<SourceAccessProfile | null> {
    let origin: string;
    try {
      origin = new URL(target).origin;
    } catch {
      return null;
    }
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const cacheKey = `${platform}:${origin}:${purpose}`;
    let rows: SourceAccessProfileRow[];
    if (cache && cache.has(cacheKey)) {
      rows = cache.get(cacheKey)!;
    } else {
      const res = await this.db
        .prepare(
          `SELECT * FROM source_access_profiles
        WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?
        ORDER BY length(path_scope) DESC,created_at ASC,profile_id ASC`
        )
        .bind(platform, origin, purpose, now)
        .all<SourceAccessProfileRow>();
      rows = res.results || [];
      if (cache) cache.set(cacheKey, rows);
    }
    for (const row of rows) {
      const profile = this.sourceAccessProfileFromRow(row);
      if (sourceAccessProfileMatches(profile, platform, target, purpose, nowMs)) return profile;
    }
    return null;
  }

  async activeAutoQueueRuleForLead(kind: string, url: string): Promise<AutoQueueRule | null> {
    if (kind !== "vpm_listing") return null;
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.hash ||
      target.search ||
      target.port ||
      target.hostname.endsWith(".")
    ) {
      return null;
    }
    const res = await this.db
      .prepare(
        `SELECT * FROM lead_autoqueue_rules
      WHERE lead_kind=? AND origin=? AND disabled_at IS NULL AND expires_at>?
      ORDER BY length(path_scope) DESC,created_at DESC`
      )
      .bind(kind, target.origin, new Date(this.now()).toISOString())
      .all<AutoQueueRuleRow>();
    const rows = res.results || [];
    const match = rows.find((row) =>
      row.path_scope.endsWith("/") ? target.pathname.startsWith(row.path_scope) : target.pathname === row.path_scope
    );
    return match ? this.autoQueueRuleFromRow(match) : null;
  }

  async approvedDueProfileDelayForOrigin(origin: string, now: string): Promise<number | null> {
    const res = await this.db
      .prepare(
        `SELECT j.* FROM crawl_jobs j WHERE j.origin=?
      AND j.state!='blocked' AND j.next_fetch_at<=?
      AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
        WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?))`
      )
      .bind(origin, now, now)
      .all<JobRow>();
    const rows = res.results || [];
    let delay: number | null = null;
    const profileCache = new Map<string, SourceAccessProfileRow[]>();
    for (const job of rows) {
      const profile = await this.activeSourceAccessProfileForTarget(job.platform, job.url, job.job_purpose, profileCache);
      if (profile) delay = Math.max(delay ?? 0, profile.minDelayMs);
    }
    return delay;
  }

  robotsSnapshotStatements(
    parsed: OriginRobotsSnapshot,
    nowMs: number,
    guard: string | ((offset: number) => string) = "1",
    guardValues: unknown[] = [],
    clearLease = false
  ): D1PreparedStatement[] {
    const fetchedAt = new Date(nowMs).toISOString();
    const ttlMs =
      (parsed.statusCode >= 200 && parsed.statusCode < 300) || robotsResultAllowsMissingFile(parsed.statusCode)
        ? 24 * 60 * 60 * 1000
        : 60 * 60 * 1000;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    const leaseUpdate = clearLease ? ",refresh_lease_id=NULL,refresh_lease_expires_at=NULL" : "";
    return [
      this.db
        .prepare(
          `INSERT INTO origin_robots(origin,snapshot_id,status_code,body,fetched_at,expires_at)
        SELECT ?,?,?,?,?,? WHERE ${typeof guard === "string" ? guard : guard(6)} ON CONFLICT(origin) DO UPDATE SET
        snapshot_id=excluded.snapshot_id,status_code=excluded.status_code,body=excluded.body,
        fetched_at=excluded.fetched_at,expires_at=excluded.expires_at${leaseUpdate}`
        )
        .bind(parsed.origin, crypto.randomUUID(), parsed.statusCode, parsed.body, fetchedAt, expiresAt, ...guardValues),
      this.db
        .prepare(
          `UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=NULL
        WHERE origin=? AND robots_deferred_until IS NOT NULL AND state IN ('pending','done','backoff') AND ${
          typeof guard === "string" ? guard : guard(2)
        }`
        )
        .bind(fetchedAt, parsed.origin, ...guardValues)
    ];
  }
}
