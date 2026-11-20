import {
  RevokeNodeRequestSchema,
  RevokeNodeResponseSchema,
  IssueNodeCredentialSchema,
  CreateAutoQueueRuleSchema,
  encodeRuleCursor,
  encodeLeadCursor,
  encodeTakedownCursor,
  encodeDelegatedClaimCursor,
  encodeOperatorAppCursor,
  encodeProfileCursor,
  CreateSourceAccessProfileSchema,
  DOWNSTREAM_PROTOCOL_VERSION,
  type RevokeNodeRequest,
  type IssueNodeCredential,
  type AutoQueueRule,
  type CreateAutoQueueRule,
  type RuleCursor,
  type LeadCursor,
  type LeadRow,
  type TakedownCursor,
  type TakedownRecord,
  type DelegatedClaimCursor,
  type DelegatedClaimRecord,
  type OperatorAppCursor,
  type OperatorAppRecord,
  type ProfileCursor,
  type SourceAccessProfile,
  type CreateSourceAccessProfile
} from "vrc-packages-api";
import {
  ClaimRequestSchema,
  PROTOCOL_VERSION,
  PlatformSchema,
  type Platform,
  type DiscoveryLead
} from "vrc-packages-network/node";
import { resolveDiscoveryLeadTarget } from "vrc-packages-network/source-targets";
import { sourcePathScopesOverlap, type SourcePurpose } from "../../../domain/access/source_access_profile.ts";
import { formatCapabilityToken } from "../../../domain/security/capability_token.ts";
import { sha256Hex } from "../../../domain/security/crypto_primitives.ts";
import type { AutoQueueRuleRow, D1PreparedStatement, SourceAccessProfileRow } from "../definitions.ts";
import { D1PlaneContext, type OperatorAuditLogRow } from "./shared_context.ts";

export class OperatorPlane {
  constructor(
    private readonly ctx: D1PlaneContext,
    private readonly seedJobFn: (
      url: string,
      platform: Platform,
      minDelayMs?: number,
      sourceRuleId?: string,
      purpose?: SourcePurpose,
      audit?: { actor: string; reason: string; leadKey?: string }
    ) => Promise<string>
  ) {}

  async revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> {
    RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
    const parsed = RevokeNodeRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const now = new Date(this.ctx.now()).toISOString();
    const result = await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        SELECT 'node',node_id,?,'revoke',?,? FROM node_credentials WHERE node_id=?`
        )
        .bind(actor, parsed.reason, now, nodeId),
      this.ctx.db
        .prepare("UPDATE node_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE node_id=?")
        .bind(now, nodeId)
    ]);
    if ((result[0]?.meta as { changes?: number } | undefined)?.changes !== 1) throw new Error("Node not found");
  }

  async createNodeCredential(
    nodeId: string,
    capabilities: Platform[],
    audit?: { actor: string; reason: string }
  ): Promise<string> {
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
    if (
      audit &&
      (!audit.actor.trim() || audit.actor.length > 100 || !audit.reason.trim() || audit.reason.length > 300)
    ) {
      throw new Error("Credential audit actor and reason required");
    }
    const token = formatCapabilityToken(capabilities);
    const hash = await sha256Hex(token);
    const writes = [
      this.ctx.db
        .prepare(
          `INSERT INTO node_credentials(node_id,token_hash,capabilities_json,revoked_at)
      VALUES (?,?,?,NULL)
      ON CONFLICT(node_id) DO UPDATE SET token_hash=excluded.token_hash,
        capabilities_json=excluded.capabilities_json, revoked_at=NULL`
        )
        .bind(nodeId, hash, JSON.stringify([...new Set(capabilities)]))
    ];
    if (audit) {
      writes.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
      VALUES ('node',?,?, 'issue', ?, ?)`
          )
          .bind(nodeId, audit.actor, audit.reason.trim(), new Date(this.ctx.now()).toISOString())
      );
    }
    await this.ctx.db.batch(writes);
    return token;
  }

  async evaluateWorkforceDistribution(candidateCapabilities?: Platform[]): Promise<Platform[]> {
    const candidates =
      candidateCapabilities && candidateCapabilities.length > 0
        ? [...new Set(candidateCapabilities)]
        : [...PlatformSchema.options];
    const now = new Date(this.ctx.now()).toISOString();
    const activeCutoff = new Date(this.ctx.now() - 5 * 60 * 1000).toISOString();

    const jobsByPlatform = new Map<string, number>();
    const jobRes = await this.ctx.db
      .prepare(
        `SELECT platform, COUNT(*) as cnt FROM crawl_jobs
      WHERE (state IN ('pending', 'backoff') OR (state = 'done' AND next_fetch_at <= ?))
      GROUP BY platform`
      )
      .bind(now)
      .all<{ platform: string; cnt: number }>();
    for (const row of jobRes.results || []) {
      jobsByPlatform.set(row.platform, row.cnt);
    }

    const demandByPlatform = new Map<string, number>();
    const demandRes = await this.ctx.db
      .prepare(
        `SELECT requested_platform, COUNT(*) as cnt FROM downstream_demand_signals
      WHERE resolved_at IS NULL AND requested_platform IS NOT NULL
      GROUP BY requested_platform`
      )
      .all<{ requested_platform: string; cnt: number }>();
    for (const row of demandRes.results || []) {
      demandByPlatform.set(row.requested_platform, row.cnt);
    }

    const activeNodesByPlatform = new Map<string, number>();
    const activeRes = await this.ctx.db
      .prepare(
        `SELECT c.capabilities_json FROM node_heartbeats h
      JOIN node_credentials c ON c.node_id = h.node_id
      WHERE h.last_seen_at >= ? AND c.revoked_at IS NULL`
      )
      .bind(activeCutoff)
      .all<{ capabilities_json: string }>();
    for (const row of activeRes.results || []) {
      try {
        const caps = JSON.parse(row.capabilities_json) as string[];
        for (const cap of caps) {
          activeNodesByPlatform.set(cap, (activeNodesByPlatform.get(cap) || 0) + 1);
        }
      } catch {
        // ignore
      }
    }

    const scored = candidates.map((platform) => {
      const pendingJobs = jobsByPlatform.get(platform) || 0;
      const demandSignals = demandByPlatform.get(platform) || 0;
      const activeWorkers = activeNodesByPlatform.get(platform) || 0;
      const score = (pendingJobs * 2 + demandSignals * 5 + 1) / (activeWorkers + 1);
      return { platform, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (candidateCapabilities && candidateCapabilities.length > 0) {
      return scored.map((s) => s.platform);
    }
    const count = Math.min(3, scored.length);
    return scored.slice(0, count).map((s) => s.platform);
  }

  async issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> {
    const parsed = IssueNodeCredentialSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const capabilities =
      parsed.capabilities && parsed.capabilities.length > 0
        ? await this.evaluateWorkforceDistribution(parsed.capabilities)
        : await this.evaluateWorkforceDistribution();
    return this.createNodeCredential(parsed.nodeId, capabilities, { actor, reason: parsed.reason });
  }

  async listLeadsPage(
    status: "pending_review" | "approved" | "rejected",
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Lead limit must be 1..100");
    const after = cursor ? "AND (first_seen_at,lead_key)>(?,?)" : "";
    const params = cursor ? [status, cursor.firstSeenAt, cursor.leadKey, limit + 1] : [status, limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT lead_key,kind,target_url,claimed_package_id,discovered_from_url,
      discovered_from_item_key,status,first_seen_at,last_seen_at FROM source_leads
      WHERE status=? ${after} ORDER BY first_seen_at,lead_key LIMIT ?`
      )
      .bind(...params)
      .all<LeadRow>();
    const rows = res.results || [];
    const leads = rows.slice(0, limit);
    const last = leads.at(-1);
    return {
      leads,
      nextCursor:
        rows.length > limit && last
          ? encodeLeadCursor({
              status,
              firstSeenAt: last.first_seen_at,
              leadKey: last.lead_key
            })
          : null
    };
  }

  async approveDiscoveryLead(
    leadKey: string,
    minDelayMs = 1000,
    actor = "local-cli",
    reason = "Operator reviewed listing",
    sourceRuleId?: string
  ): Promise<string> {
    if (!reason.trim() || reason.length > 300) throw new Error("Approval reason required (at most 300 characters)");
    const lead = await this.ctx.db
      .prepare("SELECT kind,status,target_url FROM source_leads WHERE lead_key=?")
      .bind(leadKey)
      .first<{ kind: DiscoveryLead["kind"]; status: string; target_url: string }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");

    const resolved = resolveDiscoveryLeadTarget(lead.kind, lead.target_url, minDelayMs);
    if (!resolved) {
      throw new Error("Only published VPM listing leads can become VPM crawl jobs");
    }

    return this.seedJobFn(resolved.url, resolved.platform, resolved.minDelayMs, sourceRuleId, resolved.purpose, {
      actor,
      reason,
      leadKey
    });
  }

  async rejectLead(leadKey: string, actor: string, reason: string): Promise<void> {
    if (!reason.trim() || reason.length > 300) throw new Error("Rejection reason required (at most 300 characters)");
    const lead = await this.ctx.db
      .prepare("SELECT status FROM source_leads WHERE lead_key=?")
      .bind(leadKey)
      .first<{ status: string }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "approved") throw new Error("Approved lead cannot be rejected without revoking its job");
    if (lead.status === "rejected") return;
    await this.ctx.db.batch([
      this.ctx.db.prepare("UPDATE source_leads SET status='rejected' WHERE lead_key=?").bind(leadKey),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('lead',?,?,'reject_lead',?,?)`
        )
        .bind(leadKey, actor, reason.trim(), new Date(this.ctx.now()).toISOString())
    ]);
  }

  async listAutoQueueRulesPage(
    limit: number,
    cursor: RuleCursor | null
  ): Promise<{ rules: AutoQueueRule[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Rule limit must be 1..100");
    const before = cursor ? "WHERE (created_at,rule_id)<(?,?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.ruleId, limit + 1] : [limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT * FROM lead_autoqueue_rules ${before}
      ORDER BY created_at DESC,rule_id DESC LIMIT ?`
      )
      .bind(...params)
      .all<AutoQueueRuleRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      rules: visible.map((row) => this.ctx.autoQueueRuleFromRow(row)),
      nextCursor:
        rows.length > limit && last
          ? encodeRuleCursor({
              createdAt: last.created_at,
              ruleId: last.rule_id
            })
          : null
    };
  }

  async createAutoQueueRule(input: CreateAutoQueueRule, actor: string): Promise<AutoQueueRule> {
    const parsed = CreateAutoQueueRuleSchema.parse(input);
    const now = new Date(this.ctx.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Rule expiry must be in the future");
    const existing = await this.ctx.db
      .prepare(
        `SELECT 1 FROM lead_autoqueue_rules
      WHERE lead_kind=? AND origin=? AND path_scope=? AND disabled_at IS NULL AND expires_at>?`
      )
      .bind(parsed.leadKind, parsed.origin, parsed.pathScope, now)
      .first();
    if (existing) throw new Error("An active rule already covers this exact scope");
    const ruleId = crypto.randomUUID();
    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO lead_autoqueue_rules
        (rule_id,lead_kind,origin,path_scope,min_delay_ms,expires_at,review_reference,reason,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          ruleId,
          parsed.leadKind,
          parsed.origin,
          parsed.pathScope,
          parsed.minDelayMs,
          parsed.expiresAt,
          parsed.reviewReference,
          parsed.reason,
          now
        ),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('rule',?,?, 'create', ?, ?)`
        )
        .bind(ruleId, actor, parsed.reason, now)
    ]);
    const row = await this.ctx.db
      .prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
      .bind(ruleId)
      .first<AutoQueueRuleRow>();
    return this.ctx.autoQueueRuleFromRow(row!);
  }

  async disableAutoQueueRule(ruleId: string, actor: string, reason: string): Promise<AutoQueueRule> {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    const row = await this.ctx.db
      .prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
      .bind(ruleId)
      .first<AutoQueueRuleRow>();
    if (!row) throw new Error("Rule not found");
    if (!row.disabled_at) {
      const now = new Date(this.ctx.now()).toISOString();
      const leasedRes = await this.ctx.db
        .prepare("SELECT job_id,origin FROM crawl_jobs WHERE source_rule_id=? AND state='leased'")
        .bind(ruleId)
        .all<{ job_id: string; origin: string }>();
      const leased = leasedRes.results || [];
      const batchStmts = [
        this.ctx.db.prepare("UPDATE lead_autoqueue_rules SET disabled_at=? WHERE rule_id=?").bind(now, ruleId)
      ];
      for (const job of leased) {
        batchStmts.push(
          this.ctx.db
            .prepare(
              `UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL
            WHERE job_id=?`
            )
            .bind(job.job_id),
          this.ctx.db
            .prepare(
              `UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
            WHERE origin=? AND active_job_id=?`
            )
            .bind(job.origin, job.job_id)
        );
      }
      batchStmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
          VALUES ('rule',?,?, 'disable', ?, ?)`
          )
          .bind(ruleId, actor, reason.trim(), now)
      );
      await this.ctx.executeBatchChunked(batchStmts);
      row.disabled_at = now;
    }
    return this.ctx.autoQueueRuleFromRow(row);
  }

  async listSourceAccessProfilesPage(
    limit: number,
    cursor: ProfileCursor | null
  ): Promise<{ profiles: SourceAccessProfile[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Profile limit must be 1..100");
    const before = cursor ? "WHERE (created_at,profile_id)<(?,?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.profileId, limit + 1] : [limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT * FROM source_access_profiles ${before}
      ORDER BY created_at DESC,profile_id DESC LIMIT ?`
      )
      .bind(...params)
      .all<SourceAccessProfileRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      profiles: visible.map((row) => this.ctx.sourceAccessProfileFromRow(row)),
      nextCursor:
        rows.length > limit && last
          ? encodeProfileCursor({
              createdAt: last.created_at,
              profileId: last.profile_id
            })
          : null
    };
  }

  async createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string): Promise<SourceAccessProfile> {
    const parsed = CreateSourceAccessProfileSchema.parse(input);
    const now = new Date(this.ctx.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Source profile expiry must be in the future");
    const profileId = crypto.randomUUID();
    const existingRes = await this.ctx.db
      .prepare(
        `SELECT path_scope,query_scope FROM source_access_profiles
      WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?`
      )
      .bind(parsed.platform, parsed.origin, parsed.purpose, now)
      .all<{ path_scope: string; query_scope: string | null }>();
    const existing = existingRes.results || [];
    if (
      existing.some((row) =>
        sourcePathScopesOverlap(row.path_scope, parsed.pathScope, row.query_scope ?? undefined, parsed.exactQuery)
      )
    ) {
      throw new Error("Overlapping active source profile requires disabling the old grant first");
    }
    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO source_access_profiles
        (profile_id,platform,origin,path_scope,query_scope,method,purpose,min_delay_ms,expires_at,
          review_reference,reason,retain_classes_json,publish_classes_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .bind(
          profileId,
          parsed.platform,
          parsed.origin,
          parsed.pathScope,
          parsed.exactQuery ?? null,
          parsed.method,
          parsed.purpose,
          parsed.minDelayMs,
          parsed.expiresAt,
          parsed.reviewReference,
          parsed.reason,
          JSON.stringify(parsed.retainClasses),
          JSON.stringify(parsed.publishClasses),
          now
        ),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('profile',?,?, 'create', ?, ?)`
        )
        .bind(profileId, actor, parsed.reason, now)
    ]);
    const row = await this.ctx.db
      .prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId)
      .first<SourceAccessProfileRow>();
    return this.ctx.sourceAccessProfileFromRow(row!);
  }

  async disableSourceAccessProfile(profileId: string, actor: string, reason: string): Promise<SourceAccessProfile> {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    const row = await this.ctx.db
      .prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId)
      .first<SourceAccessProfileRow>();
    if (!row) throw new Error("Source profile not found");
    if (row.disabled_at) return this.ctx.sourceAccessProfileFromRow(row);
    const now = new Date(this.ctx.now()).toISOString();

    const leasedRes = await this.ctx.db
      .prepare("SELECT job_id,origin FROM crawl_jobs WHERE lease_profile_id=? AND state='leased'")
      .bind(profileId)
      .all<{ job_id: string; origin: string }>();
    const leased = leasedRes.results || [];

    const batchStmts = [
      this.ctx.db.prepare("UPDATE source_access_profiles SET disabled_at=? WHERE profile_id=?").bind(now, profileId)
    ];
    for (const job of leased) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,
          lease_expires_at=NULL,lease_profile_id=NULL WHERE job_id=?`
          )
          .bind(job.job_id),
        this.ctx.db
          .prepare(
            `UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
          WHERE origin=? AND active_job_id=?`
          )
          .bind(job.origin, job.job_id)
      );
    }
    const dueDelay = await this.ctx.approvedDueProfileDelayForOrigin(row.origin, now);
    if (dueDelay === null) {
      batchStmts.push(
        this.ctx.db
          .prepare("UPDATE origin_robots SET refresh_lease_id=NULL, refresh_lease_expires_at=NULL WHERE origin=?")
          .bind(row.origin)
      );
    }
    batchStmts.push(
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('profile',?,?, 'disable', ?, ?)`
        )
        .bind(profileId, actor, reason.trim(), now)
    );
    await this.ctx.executeBatchChunked(batchStmts);
    const updatedRow = await this.ctx.db
      .prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId)
      .first<SourceAccessProfileRow>();
    return this.ctx.sourceAccessProfileFromRow(updatedRow!);
  }

  async listAuditLogs(options?: {
    entityType?: "node" | "lead" | "job" | "rule" | "profile" | "app";
    entityId?: string;
    limit?: number;
  }): Promise<OperatorAuditLogRow[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
    let sql = "SELECT * FROM operator_audit_log";
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options?.entityType) {
      conditions.push("entity_type = ?");
      params.push(options.entityType);
    }
    if (options?.entityId) {
      conditions.push("entity_id = ?");
      params.push(options.entityId);
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }
    sql += " ORDER BY occurred_at DESC, action_id DESC LIMIT ?";
    params.push(limit);
    const res = await this.ctx.db.prepare(sql).bind(...params).all<OperatorAuditLogRow>();
    return res.results || [];
  }

  async submitDelistRequest(input: {
    targetUrl?: string;
    canonicalId?: string;
    reason: string;
    requesterType: "unauthenticated_creator" | "user" | "admin_operator";
    requesterId?: string;
    proofKind?: "storefront_bio_token" | "dns_txt" | "manual_notice";
    proofValue?: string;
    contactEmail?: string;
  }) {
    if (!input.targetUrl && !input.canonicalId) {
      throw new Error("Either targetUrl or canonicalId must be provided");
    }
    if (input.requesterType === "unauthenticated_creator" && (!input.proofKind || !input.proofValue?.trim())) {
      throw new Error("Ownership proof is required for unauthenticated delist requests");
    }
    const takedownId = crypto.randomUUID();
    const recordedAt = new Date(this.ctx.now()).toISOString();
    const target = input.targetUrl || input.canonicalId!;
    const reviewStatus = input.requesterType === "unauthenticated_creator" ? "pending" : "accepted";

    let normalizedUrl: string | null = null;
    if (input.targetUrl) {
      try {
        normalizedUrl = new URL(input.targetUrl).href;
      } catch {
        normalizedUrl = input.targetUrl;
      }
    }

    const priorLifecycles: Record<string, string> = {};
    if (input.canonicalId) {
      const pkg = await this.ctx.db
        .prepare("SELECT canonical_id, lifecycle FROM canonical_packages WHERE canonical_id = ?")
        .bind(input.canonicalId)
        .first<{ canonical_id: string; lifecycle: string }>();
      if (pkg) priorLifecycles[pkg.canonical_id] = pkg.lifecycle;
    }
    if (input.targetUrl) {
      const fronts = await this.ctx.db
        .prepare(
          `SELECT cp.canonical_id, cp.lifecycle
        FROM canonical_packages cp
        JOIN package_fronts pf ON pf.canonical_id = cp.canonical_id
        WHERE pf.storefront_url = ?`
        )
        .bind(input.targetUrl)
        .all<{ canonical_id: string; lifecycle: string }>();
      for (const row of fronts.results || []) {
        priorLifecycles[row.canonical_id] = row.lifecycle;
      }
    }

    let priorSuppressedReason: string | null = null;
    let priorJobState: string | null = null;
    if (normalizedUrl) {
      const sup = await this.ctx.db
        .prepare("SELECT reason FROM suppressed_urls WHERE url = ?")
        .bind(normalizedUrl)
        .first<{ reason: string }>();
      priorSuppressedReason = sup?.reason ?? null;
      const job = await this.ctx.db
        .prepare("SELECT state FROM crawl_jobs WHERE url = ?")
        .bind(normalizedUrl)
        .first<{ state: string }>();
      priorJobState = job?.state ?? null;
    }

    const payloadJson = JSON.stringify({
      priorLifecycles,
      priorSuppressedReason,
      priorJobState
    });

    await this.ctx.db
      .prepare(
        `INSERT INTO catalog_tickets (
        ticket_id, ticket_type, target_url, canonical_id, requester_type, requester_id,
        reason, proof_kind, proof_value, contact_email, payload_json, recorded_at, review_status, review_notes
      ) VALUES (?, 'opt_out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        takedownId,
        input.targetUrl || null,
        input.canonicalId || null,
        input.requesterType,
        input.requesterId || null,
        input.reason,
        input.proofKind || null,
        input.proofValue || null,
        input.contactEmail || null,
        payloadJson,
        recordedAt,
        reviewStatus
      )
      .run();

    if (normalizedUrl) {
      try {
        await this.ctx.db
          .prepare("INSERT OR REPLACE INTO suppressed_urls(url,reason,suppressed_at) VALUES (?,?,?)")
          .bind(normalizedUrl, `Delisting request ${takedownId}: ${input.reason}`, recordedAt)
          .run();
        const job = await this.ctx.db
          .prepare("SELECT job_id,origin FROM crawl_jobs WHERE url=?")
          .bind(normalizedUrl)
          .first<{ job_id: string; origin: string }>();
        if (job) {
          await this.ctx.db
            .prepare(
              "UPDATE crawl_jobs SET state='blocked',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?"
            )
            .bind(job.job_id)
            .run();
          await this.ctx.db
            .prepare("UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL WHERE origin=? AND active_job_id=?")
            .bind(job.origin, job.job_id)
            .run();
        }
      } catch {
        // best-effort URL suppression
      }
    }

    if (input.canonicalId) {
      await this.ctx.db
        .prepare(
          `UPDATE canonical_packages SET lifecycle = 'delisted', updated_at = ?
        WHERE canonical_id = ? AND lifecycle != 'delisted'`
        )
        .bind(recordedAt, input.canonicalId)
        .run();
      await this.ctx.db
        .prepare(
          "INSERT OR IGNORE INTO catalog_tombstones (canonical_id, reason, recorded_at) VALUES (?, 'delisted', ?)"
        )
        .bind(input.canonicalId, recordedAt)
        .run();
    }
    if (input.targetUrl) {
      await this.ctx.db
        .prepare(
          `UPDATE canonical_packages SET lifecycle = 'delisted', updated_at = ?
        WHERE canonical_id IN (
          SELECT DISTINCT pf.canonical_id FROM package_fronts pf WHERE pf.storefront_url = ?
        ) AND lifecycle != 'delisted'`
        )
        .bind(recordedAt, input.targetUrl)
        .run();
      for (const canonicalId of Object.keys(priorLifecycles)) {
        await this.ctx.db
          .prepare(
            "INSERT OR IGNORE INTO catalog_tombstones (canonical_id, reason, recorded_at) VALUES (?, 'delisted', ?)"
          )
          .bind(canonicalId, recordedAt)
          .run();
      }
    }

    return {
      schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
      status: "accepted" as const,
      takedownId,
      target,
      action: "delisted" as const,
      requesterType: input.requesterType,
      recordedAt
    };
  }

  async listTakedownsPage(
    requesterType?: string,
    limit = 100,
    cursor: TakedownCursor | null = null
  ): Promise<{ records: TakedownRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Takedown limit must be 1..100");
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (requesterType) {
      conditions.push("requester_type = ?");
      params.push(requesterType);
    }
    if (cursor) {
      conditions.push("(recorded_at, ticket_id) < (?, ?)");
      params.push(cursor.recordedAt, cursor.takedownId);
    }
    const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS takedown_id, target_url, canonical_id, requester_type, requester_id,
             reason, proof_kind, proof_value, contact_email, review_status, review_notes, recorded_at
      FROM catalog_tickets
      WHERE ticket_type = 'opt_out' ${where}
      ORDER BY recorded_at DESC, ticket_id DESC
      LIMIT ?`
      )
      .bind(...params)
      .all<{
        takedown_id: string;
        target_url: string | null;
        canonical_id: string | null;
        requester_type: "unauthenticated_creator" | "user" | "admin_operator";
        requester_id: string | null;
        reason: string;
        proof_kind: "storefront_bio_token" | "dns_txt" | "manual_notice" | null;
        proof_value: string | null;
        contact_email: string | null;
        review_status: "pending" | "accepted" | "rejected";
        review_notes: string | null;
        recorded_at: string;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const records: TakedownRecord[] = visible.map((row) => ({
      takedownId: row.takedown_id,
      targetUrl: row.target_url,
      canonicalId: row.canonical_id,
      requesterType: row.requester_type,
      requesterId: row.requester_id,
      reason: row.reason,
      proofKind: row.proof_kind,
      proofValue: row.proof_value,
      contactEmail: row.contact_email,
      reviewStatus: row.review_status,
      reviewNotes: row.review_notes,
      recordedAt: row.recorded_at
    }));

    return {
      records,
      nextCursor:
        rows.length > limit && last
          ? encodeTakedownCursor({
              recordedAt: last.recorded_at,
              takedownId: last.takedown_id
            })
          : null
    };
  }

  async verifyTakedown(
    takedownId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ takedownId: string; status: "accepted" | "rejected"; updatedAt: string }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS takedown_id, target_url, canonical_id, requester_type, review_status, payload_json, recorded_at
      FROM catalog_tickets
      WHERE ticket_id = ? AND ticket_type = 'opt_out'`
      )
      .bind(takedownId)
      .first<{
        takedown_id: string;
        target_url: string | null;
        canonical_id: string | null;
        requester_type: string;
        review_status: string;
        payload_json: string | null;
        recorded_at: string;
      }>();

    if (!row) {
      throw new Error("Takedown not found");
    }

    let snapshot: {
      priorLifecycles?: Record<string, string>;
      priorSuppressedReason?: string | null;
      priorJobState?: string | null;
    } = {};
    if (row.payload_json) {
      try {
        snapshot = JSON.parse(row.payload_json);
      } catch {}
    }

    const updatedAt = new Date(this.ctx.now()).toISOString();
    const auditNotes = JSON.stringify({ actor, verdict, notes: notes ?? null });
    const batchStatements: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `UPDATE catalog_tickets
        SET review_status = ?, review_notes = ?, payload_json = COALESCE(json_set(COALESCE(payload_json, '{}'), '$.verifiedBy', ?, '$.verifiedAt', ?), ?)
        WHERE ticket_id = ? AND ticket_type = 'opt_out'`
        )
        .bind(verdict, notes || null, actor, updatedAt, auditNotes, takedownId)
    ];

    if (verdict === "rejected") {
      if (row.canonical_id) {
        const priorLifecycle = snapshot.priorLifecycles?.[row.canonical_id] ?? "active";
        if (priorLifecycle !== "delisted") {
          batchStatements.push(
            this.ctx.db
              .prepare(
                `UPDATE canonical_packages
              SET lifecycle = ?, updated_at = ?
              WHERE canonical_id = ? AND lifecycle = 'delisted'
                AND NOT EXISTS (
                  SELECT 1 FROM catalog_tickets ct
                  WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                    AND ct.canonical_id = ? AND ct.review_status = 'accepted'
                )`
              )
              .bind(priorLifecycle, updatedAt, row.canonical_id, takedownId, row.canonical_id),
            this.ctx.db
              .prepare(
                `DELETE FROM catalog_tombstones
                WHERE canonical_id = ? AND reason = 'delisted' AND recorded_at = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM catalog_tickets ct
                    WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                      AND ct.canonical_id = ? AND ct.review_status = 'accepted'
                  )`
              )
              .bind(row.canonical_id, row.recorded_at, takedownId, row.canonical_id)
          );
        }
      }
      if (row.target_url) {
        try {
          const normalized = new URL(row.target_url).href;
          if (!snapshot.priorSuppressedReason) {
            batchStatements.push(
              this.ctx.db
                .prepare("DELETE FROM suppressed_urls WHERE url = ? AND reason LIKE ?")
                .bind(normalized, `Delisting request ${takedownId}:%`)
            );
          } else {
            batchStatements.push(
              this.ctx.db
                .prepare("UPDATE suppressed_urls SET reason = ? WHERE url = ? AND reason LIKE ?")
                .bind(snapshot.priorSuppressedReason, normalized, `Delisting request ${takedownId}:%`)
            );
          }
          const restoredJobState =
            snapshot.priorJobState && snapshot.priorJobState !== "leased" ? snapshot.priorJobState : "pending";
          if (restoredJobState !== "blocked" && !snapshot.priorSuppressedReason) {
            batchStatements.push(
              this.ctx.db
                .prepare("UPDATE crawl_jobs SET state = ? WHERE url = ? AND state = 'blocked'")
                .bind(restoredJobState, normalized)
            );
          }
        } catch {
          // URL normalization best-effort
        }

        const fronts = await this.ctx.db
          .prepare("SELECT DISTINCT pf.canonical_id FROM package_fronts pf WHERE pf.storefront_url = ?")
          .bind(row.target_url)
          .all<{ canonical_id: string }>();
        for (const front of fronts.results || []) {
          const priorLifecycle = snapshot.priorLifecycles?.[front.canonical_id] ?? "active";
          if (priorLifecycle !== "delisted") {
            batchStatements.push(
              this.ctx.db
                .prepare(
                  `UPDATE canonical_packages
                SET lifecycle = ?, updated_at = ?
                WHERE canonical_id = ? AND lifecycle = 'delisted'
                  AND NOT EXISTS (
                    SELECT 1 FROM catalog_tickets ct
                    WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                      AND (ct.canonical_id = ? OR ct.target_url = ?) AND ct.review_status = 'accepted'
                  )`
                )
                .bind(priorLifecycle, updatedAt, front.canonical_id, takedownId, front.canonical_id, row.target_url),
              this.ctx.db
                .prepare(
                  `DELETE FROM catalog_tombstones
                  WHERE canonical_id = ? AND reason = 'delisted' AND recorded_at = ?
                    AND NOT EXISTS (
                      SELECT 1 FROM catalog_tickets ct
                      WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                        AND (ct.canonical_id = ? OR ct.target_url = ?) AND ct.review_status = 'accepted'
                    )`
                )
                .bind(front.canonical_id, row.recorded_at, takedownId, front.canonical_id, row.target_url)
            );
          }
        }
      }
    }

    await this.ctx.executeBatchChunked(batchStatements);

    return {
      takedownId,
      status: verdict,
      updatedAt
    };
  }

  async listDelegatedClaimsPage(
    reviewStatus?: string,
    limit = 100,
    cursor: DelegatedClaimCursor | null = null
  ): Promise<{ records: DelegatedClaimRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Claim limit must be 1..100");
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (reviewStatus) {
      conditions.push("review_status = ?");
      params.push(reviewStatus);
    }
    if (cursor) {
      conditions.push("(recorded_at, ticket_id) < (?, ?)");
      params.push(cursor.recordedAt, cursor.claimId);
    }
    const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS claim_id, app_id, 'creator_ownership_claim' AS action, target_url AS front_url, creator_id, challenge_token,
             expires_at, nonce, signature, reason, contact_email, review_status, review_notes, recorded_at
      FROM catalog_tickets
      WHERE ticket_type = 'delegated_claim' ${where}
      ORDER BY recorded_at DESC, ticket_id DESC
      LIMIT ?`
      )
      .bind(...params)
      .all<{
        claim_id: string;
        app_id: string;
        action: "creator_ownership_claim";
        front_url: string;
        creator_id: string;
        challenge_token: string;
        expires_at: number;
        nonce: string;
        signature: string;
        reason: string | null;
        contact_email: string | null;
        review_status: "pending" | "accepted" | "rejected";
        review_notes: string | null;
        recorded_at: string;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const records: DelegatedClaimRecord[] = visible.map((row) => ({
      claimId: row.claim_id,
      appId: row.app_id,
      action: row.action,
      frontUrl: row.front_url,
      creatorId: row.creator_id,
      challengeToken: row.challenge_token,
      expiresAt: row.expires_at,
      nonce: row.nonce,
      signature: row.signature,
      reason: row.reason,
      contactEmail: row.contact_email,
      reviewStatus: row.review_status,
      reviewNotes: row.review_notes,
      recordedAt: row.recorded_at
    }));

    return {
      records,
      nextCursor:
        rows.length > limit && last
          ? encodeDelegatedClaimCursor({
              recordedAt: last.recorded_at,
              claimId: last.claim_id
            })
          : null
    };
  }

  async verifyDelegatedClaim(
    claimId: string,
    verdict: "accepted" | "rejected",
    _actor: string,
    notes?: string
  ): Promise<{ claimId: string; status: "accepted" | "rejected"; updatedAt: string }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS claim_id, review_status
      FROM catalog_tickets
      WHERE ticket_id = ? AND ticket_type = 'delegated_claim'`
      )
      .bind(claimId)
      .first<{
        claim_id: string;
        review_status: string;
      }>();

    if (!row) {
      throw new Error("Claim not found");
    }

    const updatedAt = new Date(this.ctx.now()).toISOString();
    await this.ctx.db
      .prepare(
        `UPDATE catalog_tickets
      SET review_status = ?, review_notes = ?
      WHERE ticket_id = ? AND ticket_type = 'delegated_claim'`
      )
      .bind(verdict, notes || null, claimId)
      .run();

    return {
      claimId,
      status: verdict,
      updatedAt
    };
  }

  async listOperatorAppsPage(
    limit = 100,
    cursor: OperatorAppCursor | null = null,
    candidateStatus?: string
  ): Promise<{ apps: OperatorAppRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("App limit must be 1..100");
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (candidateStatus) {
      conditions.push("candidate_status = ?");
      params.push(candidateStatus);
    }

    if (cursor) {
      conditions.push("(created_at, app_id) < (?, ?)");
      params.push(cursor.createdAt, cursor.appId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT app_id, app_name, contact_email, permissions_json, created_at, revoked_at,
             request_count, last_active_at, candidate_status, candidate_flags_json
      FROM registered_apps
      ${where}
      ORDER BY created_at DESC, app_id DESC
      LIMIT ?`
      )
      .bind(...params)
      .all<{
        app_id: string;
        app_name: string;
        contact_email: string | null;
        permissions_json: string;
        created_at: string;
        revoked_at: string | null;
        request_count: number;
        last_active_at: string | null;
        candidate_status: string;
        candidate_flags_json: string;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const apps: OperatorAppRecord[] = visible.map((row) => {
      const perms: string[] = JSON.parse(row.permissions_json);
      let flags: string[] = [];
      try {
        flags = JSON.parse(row.candidate_flags_json);
      } catch {}
      return {
        appId: row.app_id,
        appName: row.app_name,
        contactEmail: row.contact_email ?? null,
        permissions: perms,
        delegationAllowed: perms.includes("claims:delegate"),
        requestCount: row.request_count ?? 0,
        lastActiveAt: row.last_active_at ?? null,
        candidateStatus: (row.candidate_status as any) || "none",
        candidateFlags: flags,
        createdAt: row.created_at,
        revokedAt: row.revoked_at ?? null
      };
    });

    return {
      apps,
      nextCursor:
        rows.length > limit && last
          ? encodeOperatorAppCursor({
              createdAt: last.created_at,
              appId: last.app_id
            })
          : null
    };
  }

  private mutateDelegationPermissions(currentPermissionsJson: string, grantDelegation: boolean | undefined): string[] {
    const currentPerms = new Set<string>(JSON.parse(currentPermissionsJson));
    if (grantDelegation === true) {
      currentPerms.add("claims:delegate");
      currentPerms.add("takedowns:submit");
    } else if (grantDelegation === false) {
      currentPerms.delete("claims:delegate");
      currentPerms.delete("takedowns:submit");
    }
    return Array.from(currentPerms);
  }

  async reviewAppCandidate(
    appId: string,
    input: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string },
    actor: string
  ): Promise<{
    appId: string;
    candidateStatus: "none" | "review_pending" | "reviewed" | "trusted";
    candidateFlags: string[];
    delegationAllowed: boolean;
    permissions: string[];
    reviewedAt: string;
  }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT app_id, permissions_json, revoked_at, candidate_flags_json
      FROM registered_apps
      WHERE app_id = ?`
      )
      .bind(appId)
      .first<{
        app_id: string;
        permissions_json: string;
        revoked_at: string | null;
        candidate_flags_json: string;
      }>();

    if (!row) {
      throw new Error("App not found");
    }
    if (row.revoked_at) {
      throw new Error("App is revoked");
    }

    const grantFlag =
      input.grantDelegation === true || input.candidateStatus === "trusted"
        ? true
        : input.grantDelegation === false
        ? false
        : undefined;
    const newPerms = this.mutateDelegationPermissions(row.permissions_json, grantFlag);

    let flags: string[] = [];
    try {
      flags = JSON.parse(row.candidate_flags_json);
    } catch {}
    const reviewedAt = new Date(this.ctx.now()).toISOString();
    const auditReason = (input.notes?.trim() || `Candidate status set to ${input.candidateStatus}`).slice(0, 300);

    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `UPDATE registered_apps
        SET candidate_status = ?, permissions_json = ?
        WHERE app_id = ?`
        )
        .bind(input.candidateStatus, JSON.stringify(newPerms), appId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('app',?,?, 'candidate_review', ?, ?)`
        )
        .bind(appId, actor || "operator-api", auditReason, reviewedAt)
    ]);

    return {
      appId,
      candidateStatus: input.candidateStatus,
      candidateFlags: flags,
      delegationAllowed: newPerms.includes("claims:delegate"),
      permissions: newPerms,
      reviewedAt
    };
  }

  async setAppDelegation(
    appId: string,
    allowed: boolean,
    actor: string,
    reason?: string
  ): Promise<{ appId: string; delegationAllowed: boolean; permissions: string[]; updatedAt: string }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT app_id, permissions_json, revoked_at
      FROM registered_apps
      WHERE app_id = ?`
      )
      .bind(appId)
      .first<{
        app_id: string;
        permissions_json: string;
        revoked_at: string | null;
      }>();

    if (!row) {
      throw new Error("App not found");
    }
    if (row.revoked_at) {
      throw new Error("App is revoked");
    }

    const newPerms = this.mutateDelegationPermissions(row.permissions_json, allowed);
    const updatedAt = new Date(this.ctx.now()).toISOString();
    const auditReason = (reason?.trim() || (allowed ? "Delegation enabled" : "Delegation revoked")).slice(0, 300);

    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `UPDATE registered_apps
        SET permissions_json = ?,
            candidate_status = CASE WHEN ? = 0 AND candidate_status = 'trusted' THEN 'reviewed' ELSE candidate_status END
        WHERE app_id = ?`
        )
        .bind(JSON.stringify(newPerms), allowed ? 1 : 0, appId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type,entity_id,actor,action,reason,occurred_at)
        VALUES ('app',?,?, ?, ?, ?)`
        )
        .bind(appId, actor || "operator-api", allowed ? "grant_delegation" : "revoke_delegation", auditReason, updatedAt)
    ]);

    return {
      appId,
      delegationAllowed: allowed,
      permissions: newPerms,
      updatedAt
    };
  }
}
