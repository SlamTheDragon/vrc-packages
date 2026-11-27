import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import workerEntry, { type Env } from "../src/worker_entry.ts";
import { createInitializedD1Coordinator, createMockD1Database } from "./support/d1_test_fixtures.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { OPERATOR_API_JSON_SCHEMAS } from "../src/api/protocol/operator_protocol.ts";
import { PREVIEW_STARTER_PROFILE_COUNT } from "../src/storage/default_seeds.ts";
import {
  BulkApproveLeadsResponseSchema,
  DeleteJobResponseSchema,
  DelegatedClaimListResponseSchema,
  OperatorAppListResponseSchema,
  OperatorJobListResponseSchema,
  OperatorNodeListResponseSchema,
  OperatorStatusResponseSchema,
  PruneNodeResponseSchema,
  ReviewAppCandidateResponseSchema,
  SetAppDelegationResponseSchema,
  SuppressLeadDomainResponseSchema,
  SystemPurgeResponseSchema,
  TakedownListResponseSchema,
  UpdateJobResponseSchema,
  RequeueJobResponseSchema,
  VerifyDelegatedClaimResponseSchema,
  VerifyTakedownResponseSchema,
  encodeOperatorJobCursor,
  decodeOperatorJobCursor,
  encodeOperatorNodeCursor,
  decodeOperatorNodeCursor
} from "vrc-packages-api";
import { approveFixtureSource, seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

const operatorToken = "a".repeat(64);

function operatorRequest(path: string, method = "GET", body?: unknown, token = operatorToken): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

describe("separate operator control API (V0)", () => {
  test("operator pagination normalizes decoded UUIDs without changing timestamps or accepting noncanonical cursors", async () => {
    const store = await createInitializedD1Coordinator();
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const timestamp = "2026-10-04T00:00:00.000Z";
    const calls: unknown[] = [];
    store.listSteeringProfilesPage = async (_limit, cursor) => {
      calls.push(cursor);
      return { profiles: [], nextCursor: null };
    };
    store.listTakedownsPage = async (_type, _limit, cursor) => {
      calls.push(cursor);
      return { records: [], nextCursor: null };
    };
    store.listDelegatedClaimsPage = async (_status, _limit, cursor) => {
      calls.push(cursor);
      return { records: [], nextCursor: null };
    };
    store.listOperatorAppsPage = async (_limit, cursor) => {
      calls.push(cursor);
      return { apps: [], nextCursor: null };
    };
    try {
      for (const [route, timeField, idField] of [
        ["steering-profiles", "createdAt", "profileId"],
        ["takedowns", "recordedAt", "takedownId"],
        ["claims", "recordedAt", "claimId"],
        ["apps", "createdAt", "appId"]
      ] as const) {
        for (const value of [id, id.toUpperCase(), id.replace("abcdefab", "AbCdEfAb")]) {
          const encoded = btoa(JSON.stringify({ [timeField]: timestamp, [idField]: value }))
            .replaceAll("+", "-")
            .replaceAll("/", "_")
            .replace(/=+$/, "");
          const path = `/v1/operator/${route}?cursor=${encoded}`;
          const before = calls.length;
          expect((await handleOperatorRequest(operatorRequest(path), store, operatorToken)).status).toBe(200);
          expect(calls.slice(before)).toEqual([{ [timeField]: timestamp, [idField]: id }]);
          for (const invalid of [encoded + "=", "invalid-cursor"]) {
            expect(
              (
                await handleOperatorRequest(
                  operatorRequest(`/v1/operator/${route}?cursor=${encodeURIComponent(invalid)}`),
                  store,
                  operatorToken
                )
              ).status
            ).toBe(400);
          }
          expect(calls.length).toBe(before + 1);
        }
      }
    } finally {
      store.close();
    }
  });

  test("UUID action paths normalize case and reject malformed IDs before storage", async () => {
    const store = await createInitializedD1Coordinator();
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const calls: string[] = [];
    store.disableSteeringProfile = async (value) => {
      calls.push(value);
      throw new Error("Steering profile not found");
    };
    store.verifyTakedown = async (value) => {
      calls.push(value);
      throw new Error("Takedown not found");
    };
    store.verifyDelegatedClaim = async (value) => {
      calls.push(value);
      throw new Error("Claim not found");
    };
    store.setAppDelegation = async (value) => {
      calls.push(value);
      throw new Error("App not found");
    };
    try {
      for (const [route, action, body] of [
        ["steering-profiles", "disable", { schemaVersion: 1, reason: "Reviewed profile" }],
        ["takedowns", "verify", { schemaVersion: 1, verdict: "accepted" }],
        ["claims", "verify", { schemaVersion: 1, verdict: "accepted" }],
        ["apps", "delegation", { schemaVersion: 1, delegationAllowed: true }]
      ] as const) {
        const path = `/v1/operator/${route}/${id.toUpperCase()}/${action}`;
        expect(
          (await handleOperatorRequest(operatorRequest(path, "POST", body, "b".repeat(64)), store, operatorToken))
            .status
        ).toBe(401);
        const before = calls.length;
        expect((await handleOperatorRequest(operatorRequest(path, "POST", body), store, operatorToken)).status).toBe(
          404
        );
        expect(calls.slice(before)).toEqual([id]);
        for (const malformed of ["-".repeat(36), "a".repeat(36), "not-a-uuid"]) {
          const invalid = `/v1/operator/${route}/${malformed}/${action}`;
          expect(
            (await handleOperatorRequest(operatorRequest(invalid, "POST", body), store, operatorToken)).status
          ).toBe(404);
        }
        expect(calls.length).toBe(before + 1);
      }
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/status detects uninitialized, legacy, and v0-17 schemas with accurate queueReadiness", async () => {
    const emptySqlite = new Database(":memory:");
    const legacySqlite = new Database(":memory:");
    try {
      // 1. Uninitialized DB
      const uninitEnv: Env = {
        VRCP_D1: createMockD1Database(emptySqlite),
        OPERATOR_TOKEN: operatorToken,
        VRCP_ENV: "development"
      };
      const unauthStatus = await workerEntry.fetch(new Request("https://worker.example/v1/operator/status"), uninitEnv);
      expect(unauthStatus.status).toBe(401);

      const uninitRes = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/status", {
          headers: { authorization: `Bearer ${operatorToken}` }
        }),
        uninitEnv
      );
      expect(uninitRes.status).toBe(200);
      const uninitStatus = OperatorStatusResponseSchema.parse(await uninitRes.json());
      expect(uninitStatus).toEqual({
        schemaVersion: 1,
        environment: "development",
        purgeEnabled: true,
        d1SchemaState: "uninitialized",
        queueReadiness: {
          claimableJobs: 0,
          blockedJobs: 0,
          pendingLeads: 0,
          unresolvedDemandSignals: 0,
          activeNodes: 0,
          activeSteeringProfiles: 0
        }
      });

      // 2. Legacy DB (has extra legacy table / view)
      legacySqlite.run("CREATE TABLE node_credentials (node_id TEXT PRIMARY KEY);");
      legacySqlite.run("CREATE VIEW creator_opt_outs AS SELECT node_id FROM node_credentials;");
      const legacyEnv: Env = {
        VRCP_D1: createMockD1Database(legacySqlite),
        OPERATOR_TOKEN: operatorToken,
        VRCP_ENV: "production"
      };
      const legacyRes = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/status", {
          headers: { authorization: `Bearer ${operatorToken}` }
        }),
        legacyEnv
      );
      expect(legacyRes.status).toBe(200);
      const legacyStatus = OperatorStatusResponseSchema.parse(await legacyRes.json());
      expect(legacyStatus.environment).toBe("production");
      expect(legacyStatus.purgeEnabled).toBe(false);
      expect(legacyStatus.d1SchemaState).toBe("legacy");

      // 3. Initialized v0-17 DB with accurate queueReadiness counters
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-11-05T00:00:00.000Z"));
      try {
        await store.createNodeCredential("ready-node", ["vpm"]);
        await seedApprovedFixtureJob(store, "https://claimable.example/index.json", "vpm");
        await store.seedJob("https://unsteered-blocked.example/index.json", "vpm");
        const app = await store.registerApp({ schemaVersion: 1, appName: "Status App" });
        await store.recordReportSubmission(app.appId, {
          schemaVersion: 1,
          reportType: "demand_signal",
          query: "missing mod"
        });
        store.sqlite
          .prepare(
            `INSERT INTO source_leads (lead_key, discovered_from_url, kind, target_url, target_host, status, first_seen_at, last_seen_at)
             VALUES ('lead-status-1', 'https://claimable.example/index.json', 'vpm_listing', 'https://other.example/vpm.json', 'other.example', 'pending_review', '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z')`
          )
          .run();

        const statusRes = await workerEntry.fetch(
          new Request("https://worker.example/v1/operator/status", {
            headers: { authorization: `Bearer ${operatorToken}` }
          }),
          { VRCP_D1: store.d1, OPERATOR_TOKEN: operatorToken, VRCP_ENV: "preview" }
        );
        expect(statusRes.status).toBe(200);
        const readyStatus = OperatorStatusResponseSchema.parse(await statusRes.json());
        expect(readyStatus).toEqual({
          schemaVersion: 1,
          environment: "preview",
          purgeEnabled: false,
          d1SchemaState: "v0-17",
          queueReadiness: {
            claimableJobs: 1,
            blockedJobs: 1,
            pendingLeads: 1,
            unresolvedDemandSignals: 1,
            activeNodes: 1,
            activeSteeringProfiles: 1
          }
        });
      } finally {
        store.close();
      }
    } finally {
      emptySqlite.close();
      legacySqlite.close();
    }
  });

  test("POST /v1/operator/system/purge returns 403 outside VRCP_ENV=development and cleanly resets legacy/v0 DB in development", async () => {
    const sqlite = new Database(":memory:");
    try {
      const db = createMockD1Database(sqlite);

      // Simulate legacy tables, legacy views, and an existing sqlite_sequence table
      sqlite.run("CREATE TABLE node_credentials (node_id TEXT PRIMARY KEY, token_hash TEXT, capabilities_json TEXT, revoked_at TEXT);");
      sqlite.run(
        `INSERT INTO node_credentials VALUES ('node-preserved', 'hash-keep', '["vpm","booth"]', NULL),
                                            ('node-bad-caps', 'hash-skip', '["invalid"]', NULL);`
      );
      sqlite.run("CREATE TABLE legacy_unused_table (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);");
      sqlite.run("INSERT INTO legacy_unused_table(name) VALUES ('triggers-sqlite-sequence');");
      sqlite.run("CREATE VIEW creator_opt_outs AS SELECT node_id FROM node_credentials;");
      // Simulate Cloudflare D1 internal _cf_* table that must survive purge
      sqlite.run("CREATE TABLE _cf_KV (key TEXT PRIMARY KEY, value BLOB);");
      sqlite.run("INSERT INTO _cf_KV VALUES ('cf-meta', X'0102');");

      const validBody = JSON.stringify({
        schemaVersion: 1,
        confirm: "PURGE_DEVELOPMENT_D1",
        preserveNodes: true,
        seedPreviewStarter: true
      });

      // Blocked when VRCP_ENV is unset, "preview", or "production"
      for (const vrcpEnv of [undefined, "preview", "production"] as const) {
        const res = await workerEntry.fetch(
          new Request("https://worker.example/v1/operator/system/purge", {
            method: "POST",
            headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
            body: validBody
          }),
          { VRCP_D1: db, OPERATOR_TOKEN: operatorToken, ...(vrcpEnv ? { VRCP_ENV: vrcpEnv } : {}) }
        );
        expect(res.status).toBe(403);
        const err = (await res.json()) as { code: string };
        expect(err.code).toBe("forbidden");
      }

      // Development purge preserves node-preserved, drops legacy tables/views, retains sqlite_sequence & _cf_KV, seeds 16 starter profiles
      expect(PREVIEW_STARTER_PROFILE_COUNT).toBe(16);
      const devEnv: Env = { VRCP_D1: db, OPERATOR_TOKEN: operatorToken, VRCP_ENV: "development" };
      const badConfirm = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/system/purge", {
          method: "POST",
          headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, confirm: "WRONG" })
        }),
        devEnv
      );
      expect(badConfirm.status).toBe(400);

      const purgeRes = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/system/purge", {
          method: "POST",
          headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
          body: validBody
        }),
        devEnv
      );
      expect(purgeRes.status).toBe(200);
      const parsed = SystemPurgeResponseSchema.parse(await purgeRes.json());
      expect(parsed).toEqual({
        schemaVersion: 1,
        status: "purged",
        d1SchemaState: "v0-17",
        preservedNodes: 1,
        seededProfiles: PREVIEW_STARTER_PROFILE_COUNT
      });

      // Verify legacy objects dropped, _cf_KV & sqlite_sequence survived, and 17 V0 tables / 0 views present
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE type='view'").all()).toEqual([]);
      expect(sqlite.query("SELECT * FROM _cf_KV").all()).toHaveLength(1);
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()).toBeTruthy();
      expect(sqlite.query("SELECT name FROM sqlite_master WHERE name='legacy_unused_table'").get()).toBeNull();
      expect(sqlite.query("SELECT node_id FROM nodes").all()).toEqual([{ node_id: "node-preserved" }]);
      expect(sqlite.query("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({
        count: PREVIEW_STARTER_PROFILE_COUNT
      });

      // Second purge with preserveNodes=false and seedPreviewStarter=false wipes nodes and profiles cleanly
      const wipeRes = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/system/purge", {
          method: "POST",
          headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            schemaVersion: 1,
            confirm: "PURGE_DEVELOPMENT_D1",
            preserveNodes: false,
            seedPreviewStarter: false
          })
        }),
        devEnv
      );
      expect(wipeRes.status).toBe(200);
      expect(SystemPurgeResponseSchema.parse(await wipeRes.json())).toEqual({
        schemaVersion: 1,
        status: "purged",
        d1SchemaState: "v0-17",
        preservedNodes: 0,
        seededProfiles: 0
      });
      expect(sqlite.query("SELECT COUNT(*) AS count FROM nodes").get()).toEqual({ count: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  test("manual enqueue audits atomically and preserves existing job state", async () => {
    const store = await createInitializedD1Coordinator();
    const input = {
      schemaVersion: 1,
      url: "https://queue.example/index.json",
      platform: "vpm",
      purpose: "metadata",
      minDelayMs: 1000,
      reason: "Offline fixture"
    };
    try {
      const first = await handleOperatorRequest(operatorRequest("/v1/operator/jobs", "POST", input), store, operatorToken);
      expect(first.status).toBe(200);
      expect(first.headers.get("X-RateLimit-Limit")).toBeDefined();
      const body = (await first.json()) as { jobId: string };
      store.sqlite.run("UPDATE crawl_jobs SET state='done' WHERE job_id=?", [body.jobId]);
      const second = await handleOperatorRequest(operatorRequest("/v1/operator/jobs", "POST", input), store, operatorToken);
      expect(second.status).toBe(200);
      expect(((await second.json()) as { jobId: string }).jobId).toBe(body.jobId);
      expect(store.sqlite.query("SELECT state FROM crawl_jobs").get()).toEqual({ state: "done" });
      expect(
        store.sqlite.query("SELECT COUNT(*) AS count FROM operator_audit_log WHERE entity_type='job' AND action='seed'").get()
      ).toEqual({ count: 2 });

      store.sqlite.run(
        "CREATE TRIGGER reject_seed_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='job' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;"
      );
      const failed = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs", "POST", { ...input, minDelayMs: 50_000 }),
        store,
        operatorToken
      );
      expect(failed.status).toBe(409);
      expect(store.sqlite.query("SELECT min_delay_ms FROM origin_state").get()).toEqual({ min_delay_ms: 1000 });
    } finally {
      store.close();
    }
  });

  test("exports the V0 operator request and response contracts as JSON Schema", () => {
    expect(OPERATOR_API_JSON_SCHEMAS.initializeRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorStatusResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.systemPurgeRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.systemPurgeResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.approveLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.bulkApproveLeadsRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.suppressLeadDomainRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadActionResponse.oneOf?.length).toBe(2);
    expect(OPERATOR_API_JSON_SCHEMAS.createSteeringProfile.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.updateSteeringProfile.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.steeringProfileAction.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.issueNodeCredential.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.nodeCredentialResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorNodeListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorJobListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.updateJobRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.requeueJobRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.deleteJobRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.takedownListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.delegatedClaimListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorAppListResponse.type).toBe("object");
  });

  test("only the operator can issue an audited node key without capabilities input; rotation invalidates old key", async () => {
    const store = await createInitializedD1Coordinator();
    const path = "/v1/operator/nodes";
    await seedApprovedFixtureJob(store, "https://vpm-issue.example/index.json", "vpm");
    const input = {
      schemaVersion: 1,
      nodeId: "desktop-1",
      reason: "Approve this local desktop node"
    };
    const claim = (token: string, capabilities: string[]) =>
      handleNodeRequest(
        new Request("http://localhost/v1/node/jobs/claim", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, nodeId: input.nodeId, capabilities })
        }),
        store
      );
    try {
      expect((await handleOperatorRequest(operatorRequest(path, "POST", input), store, "")).status).toBe(401);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", input, "b".repeat(64)), store, operatorToken)).status
      ).toBe(401);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", { ...input, capabilities: ["vpm"] }), store, operatorToken))
          .status
      ).toBe(400);
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM nodes").get()).toEqual({ count: 0 });

      const first = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(first.status).toBe(201);
      expect(first.headers.get("cache-control")).toBe("no-store");
      const firstBody = (await first.json()) as { token: string; nodeId: string; capabilities: string[] };
      expect(firstBody.nodeId).toBe(input.nodeId);
      expect(firstBody.capabilities).toContain("vpm");
      expect(firstBody.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
      expect((await claim(firstBody.token, firstBody.capabilities)).status).toBe(200);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", input, firstBody.token), store, operatorToken)).status
      ).toBe(401);

      const second = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(second.status).toBe(201);
      const secondBody = (await second.json()) as { token: string; capabilities: string[] };
      expect(secondBody.token).not.toBe(firstBody.token);
      expect((await claim(firstBody.token, firstBody.capabilities)).status).toBe(401);
      expect((await claim(secondBody.token, secondBody.capabilities)).status).toBe(200);

      const actions = store.sqlite
        .prepare("SELECT entity_id AS node_id, actor, action, reason FROM operator_audit_log WHERE entity_type='node' ORDER BY action_id")
        .all() as Array<{ node_id: string; actor: string; action: string; reason: string }>;
      expect(actions).toEqual(
        [1, 2].map(() => ({
          node_id: input.nodeId,
          actor: "operator-api",
          action: "issue",
          reason: input.reason
        }))
      );
      expect(JSON.stringify(actions)).not.toContain(secondBody.token);
    } finally {
      store.close();
    }
  });

  test("fails closed without a configured operator token and never accepts node credentials", async () => {
    const store = await createInitializedD1Coordinator();
    const { token: nodeToken } = await store.createNodeCredential("node", ["vpm"]);
    try {
      for (const path of [
        "/v1/operator/status",
        "/v1/operator/leads",
        "/v1/operator/steering-profiles",
        "/v1/operator/nodes",
        "/v1/operator/jobs"
      ]) {
        expect((await handleOperatorRequest(operatorRequest(path, "GET", undefined, operatorToken), store, "")).status).toBe(
          401
        );
        expect(
          (await handleOperatorRequest(operatorRequest(path, "GET", undefined, nodeToken), store, operatorToken)).status
        ).toBe(401);
      }
    } finally {
      store.close();
    }
  });

  test("paginates more than 100 pending leads with target_host preserved", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const insert = store.sqlite.prepare(
        `INSERT INTO source_leads(lead_key,discovered_from_url,kind,target_url,target_host,status,first_seen_at,last_seen_at)
         VALUES (?,'https://example.org/source.json','vpm_listing',?,?, 'pending_review',?,?)`
      );
      for (let i = 0; i < 105; i++) {
        const ts = new Date(Date.parse("2026-10-03T00:00:00.000Z") + (i < 5 ? 0 : i * 1000)).toISOString();
        const host = `p${i}.example.org`;
        insert.run(i.toString(16).padStart(64, "0"), `https://${host}/index.json`, host, ts, ts);
      }
      const first = (await (
        await handleOperatorRequest(operatorRequest("/v1/operator/leads"), store, operatorToken)
      ).json()) as { leads: { lead_key: string; target_host: string }[]; nextCursor: string | null };
      expect(first.leads).toHaveLength(100);
      expect(first.leads[0]?.target_host).toBe("p0.example.org");
      expect(first.nextCursor).toBeTruthy();

      const second = (await (
        await handleOperatorRequest(
          operatorRequest(`/v1/operator/leads?cursor=${encodeURIComponent(first.nextCursor!)}`),
          store,
          operatorToken
        )
      ).json()) as { leads: { lead_key: string }[]; nextCursor: string | null };
      expect(second.leads).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.leads, ...second.leads].map((lead) => lead.lead_key)).size).toBe(105);
    } finally {
      store.close();
    }
  });

  test("POST /v1/operator/leads/bulk-approve and POST /v1/operator/leads/suppress-domain handle valid, invalid, and domain suppression", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const key1 = "1".repeat(64);
      const key2 = "2".repeat(64);
      const key3 = "3".repeat(64);
      const keyMissing = "4".repeat(64);
      const ts = "2026-11-05T00:00:00.000Z";
      store.sqlite.exec(`
        INSERT INTO source_leads(lead_key,discovered_from_url,kind,target_url,target_host,status,first_seen_at,last_seen_at) VALUES
          ('${key1}','https://src.example/index.json','vpm_listing','https://good1.example/index.json','good1.example','pending_review','${ts}','${ts}'),
          ('${key2}','https://src.example/index.json','vpm_listing','https://spam.example/index.json','spam.example','pending_review','${ts}','${ts}'),
          ('${key3}','https://src.example/index.json','vpm_listing','https://sub.spam.example/index.json','sub.spam.example','pending_review','${ts}','${ts}');
      `);

      // Suppress spam.example domain -> suppresses both spam.example & sub.spam.example pending leads
      const suppressRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/leads/suppress-domain", "POST", {
          schemaVersion: 1,
          targetHost: "spam.example",
          rejectPendingLeads: true,
          reason: "Confirmed spam domain"
        }),
        store,
        operatorToken
      );
      expect(suppressRes.status).toBe(200);
      const suppressData = SuppressLeadDomainResponseSchema.parse(await suppressRes.json());
      expect(suppressData.targetHost).toBe("spam.example");
      expect(suppressData.scope).toBe("domain");
      expect(suppressData.rejectedLeadCount).toBe(2);

      // Bulk approve mixes approved (key1) and skipped (key2 rejected/suppressed, keyMissing not found)
      const bulkRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/leads/bulk-approve", "POST", {
          schemaVersion: 1,
          leadKeys: [key1, key2, keyMissing],
          priorityLane: 1,
          minDelayMs: 2500,
          reason: "Bulk approve reviewed listings"
        }),
        store,
        operatorToken
      );
      expect(bulkRes.status).toBe(200);
      const bulkData = BulkApproveLeadsResponseSchema.parse(await bulkRes.json());
      expect(bulkData.approved).toHaveLength(1);
      expect(bulkData.approved[0]?.leadKey).toBe(key1);
      expect(bulkData.skipped).toHaveLength(2);

      const jobRow = store.sqlite
        .prepare("SELECT priority_lane FROM crawl_jobs WHERE job_id = ?")
        .get(bulkData.approved[0]!.jobId) as { priority_lane: number };
      expect(jobRow.priority_lane).toBe(1);
    } finally {
      store.close();
    }
  });

  test("autoPromote steering profile promotes matching leads and claim-time retry recovers from transient failure", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", token))!;
    await seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    await store.recordRobotsSnapshot("https://reviewed.example.org", 404);
    try {
      const profile = await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "exact",
          hostPattern: "reviewed.example.org",
          pathScope: "/index.json",
          queryMode: "none",
          method: "GET",
          purpose: "discovery",
          autoPromote: true,
          recrawlIntervalMs: 86_400_000,
          minDelayMs: 1000,
          maxPaginationDepth: 0,
          expiresAt: "2026-10-01T00:00:00.000Z",
          reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
          reason: "Auto-promote reviewed VPM listing",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "operator-api"
      );

      const claim1 = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim1.status).toBe("leased");
      if (claim1.status !== "leased") throw new Error("Expected recipe lease");

      store.sqlite.run(
        "CREATE TRIGGER reject_auto_promotion BEFORE INSERT ON crawl_jobs WHEN NEW.url = 'https://reviewed.example.org/index.json' BEGIN SELECT RAISE(ABORT,'transient promotion failure'); END;"
      );
      const submitRes = await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node",
          jobId: claim1.job.jobId,
          leaseId: claim1.job.leaseId,
          idempotencyKey: "transient-promotion-failure-discovery",
          outcome: {
            kind: "discovery",
            leads: [{ kind: "vpm_listing", url: "https://reviewed.example.org/index.json" }]
          }
        },
        principal
      );
      store.sqlite.run("DROP TRIGGER reject_auto_promotion;");

      expect(submitRes.status).toBe("accepted");
      expect((store.sqlite.prepare("SELECT status FROM source_leads").get() as { status: string }).status).toBe(
        "pending_review"
      );
      const failAudits = await store.listAuditLogs({ entityType: "profile", entityId: profile.profileId });
      expect(failAudits.some((a) => a.action === "promotion_failed")).toBe(true);

      now += 1500;
      const claim2 = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim2.status).toBe("leased");
      if (claim2.status !== "leased") throw new Error("Expected promoted listing lease");
      expect(claim2.job.url).toBe("https://reviewed.example.org/index.json");
      expect((store.sqlite.prepare("SELECT status FROM source_leads").get() as { status: string }).status).toBe(
        "approved"
      );
      expect(await store.retryPendingAutoPromotions()).toBe(0);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/jobs returns accurate claimabilityBlockers and PATCH/requeue/DELETE enforce lease guards", async () => {
    let now = Date.parse("2026-11-05T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const profile = await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "exact",
          hostPattern: "vpm-crud.example",
          pathScope: "/",
          queryMode: "none",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: "2027-01-01T00:00:00.000Z",
          reviewReference: "CRUD-TEST",
          reason: "Job CRUD & blockers",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "operator-api"
      );
      await store.createSuppressedTarget(
        { schemaVersion: 1, target: "https://suppressed-job.example/index.json", scope: "url", reason: "Suppressed" },
        "operator-api"
      );

      const nowIso = new Date(now).toISOString();
      const futureIso = new Date(now + 3_600_000).toISOString();
      const jobBlocked = crypto.randomUUID();
      const jobLeased = crypto.randomUUID();
      const jobSuppressed = crypto.randomUUID();
      const jobCrud = crypto.randomUUID();

      await store.createNodeCredential("node-1", ["vpm"]);

      store.sqlite.run(
        `INSERT INTO origin_state(origin, active_job_id, lease_expires_at, next_allowed_at, min_delay_ms,
           robots_snapshot_id, robots_status_code, robots_body, robots_fetched_at, robots_expires_at)
         VALUES ('https://vpm-crud.example', NULL, ?, ?, 1000, 'snap-1', 200, 'User-agent: *\nDisallow: /disallowed.json', ?, ?)`,
        [futureIso, futureIso, nowIso, futureIso]
      );

      store.sqlite.run(
        `INSERT INTO crawl_jobs(job_id, platform, url, origin, state, priority_lane, recrawl_interval_ms, pagination_depth,
           next_fetch_at, claimed_by, lease_id, lease_expires_at, created_at, robots_deferred_until, steering_profile_id, job_purpose)
         VALUES
           (?, 'vpm', 'https://vpm-crud.example/disallowed.json', 'https://vpm-crud.example', 'blocked', 3, 86400000, 0, ?, NULL, NULL, NULL, ?, ?, NULL, 'metadata'),
           (?, 'vpm', 'https://vpm-crud.example/leased.json', 'https://vpm-crud.example', 'leased', 1, 86400000, 0, ?, 'node-1', 'secret-lease-xyz', ?, ?, NULL, ?, 'metadata'),
           (?, 'vpm', 'https://suppressed-job.example/index.json', 'https://suppressed-job.example', 'pending', 2, 86400000, 0, ?, NULL, NULL, NULL, ?, NULL, NULL, 'metadata'),
           (?, 'vpm', 'https://vpm-crud.example/editable.json', 'https://vpm-crud.example', 'done', 4, 86400000, 0, ?, NULL, NULL, NULL, ?, NULL, NULL, 'metadata')`,
        [
          jobBlocked,
          futureIso,
          nowIso,
          futureIso,
          jobLeased,
          nowIso,
          futureIso,
          nowIso,
          profile.profileId,
          jobSuppressed,
          nowIso,
          nowIso,
          jobCrud,
          futureIso,
          nowIso
        ]
      );

      store.sqlite.run("UPDATE origin_state SET active_job_id=? WHERE origin='https://vpm-crud.example'", [jobLeased]);

      const listRes = await handleOperatorRequest(operatorRequest("/v1/operator/jobs"), store, operatorToken);
      expect(listRes.status).toBe(200);
      const raw = await listRes.text();
      expect(raw).not.toContain("secret-lease-xyz");
      const listData = OperatorJobListResponseSchema.parse(JSON.parse(raw));

      const blockedRecord = listData.jobs.find((j) => j.jobId === jobBlocked)!;
      expect(blockedRecord.claimabilityBlockers).toEqual(
        expect.arrayContaining([
          "job_blocked",
          "scheduled_later",
          "robots_deferred",
          "robots_disallowed",
          "origin_lease_busy",
          "origin_pacing_cooldown"
        ])
      );

      const suppressedRecord = listData.jobs.find((j) => j.jobId === jobSuppressed)!;
      expect(suppressedRecord.claimabilityBlockers).toEqual(
        expect.arrayContaining(["suppressed_target", "no_active_steering_profile", "robots_refresh_due"])
      );

      // priorityLane filter
      const lane2Res = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs?priorityLane=2"),
        store,
        operatorToken
      );
      expect(OperatorJobListResponseSchema.parse(await lane2Res.json()).jobs.map((j) => j.jobId)).toEqual([
        jobSuppressed
      ]);

      // PATCH actively leased job returns 409; PATCH idle job updates lane/interval/nextFetchAt
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/jobs/${jobLeased}`, "PATCH", {
              schemaVersion: 1,
              priorityLane: 2,
              reason: "Cannot patch active lease"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(409);

      const patchRes = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs/${jobCrud}`, "PATCH", {
          schemaVersion: 1,
          priorityLane: 1,
          recrawlIntervalMs: 14_400_000,
          nextFetchAt: "2026-11-05T00:05:00.000Z",
          reason: "Promote to 4h tier"
        }),
        store,
        operatorToken
      );
      expect(patchRes.status).toBe(200);
      const patched = UpdateJobResponseSchema.parse(await patchRes.json());
      expect(patched.job.priorityLane).toBe(1);
      expect(patched.job.recrawlIntervalMs).toBe(14_400_000);
      expect(patched.job.nextFetchAt).toBe("2026-11-05T00:05:00.000Z");

      // POST /requeue resets state to pending & clears robots_deferred_until, rejects suppressed/leased
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/jobs/${jobSuppressed}/requeue`, "POST", {
              schemaVersion: 1,
              reason: "Should fail on suppressed"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(409);

      const requeueRes = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs/${jobBlocked}/requeue`, "POST", {
          schemaVersion: 1,
          priorityLane: 2,
          reason: "Retry blocked job"
        }),
        store,
        operatorToken
      );
      expect(requeueRes.status).toBe(200);
      const requeued = RequeueJobResponseSchema.parse(await requeueRes.json());
      expect(requeued.job.state).toBe("pending");
      expect(requeued.job.priorityLane).toBe(2);
      expect(requeued.job.robotsDeferredUntil).toBeNull();
      expect(requeued.job.nextFetchAt).toBe(nowIso);

      // DELETE refuses active lease, deletes idle job and cascades cleanly
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/jobs/${jobLeased}`, "DELETE", {
              schemaVersion: 1,
              reason: "Cannot delete active lease"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(409);

      const delRes = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs/${jobCrud}`, "DELETE", {
          schemaVersion: 1,
          reason: "Remove obsolete job"
        }),
        store,
        operatorToken
      );
      expect(delRes.status).toBe(200);
      expect(DeleteJobResponseSchema.parse(await delRes.json())).toEqual({
        schemaVersion: 1,
        jobId: jobCrud,
        status: "deleted"
      });
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/jobs/${jobCrud}`, "DELETE", {
              schemaVersion: 1,
              reason: "Missing after delete"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(404);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/nodes lists active/revoked/no-heartbeat nodes cleanly and omits token hashes", async () => {
    let now = Date.parse("2026-10-05T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const emptyRes = await handleOperatorRequest(operatorRequest("/v1/operator/nodes"), store, operatorToken);
      expect(emptyRes.status).toBe(200);
      expect(OperatorNodeListResponseSchema.parse(await emptyRes.json())).toEqual({
        schemaVersion: 1,
        nodes: [],
        nextCursor: null
      });

      const { token: tokAlpha } = await store.createNodeCredential("Node-Alpha", ["vpm"]);
      const { token: tokGamma } = await store.createNodeCredential("Node-Gamma", ["booth", "github"]);
      const { token: tokZeta } = await store.createNodeCredential("Node-Zeta", ["itch"]);
      const { token: tokBeta } = await store.createNodeCredential("node-beta", ["vpm", "custom_domain"]);
      const { token: tokDelta } = await store.createNodeCredential("node-delta", ["shopify"]);

      const principalAlpha = (await store.authenticate("Node-Alpha", tokAlpha))!;
      const principalGamma = (await store.authenticate("Node-Gamma", tokGamma))!;
      const principalZeta = (await store.authenticate("Node-Zeta", tokZeta))!;

      const activeProfile = await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "exact",
          hostPattern: "active-node.example",
          pathScope: "/index.json",
          queryMode: "none",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: new Date(now + 3_600_000).toISOString(),
          reviewReference: "OFFLINE-NODE-LIST-TEST",
          reason: "Active node heartbeat fixture",
          retainClasses: ["normalized_facts"],
          publishClasses: []
        },
        "operator-api"
      );
      const jobCreated = new Date(now).toISOString();
      const leaseExpires = new Date(now + 120_000).toISOString();
      store.sqlite
        .prepare(
          `INSERT INTO crawl_jobs
        (job_id, platform, url, origin, state, next_fetch_at, claimed_by, lease_id, lease_expires_at, created_at, job_purpose, steering_profile_id)
        VALUES (?, 'vpm', 'https://active-node.example/index.json', 'https://active-node.example', 'leased', ?, 'Node-Alpha', 'lease-secret-alpha', ?, ?, 'metadata', ?)`
        )
        .run("job-active-1", jobCreated, leaseExpires, jobCreated, activeProfile.profileId);

      now += 1000;
      await store.heartbeat(
        {
          schemaVersion: 1,
          nodeId: "Node-Alpha",
          capabilities: ["vpm"],
          state: "fetching",
          activeJobId: "job-active-1",
          activeLeaseId: "lease-secret-alpha"
        },
        principalAlpha
      );
      now += 1000;
      await store.heartbeat({ schemaVersion: 1, nodeId: "Node-Gamma", capabilities: ["booth", "github"], state: "idle" }, principalGamma);
      now += 1000;
      await store.heartbeat({ schemaVersion: 1, nodeId: "Node-Zeta", capabilities: ["itch"], state: "idle" }, principalZeta);
      now += 1000;
      await store.revokeNode("Node-Gamma", { schemaVersion: 1, reason: "Rotated node key" }, "operator-api");
      await store.revokeNode("node-delta", { schemaVersion: 1, reason: "Retired node" }, "operator-api");

      const allRes = await handleOperatorRequest(operatorRequest("/v1/operator/nodes"), store, operatorToken);
      expect(allRes.status).toBe(200);
      const allRaw = await allRes.text();
      expect(allRaw).not.toContain("token_hash");
      for (const secretToken of [tokAlpha, tokGamma, tokZeta, tokBeta, tokDelta]) {
        expect(allRaw).not.toContain(secretToken);
      }
      const allData = OperatorNodeListResponseSchema.parse(JSON.parse(allRaw));
      expect(allData.nodes.map((node) => node.nodeId)).toEqual([
        "Node-Alpha",
        "Node-Gamma",
        "Node-Zeta",
        "node-beta",
        "node-delta"
      ]);
      expect(decodeOperatorNodeCursor(encodeOperatorNodeCursor({ nodeId: "Node-Alpha" }))).toEqual({
        nodeId: "Node-Alpha"
      });
      expect(
        decodeOperatorJobCursor(encodeOperatorJobCursor({ createdAt: "2026-10-05T00:00:01.000Z", jobId: "Job-Zeta" }))
      ).toEqual({ createdAt: "2026-10-05T00:00:01.000Z", jobId: "Job-Zeta" });
    } finally {
      store.close();
    }
  });

  test("DELETE /v1/operator/nodes/{nodeId} prunes revoked nodes and returns invalid_payload / bad_json / not_revoked accurately", async () => {
    let now = Date.parse("2026-10-06T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      await store.createNodeCredential("prune-node-1", ["vpm"]);
      now += 1000;
      await store.revokeNode("prune-node-1", { schemaVersion: 1, reason: "Rotated node" }, "operator-api");

      const pruneRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/prune-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(pruneRes.status).toBe(200);
      expect(PruneNodeResponseSchema.parse(await pruneRes.json())).toEqual({
        schemaVersion: 1,
        nodeId: "prune-node-1",
        status: "pruned"
      });
      expect((await store.listNodesPage()).nodes.some((n) => n.nodeId === "prune-node-1")).toBe(false);

      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/nodes/prune-node-1", "DELETE", {
              schemaVersion: 1,
              reason: "Already pruned"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(404);

      await store.createNodeCredential("active-node-1", ["booth"]);
      const activeRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "Cannot prune active"
        }),
        store,
        operatorToken
      );
      expect(activeRes.status).toBe(409);
      const activeBody = (await activeRes.json()) as { code: string; error: string };
      expect(activeBody.code).toBe("not_revoked");
      expect(activeBody.error).toBe("Node must be revoked before it can be pruned.");

      const missingContentTypeRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE"),
        store,
        operatorToken
      );
      expect(missingContentTypeRes.status).toBe(415);

      const badJsonRes = await handleOperatorRequest(
        new Request("https://worker.example/v1/operator/nodes/active-node-1", {
          method: "DELETE",
          headers: { authorization: `Bearer ${operatorToken}`, "content-type": "application/json" },
          body: "{"
        }),
        store,
        operatorToken
      );
      expect(badJsonRes.status).toBe(400);
      expect(((await badJsonRes.json()) as { code: string }).code).toBe("bad_json");

      for (const badBody of [
        { schemaVersion: 1, reason: "   " },
        { schemaVersion: 2, reason: "Wrong version" }
      ]) {
        const res = await handleOperatorRequest(
          operatorRequest("/v1/operator/nodes/active-node-1", "DELETE", badBody),
          store,
          operatorToken
        );
        expect(res.status).toBe(400);
        expect(((await res.json()) as { code: string }).code).toBe("invalid_payload");
      }
    } finally {
      store.close();
    }
  });

  test("takedowns, delegated claims, app delegation, and candidate review work over catalog_tickets & suppressed_targets", async () => {
    let fixtureNow = 1700000000000;
    const store = await createInitializedD1Coordinator(":memory:", () => fixtureNow);
    try {
      const canonicalId = "pkg-verification-target";
      const storefrontUrl = "https://booth.pm/en/items/888888";
      store.sqlite
        .prepare(
          `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
           VALUES (?, 'tools', 'editor_tool', 'active', 'Target Package', 'com.target.pkg', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`
        )
        .run(canonicalId);

      const delist = await store.submitDelistRequest({
        canonicalId,
        targetUrl: storefrontUrl,
        reason: "Suspected copyright infringement",
        requesterType: "unauthenticated_creator",
        proofKind: "storefront_bio_token",
        proofValue: "claim-bio-123"
      });
      expect(
        (store.sqlite.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id=?").get(canonicalId) as { lifecycle: string }).lifecycle
      ).toBe("delisted");
      expect(
        store.sqlite.prepare("SELECT reason FROM suppressed_targets WHERE target=? AND scope='url'").get(storefrontUrl)
      ).toBeTruthy();

      const takedownList = TakedownListResponseSchema.parse(
        await (await handleOperatorRequest(operatorRequest("/v1/operator/takedowns"), store, operatorToken)).json()
      );
      expect(takedownList.records).toHaveLength(1);

      const rejectedDelist = VerifyTakedownResponseSchema.parse(
        await (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
              schemaVersion: 1,
              verdict: "rejected",
              notes: "Bio token did not match"
            }),
            store,
            operatorToken
          )
        ).json()
      );
      expect(rejectedDelist.status).toBe("rejected");
      expect(
        (store.sqlite.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id=?").get(canonicalId) as { lifecycle: string }).lifecycle
      ).toBe("active");
      expect(
        store.sqlite.prepare("SELECT reason FROM suppressed_targets WHERE target=? AND scope='url'").get(storefrontUrl)
      ).toBeNull();

      // App candidate review & delegation + claims audit
      const user = await store.issueUserToken("app-dev");
      const app = await store.registerApp({ schemaVersion: 1, appName: "Trusted Claims App" }, user.userId);
      const listedApps = OperatorAppListResponseSchema.parse(
        await (await handleOperatorRequest(operatorRequest("/v1/operator/apps"), store, operatorToken)).json()
      );
      expect(listedApps.apps).toHaveLength(1);

      const reviewed = ReviewAppCandidateResponseSchema.parse(
        await (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/apps/${app.appId}/candidate-review`, "POST", {
              schemaVersion: 1,
              candidateStatus: "trusted",
              grantDelegation: true,
              notes: "Verified partner"
            }),
            store,
            operatorToken
          )
        ).json()
      );
      expect(reviewed.candidateStatus).toBe("trusted");
      expect(reviewed.permissions).toContain("claims:delegate");

      const claim = await store.recordCreatorClaimIntake(app.appId, {
        schemaVersion: 1,
        attestation: {
          appId: app.appId,
          action: "creator_ownership_claim",
          frontUrl: storefrontUrl,
          creatorId: "creator_abc",
          challengeToken: "chal_token_1_123456",
          expiresAt: Math.floor(fixtureNow / 1000) + 3600,
          nonce: "nonce_claim_op_1"
        },
        signature: "sig_claim_op_1",
        reason: "Primary ownership claim"
      });

      const claimList = DelegatedClaimListResponseSchema.parse(
        await (await handleOperatorRequest(operatorRequest("/v1/operator/claims"), store, operatorToken)).json()
      );
      expect(claimList.records.map((r) => r.claimId)).toEqual([claim.claimId]);

      const verifiedClaim = VerifyDelegatedClaimResponseSchema.parse(
        await (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/claims/${claim.claimId}/verify`, "POST", {
              schemaVersion: 1,
              verdict: "accepted",
              notes: "Verified signature"
            }),
            store,
            operatorToken
          )
        ).json()
      );
      expect(verifiedClaim.status).toBe("accepted");

      const revokeDelegation = SetAppDelegationResponseSchema.parse(
        await (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/apps/${app.appId}/delegation`, "POST", {
              schemaVersion: 1,
              delegationAllowed: false,
              reason: "Rotate permissions"
            }),
            store,
            operatorToken
          )
        ).json()
      );
      expect(revokeDelegation.delegationAllowed).toBe(false);
    } finally {
      store.close();
    }
  });
});
