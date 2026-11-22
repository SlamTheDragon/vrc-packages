import { describe, expect, test } from "bun:test";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { OPERATOR_API_JSON_SCHEMAS } from "../src/api/protocol/operator_protocol.ts";
import {
  TakedownListResponseSchema,
  VerifyTakedownResponseSchema,
  DelegatedClaimListResponseSchema,
  VerifyDelegatedClaimResponseSchema,
  OperatorAppListResponseSchema,
  OperatorNodeListResponseSchema,
  OperatorJobListResponseSchema,
  encodeOperatorNodeCursor,
  decodeOperatorNodeCursor,
  encodeOperatorJobCursor,
  decodeOperatorJobCursor,
  SetAppDelegationResponseSchema,
  ReviewAppCandidateResponseSchema
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

describe("separate operator control API", () => {
  test("operator pagination normalizes decoded UUIDs without changing timestamps or accepting noncanonical cursors", async () => {
    const store = await createInitializedD1Coordinator();
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const timestamp = "2026-10-04T00:00:00.000Z";
    const calls: unknown[] = [];
    store.listAutoQueueRulesPage = async (_limit, cursor) => {
      calls.push(cursor);
      return { rules: [], nextCursor: null };
    };
    store.listSourceAccessProfilesPage = async (_limit, cursor) => {
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
        ["autoqueue-rules", "createdAt", "ruleId"],
        ["source-profiles", "createdAt", "profileId"],
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
    store.disableSourceAccessProfile = async (value) => {
      calls.push(value);
      throw new Error("Source profile not found");
    };
    store.disableAutoQueueRule = async (value) => {
      calls.push(value);
      throw new Error("Rule not found");
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
        ["source-profiles", "disable", { schemaVersion: 1, reason: "Reviewed profile" }],
        ["autoqueue-rules", "disable", { schemaVersion: 1, reason: "Reviewed rule" }],
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

  test("manual enqueue audits atomically and preserves existing job state in the SQLite comparator", async () => {
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
      expect(store.sqlite.query("SELECT COUNT(*) AS count FROM job_seed_actions").get()).toEqual({ count: 2 });
      store.sqlite.run(
        "CREATE TRIGGER reject_seed_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='job' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;"
      );
      const failed = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs", "POST", { ...input, minDelayMs: 50000 }),
        store,
        operatorToken
      );
      expect(failed.status).toBe(409);
      expect(store.sqlite.query("SELECT min_delay_ms FROM origin_leases").get()).toEqual({ min_delay_ms: 1000 });
    } finally {
      store.close();
    }
  });

  test("exports the operator request and response contracts as JSON Schema", () => {
    expect(OPERATOR_API_JSON_SCHEMAS.approveLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.rejectLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadActionResponse.oneOf?.length).toBe(2);
    expect(OPERATOR_API_JSON_SCHEMAS.createAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.disableAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.autoQueueRuleResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.issueNodeCredential.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.nodeCredentialResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorNodeListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorJobListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.takedownListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyTakedownRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyTakedownResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.delegatedClaimListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyDelegatedClaimRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyDelegatedClaimResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.operatorAppListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.setAppDelegationRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.setAppDelegationResponse.type).toBe("object");
  });

  test("only the operator can issue an audited node key; rotation invalidates the old key", async () => {
    const store = await createInitializedD1Coordinator();
    const path = "/v1/operator/nodes";
    const input = {
      schemaVersion: 1,
      nodeId: "desktop-1",
      capabilities: ["vpm"],
      reason: "Approve this local desktop node"
    };
    const claim = (token: string) =>
      handleNodeRequest(
        new Request("http://localhost/v1/node/jobs/claim", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, nodeId: input.nodeId, capabilities: input.capabilities })
        }),
        store
      );
    try {
      expect((await handleOperatorRequest(operatorRequest(path, "POST", input), store, "")).status).toBe(401);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", input, "b".repeat(64)), store, operatorToken)).status
      ).toBe(401);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", { ...input, extra: true }), store, operatorToken))
          .status
      ).toBe(400);
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM node_credentials").get()).toEqual({ count: 0 });
      const first = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(first.status).toBe(201);
      expect(first.headers.get("cache-control")).toBe("no-store");
      const firstBody = (await first.json()) as { token: string; nodeId: string };
      expect(firstBody.nodeId).toBe(input.nodeId);
      expect(firstBody.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
      expect((await claim(firstBody.token)).status).toBe(200);
      expect(
        (await handleOperatorRequest(operatorRequest(path, "POST", input, firstBody.token), store, operatorToken))
          .status
      ).toBe(401);
      const second = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(second.status).toBe(201);
      const secondBody = (await second.json()) as { token: string };
      expect(secondBody.token).not.toBe(firstBody.token);
      expect((await claim(firstBody.token)).status).toBe(401);
      expect((await claim(secondBody.token)).status).toBe(200);
      const actions = store.sqlite
        .prepare("SELECT node_id,actor,action,reason FROM node_credential_actions ORDER BY action_id")
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

  test("node issuance rejects the wrong schema version before creating credentials", async () => {
    const store = await createInitializedD1Coordinator();
    const path = "/v1/operator/nodes";
    const invalid = { schemaVersion: 2, nodeId: "unknown", capabilities: ["vpm"], reason: "Local approval" };
    try {
      const rejected = await handleOperatorRequest(operatorRequest(path, "POST", invalid), store, operatorToken);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        schemaVersion: 1,
        code: "invalid_payload",
        error: "Node credential body is invalid"
      });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM node_credentials").get()).toEqual({ count: 0 });
      const valid = { ...invalid, schemaVersion: 1 };
      const issued = await handleOperatorRequest(operatorRequest(path, "POST", valid), store, operatorToken);
      expect(issued.status).toBe(201);
      expect(((await issued.json()) as { token: string }).token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    } finally {
      store.close();
    }
  });

  test("fails closed without a configured operator token and never accepts node credentials", async () => {
    const store = await createInitializedD1Coordinator();
    const nodeToken = await store.createNodeCredential("node", ["vpm"]);
    try {
      const request = operatorRequest("/v1/operator/leads");
      expect((await handleOperatorRequest(request, store, "")).status).toBe(401);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/leads", "GET", undefined, nodeToken),
            store,
            operatorToken
          )
        ).status
      ).toBe(401);
      expect((await handleOperatorRequest(request, store, operatorToken)).status).toBe(200);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/leads?limit=101"), store, operatorToken)).status).toBe(
        400
      );
    } finally {
      store.close();
    }
  });

  test("paginates more than 100 pending leads without hiding later rows", async () => {
    const store = await createInitializedD1Coordinator();
    const jobId = await seedApprovedFixtureJob(store, "https://index.example.org/source.json", "curated", 0);
    try {
      const insert = store.sqlite.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,claimed_package_id,
          status,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,NULL,?,?,?)`);
      for (let index = 0; index < 205; index++) {
        insert.run(
          index.toString(16).padStart(64, "0"),
          "https://index.example.org/source.json",
          jobId,
          "publisher_site",
          `https://creator-${index}.example.org/`,
          "pending_review",
          "2026-09-28T00:00:00.000Z",
          "2026-09-28T00:00:00.000Z"
        );
      }
      insert.run(
        "f".repeat(64),
        "https://index.example.org/source.json",
        jobId,
        "publisher_site",
        "https://rejected.example.org/",
        "rejected",
        "2026-09-28T00:00:00.000Z",
        "2026-09-28T00:00:00.000Z"
      );
      const seen = new Set<string>();
      const pageSizes: number[] = [];
      let cursor: string | null = null;
      let firstCursor: string | null = null;
      do {
        const path = `/v1/operator/leads?status=pending_review&limit=60${cursor ? `&cursor=${cursor}` : ""}`;
        const response = await handleOperatorRequest(operatorRequest(path), store, operatorToken);
        expect(response.status).toBe(200);
        const page = (await response.json()) as { leads: { lead_key: string }[]; nextCursor: string | null };
        pageSizes.push(page.leads.length);
        for (const lead of page.leads) {
          expect(seen.has(lead.lead_key)).toBe(false);
          seen.add(lead.lead_key);
        }
        cursor = page.nextCursor;
        firstCursor ??= cursor;
      } while (cursor);
      expect(pageSizes).toEqual([60, 60, 60, 25]);
      expect(seen.size).toBe(205);
      const plan = store.sqlite
        .prepare(
          `EXPLAIN QUERY PLAN SELECT lead_key FROM source_leads
        WHERE status=? AND (first_seen_at,lead_key)>(?,?)
        ORDER BY first_seen_at,lead_key LIMIT ?`
        )
        .all("pending_review", "2026-09-28T00:00:00.000Z", "0".repeat(64), 61) as { detail: string }[];
      expect(plan.some((step) => step.detail.includes("idx_source_leads_page"))).toBe(true);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/leads?status=rejected&cursor=${firstCursor}`),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/leads?cursor=not-a-valid-cursor"),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);
      const replay = await handleOperatorRequest(
        operatorRequest(`/v1/operator/leads?status=pending_review&limit=60&cursor=${firstCursor}`),
        store,
        operatorToken
      );
      expect(replay.status).toBe(200);
      const replayPage = (await replay.json()) as { leads: { lead_key: string }[]; nextCursor: string | null };
      expect(replayPage.leads).toHaveLength(60);
      expect(replayPage.leads.map((lead) => lead.lead_key)).toEqual(
        Array.from({ length: 60 }, (_, index) => (index + 60).toString(16).padStart(64, "0"))
      );
      expect(replayPage.nextCursor).not.toBeNull();
    } finally {
      store.close();
    }
  });

  test("paginates the complete auto-queue rule inventory", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const insert = store.sqlite.prepare(`INSERT INTO lead_autoqueue_rules
        (rule_id,lead_kind,origin,path_scope,min_delay_ms,expires_at,review_reference,
          reason,created_at,disabled_at) VALUES (?,'vpm_listing','https://example.org',?,1000,?,
          'fixture-review','Fixture rule',?,NULL)`);
      for (let index = 0; index < 105; index++) {
        insert.run(
          crypto.randomUUID(),
          `/listing-${index}.json`,
          "2027-09-28T00:00:00.000Z",
          "2026-09-28T00:00:00.000Z"
        );
      }
      const seen = new Set<string>();
      const sizes: number[] = [];
      let cursor: string | null = null;
      do {
        const path = `/v1/operator/autoqueue-rules?limit=40${cursor ? `&cursor=${cursor}` : ""}`;
        const response = await handleOperatorRequest(operatorRequest(path), store, operatorToken);
        expect(response.status).toBe(200);
        const page = (await response.json()) as { rules: { ruleId: string }[]; nextCursor: string | null };
        sizes.push(page.rules.length);
        for (const rule of page.rules) {
          expect(seen.has(rule.ruleId)).toBe(false);
          seen.add(rule.ruleId);
        }
        cursor = page.nextCursor;
      } while (cursor);
      expect(sizes).toEqual([40, 40, 25]);
      expect(seen.size).toBe(105);
      expect(
        (await handleOperatorRequest(operatorRequest("/v1/operator/autoqueue-rules?cursor=bad"), store, operatorToken))
          .status
      ).toBe(400);
      const plan = store.sqlite
        .prepare(
          `EXPLAIN QUERY PLAN SELECT rule_id FROM lead_autoqueue_rules
        WHERE (created_at,rule_id)<(?,?) ORDER BY created_at DESC,rule_id DESC LIMIT ?`
        )
        .all("2026-09-28T00:00:00.000Z", "00000000-0000-4000-8000-000000000000", 41) as { detail: string }[];
      expect(plan.some((step) => step.detail.includes("idx_lead_autoqueue_rules_page"))).toBe(true);
    } finally {
      store.close();
    }
  });

  test("malformed lead approval payloads fail before changing leads or queue state", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const path = `/v1/operator/leads/${"0".repeat(64)}/approve`;
      const invalid = { schemaVersion: 2, reason: "No source review" };
      const rejected = await handleOperatorRequest(operatorRequest(path, "POST", invalid), store, operatorToken);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({
        schemaVersion: 1,
        code: "invalid_payload",
        error: "Approval body is invalid"
      });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM source_leads").get()).toEqual({ count: 0 });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 0 });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM operator_actions").get()).toEqual({ count: 0 });
    } finally {
      store.close();
    }
  });

  test("reviews a node-discovered listing through versioned requests with an audit record", async () => {
    const store = await createInitializedD1Coordinator();
    const nodeToken = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", nodeToken))!;
    await seedApprovedFixtureJob(store, "https://example.org/source.json", "vpm", 0);
    await store.recordRobotsSnapshot("https://example.org", 404);
    try {
      const claim = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected recipe lease");
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: "operator-api-discovery-result",
          outcome: {
            kind: "discovery",
            leads: [
              { kind: "vpm_listing", url: "https://example.org/index.json" },
              {
                kind: "github_repository",
                url: "https://github.com/example/tool",
                discoveredFromItemKey: "recipe-tool"
              }
            ]
          }
        },
        principal
      );
      const list = await handleOperatorRequest(operatorRequest("/v1/operator/leads"), store, operatorToken);
      expect(list.status).toBe(200);
      const pending = (await list.json()) as {
        schemaVersion: number;
        leads: { lead_key: string; kind: string; discovered_from_item_key: string | null }[];
      };
      expect(pending.schemaVersion).toBe(1);
      expect(pending.leads).toHaveLength(2);
      expect(pending.leads.find((lead) => lead.kind === "github_repository")?.discovered_from_item_key).toBe(
        "recipe-tool"
      );
      expect(pending.leads.find((lead) => lead.kind === "vpm_listing")?.discovered_from_item_key).toBeNull();
      const listingKey = pending.leads.find((lead) => lead.kind === "vpm_listing")!.lead_key;
      const githubKey = pending.leads.find((lead) => lead.kind === "github_repository")!.lead_key;
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST", {
              schemaVersion: 2,
              reason: "Reviewed source"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);
      const approve = await handleOperatorRequest(
        operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST", {
          schemaVersion: 1,
          reason: "Reviewed listing host and path",
          minDelayMs: 1200
        }),
        store,
        operatorToken
      );
      expect(approve.status).toBe(200);
      expect(((await approve.json()) as { status: string }).status).toBe("approved");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST", {
              schemaVersion: 1,
              reason: "Repeated review"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(200);
      const reject = await handleOperatorRequest(
        operatorRequest(`/v1/operator/leads/${githubKey}/reject`, "POST", {
          schemaVersion: 1,
          reason: "No approved job mapping"
        }),
        store,
        operatorToken
      );
      expect(reject.status).toBe(200);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect(
        (store.sqlite.prepare("SELECT action FROM operator_actions ORDER BY action_id").all() as { action: string }[]).map(
          (row) => row.action
        )
      ).toEqual(["approve_lead", "reject_lead"]);
      expect(
        (
          (await handleOperatorRequest(
            operatorRequest("/v1/operator/leads?status=pending_review"),
            store,
            operatorToken
          ).then((response) => response.json())) as { leads: unknown[] }
        ).leads
      ).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("a reviewed exact-scope rule queues matching VPM leads and disabling it revokes their leases", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const nodeToken = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", nodeToken))!;
    await seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    await approveFixtureSource(store, "https://reviewed.example.org/index.json", "vpm", "discovery");
    await store.recordRobotsSnapshot("https://reviewed.example.org", 404);
    try {
      const create = await handleOperatorRequest(
        operatorRequest("/v1/operator/autoqueue-rules", "POST", {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: "https://reviewed.example.org",
          pathScope: "/index.json",
          minDelayMs: 1200,
          expiresAt: "2026-10-01T00:00:00.000Z",
          reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
          reason: "Reviewed this listing endpoint"
        }),
        store,
        operatorToken
      );
      expect(create.status).toBe(201);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/autoqueue-rules", "POST", {
              schemaVersion: 1,
              leadKind: "vpm_listing",
              origin: "https://reviewed.example.org",
              pathScope: "/private/../index.json",
              minDelayMs: 1200,
              expiresAt: "2026-10-01T00:00:00.000Z",
              reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
              reason: "Invalid traversal scope"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);
      const rule = ((await create.json()) as { rule: { ruleId: string } }).rule;
      expect(
        (
          (await handleOperatorRequest(operatorRequest("/v1/operator/autoqueue-rules"), store, operatorToken).then(
            (response) => response.json()
          )) as { rules: unknown[] }
        ).rules
      ).toHaveLength(1);
      const recipe = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(recipe.status).toBe("leased");
      if (recipe.status !== "leased") throw new Error("Expected recipe lease");
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node",
          jobId: recipe.job.jobId,
          leaseId: recipe.job.leaseId,
          idempotencyKey: "reviewed-autoqueue-discovery",
          outcome: {
            kind: "discovery",
            leads: [
              { kind: "vpm_listing", url: "https://reviewed.example.org/index.json" },
              { kind: "vpm_listing", url: "https://reviewed.example.org/index-v2.json" },
              { kind: "vpm_listing", url: "https://reviewed.example.org/index.json?variant=other" },
              { kind: "vpm_listing", url: "https://unknown.example.org/index.json" },
              { kind: "github_repository", url: "https://github.com/example/tool" }
            ]
          }
        },
        principal
      );
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect(
        (store.sqlite.prepare("SELECT count(*) AS n FROM source_leads WHERE status='approved'").get() as { n: number })
          .n
      ).toBe(1);
      expect(
        (
          store.sqlite
            .prepare("SELECT count(*) AS n FROM source_leads WHERE status='pending_review'")
            .get() as { n: number }
        ).n
      ).toBe(4);
      expect(
        (
          store.sqlite
            .prepare("SELECT source_rule_id FROM crawl_jobs WHERE url=?")
            .get("https://reviewed.example.org/index.json") as { source_rule_id: string }
        ).source_rule_id
      ).toBe(rule.ruleId);
      now += 1200;
      const listing = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(listing.status).toBe("leased");
      if (listing.status !== "leased") throw new Error("Expected listing lease");
      const disable = await handleOperatorRequest(
        operatorRequest(`/v1/operator/autoqueue-rules/${rule.ruleId}/disable`, "POST", {
          schemaVersion: 1,
          reason: "Access review withdrawn"
        }),
        store,
        operatorToken
      );
      expect(disable.status).toBe(200);
      expect(
        (
          await handleOperatorRequest(
            operatorRequest(`/v1/operator/autoqueue-rules/${rule.ruleId}/disable`, "POST", {
              schemaVersion: 1,
              reason: "Repeated disable"
            }),
            store,
            operatorToken
          )
        ).status
      ).toBe(200);
      await expect(
        store.heartbeat(
          {
            schemaVersion: 1,
            nodeId: "node",
            capabilities: ["vpm"],
            state: "fetching",
            activeJobId: listing.job.jobId,
            activeLeaseId: listing.job.leaseId
          },
          principal
        )
      ).rejects.toThrow();
      await expect(
        store.submit(
          {
            schemaVersion: 1,
            nodeId: "node",
            jobId: listing.job.jobId,
            leaseId: listing.job.leaseId,
            idempotencyKey: "disabled-rule-stale-result",
            outcome: { kind: "unchanged" }
          },
          principal
        )
      ).rejects.toThrow("rule");
      expect(
        (
          store.sqlite
            .prepare("SELECT action FROM operator_rule_actions ORDER BY action_id")
            .all() as { action: string }[]
        ).map((row) => row.action)
      ).toEqual(["create", "disable"]);
    } finally {
      store.close();
    }
  });

  test("an expired auto-queue rule withholds its queued job and robots refresh", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", token))!;
    await seedApprovedFixtureJob(store, "https://expiry.example.org/source.json", "vpm", 0);
    await approveFixtureSource(store, "https://expiry.example.org/index.json", "vpm", "discovery");
    await store.recordRobotsSnapshot("https://expiry.example.org", 404);
    try {
      await store.createAutoQueueRule(
        {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: "https://expiry.example.org",
          pathScope: "/index.json",
          minDelayMs: 1000,
          expiresAt: "2026-09-28T01:00:00.000Z",
          reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
          reason: "One-hour fixture review"
        },
        "operator-api"
      );
      const recipe = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(recipe.status).toBe("leased");
      if (recipe.status !== "leased") throw new Error("Expected recipe lease");
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node",
          jobId: recipe.job.jobId,
          leaseId: recipe.job.leaseId,
          idempotencyKey: "expiry-recipe-result",
          outcome: {
            kind: "discovery",
            leads: [{ kind: "vpm_listing", url: "https://expiry.example.org/index.json" }]
          }
        },
        principal
      );
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      now += 60 * 60 * 1000 + 1;
      expect((await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal)).status).toBe(
        "empty"
      );
      expect(await store.claimDueRobotsRefresh()).toBeNull();
    } finally {
      store.close();
    }
  });

  test("a new rule does not silently promote old leads, and a rejected lead stays rejected on rediscovery", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", token))!;
    await seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "node", capabilities: ["vpm" as const] };
    const leads = [
      { kind: "vpm_listing" as const, url: "https://reviewed.example.org/index.json" },
      { kind: "vpm_listing" as const, url: "https://reviewed.example.org/rejected.json" }
    ];
    const discover = async (key: string) => {
      await store.recordRobotsSnapshot("https://reviewed.example.org", 404);
      const claim = await store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected recipe lease");
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: key,
          outcome: { kind: "discovery", leads }
        },
        principal
      );
    };
    try {
      await discover("first-discovery-before-rule");
      const page = await store.listLeadsPage("pending_review", 10, null);
      const rejected = page.leads.find((lead) => lead.target_url.endsWith("/rejected.json"))!.lead_key;
      await store.rejectLead(rejected, "operator-api", "Reviewed and rejected");
      await store.createAutoQueueRule(
        {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: "https://reviewed.example.org",
          pathScope: "/",
          minDelayMs: 1000,
          expiresAt: "2026-10-01T00:00:00.000Z",
          reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
          reason: "Reviewed this host for VPM listings"
        },
        "operator-api"
      );
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(1);
      now += 24 * 60 * 60 * 1000 + 1;
      await discover("rediscovery-after-rule");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect(
        (store.sqlite.prepare("SELECT status FROM source_leads WHERE lead_key=?").get(rejected) as { status: string })
          .status
      ).toBe("rejected");
      expect(
        (store.sqlite.prepare("SELECT count(*) AS n FROM source_leads WHERE status='approved'").get() as { n: number })
          .n
      ).toBe(1);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/takedowns lists recorded creator opt-outs and supports requesterType filter and pagination", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      const t1 = await store.submitDelistRequest({
        targetUrl: "https://booth.pm/en/items/111",
        reason: "Creator bio opt-out",
        requesterType: "unauthenticated_creator",
        proofKind: "storefront_bio_token",
        proofValue: "proof-bio-111"
      });
      const t2 = await store.submitDelistRequest({
        canonicalId: "canonical-pkg-222",
        reason: "User requested removal",
        requesterType: "user",
        requesterId: "user-dan"
      });
      const t3 = await store.submitDelistRequest({
        targetUrl: "https://example.org/bad-pkg",
        reason: "Malware removal",
        requesterType: "admin_operator"
      });

      const resAll = await handleOperatorRequest(operatorRequest("/v1/operator/takedowns"), store, operatorToken);
      expect(resAll.status).toBe(200);
      const dataAll = (await resAll.json()) as any;
      expect(dataAll.schemaVersion).toBe(1);
      expect(dataAll.records.length).toBe(3);
      const rec1 = dataAll.records.find((r: any) => r.takedownId === t1.takedownId);
      const rec2 = dataAll.records.find((r: any) => r.takedownId === t2.takedownId);
      const rec3 = dataAll.records.find((r: any) => r.takedownId === t3.takedownId);
      expect(rec1.reviewStatus).toBe("pending");
      expect(rec2.reviewStatus).toBe("accepted");
      expect(rec3.reviewStatus).toBe("accepted");

      expect(() => TakedownListResponseSchema.parse(dataAll)).not.toThrow();

      const resFiltered = await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?requesterType=unauthenticated_creator"),
        store,
        operatorToken
      );
      expect(resFiltered.status).toBe(200);
      const dataFiltered = (await resFiltered.json()) as any;
      expect(dataFiltered.records.length).toBe(1);
      expect(dataFiltered.records[0].takedownId).toBe(t1.takedownId);

      const resPage1 = await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?limit=2"),
        store,
        operatorToken
      );
      expect(resPage1.status).toBe(200);
      const dataPage1 = (await resPage1.json()) as any;
      expect(dataPage1.records.length).toBe(2);
      expect(dataPage1.nextCursor).toBeTruthy();

      const resPage2 = await handleOperatorRequest(
        operatorRequest(`/v1/operator/takedowns?limit=2&cursor=${dataPage1.nextCursor}`),
        store,
        operatorToken
      );
      expect(resPage2.status).toBe(200);
      const dataPage2 = (await resPage2.json()) as any;
      expect(dataPage2.records.length).toBe(1);
      expect(dataPage2.nextCursor).toBeNull();

      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/takedowns?requesterType=invalid_type"),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);

      expect(
        (await handleOperatorRequest(operatorRequest("/v1/operator/takedowns?limit=0"), store, operatorToken)).status
      ).toBe(400);

      expect(
        (
          await handleOperatorRequest(
            operatorRequest("/v1/operator/takedowns?cursor=invalid_base64!"),
            store,
            operatorToken
          )
        ).status
      ).toBe(400);
    } finally {
      store.close();
    }
  });

  test("POST /v1/operator/takedowns/{id}/verify allows operator to accept or reject creator proof and restore lifecycle on rejection", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
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

      const pkgRowDelisted = store.sqlite
        .prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?")
        .get(canonicalId) as any;
      expect(pkgRowDelisted.lifecycle).toBe("delisted");
      const suppressedRow = store.sqlite
        .prepare("SELECT reason FROM suppressed_urls WHERE url = ?")
        .get(storefrontUrl) as any;
      expect(suppressedRow).toBeTruthy();

      const reqNoAuth = operatorRequest(
        `/v1/operator/takedowns/${delist.takedownId}/verify`,
        "POST",
        {
          schemaVersion: 1,
          verdict: "rejected"
        },
        ""
      );
      expect((await handleOperatorRequest(reqNoAuth, store, operatorToken)).status).toBe(401);

      const reqBadBody = operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "maybe"
      });
      expect((await handleOperatorRequest(reqBadBody, store, operatorToken)).status).toBe(400);

      const reqNotFound = operatorRequest(`/v1/operator/takedowns/${crypto.randomUUID()}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected"
      });
      expect((await handleOperatorRequest(reqNotFound, store, operatorToken)).status).toBe(404);

      const reqReject = operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected",
        notes: "Bio token did not match storefront profile"
      });
      const resReject = await handleOperatorRequest(reqReject, store, operatorToken);
      expect(resReject.status).toBe(200);
      const dataReject = (await resReject.json()) as any;
      expect(dataReject.status).toBe("rejected");
      expect(dataReject.takedownId).toBe(delist.takedownId);
      expect(() => VerifyTakedownResponseSchema.parse(dataReject)).not.toThrow();

      const takedownRow = store.sqlite
        .prepare("SELECT review_status, review_notes FROM creator_opt_outs WHERE takedown_id = ?")
        .get(delist.takedownId) as any;
      expect(takedownRow.review_status).toBe("rejected");
      expect(takedownRow.review_notes).toBe("Bio token did not match storefront profile");

      const pkgRowRestored = store.sqlite
        .prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?")
        .get(canonicalId) as any;
      expect(pkgRowRestored.lifecycle).toBe("active");

      const suppressedAfter = store.sqlite
        .prepare("SELECT reason FROM suppressed_urls WHERE url = ?")
        .get(storefrontUrl);
      expect(suppressedAfter).toBeNull();

      const canonicalId2 = "pkg-legit-target";
      store.sqlite
        .prepare(
          `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
        VALUES (?, 'tools', 'editor_tool', 'active', 'Legit Target', 'com.legit.pkg', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`
        )
        .run(canonicalId2);

      const delist2 = await store.submitDelistRequest({
        canonicalId: canonicalId2,
        reason: "Valid creator withdrawal",
        requesterType: "unauthenticated_creator",
        proofKind: "dns_txt",
        proofValue: "valid-txt-record"
      });

      const reqAccept = operatorRequest(`/v1/operator/takedowns/${delist2.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "accepted",
        notes: "DNS TXT record verified"
      });
      const resAccept = await handleOperatorRequest(reqAccept, store, operatorToken);
      expect(resAccept.status).toBe(200);
      const dataAccept = (await resAccept.json()) as any;
      expect(dataAccept.status).toBe("accepted");

      const takedownRow2 = store.sqlite
        .prepare("SELECT review_status, review_notes FROM creator_opt_outs WHERE takedown_id = ?")
        .get(delist2.takedownId) as any;
      expect(takedownRow2.review_status).toBe("accepted");
      expect(takedownRow2.review_notes).toBe("DNS TXT record verified");

      const pkgRow2 = store.sqlite
        .prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?")
        .get(canonicalId2) as any;
      expect(pkgRow2.lifecycle).toBe("delisted");

      const tombstone1 = store.sqlite
        .prepare("SELECT reason FROM catalog_tombstones WHERE canonical_id = ?")
        .get(canonicalId);
      expect(tombstone1).toBeNull();
      const ticketPayload1 = JSON.parse(
        (store.sqlite.prepare("SELECT payload_json FROM catalog_tickets WHERE ticket_id = ?").get(delist.takedownId) as any)
          .payload_json
      );
      expect(ticketPayload1.verifiedBy).toBe("operator-api");
      expect(typeof ticketPayload1.verifiedAt).toBe("string");

      await expect(
        store.submitDelistRequest({
          canonicalId: canonicalId2,
          reason: "Missing proof",
          requesterType: "unauthenticated_creator"
        })
      ).rejects.toThrow("Ownership proof is required");

      const priorSuppressedUrl = "https://booth.pm/en/items/999999";
      store.sqlite
        .prepare("INSERT INTO suppressed_urls (url, reason, suppressed_at) VALUES (?, ?, '2026-10-01T00:00:00Z')")
        .run(priorSuppressedUrl, "Manual malware suppression");
      const falseNoticeOnDelisted = await store.submitDelistRequest({
        canonicalId: canonicalId2,
        targetUrl: priorSuppressedUrl,
        reason: "Unverified duplicate notice",
        requesterType: "unauthenticated_creator",
        proofKind: "storefront_bio_token",
        proofValue: "bad-bio-999"
      });
      const rejectDuplicate = await handleOperatorRequest(
        operatorRequest(`/v1/operator/takedowns/${falseNoticeOnDelisted.takedownId}/verify`, "POST", {
          schemaVersion: 1,
          verdict: "rejected",
          notes: "Preserve prior delisted and suppressed causes"
        }),
        store,
        operatorToken
      );
      expect(rejectDuplicate.status).toBe(200);
      expect(
        (store.sqlite.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?").get(canonicalId2) as any)
          .lifecycle
      ).toBe("delisted");
      expect(
        (store.sqlite.prepare("SELECT reason FROM suppressed_urls WHERE url = ?").get(priorSuppressedUrl) as any).reason
      ).toBe("Manual malware suppression");
    } finally {
      store.close();
    }
  });

  test("operator audits, paginates, and verifies delegated creator claims", async () => {
    let fixtureNow = 1700000000000;
    const store = await createInitializedD1Coordinator(":memory:", () => fixtureNow);
    try {
      const app = await store.registerApp({ schemaVersion: 1, appName: "Claims Audit App" });

      const nowSec = 1700000000;
      const claim1 = await store.recordCreatorClaimIntake(app.appId, {
        schemaVersion: 1,
        attestation: {
          appId: app.appId,
          action: "creator_ownership_claim",
          frontUrl: "https://creator.booth.pm/items/12345",
          creatorId: "creator_abc",
          challengeToken: "chal_token_1_123456",
          expiresAt: nowSec + 3600,
          nonce: "nonce_claim_1_123456"
        },
        signature: "sig_claim_1_123456",
        reason: "Primary ownership claim"
      });

      fixtureNow = 1700000001000;
      const claim2 = await store.recordCreatorClaimIntake(app.appId, {
        schemaVersion: 1,
        attestation: {
          appId: app.appId,
          action: "creator_ownership_claim",
          frontUrl: "https://creator2.booth.pm/items/67890",
          creatorId: "creator_def",
          challengeToken: "chal_token_2_123456",
          expiresAt: nowSec + 3600,
          nonce: "nonce_claim_2_123456"
        },
        signature: "sig_claim_2_123456",
        reason: "Secondary ownership claim"
      });

      const listReq = operatorRequest("/v1/operator/claims");
      const listRes = await handleOperatorRequest(listReq, store, operatorToken);
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(() => DelegatedClaimListResponseSchema.parse(listData)).not.toThrow();
      expect(listData.records.length).toBe(2);
      expect(listData.records[0].claimId).toBe(claim2.claimId);
      expect(listData.records[1].claimId).toBe(claim1.claimId);

      const page1Req = operatorRequest("/v1/operator/claims?limit=1");
      const page1Res = await handleOperatorRequest(page1Req, store, operatorToken);
      expect(page1Res.status).toBe(200);
      const page1Data = (await page1Res.json()) as any;
      expect(page1Data.records.length).toBe(1);
      expect(page1Data.nextCursor).toBeDefined();

      const page2Req = operatorRequest(`/v1/operator/claims?limit=1&cursor=${page1Data.nextCursor}`);
      const page2Res = await handleOperatorRequest(page2Req, store, operatorToken);
      expect(page2Res.status).toBe(200);
      const page2Data = (await page2Res.json()) as any;
      expect(page2Data.records.length).toBe(1);
      expect(page2Data.records[0].claimId).toBe(claim1.claimId);

      const rejectReq = operatorRequest(`/v1/operator/claims/${claim1.claimId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected",
        notes: "Unverified storefront account"
      });
      const rejectRes = await handleOperatorRequest(rejectReq, store, operatorToken);
      expect(rejectRes.status).toBe(200);
      const rejectData = (await rejectRes.json()) as any;
      expect(() => VerifyDelegatedClaimResponseSchema.parse(rejectData)).not.toThrow();
      expect(rejectData.claimId).toBe(claim1.claimId);
      expect(rejectData.status).toBe("rejected");

      const row1 = store.sqlite
        .prepare("SELECT review_status, review_notes FROM delegated_creator_claims WHERE claim_id = ?")
        .get(claim1.claimId) as any;
      expect(row1.review_status).toBe("rejected");
      expect(row1.review_notes).toBe("Unverified storefront account");

      const acceptReq = operatorRequest(`/v1/operator/claims/${claim2.claimId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "accepted",
        notes: "Verified signature matches registered creator"
      });
      const acceptRes = await handleOperatorRequest(acceptReq, store, operatorToken);
      expect(acceptRes.status).toBe(200);
      const acceptData = (await acceptRes.json()) as any;
      expect(acceptData.claimId).toBe(claim2.claimId);
      expect(acceptData.status).toBe("accepted");

      const row2 = store.sqlite
        .prepare("SELECT review_status, review_notes FROM delegated_creator_claims WHERE claim_id = ?")
        .get(claim2.claimId) as any;
      expect(row2.review_status).toBe("accepted");
      expect(row2.review_notes).toBe("Verified signature matches registered creator");

      const filterReq = operatorRequest("/v1/operator/claims?reviewStatus=accepted");
      const filterRes = await handleOperatorRequest(filterReq, store, operatorToken);
      expect(filterRes.status).toBe(200);
      const filterData = (await filterRes.json()) as any;
      expect(filterData.records.length).toBe(1);
      expect(filterData.records[0].claimId).toBe(claim2.claimId);

      const unknownReq = operatorRequest("/v1/operator/claims/00000000-0000-4000-8000-000000000000/verify", "POST", {
        schemaVersion: 1,
        verdict: "accepted"
      });
      const unknownRes = await handleOperatorRequest(unknownReq, store, operatorToken);
      expect(unknownRes.status).toBe(404);
    } finally {
      store.close();
    }
  });

  test("operator audits, paginates, and mutates application delegation authority", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const app1 = await store.registerApp({ schemaVersion: 1, appName: "App One", contactEmail: "one@example.com" });
      const app2 = await store.registerApp({ schemaVersion: 1, appName: "App Two" });

      const listReq = operatorRequest("/v1/operator/apps");
      const listRes = await handleOperatorRequest(listReq, store, operatorToken);
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(() => OperatorAppListResponseSchema.parse(listData)).not.toThrow();
      expect(listData.apps.length).toBe(2);
      expect(listData.apps.every((a: any) => a.delegationAllowed === false)).toBe(true);
      expect(listData.apps.every((a: any) => !a.permissions.includes("claims:delegate"))).toBe(true);

      const page1Req = operatorRequest("/v1/operator/apps?limit=1");
      const page1Res = await handleOperatorRequest(page1Req, store, operatorToken);
      expect(page1Res.status).toBe(200);
      const page1Data = (await page1Res.json()) as any;
      expect(page1Data.apps.length).toBe(1);
      expect(page1Data.nextCursor).toBeTruthy();

      const page2Req = operatorRequest(`/v1/operator/apps?limit=1&cursor=${page1Data.nextCursor}`);
      const page2Res = await handleOperatorRequest(page2Req, store, operatorToken);
      expect(page2Res.status).toBe(200);
      const page2Data = (await page2Res.json()) as any;
      expect(page2Data.apps.length).toBe(1);
      expect(page2Data.apps[0].appId).not.toBe(page1Data.apps[0].appId);

      const grantReq = operatorRequest(`/v1/operator/apps/${app1.appId}/delegation`, "POST", {
        schemaVersion: 1,
        delegationAllowed: true,
        reason: "Verified partner application"
      });
      const grantRes = await handleOperatorRequest(grantReq, store, operatorToken);
      expect(grantRes.status).toBe(200);
      const grantData = (await grantRes.json()) as any;
      expect(() => SetAppDelegationResponseSchema.parse(grantData)).not.toThrow();
      expect(grantData.appId).toBe(app1.appId);
      expect(grantData.delegationAllowed).toBe(true);
      expect(grantData.permissions).toContain("claims:delegate");
      expect(grantData.permissions).toContain("takedowns:submit");

      const row1 = store.sqlite
        .prepare("SELECT permissions_json FROM registered_apps WHERE app_id = ?")
        .get(app1.appId) as any;
      const perms1 = JSON.parse(row1.permissions_json);
      expect(perms1).toContain("claims:delegate");
      expect(perms1).toContain("takedowns:submit");

      const auditLogs = await store.listAuditLogs({ entityType: "app", entityId: app1.appId });
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe("grant_delegation");
      expect(auditLogs[0].reason).toBe("Verified partner application");

      const updatedListRes = await handleOperatorRequest(operatorRequest("/v1/operator/apps"), store, operatorToken);
      const updatedListData = (await updatedListRes.json()) as any;
      const updatedApp1 = updatedListData.apps.find((a: any) => a.appId === app1.appId);
      const updatedApp2 = updatedListData.apps.find((a: any) => a.appId === app2.appId);
      expect(updatedApp1.delegationAllowed).toBe(true);
      expect(updatedApp1.permissions).toContain("claims:delegate");
      expect(updatedApp2.delegationAllowed).toBe(false);
      expect(updatedApp2.permissions).not.toContain("claims:delegate");

      const revokeReq = operatorRequest(`/v1/operator/apps/${app1.appId}/delegation`, "POST", {
        schemaVersion: 1,
        delegationAllowed: false,
        reason: "Partner status revoked"
      });
      const revokeRes = await handleOperatorRequest(revokeReq, store, operatorToken);
      expect(revokeRes.status).toBe(200);
      const revokeData = (await revokeRes.json()) as any;
      expect(revokeData.delegationAllowed).toBe(false);
      expect(revokeData.permissions).not.toContain("claims:delegate");
      expect(revokeData.permissions).not.toContain("takedowns:submit");

      const unknownReq = operatorRequest(
        "/v1/operator/apps/00000000-0000-4000-8000-000000000000/delegation",
        "POST",
        {
          schemaVersion: 1,
          delegationAllowed: true
        }
      );
      const unknownRes = await handleOperatorRequest(unknownReq, store, operatorToken);
      expect(unknownRes.status).toBe(404);
    } finally {
      store.close();
    }
  });

  test("allows operator to list candidates and review intensive-use apps (R54-C38A2)", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const user = await store.issueUserToken("operator-test-user");
      const app1 = await store.registerApp({ schemaVersion: 1, appName: "Candidate App 1" }, user.userId);
      const app2 = await store.registerApp({ schemaVersion: 1, appName: "Candidate App 2" }, user.userId);

      for (let i = 0; i < 50; i++) {
        await store.recordAppActivity(app1.appId);
      }

      const pendingRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/apps?candidateStatus=review_pending"),
        store,
        operatorToken
      );
      expect(pendingRes.status).toBe(200);
      const pendingData = (await pendingRes.json()) as any;
      expect(pendingData.apps).toHaveLength(1);
      expect(pendingData.apps[0].appId).toBe(app1.appId);
      expect(pendingData.apps[0].candidateStatus).toBe("review_pending");
      expect(pendingData.apps[0].candidateFlags).toContain("intensive_usage");

      const noneRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/apps?candidateStatus=none"),
        store,
        operatorToken
      );
      expect(noneRes.status).toBe(200);
      const noneData = (await noneRes.json()) as any;
      expect(noneData.apps.some((a: any) => a.appId === app2.appId)).toBe(true);

      const reviewReq = operatorRequest(`/v1/operator/apps/${app1.appId}/candidate-review`, "POST", {
        schemaVersion: 1,
        candidateStatus: "trusted",
        grantDelegation: true,
        notes: "Approved high-throughput partner application"
      });
      const reviewRes = await handleOperatorRequest(reviewReq, store, operatorToken);
      expect(reviewRes.status).toBe(200);
      const reviewData = (await reviewRes.json()) as any;
      expect(() => ReviewAppCandidateResponseSchema.parse(reviewData)).not.toThrow();
      expect(reviewData.appId).toBe(app1.appId);
      expect(reviewData.candidateStatus).toBe("trusted");
      expect(reviewData.delegationAllowed).toBe(true);
      expect(reviewData.permissions).toContain("claims:delegate");

      const row = store.sqlite
        .prepare("SELECT candidate_status, permissions_json FROM registered_apps WHERE app_id = ?")
        .get(app1.appId) as any;
      expect(row.candidate_status).toBe("trusted");
      expect(JSON.parse(row.permissions_json)).toContain("claims:delegate");

      const downgradeReq = operatorRequest(`/v1/operator/apps/${app1.appId}/candidate-review`, "POST", {
        schemaVersion: 1,
        candidateStatus: "reviewed",
        grantDelegation: false
      });
      const downgradeRes = await handleOperatorRequest(downgradeReq, store, operatorToken);
      expect(downgradeRes.status).toBe(200);
      const downgradeData = (await downgradeRes.json()) as any;
      expect(downgradeData.candidateStatus).toBe("reviewed");
      expect(downgradeData.delegationAllowed).toBe(false);
      expect(downgradeData.permissions).not.toContain("claims:delegate");
      expect(downgradeData.permissions).not.toContain("takedowns:submit");

      const unknownReq = operatorRequest(
        "/v1/operator/apps/00000000-0000-4000-8000-000000000000/candidate-review",
        "POST",
        {
          schemaVersion: 1,
          candidateStatus: "trusted"
        }
      );
      const unknownRes = await handleOperatorRequest(unknownReq, store, operatorToken);
      expect(unknownRes.status).toBe(404);

      const invalidReq = operatorRequest(`/v1/operator/apps/${app1.appId}/candidate-review`, "POST", {
        schemaVersion: 1,
        candidateStatus: "invalid_status"
      });
      const invalidRes = await handleOperatorRequest(invalidReq, store, operatorToken);
      expect(invalidRes.status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("durable claim-time retry promotes pending leads after transient post-commit promotion failure (R47-C26)", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("node", ["vpm"]);
    const principal = (await store.authenticate("node", token))!;
    await seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    await approveFixtureSource(store, "https://reviewed.example.org/index.json", "vpm", "discovery");
    await store.recordRobotsSnapshot("https://reviewed.example.org", 404);
    try {
      const rule = await store.createAutoQueueRule(
        {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: "https://reviewed.example.org",
          pathScope: "/index.json",
          minDelayMs: 1000,
          expiresAt: "2026-10-01T00:00:00.000Z",
          reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
          reason: "Reviewed this host for VPM listings"
        },
        "operator-api"
      );
      const claim1 = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim1.status).toBe("leased");
      if (claim1.status !== "leased") throw new Error("Expected recipe lease");

      store.sqlite.run(
        "CREATE TRIGGER reject_auto_promotion BEFORE INSERT ON crawl_jobs WHEN NEW.source_rule_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'transient promotion failure'); END;"
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
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n).toBe(1);
      expect(
        (store.sqlite.prepare("SELECT status FROM source_leads").get() as { status: string }).status
      ).toBe("pending_review");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(1);
      const failAudits = await store.listAuditLogs({ entityType: "rule", entityId: rule.ruleId });
      expect(failAudits.some((a) => a.action === "promotion_failed")).toBe(true);

      now += 1500;
      const claim2 = await store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim2.status).toBe("leased");
      if (claim2.status !== "leased") throw new Error("Expected promoted listing lease");
      expect(claim2.job.url).toBe("https://reviewed.example.org/index.json");
      expect(
        (store.sqlite.prepare("SELECT status FROM source_leads").get() as { status: string }).status
      ).toBe("approved");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect(await store.retryPendingAutoPromotions()).toBe(0);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/nodes lists active, revoked, heartbeat, and no-heartbeat nodes with mixed-case cursor pagination and zero token secrets", async () => {
    let now = Date.parse("2026-10-05T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const emptyRes = await handleOperatorRequest(operatorRequest("/v1/operator/nodes"), store, operatorToken);
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.headers.get("X-RateLimit-Limit")).toBeDefined();
      const emptyPayload = OperatorNodeListResponseSchema.parse(await emptyRes.json());
      expect(emptyPayload).toEqual({ schemaVersion: 1, nodes: [], nextCursor: null });

      const tokAlpha = await store.createNodeCredential("Node-Alpha", ["vpm"]);
      const tokGamma = await store.createNodeCredential("Node-Gamma", ["booth", "github"]);
      const tokZeta = await store.createNodeCredential("Node-Zeta", ["itch"]);
      const tokBeta = await store.createNodeCredential("node-beta", ["vpm", "curated"]);
      const tokDelta = await store.createNodeCredential("node-delta", ["shopify"]);

      const principalAlpha = (await store.authenticate("Node-Alpha", tokAlpha))!;
      const principalGamma = (await store.authenticate("Node-Gamma", tokGamma))!;
      const principalZeta = (await store.authenticate("Node-Zeta", tokZeta))!;

      const activeProfile = await store.createSourceAccessProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          origin: "https://active-node.example",
          pathScope: "/index.json",
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
      const leaseSecret = "lease-secret-node-alpha";
      store.sqlite
        .prepare(
          `INSERT INTO crawl_jobs
        (job_id, platform, url, origin, state, next_fetch_at, claimed_by, lease_id, lease_expires_at, created_at, job_purpose, lease_profile_id)
        VALUES (?, 'vpm', 'https://active-node.example/index.json', 'https://active-node.example', 'leased', ?, 'Node-Alpha', ?, ?, ?, 'metadata', ?)`
        )
        .run("job-active-1", jobCreated, leaseSecret, leaseExpires, jobCreated, activeProfile.profileId);

      now += 1000;
      await store.heartbeat(
        {
          schemaVersion: 1,
          nodeId: "Node-Alpha",
          capabilities: ["vpm"],
          state: "fetching",
          activeJobId: "job-active-1",
          activeLeaseId: leaseSecret
        },
        principalAlpha
      );
      now += 1000;
      await store.heartbeat(
        { schemaVersion: 1, nodeId: "Node-Gamma", capabilities: ["booth", "github"], state: "idle" },
        principalGamma
      );
      now += 1000;
      await store.heartbeat(
        { schemaVersion: 1, nodeId: "Node-Zeta", capabilities: ["itch"], state: "idle" },
        principalZeta
      );

      now += 1000;
      await store.revokeNode("Node-Gamma", { schemaVersion: 1, reason: "Rotated node key" }, "operator-api");
      await store.revokeNode("node-delta", { schemaVersion: 1, reason: "Retired node" }, "operator-api");

      const allRes = await handleOperatorRequest(operatorRequest("/v1/operator/nodes"), store, operatorToken);
      expect(allRes.status).toBe(200);
      const allRaw = await allRes.text();
      expect(allRaw).not.toContain("token_hash");
      expect(allRaw).not.toContain("tokenHash");
      expect(allRaw).not.toContain('"token"');
      for (const secretToken of [tokAlpha, tokGamma, tokZeta, tokBeta, tokDelta]) {
        expect(allRaw).not.toContain(secretToken);
      }

      const allData = OperatorNodeListResponseSchema.parse(JSON.parse(allRaw));
      expect(allData.nextCursor).toBeNull();
      expect(allData.nodes.map((node) => node.nodeId)).toEqual([
        "Node-Alpha",
        "Node-Gamma",
        "Node-Zeta",
        "node-beta",
        "node-delta"
      ]);

      const nodeAlpha = allData.nodes[0]!;
      expect(nodeAlpha).toEqual({
        nodeId: "Node-Alpha",
        capabilities: ["vpm"],
        status: "active",
        revokedAt: null,
        lastSeenAt: "2026-10-05T00:00:01.000Z",
        heartbeatState: "fetching",
        activeJobId: "job-active-1"
      });

      const nodeGamma = allData.nodes[1]!;
      expect(nodeGamma).toEqual({
        nodeId: "Node-Gamma",
        capabilities: ["booth", "github"],
        status: "revoked",
        revokedAt: "2026-10-05T00:00:04.000Z",
        lastSeenAt: "2026-10-05T00:00:02.000Z",
        heartbeatState: "idle",
        activeJobId: null
      });

      const nodeBeta = allData.nodes[3]!;
      expect(nodeBeta).toEqual({
        nodeId: "node-beta",
        capabilities: ["vpm", "curated"],
        status: "active",
        revokedAt: null,
        lastSeenAt: null,
        heartbeatState: null,
        activeJobId: null
      });

      const activeRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes?status=active"),
        store,
        operatorToken
      );
      expect(activeRes.status).toBe(200);
      const activeData = OperatorNodeListResponseSchema.parse(await activeRes.json());
      expect(activeData.nodes.map((node) => node.nodeId)).toEqual(["Node-Alpha", "Node-Zeta", "node-beta"]);
      expect(activeData.nodes.every((node) => node.status === "active" && node.revokedAt === null)).toBe(true);

      const revokedRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes?status=revoked"),
        store,
        operatorToken
      );
      expect(revokedRes.status).toBe(200);
      const revokedData = OperatorNodeListResponseSchema.parse(await revokedRes.json());
      expect(revokedData.nodes.map((node) => node.nodeId)).toEqual(["Node-Gamma", "node-delta"]);
      expect(revokedData.nodes.every((node) => node.status === "revoked" && node.revokedAt !== null)).toBe(true);

      const page1Res = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes?limit=2"),
        store,
        operatorToken
      );
      expect(page1Res.status).toBe(200);
      const page1 = OperatorNodeListResponseSchema.parse(await page1Res.json());
      expect(page1.nodes.map((node) => node.nodeId)).toEqual(["Node-Alpha", "Node-Gamma"]);
      expect(page1.nextCursor).not.toBeNull();
      expect(decodeOperatorNodeCursor(page1.nextCursor!)).toEqual({ nodeId: "Node-Gamma" });

      const page2Res = await handleOperatorRequest(
        operatorRequest(`/v1/operator/nodes?limit=2&cursor=${page1.nextCursor}`),
        store,
        operatorToken
      );
      expect(page2Res.status).toBe(200);
      const page2 = OperatorNodeListResponseSchema.parse(await page2Res.json());
      expect(page2.nodes.map((node) => node.nodeId)).toEqual(["Node-Zeta", "node-beta"]);
      expect(page2.nextCursor).not.toBeNull();
      expect(decodeOperatorNodeCursor(page2.nextCursor!)).toEqual({ nodeId: "node-beta" });

      const page3Res = await handleOperatorRequest(
        operatorRequest(`/v1/operator/nodes?limit=2&cursor=${page2.nextCursor}`),
        store,
        operatorToken
      );
      expect(page3Res.status).toBe(200);
      const page3 = OperatorNodeListResponseSchema.parse(await page3Res.json());
      expect(page3.nodes.map((node) => node.nodeId)).toEqual(["node-delta"]);
      expect(page3.nextCursor).toBeNull();

      // Verify exact mixed-case cursor preservation when cursor nodeId has uppercase prefix before another uppercase nodeId
      const afterAlphaCursor = encodeOperatorNodeCursor({ nodeId: "Node-Alpha" });
      const afterAlphaRes = await handleOperatorRequest(
        operatorRequest(`/v1/operator/nodes?limit=1&cursor=${afterAlphaCursor}`),
        store,
        operatorToken
      );
      expect(afterAlphaRes.status).toBe(200);
      const afterAlphaData = OperatorNodeListResponseSchema.parse(await afterAlphaRes.json());
      expect(afterAlphaData.nodes.map((node) => node.nodeId)).toEqual(["Node-Gamma"]);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/jobs lists UUID and non-UUID jobs, supports state/platform filters and mixed-case keyset pagination, and omits lease secrets", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const emptyRes = await handleOperatorRequest(operatorRequest("/v1/operator/jobs"), store, operatorToken);
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.headers.get("X-RateLimit-Limit")).toBeDefined();
      const emptyPayload = OperatorJobListResponseSchema.parse(await emptyRes.json());
      expect(emptyPayload).toEqual({ schemaVersion: 1, jobs: [], nextCursor: null });

      await store.createNodeCredential("Node-Alpha", ["booth"]);
      const rule = await store.createAutoQueueRule(
        {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: "https://vpm-rule.example",
          pathScope: "/index.json",
          minDelayMs: 1000,
          expiresAt: "2027-01-01T00:00:00.000Z",
          reviewReference: "OFFLINE-JOB-RULE",
          reason: "Job listing fixture rule"
        },
        "operator-api"
      );
      const profile = await store.createSourceAccessProfile(
        {
          schemaVersion: 1,
          platform: "booth",
          origin: "https://booth.pm",
          pathScope: "/items/",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: "2027-01-01T00:00:00.000Z",
          reviewReference: "OFFLINE-JOB-PROFILE",
          reason: "Job listing fixture profile",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "operator-api"
      );

      const uuidJobId = "00000000-0000-4000-8000-000000000010";
      const secretLeaseId = "secret-lease-uuid-1234";
      const secretEtag = '"secret-etag-abc"';
      const secretLastModified = "Mon, 05 Oct 2026 00:00:00 GMT";
      const insertJob = store.sqlite.prepare(`INSERT INTO crawl_jobs
        (job_id, platform, url, origin, state, next_fetch_at, claimed_by, lease_id, lease_expires_at,
          etag, last_modified, created_at, robots_deferred_until, source_rule_id, job_purpose, lease_profile_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

      insertJob.run(
        uuidJobId,
        "vpm",
        "https://vpm-rule.example/index.json",
        "https://vpm-rule.example",
        "done",
        "2026-10-06T00:00:00.000Z",
        null,
        null,
        null,
        secretEtag,
        secretLastModified,
        "2026-10-05T00:00:02.000Z",
        null,
        rule.ruleId,
        "discovery",
        null
      );
      insertJob.run(
        "job-beta",
        "booth",
        "https://booth.pm/items/1",
        "https://booth.pm",
        "leased",
        "2026-10-05T00:00:01.000Z",
        "Node-Alpha",
        secretLeaseId,
        "2026-10-05T00:02:01.000Z",
        secretEtag,
        secretLastModified,
        "2026-10-05T00:00:01.000Z",
        null,
        null,
        "metadata",
        profile.profileId
      );
      insertJob.run(
        "Job-Zeta",
        "booth",
        "https://booth.pm/items/2",
        "https://booth.pm",
        "pending",
        "2026-10-05T00:00:01.000Z",
        null,
        null,
        null,
        null,
        null,
        "2026-10-05T00:00:01.000Z",
        "2026-10-05T01:00:00.000Z",
        null,
        "metadata",
        null
      );
      insertJob.run(
        "Job-Alpha",
        "github",
        "https://api.github.com/repos/example/tool",
        "https://api.github.com",
        "backoff",
        "2026-10-05T00:15:00.000Z",
        null,
        null,
        null,
        null,
        null,
        "2026-10-05T00:00:01.000Z",
        null,
        null,
        "metadata",
        null
      );
      insertJob.run(
        "job-b1",
        "vpm",
        "https://blocked.example/index.json",
        "https://blocked.example",
        "blocked",
        "2026-10-08T00:00:00.000Z",
        null,
        null,
        null,
        null,
        null,
        "2026-10-05T00:00:00.000Z",
        null,
        null,
        "discovery",
        null
      );

      const allRes = await handleOperatorRequest(operatorRequest("/v1/operator/jobs"), store, operatorToken);
      expect(allRes.status).toBe(200);
      const allRaw = await allRes.text();
      expect(allRaw).not.toContain("lease_id");
      expect(allRaw).not.toContain("leaseId");
      expect(allRaw).not.toContain(secretLeaseId);
      expect(allRaw).not.toContain("etag");
      expect(allRaw).not.toContain(secretEtag);
      expect(allRaw).not.toContain("last_modified");
      expect(allRaw).not.toContain("lastModified");
      expect(allRaw).not.toContain(secretLastModified);

      const allData = OperatorJobListResponseSchema.parse(JSON.parse(allRaw));
      expect(allData.nextCursor).toBeNull();
      expect(allData.jobs.map((job) => job.jobId)).toEqual([
        uuidJobId,
        "job-beta",
        "Job-Zeta",
        "Job-Alpha",
        "job-b1"
      ]);

      expect(allData.jobs[0]).toEqual({
        jobId: uuidJobId,
        platform: "vpm",
        url: "https://vpm-rule.example/index.json",
        origin: "https://vpm-rule.example",
        state: "done",
        purpose: "discovery",
        nextFetchAt: "2026-10-06T00:00:00.000Z",
        claimedBy: null,
        leaseExpiresAt: null,
        createdAt: "2026-10-05T00:00:02.000Z",
        robotsDeferredUntil: null,
        sourceRuleId: rule.ruleId,
        leaseProfileId: null
      });

      expect(allData.jobs[1]).toEqual({
        jobId: "job-beta",
        platform: "booth",
        url: "https://booth.pm/items/1",
        origin: "https://booth.pm",
        state: "leased",
        purpose: "metadata",
        nextFetchAt: "2026-10-05T00:00:01.000Z",
        claimedBy: "Node-Alpha",
        leaseExpiresAt: "2026-10-05T00:02:01.000Z",
        createdAt: "2026-10-05T00:00:01.000Z",
        robotsDeferredUntil: null,
        sourceRuleId: null,
        leaseProfileId: profile.profileId
      });

      expect(allData.jobs[2]?.robotsDeferredUntil).toBe("2026-10-05T01:00:00.000Z");

      const leasedRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs?state=leased"),
        store,
        operatorToken
      );
      expect(leasedRes.status).toBe(200);
      const leasedData = OperatorJobListResponseSchema.parse(await leasedRes.json());
      expect(leasedData.jobs.map((job) => job.jobId)).toEqual(["job-beta"]);

      const boothRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs?platform=booth"),
        store,
        operatorToken
      );
      expect(boothRes.status).toBe(200);
      const boothData = OperatorJobListResponseSchema.parse(await boothRes.json());
      expect(boothData.jobs.map((job) => job.jobId)).toEqual(["job-beta", "Job-Zeta"]);

      const boothPendingRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs?state=pending&platform=booth"),
        store,
        operatorToken
      );
      expect(boothPendingRes.status).toBe(200);
      const boothPendingData = OperatorJobListResponseSchema.parse(await boothPendingRes.json());
      expect(boothPendingData.jobs.map((job) => job.jobId)).toEqual(["Job-Zeta"]);

      const page1Res = await handleOperatorRequest(
        operatorRequest("/v1/operator/jobs?limit=2"),
        store,
        operatorToken
      );
      expect(page1Res.status).toBe(200);
      const page1 = OperatorJobListResponseSchema.parse(await page1Res.json());
      expect(page1.jobs.map((job) => job.jobId)).toEqual([uuidJobId, "job-beta"]);
      expect(page1.nextCursor).not.toBeNull();
      expect(decodeOperatorJobCursor(page1.nextCursor!)).toEqual({
        createdAt: "2026-10-05T00:00:01.000Z",
        jobId: "job-beta"
      });

      const page2Res = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs?limit=2&cursor=${page1.nextCursor}`),
        store,
        operatorToken
      );
      expect(page2Res.status).toBe(200);
      const page2 = OperatorJobListResponseSchema.parse(await page2Res.json());
      expect(page2.jobs.map((job) => job.jobId)).toEqual(["Job-Zeta", "Job-Alpha"]);
      expect(page2.nextCursor).not.toBeNull();
      expect(decodeOperatorJobCursor(page2.nextCursor!)).toEqual({
        createdAt: "2026-10-05T00:00:01.000Z",
        jobId: "Job-Alpha"
      });

      const page3Res = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs?limit=2&cursor=${page2.nextCursor}`),
        store,
        operatorToken
      );
      expect(page3Res.status).toBe(200);
      const page3 = OperatorJobListResponseSchema.parse(await page3Res.json());
      expect(page3.jobs.map((job) => job.jobId)).toEqual(["job-b1"]);
      expect(page3.nextCursor).toBeNull();

      // Verify exact mixed-case jobId cursor preservation without duplicating "job-beta"
      const zetaCursor = encodeOperatorJobCursor({ createdAt: "2026-10-05T00:00:01.000Z", jobId: "Job-Zeta" });
      const afterZetaRes = await handleOperatorRequest(
        operatorRequest(`/v1/operator/jobs?limit=2&cursor=${zetaCursor}`),
        store,
        operatorToken
      );
      expect(afterZetaRes.status).toBe(200);
      const afterZeta = OperatorJobListResponseSchema.parse(await afterZetaRes.json());
      expect(afterZeta.jobs.map((job) => job.jobId)).toEqual(["Job-Alpha", "job-b1"]);
    } finally {
      store.close();
    }
  });

  test("GET /v1/operator/nodes and GET /v1/operator/jobs enforce auth and reject invalid queries with 400 invalid_query", async () => {
    const store = await createInitializedD1Coordinator();
    const nodeToken = await store.createNodeCredential("node-auth-check", ["vpm"]);
    try {
      const validNodeCursor = encodeOperatorNodeCursor({ nodeId: "Node-A" });
      const validJobCursor = encodeOperatorJobCursor({
        createdAt: "2026-10-05T00:00:00.000Z",
        jobId: "Job-A"
      });

      for (const path of ["/v1/operator/nodes", "/v1/operator/jobs"]) {
        expect((await handleOperatorRequest(operatorRequest(path), store, "")).status).toBe(401);
        expect(
          (await handleOperatorRequest(operatorRequest(path, "GET", undefined, "b".repeat(64)), store, operatorToken))
            .status
        ).toBe(401);
        expect(
          (await handleOperatorRequest(operatorRequest(path, "GET", undefined, nodeToken), store, operatorToken)).status
        ).toBe(401);
        expect((await handleOperatorRequest(new Request(`http://localhost${path}`), store, operatorToken)).status).toBe(
          401
        );
      }

      expect((await handleOperatorRequest(operatorRequest("/v1/operator/nodes/abc"), store, operatorToken)).status).toBe(
        404
      );
      expect(
        (await handleOperatorRequest(operatorRequest("/v1/operator/nodes", "DELETE"), store, operatorToken)).status
      ).toBe(404);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/jobs/123"), store, operatorToken)).status).toBe(
        404
      );

      const badNodeQueries = [
        "limit=",
        "limit=0",
        "limit=101",
        "limit=-1",
        "limit=abc",
        "limit=1.5",
        "cursor=",
        "cursor=not-valid",
        `cursor=${encodeURIComponent(validNodeCursor + "=")}`,
        `cursor=${encodeURIComponent(validJobCursor)}`,
        "status=",
        "status=unknown",
        "status=active&status=revoked",
        "limit=1&limit=2",
        `cursor=${validNodeCursor}&cursor=${validNodeCursor}`,
        "unknown=1"
      ];
      for (const query of badNodeQueries) {
        const res = await handleOperatorRequest(
          operatorRequest(`/v1/operator/nodes?${query}`),
          store,
          operatorToken
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { schemaVersion: number; code: string; error: string };
        expect(body.schemaVersion).toBe(1);
        expect(body.code).toBe("invalid_query");
      }

      const badJobQueries = [
        "limit=",
        "limit=0",
        "limit=101",
        "limit=-1",
        "limit=abc",
        "limit=1.5",
        "cursor=",
        "cursor=not-valid",
        `cursor=${encodeURIComponent(validJobCursor + "=")}`,
        `cursor=${encodeURIComponent(validNodeCursor)}`,
        "state=",
        "state=unknown",
        "platform=",
        "platform=unknown",
        "state=pending&state=done",
        "platform=vpm&platform=booth",
        "limit=1&limit=2",
        `cursor=${validJobCursor}&cursor=${validJobCursor}`,
        "unknown=1"
      ];
      for (const query of badJobQueries) {
        const res = await handleOperatorRequest(
          operatorRequest(`/v1/operator/jobs?${query}`),
          store,
          operatorToken
        );
        expect(res.status).toBe(400);
        const body = (await res.json()) as { schemaVersion: number; code: string; error: string };
        expect(body.schemaVersion).toBe(1);
        expect(body.code).toBe("invalid_query");
      }
    } finally {
      store.close();
    }
  });

  test("DELETE /v1/operator/nodes/{nodeId} prunes revoked nodes with audit logging and rejects invalid requests", async () => {
    let now = Date.parse("2026-10-06T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      // 1. Issue and revoke a node
      await store.issueNodeCredential(
        { schemaVersion: 1, nodeId: "prune-node-1", capabilities: ["vpm"], reason: "Prune test fixture" },
        "fixture"
      );
      now += 1000;
      await store.revokeNode("prune-node-1", { schemaVersion: 1, reason: "Rotated node" }, "operator-api");

      // 1. Happy path: prune node
      const pruneRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/prune-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(pruneRes.status).toBe(200);
      const pruneBody = (await pruneRes.json()) as { schemaVersion: number; nodeId: string; status: string };
      expect(pruneBody).toEqual({
        schemaVersion: 1,
        nodeId: "prune-node-1",
        status: "pruned"
      });

      // Verify node is gone
      const listAfter = await store.listNodesPage();
      expect(listAfter.nodes.some((n) => n.nodeId === "prune-node-1")).toBe(false);

      // 2. 404 if node does not exist (including pruned node)
      const notFoundRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/prune-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(notFoundRes.status).toBe(404);
      const notFoundBody = (await notFoundRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(notFoundBody.schemaVersion).toBe(1);
      expect(notFoundBody.code).toBe("not_found");

      const nonExistentRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/never-existed-node", "DELETE", {
          schemaVersion: 1,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(nonExistentRes.status).toBe(404);
      const nonExistentBody = (await nonExistentRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(nonExistentBody.schemaVersion).toBe(1);
      expect(nonExistentBody.code).toBe("not_found");

      // 3. 409 not_revoked if node is still active
      await store.issueNodeCredential(
        { schemaVersion: 1, nodeId: "active-node-1", capabilities: ["booth"], reason: "Active node fixture" },
        "fixture"
      );
      const activeRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(activeRes.status).toBe(409);
      const activeBody = (await activeRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(activeBody.schemaVersion).toBe(1);
      expect(activeBody.code).toBe("not_revoked");
      expect(activeBody.error).toBe("Node must be revoked before it can be pruned.");

      // 4. 400 invalid_body if body is missing or reason is empty/invalid
      const missingBodyRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE"),
        store,
        operatorToken
      );
      expect(missingBodyRes.status).toBe(400);
      const missingBodyData = (await missingBodyRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(missingBodyData.schemaVersion).toBe(1);
      expect(missingBodyData.code).toBe("invalid_body");

      const emptyReasonRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE", {
          schemaVersion: 1,
          reason: "   "
        }),
        store,
        operatorToken
      );
      expect(emptyReasonRes.status).toBe(400);
      const emptyReasonData = (await emptyReasonRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(emptyReasonData.schemaVersion).toBe(1);
      expect(emptyReasonData.code).toBe("invalid_body");

      const invalidVersionRes = await handleOperatorRequest(
        operatorRequest("/v1/operator/nodes/active-node-1", "DELETE", {
          schemaVersion: 2,
          reason: "Decommissioned test node"
        }),
        store,
        operatorToken
      );
      expect(invalidVersionRes.status).toBe(400);
      const invalidVersionData = (await invalidVersionRes.json()) as { schemaVersion: number; code: string; error: string };
      expect(invalidVersionData.schemaVersion).toBe(1);
      expect(invalidVersionData.code).toBe("invalid_body");
    } finally {
      store.close();
    }
  });
});
