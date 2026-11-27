import {
  BulkApproveLeadsRequestSchema,
  CreateSteeringProfileSchema,
  CreateSuppressedTargetSchema,
  DOWNSTREAM_PROTOCOL_VERSION,
  DeleteJobRequestSchema,
  EnqueueJobRequestSchema,
  IssueNodeCredentialSchema,
  OperatorJobListQuerySchema,
  OperatorJobStateSchema,
  OperatorNodeStatusSchema,
  PlatformSchema as ApiPlatformSchema,
  RequeueJobRequestSchema,
  RevokeNodeRequestSchema,
  RevokeNodeResponseSchema,
  SteeringProfileActionSchema,
  SteeringProfileSchema,
  SuppressLeadDomainRequestSchema,
  SystemPurgeRequestSchema,
  UpdateJobRequestSchema,
  UpdateSteeringProfileSchema,
  encodeDelegatedClaimCursor,
  encodeLeadCursor,
  encodeOperatorAppCursor,
  encodeOperatorJobCursor,
  encodeOperatorNodeCursor,
  encodeSteeringProfileCursor,
  encodeSuppressedTargetCursor,
  encodeTakedownCursor,
  type BulkApproveLeadsRequest,
  type BulkApproveLeadsResponse,
  type CreateSteeringProfile,
  type CreateSuppressedTarget,
  type DelegatedClaimCursor,
  type DelegatedClaimRecord,
  type EnqueueJobRequest,
  type IssueNodeCredential,
  type LeadCursor,
  type LeadRow,
  type LeadStatus,
  type OperatorAppCursor,
  type OperatorAppRecord,
  type OperatorEnvironment,
  type OperatorJobCursor,
  type OperatorJobRecord,
  type OperatorJobState,
  type OperatorNodeCursor,
  type OperatorNodeRecord,
  type OperatorNodeStatus,
  type OperatorStatusResponse,
  type PriorityLane,
  type RequeueJobRequest,
  type RevokeNodeRequest,
  type SteeringProfile,
  type SteeringProfileCursor,
  type SuppressLeadDomainRequest,
  type SuppressLeadDomainResponse,
  type SuppressedTarget,
  type SuppressedTargetCursor,
  type SystemPurgeRequest,
  type SystemPurgeResponse,
  type TakedownCursor,
  type TakedownRecord,
  type UpdateJobRequest,
  type UpdateSteeringProfile
} from "vrc-packages-api";
import {
  ClaimRequestSchema,
  PROTOCOL_VERSION,
  PlatformSchema,
  type DiscoveryLead,
  type Platform
} from "vrc-packages-network/node";
import { robotsResultAllowsMissingFile } from "vrc-packages-network/robots";
import { resolveDiscoveryLeadTarget } from "vrc-packages-network/source-targets";
import {
  findMatchingHostSuppression,
  findMatchingSuppressedTarget,
  normalizeTargetHost,
  steeringPathScopesOverlap,
  steeringProfileMatches,
  steeringQueryModesOverlap,
  type SourcePurpose
} from "../../../domain/access/steering_profile.ts";
import { CoordinatorConflict, type NodeCredentialIssued } from "../../../domain/ports/stores.ts";
import { formatCapabilityToken } from "../../../domain/security/capability_token.ts";
import { sha256Hex } from "../../../domain/security/crypto_primitives.ts";
import { buildPreviewStarterSteeringProfiles } from "../../default_seeds.ts";
import type {
  D1PreparedStatement,
  JobRow,
  SteeringProfileRow,
  SuppressedTargetRow
} from "../definitions.ts";
import { EXPECTED_V0_TABLE_NAMES } from "../schema/index.ts";
import { D1_SCHEMA_SQL } from "../utils.ts";
import { D1PlaneContext, type OperatorAuditLogRow } from "./shared_context.ts";

export interface SeedJobOptions {
  minDelayMs?: number;
  purpose?: SourcePurpose;
  priorityLane?: PriorityLane;
  recrawlIntervalMs?: number;
  paginationDepth?: number;
  steeringProfileId?: string | null;
  audit?: { actor: string; reason: string; leadKey?: string };
}

type OriginBlockerRow = {
  origin: string;
  active_job_id: string | null;
  lease_expires_at: string | null;
  next_allowed_at: string;
  robots_snapshot_id: string | null;
  robots_status_code: number | null;
  robots_body: string | null;
  robots_fetched_at: string | null;
  robots_expires_at: string | null;
};

function quoteSqliteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export class OperatorPlane {
  constructor(
    private readonly ctx: D1PlaneContext,
    private readonly seedJobFn: (url: string, platform: Platform, options?: SeedJobOptions) => Promise<string>
  ) {}

  async initSchema(_options?: { autoSeed?: false }): Promise<void> {
    await this.ctx.db.exec(D1_SCHEMA_SQL);
  }

  private async detectSchemaState(): Promise<"v0-17" | "legacy" | "uninitialized"> {
    const res = await this.ctx.db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE '_cf_%'`
      )
      .all<{ name: string; type: string }>();
    const entries = res.results || [];
    if (entries.length === 0) return "uninitialized";
    if (entries.some((entry) => entry.type === "view")) return "legacy";

    const expectedSet = new Set<string>(EXPECTED_V0_TABLE_NAMES);
    const actualTables = entries.filter((entry) => entry.type === "table").map((entry) => entry.name);
    if (actualTables.length !== expectedSet.size) return "legacy";
    for (const tableName of actualTables) {
      if (!expectedSet.has(tableName)) return "legacy";
    }
    return "v0-17";
  }

  async getOperatorStatus(
    environment: OperatorEnvironment,
    purgeEnabled: boolean
  ): Promise<OperatorStatusResponse> {
    const d1SchemaState = await this.detectSchemaState();
    if (d1SchemaState !== "v0-17") {
      return {
        schemaVersion: 1,
        environment,
        purgeEnabled,
        d1SchemaState,
        queueReadiness: {
          claimableJobs: 0,
          blockedJobs: 0,
          pendingLeads: 0,
          unresolvedDemandSignals: 0,
          activeNodes: 0,
          activeSteeringProfiles: 0
        }
      };
    }

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    const [suppressedTargets, activeProfiles, jobsRes, countsRow] = await Promise.all([
      this.ctx.loadSuppressedTargets(),
      this.ctx.loadActiveSteeringProfiles(),
      this.ctx.db
        .prepare(
          `SELECT platform, url, job_purpose, state, next_fetch_at, lease_expires_at, robots_deferred_until
           FROM crawl_jobs`
        )
        .all<{
          platform: Platform;
          url: string;
          job_purpose: SourcePurpose;
          state: OperatorJobState;
          next_fetch_at: string;
          lease_expires_at: string | null;
          robots_deferred_until: string | null;
        }>(),
      this.ctx.db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM source_leads WHERE status = 'pending_review') AS pending_leads,
             (SELECT COUNT(*) FROM downstream_signals WHERE resolved_at IS NULL) AS unresolved_demand_signals,
             (SELECT COUNT(*) FROM nodes WHERE revoked_at IS NULL) AS active_nodes,
             (SELECT COUNT(*) FROM steering_profiles WHERE disabled_at IS NULL AND expires_at > ?) AS active_steering_profiles`
        )
        .bind(nowIso)
        .first<{
          pending_leads: number;
          unresolved_demand_signals: number;
          active_nodes: number;
          active_steering_profiles: number;
        }>()
    ]);

    let claimableJobs = 0;
    let blockedJobs = 0;
    for (const job of jobsRes.results || []) {
      const isSuppressed = findMatchingSuppressedTarget(job.url, suppressedTargets) !== null;
      const hasProfile = activeProfiles.some((profile) =>
        steeringProfileMatches(profile, job.platform, job.url, job.job_purpose, nowMs)
      );
      const robotsDeferred = Boolean(job.robots_deferred_until && job.robots_deferred_until > nowIso);

      if (job.state === "blocked" || isSuppressed || !hasProfile || robotsDeferred) {
        blockedJobs += 1;
        continue;
      }

      const unleasedOrExpired =
        job.state === "pending" ||
        job.state === "done" ||
        job.state === "backoff" ||
        (job.state === "leased" && (!job.lease_expires_at || job.lease_expires_at <= nowIso));
      if (unleasedOrExpired && job.next_fetch_at <= nowIso) {
        claimableJobs += 1;
      }
    }

    return {
      schemaVersion: 1,
      environment,
      purgeEnabled,
      d1SchemaState,
      queueReadiness: {
        claimableJobs,
        blockedJobs,
        pendingLeads: countsRow?.pending_leads ?? 0,
        unresolvedDemandSignals: countsRow?.unresolved_demand_signals ?? 0,
        activeNodes: countsRow?.active_nodes ?? 0,
        activeSteeringProfiles: countsRow?.active_steering_profiles ?? 0
      }
    };
  }

  async purgeDevelopmentDatabase(input: SystemPurgeRequest, actor: string): Promise<SystemPurgeResponse> {
    const parsed = SystemPurgeRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");

    const preserveNodes = parsed.preserveNodes !== false;
    const preservedRows: Array<{
      node_id: string;
      token_hash: string;
      capabilities_json: string;
      revoked_at: string | null;
      last_seen_at: string | null;
    }> = [];

    const objectsRes = await this.ctx.db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
           AND name NOT LIKE '_cf_%'`
      )
      .all<{ name: string; type: "table" | "view" }>();
    const dbObjects = objectsRes.results || [];
    const tableNames = new Set(dbObjects.filter((obj) => obj.type === "table").map((obj) => obj.name));

    if (preserveNodes) {
      if (tableNames.has("nodes")) {
        const nodesRes = await this.ctx.db
          .prepare("SELECT node_id, token_hash, capabilities_json, revoked_at, last_seen_at FROM nodes")
          .all<{
            node_id: string;
            token_hash: string;
            capabilities_json: string;
            revoked_at: string | null;
            last_seen_at: string | null;
          }>();
        for (const row of nodesRes.results || []) {
          preservedRows.push(row);
        }
      } else if (tableNames.has("node_credentials")) {
        const credRes = await this.ctx.db
          .prepare("SELECT node_id, token_hash, capabilities_json, revoked_at FROM node_credentials")
          .all<{
            node_id: string;
            token_hash: string;
            capabilities_json: string;
            revoked_at: string | null;
          }>();
        for (const row of credRes.results || []) {
          preservedRows.push({ ...row, last_seen_at: null });
        }
      }
    }

    this.ctx.robotsMatcherCache.clear();

    const viewObjects = dbObjects.filter((obj) => obj.type === "view");
    for (const view of viewObjects) {
      await this.ctx.db.prepare(`DROP VIEW IF EXISTS ${quoteSqliteIdentifier(view.name)}`).run();
    }

    let pendingTables = dbObjects
      .filter((obj) => obj.type === "table")
      .map((obj) => obj.name)
      .reverse();
    while (pendingTables.length > 0) {
      const remaining: string[] = [];
      let droppedInPass = 0;
      let lastError: unknown;
      for (const tableName of pendingTables) {
        try {
          await this.ctx.db.prepare(`DROP TABLE IF EXISTS ${quoteSqliteIdentifier(tableName)}`).run();
          droppedInPass += 1;
        } catch (error) {
          remaining.push(tableName);
          lastError = error;
        }
      }
      if (droppedInPass === 0) {
        throw lastError instanceof Error
          ? lastError
          : new Error(`Failed to drop D1 tables during purge: ${remaining.join(", ")}`);
      }
      pendingTables = remaining;
    }

    await this.ctx.db.exec(D1_SCHEMA_SQL);

    let restoredNodeCount = 0;
    if (preservedRows.length > 0) {
      const restoreStmts: D1PreparedStatement[] = [];
      for (const node of preservedRows) {
        const cleanCaps = this.parseNodeCapabilities(node.capabilities_json);
        if (cleanCaps.length === 0) continue;
        restoreStmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO nodes(node_id, token_hash, capabilities_json, revoked_at, last_seen_at, state, active_job_id)
               VALUES (?, ?, ?, ?, ?, 'idle', NULL)`
            )
            .bind(
              node.node_id,
              node.token_hash,
              JSON.stringify(cleanCaps),
              node.revoked_at,
              node.last_seen_at
            )
        );
        restoredNodeCount += 1;
      }
      if (restoreStmts.length > 0) {
        await this.ctx.executeBatchChunked(restoreStmts);
      }
    }

    let seededProfiles = 0;
    if (parsed.seedPreviewStarter === true) {
      const starters = buildPreviewStarterSteeringProfiles(this.ctx.now());
      for (const starter of starters) {
        await this.createSteeringProfile(starter, actor);
        seededProfiles += 1;
      }
    }

    await this.ctx.db
      .prepare(
        `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
         VALUES ('system', 'd1', ?, 'purge_development_d1', ?, ?)`
      )
      .bind(
        actor,
        `Purged development D1 schema (preservedNodes=${restoredNodeCount}, seededProfiles=${seededProfiles})`,
        new Date(this.ctx.now()).toISOString()
      )
      .run();

    return {
      schemaVersion: 1,
      status: "purged",
      d1SchemaState: "v0-17",
      preservedNodes: restoredNodeCount,
      seededProfiles
    };
  }

  async revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> {
    RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
    const parsed = RevokeNodeRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const now = new Date(this.ctx.now()).toISOString();
    const result = await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           SELECT 'node', node_id, ?, 'revoke', ?, ? FROM nodes WHERE node_id = ?`
        )
        .bind(actor, parsed.reason, now, nodeId),
      this.ctx.db
        .prepare(
          "UPDATE nodes SET revoked_at = COALESCE(revoked_at, ?), state = 'idle', active_job_id = NULL WHERE node_id = ?"
        )
        .bind(now, nodeId)
    ]);
    if ((result[0]?.meta as { changes?: number } | undefined)?.changes !== 1) throw new Error("Node not found");
  }

  async pruneNode(nodeId: string, actor: string, reason: string): Promise<void> {
    RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    RevokeNodeRequestSchema.shape.reason.parse(reason);
    const now = new Date(this.ctx.now()).toISOString();
    const result = await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           SELECT 'node', node_id, ?, 'prune', ?, ? FROM nodes
           WHERE node_id = ? AND revoked_at IS NOT NULL`
        )
        .bind(actor, reason.trim(), now, nodeId),
      this.ctx.db.prepare("DELETE FROM nodes WHERE node_id = ? AND revoked_at IS NOT NULL").bind(nodeId)
    ]);
    const auditChanges = (result[0]?.meta as { changes?: number } | undefined)?.changes;
    if (auditChanges !== 1) {
      const exists = await this.ctx.db
        .prepare("SELECT revoked_at FROM nodes WHERE node_id = ?")
        .bind(nodeId)
        .first<{ revoked_at: string | null }>();
      if (!exists) throw new Error("Node not found");
      throw new Error("Node not revoked");
    }
  }

  async createNodeCredential(
    nodeId: string,
    capabilities: Platform[],
    audit?: { actor: string; reason: string }
  ): Promise<NodeCredentialIssued> {
    const dedupCaps = [...new Set(capabilities)];
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: dedupCaps });
    if (
      audit &&
      (!audit.actor.trim() || audit.actor.length > 100 || !audit.reason.trim() || audit.reason.length > 300)
    ) {
      throw new Error("Credential audit actor and reason required");
    }
    const token = formatCapabilityToken(dedupCaps);
    const hash = await sha256Hex(token);
    const writes: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `INSERT INTO nodes(node_id, token_hash, capabilities_json, revoked_at, last_seen_at, state, active_job_id)
           VALUES (?, ?, ?, NULL, NULL, 'idle', NULL)
           ON CONFLICT(node_id) DO UPDATE SET
             token_hash = excluded.token_hash,
             capabilities_json = excluded.capabilities_json,
             revoked_at = NULL,
             state = 'idle',
             active_job_id = NULL`
        )
        .bind(nodeId, hash, JSON.stringify(dedupCaps))
    ];
    if (audit) {
      writes.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             VALUES ('node', ?, ?, 'issue', ?, ?)`
          )
          .bind(nodeId, audit.actor, audit.reason.trim(), new Date(this.ctx.now()).toISOString())
      );
    }
    await this.ctx.db.batch(writes);
    return { token, capabilities: dedupCaps };
  }

  async evaluateWorkforceDistribution(candidateCapabilities?: Platform[]): Promise<Platform[]> {
    const candidates =
      candidateCapabilities && candidateCapabilities.length > 0
        ? [...new Set(candidateCapabilities)]
        : [...PlatformSchema.options];
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    const activeCutoff = new Date(nowMs - 5 * 60 * 1000).toISOString();

    const [activeProfiles, suppressedTargets, jobRowsRes, demandRes, nodeRes] = await Promise.all([
      this.ctx.loadActiveSteeringProfiles(),
      this.ctx.loadSuppressedTargets(),
      this.ctx.db
        .prepare(
          `SELECT platform, url, job_purpose FROM crawl_jobs
           WHERE state IN ('pending', 'backoff')
              OR (state = 'done' AND next_fetch_at <= ?)
              OR (state = 'leased' AND lease_expires_at <= ?)`
        )
        .bind(nowIso, nowIso)
        .all<{ platform: Platform; url: string; job_purpose: SourcePurpose }>(),
      this.ctx.db
        .prepare(
          `SELECT requested_platform, COUNT(*) AS cnt FROM downstream_signals
           WHERE resolved_at IS NULL AND requested_platform IS NOT NULL
           GROUP BY requested_platform`
        )
        .all<{ requested_platform: string; cnt: number }>(),
      this.ctx.db
        .prepare(
          `SELECT capabilities_json FROM nodes
           WHERE revoked_at IS NULL
             AND (last_seen_at IS NULL OR last_seen_at >= ?)`
        )
        .bind(activeCutoff)
        .all<{ capabilities_json: string }>()
    ]);

    const claimableJobsByPlatform = new Map<string, number>();
    for (const row of jobRowsRes.results || []) {
      if (findMatchingSuppressedTarget(row.url, suppressedTargets)) continue;
      if (!activeProfiles.some((profile) => steeringProfileMatches(profile, row.platform, row.url, row.job_purpose, nowMs))) {
        continue;
      }
      claimableJobsByPlatform.set(row.platform, (claimableJobsByPlatform.get(row.platform) || 0) + 1);
    }

    const demandByPlatform = new Map<string, number>();
    for (const row of demandRes.results || []) {
      demandByPlatform.set(row.requested_platform, row.cnt);
    }

    const activeWorkersByPlatform = new Map<string, number>();
    for (const row of nodeRes.results || []) {
      for (const cap of this.parseNodeCapabilities(row.capabilities_json)) {
        activeWorkersByPlatform.set(cap, (activeWorkersByPlatform.get(cap) || 0) + 1);
      }
    }

    const scored = candidates.map((platform, index) => {
      const claimableJobs = claimableJobsByPlatform.get(platform) || 0;
      const demandSignals = demandByPlatform.get(platform) || 0;
      const activeWorkers = activeWorkersByPlatform.get(platform) || 0;
      const demandWeight = claimableJobs * 2 + demandSignals * 5;
      const score = demandWeight > 0 ? demandWeight / (activeWorkers + 1) : 0;
      return { platform, score, activeWorkers, index };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.activeWorkers !== b.activeWorkers) return a.activeWorkers - b.activeWorkers;
      return a.index - b.index;
    });

    if (candidateCapabilities && candidateCapabilities.length > 0) {
      return scored.map((entry) => entry.platform);
    }
    return scored.slice(0, Math.min(3, scored.length)).map((entry) => entry.platform);
  }

  async issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<NodeCredentialIssued> {
    const parsed = IssueNodeCredentialSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const capabilities = await this.evaluateWorkforceDistribution();
    return this.createNodeCredential(parsed.nodeId, capabilities, { actor, reason: parsed.reason });
  }

  private parseNodeCapabilities(raw: string): Platform[] {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set<Platform>();
      for (const item of parsed) {
        const check = PlatformSchema.safeParse(item);
        if (check.success) seen.add(check.data);
      }
      return [...seen];
    } catch {
      return [];
    }
  }

  async listNodesPage(
    status?: OperatorNodeStatus,
    limit = 100,
    cursor: OperatorNodeCursor | null = null
  ): Promise<{ nodes: OperatorNodeRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Node limit must be 1..100");
    if (status !== undefined) OperatorNodeStatusSchema.parse(status);
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (status === "active") {
      conditions.push("revoked_at IS NULL");
    } else if (status === "revoked") {
      conditions.push("revoked_at IS NOT NULL");
    }
    if (cursor) {
      conditions.push("node_id > ?");
      params.push(cursor.nodeId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT node_id, capabilities_json, revoked_at, last_seen_at, state AS heartbeat_state, active_job_id
         FROM nodes
         ${where}
         ORDER BY node_id ASC
         LIMIT ?`
      )
      .bind(...params)
      .all<{
        node_id: string;
        capabilities_json: string;
        revoked_at: string | null;
        last_seen_at: string | null;
        heartbeat_state: "idle" | "fetching" | null;
        active_job_id: string | null;
      }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const nodes: OperatorNodeRecord[] = visible.map((row) => ({
      nodeId: row.node_id,
      capabilities: this.parseNodeCapabilities(row.capabilities_json),
      status: row.revoked_at ? "revoked" : "active",
      revokedAt: row.revoked_at ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      heartbeatState: row.heartbeat_state ?? null,
      activeJobId: row.active_job_id ?? null
    }));
    const last = nodes.at(-1);

    return {
      nodes,
      nextCursor:
        rows.length > limit && last
          ? encodeOperatorNodeCursor({ nodeId: last.nodeId })
          : null
    };
  }

  async enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> {
    const parsed = EnqueueJobRequestSchema.parse(input);
    return this.seedJobFn(parsed.url, parsed.platform, {
      minDelayMs: parsed.minDelayMs,
      purpose: parsed.purpose,
      priorityLane: parsed.priorityLane,
      recrawlIntervalMs: parsed.recrawlIntervalMs,
      audit: {
        actor,
        reason: parsed.reason
      }
    });
  }

  private computeJobClaimabilityBlockers(
    job: JobRow,
    nowMs: number,
    nowIso: string,
    activeProfiles: readonly SteeringProfile[],
    suppressedTargets: readonly SuppressedTarget[],
    originState: OriginBlockerRow | undefined
  ): string[] {
    const blockers: string[] = [];

    if (job.state === "blocked") {
      blockers.push("job_blocked");
    }
    if (job.state === "leased" && job.lease_expires_at && job.lease_expires_at > nowIso) {
      blockers.push("already_leased");
    }
    if (job.next_fetch_at > nowIso) {
      blockers.push("scheduled_later");
    }
    if (job.robots_deferred_until && job.robots_deferred_until > nowIso) {
      blockers.push("robots_deferred");
    }
    if (findMatchingSuppressedTarget(job.url, suppressedTargets)) {
      blockers.push("suppressed_target");
    }
    if (!activeProfiles.some((profile) => steeringProfileMatches(profile, job.platform, job.url, job.job_purpose, nowMs))) {
      blockers.push("no_active_steering_profile");
    }

    if (!originState || !originState.robots_expires_at || originState.robots_expires_at <= nowIso) {
      blockers.push("robots_refresh_due");
    } else if (
      originState.robots_status_code === null ||
      (!robotsResultAllowsMissingFile(originState.robots_status_code) &&
        (originState.robots_status_code < 200 || originState.robots_status_code >= 300))
    ) {
      blockers.push("robots_fetch_error");
    } else if (
      !this.ctx.robotsAllows({
        origin: job.origin,
        robots_snapshot_id: originState.robots_snapshot_id,
        robots_status_code: originState.robots_status_code,
        robots_body: originState.robots_body,
        robots_fetched_at: originState.robots_fetched_at,
        url: job.url
      })
    ) {
      blockers.push("robots_disallowed");
    }

    if (originState) {
      if (
        originState.active_job_id &&
        originState.active_job_id !== job.job_id &&
        originState.lease_expires_at &&
        originState.lease_expires_at > nowIso
      ) {
        blockers.push("origin_lease_busy");
      }
      if (originState.next_allowed_at > nowIso) {
        blockers.push("origin_pacing_cooldown");
      }
    }

    return blockers;
  }

  private toOperatorJobRecord(job: JobRow, blockers: string[]): OperatorJobRecord {
    return {
      jobId: job.job_id,
      platform: job.platform,
      url: job.url,
      origin: job.origin,
      state: job.state,
      purpose: job.job_purpose,
      priorityLane: job.priority_lane,
      recrawlIntervalMs: job.recrawl_interval_ms,
      paginationDepth: job.pagination_depth,
      nextFetchAt: job.next_fetch_at,
      claimedBy: job.claimed_by ?? null,
      leaseExpiresAt: job.lease_expires_at ?? null,
      createdAt: job.created_at,
      robotsDeferredUntil: job.robots_deferred_until ?? null,
      steeringProfileId: job.steering_profile_id ?? null,
      claimabilityBlockers: blockers
    };
  }

  async listJobsPage(
    filters?: { state?: OperatorJobState; platform?: Platform; priorityLane?: PriorityLane },
    limit = 100,
    cursor: OperatorJobCursor | null = null
  ): Promise<{ jobs: OperatorJobRecord[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Job limit must be 1..100");
    if (filters?.state !== undefined) OperatorJobStateSchema.parse(filters.state);
    if (filters?.platform !== undefined) ApiPlatformSchema.parse(filters.platform);
    if (filters?.priorityLane !== undefined) {
      OperatorJobListQuerySchema.shape.priorityLane.parse(filters.priorityLane);
    }

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
    if (filters?.priorityLane !== undefined) {
      conditions.push("priority_lane = ?");
      params.push(filters.priorityLane);
    }
    if (cursor) {
      conditions.push("(created_at, job_id) < (?, ?)");
      params.push(cursor.createdAt, cursor.jobId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.ctx.db
      .prepare(
        `SELECT * FROM crawl_jobs
         ${where}
         ORDER BY created_at DESC, job_id DESC
         LIMIT ?`
      )
      .bind(...params)
      .all<JobRow>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    const distinctOrigins = [...new Set(visible.map((row) => row.origin))];
    const originMap = new Map<string, OriginBlockerRow>();

    const [activeProfiles, suppressedTargets] = await Promise.all([
      this.ctx.loadActiveSteeringProfiles(),
      this.ctx.loadSuppressedTargets()
    ]);

    if (distinctOrigins.length > 0) {
      const originPlaceholders = distinctOrigins.map(() => "?").join(",");
      const originsRes = await this.ctx.db
        .prepare(
          `SELECT origin, active_job_id, lease_expires_at, next_allowed_at,
                  robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at
           FROM origin_state
           WHERE origin IN (${originPlaceholders})`
        )
        .bind(...distinctOrigins)
        .all<OriginBlockerRow>();
      for (const originRow of originsRes.results || []) {
        originMap.set(originRow.origin, originRow);
      }
    }

    const jobs: OperatorJobRecord[] = visible.map((row) =>
      this.toOperatorJobRecord(
        row,
        this.computeJobClaimabilityBlockers(row, nowMs, nowIso, activeProfiles, suppressedTargets, originMap.get(row.origin))
      )
    );
    const last = jobs.at(-1);

    return {
      jobs,
      nextCursor:
        rows.length > limit && last
          ? encodeOperatorJobCursor({ createdAt: last.createdAt, jobId: last.jobId })
          : null
    };
  }

  async updateJob(jobId: string, input: UpdateJobRequest, actor: string): Promise<OperatorJobRecord> {
    const parsed = UpdateJobRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const row = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
    if (!row) throw new Error("Job not found");

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    if (row.state === "leased" && row.lease_expires_at && row.lease_expires_at > nowIso) {
      throw new CoordinatorConflict("Cannot update an actively leased job", 409);
    }

    const nextPriorityLane = parsed.priorityLane ?? row.priority_lane;
    const nextRecrawlIntervalMs = parsed.recrawlIntervalMs ?? row.recrawl_interval_ms;
    const nextFetchAt = parsed.nextFetchAt ?? row.next_fetch_at;

    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `UPDATE crawl_jobs
           SET priority_lane = ?, recrawl_interval_ms = ?, next_fetch_at = ?
           WHERE job_id = ?`
        )
        .bind(nextPriorityLane, nextRecrawlIntervalMs, nextFetchAt, jobId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('job', ?, ?, 'update', ?, ?)`
        )
        .bind(jobId, actor, parsed.reason.trim(), nowIso)
    ]);

    const updated = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
    const [activeProfiles, suppressedTargets, originState] = await Promise.all([
      this.ctx.loadActiveSteeringProfiles(),
      this.ctx.loadSuppressedTargets(),
      this.ctx.db
        .prepare(
          `SELECT origin, active_job_id, lease_expires_at, next_allowed_at,
                  robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at
           FROM origin_state WHERE origin = ?`
        )
        .bind(updated!.origin)
        .first<OriginBlockerRow>()
    ]);
    return this.toOperatorJobRecord(
      updated!,
      this.computeJobClaimabilityBlockers(
        updated!,
        nowMs,
        nowIso,
        activeProfiles,
        suppressedTargets,
        originState ?? undefined
      )
    );
  }

  async requeueJob(jobId: string, input: RequeueJobRequest, actor: string): Promise<OperatorJobRecord> {
    const parsed = RequeueJobRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const row = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
    if (!row) throw new Error("Job not found");

    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();
    if (row.state === "leased" && row.lease_expires_at && row.lease_expires_at > nowIso) {
      throw new CoordinatorConflict("Cannot requeue an actively leased job", 409);
    }

    const suppressedTargets = await this.ctx.loadSuppressedTargets();
    if (findMatchingSuppressedTarget(row.url, suppressedTargets)) {
      throw new CoordinatorConflict("Cannot requeue a suppressed target", 409);
    }

    const nextPriorityLane = parsed.priorityLane ?? row.priority_lane;
    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `UPDATE crawl_jobs
           SET state = 'pending',
               priority_lane = ?,
               next_fetch_at = ?,
               robots_deferred_until = NULL,
               claimed_by = NULL,
               lease_id = NULL,
               lease_expires_at = NULL
           WHERE job_id = ?`
        )
        .bind(nextPriorityLane, nowIso, jobId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('job', ?, ?, 'requeue', ?, ?)`
        )
        .bind(jobId, actor, parsed.reason.trim(), nowIso)
    ]);

    const updated = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
    const [activeProfiles, originState] = await Promise.all([
      this.ctx.loadActiveSteeringProfiles(),
      this.ctx.db
        .prepare(
          `SELECT origin, active_job_id, lease_expires_at, next_allowed_at,
                  robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at
           FROM origin_state WHERE origin = ?`
        )
        .bind(updated!.origin)
        .first<OriginBlockerRow>()
    ]);
    return this.toOperatorJobRecord(
      updated!,
      this.computeJobClaimabilityBlockers(
        updated!,
        nowMs,
        nowIso,
        activeProfiles,
        suppressedTargets,
        originState ?? undefined
      )
    );
  }

  async deleteJob(jobId: string, actor: string, reason: string): Promise<{ jobId: string; status: "deleted" }> {
    DeleteJobRequestSchema.shape.reason.parse(reason);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const row = await this.ctx.db.prepare("SELECT * FROM crawl_jobs WHERE job_id = ?").bind(jobId).first<JobRow>();
    if (!row) throw new Error("Job not found");

    const nowIso = new Date(this.ctx.now()).toISOString();
    if (row.state === "leased" && row.lease_expires_at && row.lease_expires_at > nowIso) {
      throw new CoordinatorConflict("Cannot delete an actively leased job", 409);
    }

    await this.ctx.db.batch([
      this.ctx.db
        .prepare("UPDATE origin_state SET active_job_id = NULL, lease_expires_at = NULL WHERE active_job_id = ?")
        .bind(jobId),
      this.ctx.db.prepare("UPDATE source_leads SET discovered_from_job_id = NULL WHERE discovered_from_job_id = ?").bind(jobId),
      this.ctx.db.prepare("DELETE FROM job_results WHERE job_id = ?").bind(jobId),
      this.ctx.db.prepare("DELETE FROM crawl_jobs WHERE job_id = ?").bind(jobId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('job', ?, ?, 'delete', ?, ?)`
        )
        .bind(jobId, actor, reason.trim(), nowIso)
    ]);

    return { jobId, status: "deleted" };
  }

  async listLeadsPage(
    status: LeadStatus,
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Lead limit must be 1..100");
    const after = cursor ? "AND (first_seen_at, lead_key) > (?, ?)" : "";
    const params = cursor ? [status, cursor.firstSeenAt, cursor.leadKey, limit + 1] : [status, limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT lead_key, kind, target_url, target_host, claimed_package_id, discovered_from_url,
                discovered_from_item_key, status, first_seen_at, last_seen_at
         FROM source_leads
         WHERE status = ? ${after}
         ORDER BY first_seen_at ASC, lead_key ASC
         LIMIT ?`
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

  async approveLead(
    leadKey: string,
    minDelayMs: number | undefined,
    actor: string,
    reason: string,
    priorityLane?: PriorityLane
  ): Promise<string> {
    if (!reason.trim() || reason.length > 300) throw new Error("Approval reason required (at most 300 characters)");
    const lead = await this.ctx.db
      .prepare("SELECT kind, status, target_url FROM source_leads WHERE lead_key = ?")
      .bind(leadKey)
      .first<{ kind: DiscoveryLead["kind"]; status: string; target_url: string }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");

    const resolved = resolveDiscoveryLeadTarget(lead.kind, lead.target_url, minDelayMs);
    if (!resolved) {
      throw new Error("Discovery lead target cannot become a crawl job");
    }

    const suppressedTargets = await this.ctx.loadSuppressedTargets();
    if (findMatchingSuppressedTarget(resolved.url, suppressedTargets)) {
      throw new Error("URL is suppressed and cannot be approved");
    }

    return this.seedJobFn(resolved.url, resolved.platform, {
      minDelayMs: resolved.minDelayMs,
      purpose: resolved.purpose,
      priorityLane,
      audit: {
        actor,
        reason,
        leadKey
      }
    });
  }

  async bulkApproveLeads(input: BulkApproveLeadsRequest, actor: string): Promise<BulkApproveLeadsResponse> {
    const parsed = BulkApproveLeadsRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");

    const approved: Array<{ leadKey: string; jobId: string }> = [];
    const skipped: Array<{ leadKey: string; reason: string }> = [];
    const seen = new Set<string>();

    for (const leadKey of parsed.leadKeys) {
      if (seen.has(leadKey)) continue;
      seen.add(leadKey);
      try {
        const jobId = await this.approveLead(
          leadKey,
          parsed.minDelayMs,
          actor,
          parsed.reason,
          parsed.priorityLane
        );
        approved.push({ leadKey, jobId });
      } catch (cause) {
        skipped.push({
          leadKey,
          reason: cause instanceof Error ? cause.message.slice(0, 300) : "Lead approval failed"
        });
      }
    }

    return {
      schemaVersion: 1,
      approved,
      skipped
    };
  }

  async rejectLead(leadKey: string, actor: string, reason: string): Promise<void> {
    if (!reason.trim() || reason.length > 300) throw new Error("Rejection reason required (at most 300 characters)");
    const lead = await this.ctx.db
      .prepare("SELECT status FROM source_leads WHERE lead_key = ?")
      .bind(leadKey)
      .first<{ status: string }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "approved") throw new Error("Approved lead cannot be rejected without revoking its job");
    if (lead.status === "rejected") return;
    await this.ctx.db.batch([
      this.ctx.db.prepare("UPDATE source_leads SET status = 'rejected' WHERE lead_key = ?").bind(leadKey),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('lead', ?, ?, 'reject_lead', ?, ?)`
        )
        .bind(leadKey, actor, reason.trim(), new Date(this.ctx.now()).toISOString())
    ]);
  }

  async suppressLeadDomain(
    input: SuppressLeadDomainRequest,
    actor: string
  ): Promise<SuppressLeadDomainResponse> {
    const parsed = SuppressLeadDomainRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const targetHost = parsed.targetHost.trim().toLowerCase();
    const nowIso = new Date(this.ctx.now()).toISOString();

    await this.createSuppressedTarget(
      {
        schemaVersion: 1,
        target: targetHost,
        scope: "domain",
        reason: parsed.reason
      },
      actor
    );

    let rejectedLeadCount = 0;
    if (parsed.rejectPendingLeads !== false) {
      const candidatesRes = await this.ctx.db
        .prepare(
          `SELECT lead_key, target_host FROM source_leads
           WHERE status = 'pending_review'
             AND (target_host = ? OR target_host LIKE ?)`
        )
        .bind(targetHost, `%.${targetHost}`)
        .all<{ lead_key: string; target_host: string }>();
      const matching = (candidatesRes.results || []).filter(
        (lead) => lead.target_host.toLowerCase() === targetHost || lead.target_host.toLowerCase().endsWith(`.${targetHost}`)
      );
      if (matching.length > 0) {
        const stmts: D1PreparedStatement[] = [];
        for (const lead of matching) {
          stmts.push(
            this.ctx.db
              .prepare("UPDATE source_leads SET status = 'rejected' WHERE lead_key = ? AND status = 'pending_review'")
              .bind(lead.lead_key),
            this.ctx.db
              .prepare(
                `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
                 VALUES ('lead', ?, ?, 'suppress_domain', ?, ?)`
              )
              .bind(lead.lead_key, actor, parsed.reason.trim(), nowIso)
          );
          rejectedLeadCount += 1;
        }
        await this.ctx.executeBatchChunked(stmts);
      }
    }

    return {
      schemaVersion: 1,
      targetHost,
      scope: "domain",
      rejectedLeadCount
    };
  }

  async listSteeringProfilesPage(
    limit: number,
    cursor: SteeringProfileCursor | null
  ): Promise<{ profiles: SteeringProfile[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Profile limit must be 1..100");
    const before = cursor ? "WHERE (created_at, profile_id) < (?, ?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.profileId, limit + 1] : [limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT * FROM steering_profiles ${before}
         ORDER BY created_at DESC, profile_id DESC LIMIT ?`
      )
      .bind(...params)
      .all<SteeringProfileRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      profiles: visible.map((row) => this.ctx.steeringProfileFromRow(row)),
      nextCursor:
        rows.length > limit && last
          ? encodeSteeringProfileCursor({
              createdAt: last.created_at,
              profileId: last.profile_id
            })
          : null
    };
  }

  private async assertNoOverlappingActiveProfile(
    candidate: {
      platform: Platform;
      hostMatchMode: SteeringProfile["hostMatchMode"];
      hostPattern: string;
      pathScope: string;
      queryMode: SteeringProfile["queryMode"];
      queryScope?: string | null;
      purpose: SourcePurpose;
    },
    nowIso: string,
    excludeProfileId?: string
  ): Promise<void> {
    const existingRes = await this.ctx.db
      .prepare(
        `SELECT profile_id, path_scope, query_mode, query_scope FROM steering_profiles
         WHERE platform = ? AND host_match_mode = ? AND host_pattern = ? AND purpose = ?
           AND disabled_at IS NULL AND expires_at > ?`
      )
      .bind(candidate.platform, candidate.hostMatchMode, candidate.hostPattern, candidate.purpose, nowIso)
      .all<{
        profile_id: string;
        path_scope: string;
        query_mode: SteeringProfile["queryMode"];
        query_scope: string | null;
      }>();
    const existing = (existingRes.results || []).filter((row) => row.profile_id !== excludeProfileId);
    if (
      existing.some(
        (row) =>
          steeringPathScopesOverlap(row.path_scope, candidate.pathScope) &&
          steeringQueryModesOverlap(row.query_mode, row.query_scope, candidate.queryMode, candidate.queryScope)
      )
    ) {
      throw new Error("Overlapping active steering profile requires disabling the old grant first");
    }
  }

  async createSteeringProfile(input: CreateSteeringProfile, actor: string): Promise<SteeringProfile> {
    const parsed = CreateSteeringProfileSchema.parse(input);
    const nowIso = new Date(this.ctx.now()).toISOString();
    if (parsed.expiresAt <= nowIso) throw new Error("Steering profile expiry must be in the future");

    await this.assertNoOverlappingActiveProfile(parsed, nowIso);

    const profileId = crypto.randomUUID();
    await this.ctx.db.batch([
      this.ctx.db
        .prepare(
          `INSERT INTO steering_profiles(
             profile_id, platform, host_match_mode, host_pattern, path_scope, query_mode, query_scope,
             method, purpose, auto_promote, recrawl_interval_ms, min_delay_ms, max_pagination_depth,
             expires_at, review_reference, reason, retain_classes_json, publish_classes_json, created_at, disabled_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
        )
        .bind(
          profileId,
          parsed.platform,
          parsed.hostMatchMode,
          parsed.hostPattern,
          parsed.pathScope,
          parsed.queryMode,
          parsed.queryScope ?? null,
          parsed.method,
          parsed.purpose,
          parsed.autoPromote ? 1 : 0,
          parsed.recrawlIntervalMs,
          parsed.minDelayMs,
          parsed.maxPaginationDepth,
          parsed.expiresAt,
          parsed.reviewReference,
          parsed.reason,
          JSON.stringify(parsed.retainClasses),
          JSON.stringify(parsed.publishClasses),
          nowIso
        ),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('profile', ?, ?, 'create', ?, ?)`
        )
        .bind(profileId, actor, parsed.reason, nowIso)
    ]);

    const row = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    return this.ctx.steeringProfileFromRow(row!);
  }

  async updateSteeringProfile(
    profileId: string,
    input: UpdateSteeringProfile,
    actor: string
  ): Promise<SteeringProfile> {
    const parsed = UpdateSteeringProfileSchema.parse(input);
    const row = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    if (!row) throw new Error("Steering profile not found");

    const current = this.ctx.steeringProfileFromRow(row);
    const nowMs = this.ctx.now();
    const nowIso = new Date(nowMs).toISOString();

    const nextQueryMode = parsed.queryMode ?? current.queryMode;
    const nextQueryScope =
      parsed.queryScope !== undefined
        ? parsed.queryScope
        : nextQueryMode === "none"
          ? null
          : current.queryScope;

    const merged = SteeringProfileSchema.parse({
      profileId: current.profileId,
      platform: parsed.platform ?? current.platform,
      hostMatchMode: parsed.hostMatchMode ?? current.hostMatchMode,
      hostPattern: parsed.hostPattern ?? current.hostPattern,
      pathScope: parsed.pathScope ?? current.pathScope,
      queryMode: nextQueryMode,
      queryScope: nextQueryScope,
      method: "GET",
      purpose: parsed.purpose ?? current.purpose,
      autoPromote: parsed.autoPromote ?? current.autoPromote,
      recrawlIntervalMs: parsed.recrawlIntervalMs ?? current.recrawlIntervalMs,
      minDelayMs: parsed.minDelayMs ?? current.minDelayMs,
      maxPaginationDepth: parsed.maxPaginationDepth ?? current.maxPaginationDepth,
      expiresAt: parsed.expiresAt ?? current.expiresAt,
      reviewReference: parsed.reviewReference ?? current.reviewReference,
      reason: parsed.reason,
      retainClasses: parsed.retainClasses ?? current.retainClasses,
      publishClasses: parsed.publishClasses ?? current.publishClasses,
      createdAt: current.createdAt,
      disabledAt: current.disabledAt
    });

    if (parsed.expiresAt !== undefined && merged.expiresAt <= nowIso) {
      throw new Error("Steering profile expiry must be in the future");
    }
    if (!merged.disabledAt) {
      await this.assertNoOverlappingActiveProfile(merged, nowIso, profileId);
    }

    const leasedRes = await this.ctx.db
      .prepare("SELECT * FROM crawl_jobs WHERE steering_profile_id = ? AND state = 'leased'")
      .bind(profileId)
      .all<JobRow>();
    const stmts: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `UPDATE steering_profiles
           SET platform = ?,
               host_match_mode = ?,
               host_pattern = ?,
               path_scope = ?,
               query_mode = ?,
               query_scope = ?,
               purpose = ?,
               auto_promote = ?,
               recrawl_interval_ms = ?,
               min_delay_ms = ?,
               max_pagination_depth = ?,
               expires_at = ?,
               review_reference = ?,
               reason = ?,
               retain_classes_json = ?,
               publish_classes_json = ?
           WHERE profile_id = ?`
        )
        .bind(
          merged.platform,
          merged.hostMatchMode,
          merged.hostPattern,
          merged.pathScope,
          merged.queryMode,
          merged.queryScope ?? null,
          merged.purpose,
          merged.autoPromote ? 1 : 0,
          merged.recrawlIntervalMs,
          merged.minDelayMs,
          merged.maxPaginationDepth,
          merged.expiresAt,
          merged.reviewReference,
          parsed.reason.trim(),
          JSON.stringify(merged.retainClasses),
          JSON.stringify(merged.publishClasses),
          profileId
        ),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('profile', ?, ?, 'update', ?, ?)`
        )
        .bind(profileId, actor, parsed.reason.trim(), nowIso)
    ];

    for (const job of leasedRes.results || []) {
      if (!steeringProfileMatches(merged, job.platform, job.url, job.job_purpose, nowMs)) {
        stmts.push(
          this.ctx.db
            .prepare(
              `UPDATE crawl_jobs
               SET state = 'pending', claimed_by = NULL, lease_id = NULL,
                   lease_expires_at = NULL, steering_profile_id = NULL
               WHERE job_id = ?`
            )
            .bind(job.job_id),
          this.ctx.db
            .prepare("UPDATE origin_state SET active_job_id = NULL, lease_expires_at = NULL WHERE origin = ? AND active_job_id = ?")
            .bind(job.origin, job.job_id)
        );
      }
    }

    await this.ctx.executeBatchChunked(stmts);
    return merged;
  }

  async enableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> {
    SteeringProfileActionSchema.shape.reason.parse(reason);
    const row = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    if (!row) throw new Error("Steering profile not found");

    const nowIso = new Date(this.ctx.now()).toISOString();
    if (row.expires_at <= nowIso) {
      throw new CoordinatorConflict("Expired steering profile cannot be re-enabled", 409);
    }

    if (row.disabled_at) {
      const current = this.ctx.steeringProfileFromRow(row);
      await this.assertNoOverlappingActiveProfile(current, nowIso, profileId);
      await this.ctx.db.batch([
        this.ctx.db.prepare("UPDATE steering_profiles SET disabled_at = NULL WHERE profile_id = ?").bind(profileId),
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             VALUES ('profile', ?, ?, 'enable', ?, ?)`
          )
          .bind(profileId, actor, reason.trim(), nowIso)
      ]);
      row.disabled_at = null;
    }

    return this.ctx.steeringProfileFromRow(row);
  }

  /**
   * Disables a steering profile cleanly: commits `disabled_at` and unleases matching jobs FIRST,
   * then inspects remaining active profiles to clear `origin_state.refresh_lease_id` if no eligible due jobs remain.
   */
  async disableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> {
    SteeringProfileActionSchema.shape.reason.parse(reason);
    const row = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    if (!row) throw new Error("Steering profile not found");
    if (row.disabled_at) return this.ctx.steeringProfileFromRow(row);

    const nowIso = new Date(this.ctx.now()).toISOString();
    const leasedRes = await this.ctx.db
      .prepare("SELECT job_id, origin FROM crawl_jobs WHERE steering_profile_id = ? AND state = 'leased'")
      .bind(profileId)
      .all<{ job_id: string; origin: string }>();
    const leased = leasedRes.results || [];

    const batchStmts: D1PreparedStatement[] = [
      this.ctx.db.prepare("UPDATE steering_profiles SET disabled_at = ? WHERE profile_id = ?").bind(nowIso, profileId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('profile', ?, ?, 'disable', ?, ?)`
        )
        .bind(profileId, actor, reason.trim(), nowIso)
    ];

    const affectedOrigins = new Set<string>(leased.map((job) => job.origin));
    if (row.host_match_mode === "exact") {
      affectedOrigins.add(`https://${row.host_pattern.toLowerCase()}`);
    }

    for (const job of leased) {
      batchStmts.push(
        this.ctx.db
          .prepare(
            `UPDATE crawl_jobs
             SET state = 'pending', claimed_by = NULL, lease_id = NULL,
                 lease_expires_at = NULL, steering_profile_id = NULL
             WHERE job_id = ?`
          )
          .bind(job.job_id),
        this.ctx.db
          .prepare(
            `UPDATE origin_state
             SET active_job_id = NULL, lease_expires_at = NULL
             WHERE origin = ? AND active_job_id = ?`
          )
          .bind(job.origin, job.job_id)
      );
    }

    // Statement order guarantee: commit `disabled_at` BEFORE checking remaining active profiles.
    await this.ctx.executeBatchChunked(batchStmts);

    const clearRefreshStmts: D1PreparedStatement[] = [];
    for (const origin of affectedOrigins) {
      const remainingDelay = await this.ctx.approvedDueProfileDelayForOrigin(origin, nowIso);
      if (remainingDelay === null) {
        clearRefreshStmts.push(
          this.ctx.db
            .prepare("UPDATE origin_state SET refresh_lease_id = NULL, refresh_lease_expires_at = NULL WHERE origin = ?")
            .bind(origin)
        );
      }
    }
    if (clearRefreshStmts.length > 0) {
      await this.ctx.executeBatchChunked(clearRefreshStmts);
    }

    const updatedRow = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    return this.ctx.steeringProfileFromRow(updatedRow!);
  }

  async deleteSteeringProfile(
    profileId: string,
    actor: string,
    reason: string
  ): Promise<{ profileId: string; status: "deleted" }> {
    SteeringProfileActionSchema.shape.reason.parse(reason);
    const row = await this.ctx.db
      .prepare("SELECT * FROM steering_profiles WHERE profile_id = ?")
      .bind(profileId)
      .first<SteeringProfileRow>();
    if (!row) throw new Error("Steering profile not found");

    const nowIso = new Date(this.ctx.now()).toISOString();
    const leasedRes = await this.ctx.db
      .prepare("SELECT job_id, origin FROM crawl_jobs WHERE steering_profile_id = ? AND state = 'leased'")
      .bind(profileId)
      .all<{ job_id: string; origin: string }>();
    const stmts: D1PreparedStatement[] = [];
    for (const job of leasedRes.results || []) {
      stmts.push(
        this.ctx.db
          .prepare("UPDATE origin_state SET active_job_id = NULL, lease_expires_at = NULL WHERE origin = ? AND active_job_id = ?")
          .bind(job.origin, job.job_id)
      );
    }
    stmts.push(
      this.ctx.db
        .prepare(
          `UPDATE crawl_jobs
           SET state = CASE WHEN state = 'leased' THEN 'pending' ELSE state END,
               claimed_by = CASE WHEN state = 'leased' THEN NULL ELSE claimed_by END,
               lease_id = CASE WHEN state = 'leased' THEN NULL ELSE lease_id END,
               lease_expires_at = CASE WHEN state = 'leased' THEN NULL ELSE lease_expires_at END,
               steering_profile_id = NULL
           WHERE steering_profile_id = ?`
        )
        .bind(profileId),
      this.ctx.db.prepare("DELETE FROM steering_profiles WHERE profile_id = ?").bind(profileId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('profile', ?, ?, 'delete', ?, ?)`
        )
        .bind(profileId, actor, reason.trim(), nowIso)
    );
    await this.ctx.executeBatchChunked(stmts);

    return { profileId, status: "deleted" };
  }

  async listSuppressedTargetsPage(
    limit: number,
    cursor: SuppressedTargetCursor | null
  ): Promise<{ targets: SuppressedTarget[]; nextCursor: string | null }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Suppressed target limit must be 1..100");
    }
    const before = cursor ? "WHERE (suppressed_at, target) < (?, ?)" : "";
    const params = cursor ? [cursor.suppressedAt, cursor.target, limit + 1] : [limit + 1];
    const res = await this.ctx.db
      .prepare(
        `SELECT target, scope, reason, suppressed_at FROM suppressed_targets
         ${before}
         ORDER BY suppressed_at DESC, target DESC
         LIMIT ?`
      )
      .bind(...params)
      .all<SuppressedTargetRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      targets: visible.map((row) => this.ctx.suppressedTargetFromRow(row)),
      nextCursor:
        rows.length > limit && last
          ? encodeSuppressedTargetCursor({
              suppressedAt: last.suppressed_at,
              target: last.target
            })
          : null
    };
  }

  private normalizeSuppressedTargetValue(input: CreateSuppressedTarget): string {
    if (input.scope === "url") return new URL(input.target).href;
    if (input.scope === "origin") return new URL(input.target).origin;
    return input.target.trim().toLowerCase();
  }

  async createSuppressedTarget(input: CreateSuppressedTarget, actor: string): Promise<SuppressedTarget> {
    const parsed = CreateSuppressedTargetSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const target = this.normalizeSuppressedTargetValue(parsed);
    const nowIso = new Date(this.ctx.now()).toISOString();

    const stmts: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `INSERT INTO suppressed_targets(target, scope, reason, suppressed_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(target) DO UPDATE SET
             scope = excluded.scope,
             reason = excluded.reason,
             suppressed_at = excluded.suppressed_at`
        )
        .bind(target, parsed.scope, parsed.reason.trim(), nowIso),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('suppressed_target', ?, ?, 'create', ?, ?)`
        )
        .bind(target, actor, parsed.reason.trim(), nowIso)
    ];

    const entry: SuppressedTarget = {
      target,
      scope: parsed.scope,
      reason: parsed.reason.trim(),
      suppressedAt: nowIso
    };

    const candidateJobsRes =
      parsed.scope === "url"
        ? await this.ctx.db
            .prepare("SELECT job_id, url, origin FROM crawl_jobs WHERE url = ? AND state != 'blocked'")
            .bind(target)
            .all<{ job_id: string; url: string; origin: string }>()
        : parsed.scope === "origin"
          ? await this.ctx.db
              .prepare("SELECT job_id, url, origin FROM crawl_jobs WHERE origin = ? AND state != 'blocked'")
              .bind(target)
              .all<{ job_id: string; url: string; origin: string }>()
          : await this.ctx.db
              .prepare("SELECT job_id, url, origin FROM crawl_jobs WHERE state != 'blocked'")
              .all<{ job_id: string; url: string; origin: string }>();

    for (const job of candidateJobsRes.results || []) {
      if (findMatchingSuppressedTarget(job.url, [entry])) {
        stmts.push(
          this.ctx.db
            .prepare(
              "UPDATE crawl_jobs SET state = 'blocked', claimed_by = NULL, lease_id = NULL, lease_expires_at = NULL WHERE job_id = ?"
            )
            .bind(job.job_id),
          this.ctx.db
            .prepare("UPDATE origin_state SET active_job_id = NULL, lease_expires_at = NULL WHERE origin = ? AND active_job_id = ?")
            .bind(job.origin, job.job_id)
        );
      }
    }

    await this.ctx.executeBatchChunked(stmts);
    return entry;
  }

  async deleteSuppressedTarget(
    rawTarget: string,
    actor: string,
    reason: string
  ): Promise<{ target: string; status: "deleted" }> {
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    if (!reason.trim() || reason.length > 300) throw new Error("Reason required (3..300 chars)");

    const trimmed = rawTarget.trim();
    const candidates = new Set<string>([trimmed, trimmed.toLowerCase()]);
    try {
      const parsed = new URL(trimmed);
      candidates.add(parsed.href);
      candidates.add(parsed.origin);
    } catch {
      // domain literal
    }

    let matchedTarget: string | null = null;
    for (const candidate of candidates) {
      const found = await this.ctx.db
        .prepare("SELECT target FROM suppressed_targets WHERE target = ?")
        .bind(candidate)
        .first<{ target: string }>();
      if (found) {
        matchedTarget = found.target;
        break;
      }
    }
    if (!matchedTarget) throw new Error("Suppressed target not found");

    const nowIso = new Date(this.ctx.now()).toISOString();
    await this.ctx.db.batch([
      this.ctx.db.prepare("DELETE FROM suppressed_targets WHERE target = ?").bind(matchedTarget),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('suppressed_target', ?, ?, 'delete', ?, ?)`
        )
        .bind(matchedTarget, actor, reason.trim(), nowIso)
    ]);

    return { target: matchedTarget, status: "deleted" };
  }

  async listAuditLogs(options?: {
    entityType?: OperatorAuditLogRow["entity_type"];
    entityId?: string;
    limit?: number;
  }): Promise<OperatorAuditLogRow[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
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
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const res = await this.ctx.db
      .prepare(`SELECT * FROM operator_audit_log ${where} ORDER BY occurred_at DESC, action_id DESC LIMIT ?`)
      .bind(...params)
      .all<OperatorAuditLogRow>();
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
      const sources = await this.ctx.db
        .prepare(
          `SELECT cp.canonical_id, cp.lifecycle
           FROM canonical_packages cp
           JOIN listing_sources ls ON ls.canonical_id = cp.canonical_id
           WHERE ls.storefront_url = ?`
        )
        .bind(input.targetUrl)
        .all<{ canonical_id: string; lifecycle: string }>();
      for (const row of sources.results || []) {
        priorLifecycles[row.canonical_id] = row.lifecycle;
      }
    }

    let priorSuppressedReason: string | null = null;
    let priorJobState: string | null = null;
    if (normalizedUrl) {
      const sup = await this.ctx.db
        .prepare("SELECT reason FROM suppressed_targets WHERE target = ? AND scope = 'url'")
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

    const stmts: D1PreparedStatement[] = [];
    if (normalizedUrl) {
      try {
        stmts.push(
          this.ctx.db
            .prepare(
              `INSERT INTO suppressed_targets(target, scope, reason, suppressed_at)
               VALUES (?, 'url', ?, ?)
               ON CONFLICT(target) DO UPDATE SET scope = 'url', reason = excluded.reason, suppressed_at = excluded.suppressed_at`
            )
            .bind(normalizedUrl, `Delisting request ${takedownId}: ${input.reason}`, recordedAt)
        );
        const job = await this.ctx.db
          .prepare("SELECT job_id, origin FROM crawl_jobs WHERE url = ?")
          .bind(normalizedUrl)
          .first<{ job_id: string; origin: string }>();
        if (job) {
          stmts.push(
            this.ctx.db
              .prepare(
                "UPDATE crawl_jobs SET state = 'blocked', claimed_by = NULL, lease_id = NULL, lease_expires_at = NULL WHERE job_id = ?"
              )
              .bind(job.job_id),
            this.ctx.db
              .prepare("UPDATE origin_state SET active_job_id = NULL, lease_expires_at = NULL WHERE origin = ? AND active_job_id = ?")
              .bind(job.origin, job.job_id)
          );
        }
      } catch {
        // best-effort URL suppression
      }
    }

    if (input.canonicalId) {
      stmts.push(
        this.ctx.db
          .prepare(
            `UPDATE canonical_packages
             SET lifecycle = 'delisted', tombstone_reason = 'delisted', updated_at = ?
             WHERE canonical_id = ? AND lifecycle != 'delisted'`
          )
          .bind(recordedAt, input.canonicalId)
      );
    }
    if (input.targetUrl) {
      stmts.push(
        this.ctx.db
          .prepare(
            `UPDATE canonical_packages
             SET lifecycle = 'delisted', tombstone_reason = 'delisted', updated_at = ?
             WHERE canonical_id IN (
               SELECT DISTINCT ls.canonical_id FROM listing_sources ls WHERE ls.storefront_url = ?
             ) AND lifecycle != 'delisted'`
          )
          .bind(recordedAt, input.targetUrl)
      );
    }

    if (stmts.length > 0) {
      await this.ctx.executeBatchChunked(stmts);
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
        snapshot = JSON.parse(row.payload_json) as typeof snapshot;
      } catch {
        snapshot = {};
      }
    }

    const updatedAt = new Date(this.ctx.now()).toISOString();
    const auditNotes = JSON.stringify({ actor, verdict, notes: notes ?? null });
    const batchStatements: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `UPDATE catalog_tickets
           SET review_status = ?,
               review_notes = ?,
               payload_json = COALESCE(json_set(COALESCE(payload_json, '{}'), '$.verifiedBy', ?, '$.verifiedAt', ?), ?)
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
                 SET lifecycle = ?, tombstone_reason = NULL, updated_at = ?
                 WHERE canonical_id = ? AND lifecycle = 'delisted'
                   AND NOT EXISTS (
                     SELECT 1 FROM catalog_tickets ct
                     WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                       AND ct.canonical_id = ? AND ct.review_status = 'accepted'
                   )`
              )
              .bind(priorLifecycle, updatedAt, row.canonical_id, takedownId, row.canonical_id)
          );
        }
      }
      if (row.target_url) {
        try {
          const normalized = new URL(row.target_url).href;
          if (!snapshot.priorSuppressedReason) {
            batchStatements.push(
              this.ctx.db
                .prepare("DELETE FROM suppressed_targets WHERE target = ? AND scope = 'url' AND reason LIKE ?")
                .bind(normalized, `Delisting request ${takedownId}:%`)
            );
          } else {
            batchStatements.push(
              this.ctx.db
                .prepare("UPDATE suppressed_targets SET reason = ? WHERE target = ? AND scope = 'url' AND reason LIKE ?")
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
          // best-effort URL normalization
        }

        const sources = await this.ctx.db
          .prepare("SELECT DISTINCT ls.canonical_id FROM listing_sources ls WHERE ls.storefront_url = ?")
          .bind(row.target_url)
          .all<{ canonical_id: string }>();
        for (const source of sources.results || []) {
          const priorLifecycle = snapshot.priorLifecycles?.[source.canonical_id] ?? "active";
          if (priorLifecycle !== "delisted") {
            batchStatements.push(
              this.ctx.db
                .prepare(
                  `UPDATE canonical_packages
                   SET lifecycle = ?, tombstone_reason = NULL, updated_at = ?
                   WHERE canonical_id = ? AND lifecycle = 'delisted'
                     AND NOT EXISTS (
                       SELECT 1 FROM catalog_tickets ct
                       WHERE ct.ticket_type = 'opt_out' AND ct.ticket_id != ?
                         AND (ct.canonical_id = ? OR ct.target_url = ?) AND ct.review_status = 'accepted'
                     )`
                )
                .bind(priorLifecycle, updatedAt, source.canonical_id, takedownId, source.canonical_id, row.target_url)
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
    actor: string,
    notes?: string
  ): Promise<{ claimId: string; status: "accepted" | "rejected"; updatedAt: string }> {
    const row = await this.ctx.db
      .prepare(
        `SELECT ticket_id AS claim_id, app_id, target_url, canonical_id, review_status
         FROM catalog_tickets
         WHERE ticket_id = ? AND ticket_type = 'delegated_claim'`
      )
      .bind(claimId)
      .first<{
        claim_id: string;
        app_id: string | null;
        target_url: string | null;
        canonical_id: string | null;
        review_status: string;
      }>();

    if (!row) {
      throw new Error("Claim not found");
    }

    const updatedAt = new Date(this.ctx.now()).toISOString();
    const stmts: D1PreparedStatement[] = [
      this.ctx.db
        .prepare(
          `UPDATE catalog_tickets
           SET review_status = ?, review_notes = ?
           WHERE ticket_id = ? AND ticket_type = 'delegated_claim'`
        )
        .bind(verdict, notes || null, claimId)
    ];

    if (verdict === "accepted" && row.app_id) {
      if (row.canonical_id) {
        stmts.push(
          this.ctx.db
            .prepare(
              `UPDATE canonical_packages
               SET verification_status = 'verified', verified_by_app_id = ?, updated_at = ?
               WHERE canonical_id = ?`
            )
            .bind(row.app_id, updatedAt, row.canonical_id)
        );
      }
      if (row.target_url) {
        stmts.push(
          this.ctx.db
            .prepare(
              `UPDATE canonical_packages
               SET verification_status = 'verified', verified_by_app_id = ?, updated_at = ?
               WHERE canonical_id IN (
                 SELECT DISTINCT canonical_id FROM listing_sources WHERE storefront_url = ?
               )`
            )
            .bind(row.app_id, updatedAt, row.target_url)
        );
      }
      stmts.push(
        this.ctx.db
          .prepare(
            `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
             VALUES ('app', ?, ?, 'verify_claim', ?, ?)`
          )
          .bind(row.app_id, actor || "operator-api", (notes?.trim() || `Accepted delegated claim ${claimId}`).slice(0, 300), updatedAt)
      );
    }

    await this.ctx.executeBatchChunked(stmts);

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
      const perms = JSON.parse(row.permissions_json) as string[];
      let flags: string[] = [];
      try {
        flags = JSON.parse(row.candidate_flags_json) as string[];
      } catch {
        flags = [];
      }
      const statusValue: OperatorAppRecord["candidateStatus"] =
        row.candidate_status === "review_pending" ||
        row.candidate_status === "reviewed" ||
        row.candidate_status === "trusted"
          ? row.candidate_status
          : "none";
      return {
        appId: row.app_id,
        appName: row.app_name,
        contactEmail: row.contact_email ?? null,
        permissions: perms,
        delegationAllowed: perms.includes("claims:delegate"),
        requestCount: row.request_count ?? 0,
        lastActiveAt: row.last_active_at ?? null,
        candidateStatus: statusValue,
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
    const currentPerms = new Set<string>(JSON.parse(currentPermissionsJson) as string[]);
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

    if (!row) throw new Error("App not found");
    if (row.revoked_at) throw new Error("App is revoked");

    const grantFlag =
      input.grantDelegation === true || input.candidateStatus === "trusted"
        ? true
        : input.grantDelegation === false
          ? false
          : undefined;
    const newPerms = this.mutateDelegationPermissions(row.permissions_json, grantFlag);

    let flags: string[] = [];
    try {
      flags = JSON.parse(row.candidate_flags_json) as string[];
    } catch {
      flags = [];
    }
    const reviewedAt = new Date(this.ctx.now()).toISOString();
    const auditReason = (input.notes?.trim() || `Candidate status set to ${input.candidateStatus}`).slice(0, 300);

    await this.ctx.db.batch([
      this.ctx.db
        .prepare("UPDATE registered_apps SET candidate_status = ?, permissions_json = ? WHERE app_id = ?")
        .bind(input.candidateStatus, JSON.stringify(newPerms), appId),
      this.ctx.db
        .prepare(
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('app', ?, ?, 'candidate_review', ?, ?)`
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
      .prepare("SELECT app_id, permissions_json, revoked_at FROM registered_apps WHERE app_id = ?")
      .bind(appId)
      .first<{
        app_id: string;
        permissions_json: string;
        revoked_at: string | null;
      }>();

    if (!row) throw new Error("App not found");
    if (row.revoked_at) throw new Error("App is revoked");

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
          `INSERT INTO operator_audit_log(entity_type, entity_id, actor, action, reason, occurred_at)
           VALUES ('app', ?, ?, ?, ?, ?)`
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
