import { describe, expect, test } from "bun:test";
import { handleNodeRequest } from "../../src/api/handler.ts";
import type { Coordinator } from "../../src/storage/d1/coordinator.ts";
import { createInitializedD1Coordinator, inspectNodeEvidence, listCompleteVpmEvidence, suppressTestUrl } from "../support/d1_test_fixtures.ts";
import { ClaimResponseSchema, NODE_API_JSON_SCHEMAS, PROTOCOL_VERSION, ResultResponseSchema, PlatformSchema,
  BatchResultRequestSchema, BatchResultResponseSchema } from "vrc-packages-network/node";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { seedApprovedFixtureJob } from "../helpers/source_access_fixture.ts";
import { getTestOutputDir } from "../helpers/test_directory.ts";
import { DEFAULT_SEED_JOBS, DEFAULT_APPROVED_SOURCE_PROFILES } from "../../src/storage/default_seeds.ts";
import { classifyOutboundLeadKind } from "../../src/storage/d1/coordinator.ts";

async function allowFixtureOrigin(store: Coordinator, ...origins: string[]): Promise<void> {
  for (const origin of origins) await store.recordRobotsSnapshot(origin, 404);
}

function request(path: string, body: unknown, token: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

describe("local coordinator protocol", () => {
  test("conflicting seed contracts preserve queue identity and pacing", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const url = "https://seed.example/index.json";
      const id = await store.seedJob(url, "vpm", 1000, undefined, "metadata");
      const job = store.sqlite.query("SELECT * FROM crawl_jobs").get();
      const origin = store.sqlite.query("SELECT * FROM origin_leases").get();
      await expect(store.seedJob(url, "curated", 50000, undefined, "metadata")).rejects.toThrow("different reviewed platform");
      await expect(store.seedJob(url, "vpm", 50000, undefined, "discovery")).rejects.toThrow("different reviewed purpose");
      expect(store.sqlite.query("SELECT * FROM crawl_jobs").get()).toEqual(job);
      expect(store.sqlite.query("SELECT * FROM origin_leases").get()).toEqual(origin);
      expect(await store.seedJob(url, "vpm", 2000, undefined, "metadata")).toBe(id);
      expect(store.sqlite.query("SELECT min_delay_ms FROM origin_leases").get()).toEqual({ min_delay_ms: 2000 });
    } finally { store.close(); }
  });
  test("queued robots batch ignores origins without a currently due job", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await seedApprovedFixtureJob(store, "https://dormant.example.org/item", "vpm", 0);
      store.sqlite.prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE origin=?")
        .run(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), "https://dormant.example.org");
      expect(await store.claimDueRobotsRefresh()).toBeNull();
    } finally { store.close(); }
  });

  test("two coordinator processes lease queued robots refreshes and reject stale completions", async () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrc-robots-refresh-"));
    const databasePath = join(directory, "coordinator.db");
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const firstStore = await createInitializedD1Coordinator(databasePath, () => now);
    const secondStore = await createInitializedD1Coordinator(databasePath, () => now);
    try {
      await seedApprovedFixtureJob(firstStore, "https://queued.example.org/item", "vpm", 0);
      await seedApprovedFixtureJob(firstStore, "https://blocked.example.org/item", "vpm", 0);
      suppressTestUrl(firstStore, "https://blocked.example.org/item", "fixture suppression", () => now);
      const first = await firstStore.claimDueRobotsRefresh();
      expect(first?.origin).toBe("https://queued.example.org");
      expect(await secondStore.claimDueRobotsRefresh()).toBeNull();
      expect(await secondStore.reserveRobotsRefresh("https://queued.example.org")).toBeNull();
      if (!first) throw new Error("Expected first refresh lease");
      now += 45_001;
      const replacement = await secondStore.claimDueRobotsRefresh();
      expect(replacement?.origin).toBe(first.origin);
      expect(replacement?.leaseId).not.toBe(first.leaseId);
      if (!replacement) throw new Error("Expected replacement refresh lease");
      expect(await firstStore.completeRobotsRefresh(first.origin, first.leaseId, 200, "User-agent: *\nAllow: /")).toBe(false);
      expect(await firstStore.releaseRobotsRefresh(first.origin, first.leaseId)).toBe(false);
      expect(await secondStore.completeRobotsRefresh(replacement.origin, replacement.leaseId, 404)).toBe(true);
      expect(await firstStore.claimDueRobotsRefresh()).toBeNull();
      const token = await firstStore.createNodeCredential("queued-node", ["vpm"]);
      const principal = (await firstStore.authenticate("queued-node", token))!;
      now += 1000;
      expect((await firstStore.claim({ schemaVersion: 1, nodeId: "queued-node", capabilities: ["vpm"] }, principal)).status)
        .toBe("leased");
      expect(await secondStore.reserveRobotsRefresh("https://queued.example.org")).toBeNull();
      now += 24 * 60 * 60 * 1000 + 1;
      expect((await firstStore.claimDueRobotsRefresh())?.origin).toBe("https://queued.example.org");
    } finally {
      firstStore.close();
      secondStore.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("a restarted coordinator reclaims an expired node lease without accepting the old result", async () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrc-job-recovery-"));
    const databasePath = join(directory, "coordinator.db");
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    let store = await createInitializedD1Coordinator(databasePath, () => now);
    try {
      await seedApprovedFixtureJob(store, "https://recovery.example.org/item", "vpm", 1000);
      await allowFixtureOrigin(store, "https://recovery.example.org");
      const oldToken = await store.createNodeCredential("old-node", ["vpm"]);
      const newToken = await store.createNodeCredential("new-node", ["vpm"]);
      const oldPrincipal = (await store.authenticate("old-node", oldToken))!;
      const first = await store.claim({ schemaVersion: 1, nodeId: "old-node", capabilities: ["vpm"] }, oldPrincipal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected initial job lease");
      store.close();
      now += 5 * 60 * 1000 + 1;
      store = await createInitializedD1Coordinator(databasePath, () => now);
      const newPrincipal = (await store.authenticate("new-node", newToken))!;
      const replacement = await store.claim({ schemaVersion: 1, nodeId: "new-node", capabilities: ["vpm"] }, newPrincipal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement job lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      const stalePrincipal = (await store.authenticate("old-node", oldToken))!;
      await expect(store.submit({ schemaVersion: 1, nodeId: "old-node", jobId: first.job.jobId,
        leaseId: first.job.leaseId, idempotencyKey: "stale-after-restart", outcome: { kind: "unchanged" } },
      stalePrincipal)).rejects.toThrow("live lease");
      expect((await store.submit({ schemaVersion: 1, nodeId: "new-node", jobId: replacement.job.jobId,
        leaseId: replacement.job.leaseId, idempotencyKey: "replacement-after-restart",
        outcome: { kind: "unchanged" } }, newPrincipal)).duplicate).toBe(false);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n).toBe(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("robots snapshots gate exact URLs, fail closed, expire, and reconsider deferred jobs", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("robots-node", ["vpm"]);
    const principal = (await store.authenticate("robots-node", token))!;
    const claimRequest = { schemaVersion: 1 as const, nodeId: "robots-node", capabilities: ["vpm" as const] };
    try {
      await seedApprovedFixtureJob(store, "https://denied.example.org/private/one", "vpm", 0);
      await seedApprovedFixtureJob(store, "https://allowed.example.org/public", "vpm", 0);
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      await expect(store.recordRobotsSnapshot("http://denied.example.org", 200, "")).rejects.toThrow();
      await store.recordRobotsSnapshot("https://denied.example.org", 200,
        "User-agent: VRCDiscoveryBot\nDisallow: /private/\nAllow: /public/");
      await store.recordRobotsSnapshot("https://allowed.example.org", 503);
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      const denied = store.sqlite.prepare("SELECT robots_deferred_until FROM crawl_jobs WHERE url=?")
        .get("https://denied.example.org/private/one") as { robots_deferred_until: string | null };
      expect(denied.robots_deferred_until).toBeTruthy();
      await store.recordRobotsSnapshot("https://allowed.example.org", 404);
      const allowed = await store.claim(claimRequest, principal);
      expect(allowed.status).toBe("leased");
      if (allowed.status !== "leased") throw new Error("Expected allowed URL lease");
      expect(allowed.job.url).toBe("https://allowed.example.org/public");
      await store.recordRobotsSnapshot("https://allowed.example.org", 200,
        "User-agent: *\nDisallow: /public");
      await expect(store.submit({ schemaVersion: 1, nodeId: "robots-node", jobId: allowed.job.jobId,
        leaseId: allowed.job.leaseId, idempotencyKey: "robots-revoked-before-submit", outcome: { kind: "unchanged" } },
      principal)).rejects.toThrow("robots policy");
      await store.recordRobotsSnapshot("https://denied.example.org", 404);
      const reconsidered = await store.claim(claimRequest, principal);
      expect(reconsidered.status).toBe("leased");
      if (reconsidered.status === "leased") expect(reconsidered.job.url).toBe("https://denied.example.org/private/one");
      now += 25 * 60 * 60 * 1000;
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
    } finally { store.close(); }
  });

  test("more than 100 robots-denied ready jobs cannot hide an allowed job", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("robots-node", ["vpm"]);
    const principal = (await store.authenticate("robots-node", token))!;
    try {
      for (let index = 0; index < 101; index++) {
        await seedApprovedFixtureJob(store, `https://denied.example.org/private/${index}`, "vpm", 0);
      }
      await seedApprovedFixtureJob(store, "https://allowed.example.org/public", "vpm", 0);
      await store.recordRobotsSnapshot("https://denied.example.org", 200, "User-agent: *\nDisallow: /private/");
      await store.recordRobotsSnapshot("https://allowed.example.org", 404);
      const claim = await store.claim({ schemaVersion: 1, nodeId: "robots-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status === "leased") expect(claim.job.url).toBe("https://allowed.example.org/public");
    } finally { store.close(); }
  });

  test("operator seeding rejects obvious private and credential-bearing targets", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      for (const url of ["https://127.0.0.1/data", "https://[::1]/data", "https://localhost/data",
        "https://user:pass@example.org/data", "https://example.org:8443/data", "https://example.org/data#fragment",
        "https://example.org./data"]) {
        await expect(store.seedJob(url, "vpm")).rejects.toThrow();
      }
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
    } finally { store.close(); }
  });

  test("operator cannot seed a known robots-disallowed itch search path", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await expect(store.seedJob("https://itch.io/search?q=vrchat", "itch")).rejects.toThrow("disallowed");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
      expect(await seedApprovedFixtureJob(store, "https://itch.io/tools/tag-vrchat", "itch")).toBeTruthy();
    } finally { store.close(); }
  });

  test("GitHub seeding permits only the public repository API and applies unauthenticated pacing", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      for (const url of ["https://github.com/vrc-get/vrc-get", "https://api.github.com/search/repositories?q=vrc",
        "https://api.github.com/repos/vrc-get/vrc-get/readme", "https://api.github.com/repos/vrc-get/vrc-get?x=1"]) {
        await expect(store.seedJob(url, "github")).rejects.toThrow();
      }
      await expect(store.seedJob("https://api.github.com/repos/vrc-get/vrc-get", "curated")).rejects.toThrow();
      await seedApprovedFixtureJob(store, "https://api.github.com/repos/vrc-get/vrc-get", "github", 1000);
      expect((store.sqlite.prepare("SELECT min_delay_ms FROM origin_leases WHERE origin=?")
        .get("https://api.github.com") as { min_delay_ms: number }).min_delay_ms).toBe(60_000);
    } finally { store.close(); }
  });

  test("initializes D1 evidence tables with nullable provenance markers and indexes idempotently", async () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrcp-coordinator-migrate-"));
    const databasePath = join(directory, "coordinator.db");
    try {
      const store = await createInitializedD1Coordinator(databasePath);
      try {
        store.sqlite.prepare(`INSERT INTO source_items
          (source_key,platform,source_url,latest_digest,latest_version_no) VALUES (?,?,?,?,?)`)
          .run("old-source", "vpm", "https://example.org/index.json", "digest", 1);
        store.sqlite.prepare(`INSERT INTO source_versions
          (version_id,source_key,version_no,digest,payload_json,observed_at) VALUES (?,?,?,?,?,?)`)
          .run("old-version", "old-source", 1, "digest", "{}", "2026-01-01T00:00:00.000Z");
        await store.initSchema(false);

        const columns = store.sqlite.prepare("PRAGMA table_info(source_versions)").all() as { name: string }[];
        expect(columns.some((column) => column.name === "complete")).toBe(true);
        expect(columns.some((column) => column.name === "contributor_node_id")).toBe(true);
        expect(columns.some((column) => column.name === "submission_lease_id")).toBe(true);
        expect((store.sqlite.prepare("SELECT gone_at FROM source_items WHERE source_key='old-source'")
          .get() as { gone_at: string | null }).gone_at).toBeNull();
        expect((store.sqlite.prepare("PRAGMA table_info(crawl_jobs)").all() as { name: string }[])
          .map((column) => column.name)).toContain("source_rule_id");
        for (const table of ["source_events", "source_issues"]) {
          const names = (store.sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
            .map((column) => column.name);
          expect(names).toContain("contributor_node_id");
          expect(names).toContain("submission_lease_id");
        }
        const leadNames = (store.sqlite.prepare("PRAGMA table_info(source_leads)").all() as { name: string }[])
          .map((column) => column.name);
        for (const name of ["first_seen_node_id", "first_seen_lease_id", "last_seen_node_id", "last_seen_lease_id",
          "discovered_from_item_key"]) {
          expect(leadNames).toContain(name);
        }
        expect((store.sqlite.prepare(`SELECT contributor_node_id,submission_lease_id FROM source_versions
          WHERE version_id='old-version'`).get() as any)).toEqual({
            contributor_node_id: null, submission_lease_id: null
          });
        for (const [table, index] of [
          ["source_versions", "idx_source_versions_contributor"],
          ["source_events", "idx_source_events_contributor"],
          ["source_issues", "idx_source_issues_contributor"],
          ["source_leads", "idx_source_leads_first_node"],
          ["source_leads", "idx_source_leads_last_node"]
        ]) {
          const indexes = store.sqlite.prepare(`PRAGMA index_list(${table})`).all() as { name: string }[];
          expect(indexes.map((entry) => entry.name)).toContain(index);
        }
      } finally { store.close(); }
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });

  test("exports the production runtime schemas as JSON Schema", async () => {
    expect(NODE_API_JSON_SCHEMAS.claimRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.resultRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.heartbeatRequest.oneOf?.length).toBe(2);
  });

  test("heartbeat is schema-validated, scoped, and bound to a live claimed job", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("node-a", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
      return { status: response.status, body: await response.json() as any };
    };
    const idle = { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], state: "idle" };
    try {
      expect((await post("/v1/node/heartbeat", idle)).body).toEqual({ schemaVersion: 1,
        status: "alive", serverTime: "2026-09-27T00:00:00.000Z" });
      expect((store.sqlite.prepare("SELECT state,last_seen_at FROM node_heartbeats").get() as any))
        .toEqual({ state: "idle", last_seen_at: "2026-09-27T00:00:00.000Z" });
      expect((await post("/v1/node/heartbeat", { ...idle, activeJobId: "job" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, schemaVersion: 2 })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", idle, "wrong-token")).status).toBe(401);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: "not-held",
        activeLeaseId: crypto.randomUUID() })).status).toBe(403);
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
      expect(claim.body.status).toBe("leased");
      expect(ClaimResponseSchema.parse(claim.body).status).toBe("leased");
      expect(claim.body.job.purpose).toBe("metadata");
      now += 1000;
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: claim.body.job.jobId,
        activeLeaseId: crypto.randomUUID() })).status).toBe(403);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: claim.body.job.jobId,
        activeLeaseId: claim.body.job.leaseId })).status).toBe(200);
      expect((store.sqlite.prepare("SELECT state,active_job_id,last_seen_at FROM node_heartbeats").get() as any))
        .toEqual({ state: "fetching", active_job_id: claim.body.job.jobId,
          last_seen_at: "2026-09-27T00:00:01.000Z" });
      await store.revokeNode("node-a", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      expect((await post("/v1/node/heartbeat", idle)).status).toBe(401);
    } finally { store.close(); }
  });

  test("a replaced lease held by the same node cannot keep an old fetch alive", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("same-node", ["vpm"]);
    const principal = (await store.authenticate("same-node", token))!;
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const request = { schemaVersion: 1 as const, nodeId: "same-node", capabilities: ["vpm" as const] };
    try {
      const first = await store.claim(request, principal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected first lease");
      now += 5 * 60 * 1000 + 1;
      const replacement = await store.claim(request, principal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      await expect(store.heartbeat({ ...request, state: "fetching", activeJobId: first.job.jobId,
        activeLeaseId: first.job.leaseId }, principal)).rejects.toThrow("active job");
      expect((await store.heartbeat({ ...request, state: "fetching", activeJobId: replacement.job.jobId,
        activeLeaseId: replacement.job.leaseId }, principal)).status).toBe("alive");
    } finally { store.close(); }
  });

  test("serialized node requests reject malformed payloads and unsupported schema versions", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("node-a", ["vpm"]);
    const fetchHandler = (req: Request) => handleNodeRequest(req, store);
    try {
      const bodies: unknown[] = [
        { schemaVersion: 999, nodeId: "node-a", capabilities: ["vpm"] },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], extra: true },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["not-a-driver"] }
      ];
      for (const body of bodies) {
        const rejected = await fetchHandler(request("/v1/node/jobs/claim", body, token));
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "invalid_payload" });
      }
      const invalidHeartbeat = { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"],
        state: "idle", activeJobId: "not-allowed" };
      const rejectedHeartbeat = await fetchHandler(request("/v1/node/heartbeat", invalidHeartbeat, token));
      expect(rejectedHeartbeat.status).toBe(400);
      expect(await rejectedHeartbeat.json()).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "invalid_payload" });
      const malformed = new Request("http://localhost/v1/node/jobs/claim", { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{" });
      expect((await fetchHandler(malformed)).status).toBe(400);
      const oversized = new Request("http://localhost/v1/node/jobs/claim", { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: " ".repeat(256 * 1024 + 1) });
      expect((await fetchHandler(oversized)).status).toBe(413);
    } finally { store.close(); }
  });

  test("serialized results preserve platformTags and derive canonical package category", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as unknown };
    };

    try {
      // 1. Tagged fixture: observation with platformTags: ["avatar_tool", "vpm"]
      const taggedUrl = "https://tagged.example.org/index.json";
      await seedApprovedFixtureJob(store, taggedUrl, "vpm", 0);
      await allowFixtureOrigin(store, "https://tagged.example.org");

      const claimRes1 = await post("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        capabilities: ["vpm"]
      });
      expect(claimRes1.status).toBe(200);
      const claim1 = ClaimResponseSchema.parse(claimRes1.body);
      expect(claim1.status).toBe("leased");
      if (claim1.status !== "leased") throw new Error("Expected leased job");

      const vpmId1 = "com.example.avatar-tool-pkg";
      const resultRes1 = await post("/v1/node/jobs/result", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        jobId: claim1.job.jobId,
        leaseId: claim1.job.leaseId,
        idempotencyKey: "serialized-platform-tags-0001",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: vpmId1,
            title: "Avatar Tool Package",
            author: "Test Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            platformTags: ["avatar_tool", "vpm"],
            releases: [{ version: "1.0.0", dependencyRanges: {} }]
          }
        }
      });
      expect(resultRes1.status).toBe(200);
      const parsedResult1 = ResultResponseSchema.parse(resultRes1.body);
      expect(parsedResult1.status).toBe("accepted");
      expect(parsedResult1.jobId).toBe(claim1.job.jobId);
      expect(parsedResult1.sourceVersionCreated).toBe(true);

      const pkg1 = await store.getCanonicalPackage(vpmId1);
      expect(pkg1).not.toBeNull();
      expect(pkg1?.category).toBe("avatar_tool");
      expect(pkg1?.category).not.toBe("vpm_package");

      const row1 = store.sqlite.prepare("SELECT category FROM canonical_packages WHERE vpm_id=?").get(vpmId1) as { category: string } | null;
      expect(row1?.category).toBe("avatar_tool");

      // 2. Untagged fixture: observation with no platformTags (undefined)
      const untaggedUrl = "https://untagged.example.org/index.json";
      await seedApprovedFixtureJob(store, untaggedUrl, "vpm", 0);
      await allowFixtureOrigin(store, "https://untagged.example.org");

      const claimRes2 = await post("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        capabilities: ["vpm"]
      });
      expect(claimRes2.status).toBe(200);
      const claim2 = ClaimResponseSchema.parse(claimRes2.body);
      expect(claim2.status).toBe("leased");
      if (claim2.status !== "leased") throw new Error("Expected leased job");

      const vpmId2 = "com.example.untagged-pkg";
      const resultRes2 = await post("/v1/node/jobs/result", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        jobId: claim2.job.jobId,
        leaseId: claim2.job.leaseId,
        idempotencyKey: "serialized-platform-tags-0002",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: vpmId2,
            title: "Untagged Package",
            author: "Test Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            releases: [{ version: "1.0.0", dependencyRanges: {} }]
          }
        }
      });
      expect(resultRes2.status).toBe(200);
      const parsedResult2 = ResultResponseSchema.parse(resultRes2.body);
      expect(parsedResult2.status).toBe("accepted");
      expect(parsedResult2.jobId).toBe(claim2.job.jobId);

      const pkg2 = await store.getCanonicalPackage(vpmId2);
      expect(pkg2).not.toBeNull();
      expect(pkg2?.category).toBe("vpm_package");

      const row2 = store.sqlite.prepare("SELECT category FROM canonical_packages WHERE vpm_id=?").get(vpmId2) as { category: string } | null;
      expect(row2?.category).toBe("vpm_package");

      // 3. Empty tags fixture: observation with empty platformTags: []
      const emptyTagsUrl = "https://emptytags.example.org/index.json";
      await seedApprovedFixtureJob(store, emptyTagsUrl, "vpm", 0);
      await allowFixtureOrigin(store, "https://emptytags.example.org");

      const claimRes3 = await post("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        capabilities: ["vpm"]
      });
      expect(claimRes3.status).toBe(200);
      const claim3 = ClaimResponseSchema.parse(claimRes3.body);
      expect(claim3.status).toBe("leased");
      if (claim3.status !== "leased") throw new Error("Expected leased job");

      const vpmId3 = "com.example.empty-tags-pkg";
      const resultRes3 = await post("/v1/node/jobs/result", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "vpm-node",
        jobId: claim3.job.jobId,
        leaseId: claim3.job.leaseId,
        idempotencyKey: "serialized-platform-tags-0003",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: vpmId3,
            title: "Empty Tags Package",
            author: "Test Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            platformTags: [],
            releases: [{ version: "1.0.0", dependencyRanges: {} }]
          }
        }
      });
      expect(resultRes3.status).toBe(200);
      const parsedResult3 = ResultResponseSchema.parse(resultRes3.body);
      expect(parsedResult3.status).toBe("accepted");
      expect(parsedResult3.jobId).toBe(claim3.job.jobId);

      const pkg3 = await store.getCanonicalPackage(vpmId3);
      expect(pkg3).not.toBeNull();
      expect(pkg3?.category).toBe("vpm_package");

      const dbRow3 = store.sqlite.prepare("SELECT category FROM canonical_packages WHERE vpm_id=?").get(vpmId3) as { category: string } | null;
      expect(dbRow3?.category).toBe("vpm_package");
    } finally {
      store.close();
    }
  });

  test("scoped credentials, origin leases, change-only versions, idempotency, and revocation", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const aToken = await store.createNodeCredential("node-a", ["vpm"]);
    const bToken = await store.createNodeCredential("node-b", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.com/one", "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://example.com/two", "vpm", 1000);
    await allowFixtureOrigin(store, "https://example.com");
    const claimBody = (nodeId: string) => ({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] });
    const post = async (path: string, body: unknown, token: string) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const unauthMalformed = new Request("http://127.0.0.1/v1/node/jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json {{{"
      });
      expect((await handleNodeRequest(unauthMalformed, store)).status).toBe(401);
      expect((await post("/v1/node/jobs/claim", claimBody("node-a"), "bad-token")).status).toBe(401);
      expect((await post("/v1/node/jobs/claim", { ...claimBody("node-a"), capabilities: ["booth"] }, aToken)).status).toBe(403);
      const first = await post("/v1/node/jobs/claim", claimBody("node-a"), aToken);
      expect(first.status).toBe(200);
      const job = ClaimResponseSchema.parse(first.body);
      expect(job.status).toBe("leased");
      if (job.status !== "leased") throw new Error("Expected lease");
      expect((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).body.status).toBe("empty");

      const result = {
        schemaVersion: PROTOCOL_VERSION, nodeId: "node-a", jobId: job.job.jobId,
        leaseId: job.job.leaseId, idempotencyKey: "test-result-key-001",
        outcome: { kind: "changed", observation: { sourceItemKey: "com.example.tool", title: "Tool",
          author: "Author", summary: "Useful", outboundLinks: [], originUpdatedAt: null } }
      };
      expect((await post("/v1/node/jobs/result", result, bToken)).status).toBe(401);
      const accepted = await post("/v1/node/jobs/result", result, aToken);
      expect(ResultResponseSchema.parse(accepted.body).sourceVersionCreated).toBe(true);
      const duplicate = await post("/v1/node/jobs/result", result, aToken);
      expect(duplicate.body.duplicate).toBe(true);
      expect((await post("/v1/node/jobs/result", { ...result, outcome: { kind: "gone" } }, aToken)).status).toBe(409);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT contributor_node_id,submission_lease_id FROM source_versions").get() as any))
        .toEqual({ contributor_node_id: "node-a", submission_lease_id: job.job.leaseId });
      expect((store.sqlite.prepare("SELECT contributor_node_id,submission_lease_id FROM source_events").get() as any))
        .toEqual({ contributor_node_id: "node-a", submission_lease_id: job.job.leaseId });
      expect(inspectNodeEvidence(store, "node-a")).toMatchObject({
        totals: { submissions: 1, versions: 1, events: 1, issues: 0,
          leadsFirstSeen: 0, leadsLastSeen: 0 },
        versions: [{ source_key: expect.any(String), submission_lease_id: job.job.leaseId }]
      });
      expect(() => inspectNodeEvidence(store, "unknown-node")).toThrow("Node not found");

      now += 1000;
      const second = await post("/v1/node/jobs/claim", claimBody("node-b"), bToken);
      expect(second.body.status).toBe("leased");
      await store.revokeNode("node-b", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      expect((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).status).toBe(401);
    } finally { store.close(); }
  });

  test("a principal authenticated before credential rotation cannot later claim or submit", async () => {
    const store = await createInitializedD1Coordinator();
    const oldToken = await store.createNodeCredential("node-a", ["vpm"]);
    const oldPrincipal = (await store.authenticate("node-a", oldToken))!;
    await seedApprovedFixtureJob(store, "https://example.org/package.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const claimRequest = { schemaVersion: 1 as const, nodeId: "node-a", capabilities: ["vpm" as const] };
    try {
      const claim = await store.claim(claimRequest, oldPrincipal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected lease");
      const newToken = await store.createNodeCredential("node-a", ["vpm"]);
      await expect(store.claim(claimRequest, oldPrincipal)).rejects.toThrow();
      const resultRequest = { schemaVersion: 1 as const, nodeId: "node-a", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "credential-rotation-result-001",
        outcome: { kind: "unchanged" as const } };
      await expect(store.submit(resultRequest, oldPrincipal)).rejects.toThrow();
      const newPrincipal = (await store.authenticate("node-a", newToken))!;
      expect((await store.submit(resultRequest, newPrincipal)).status).toBe("accepted");
      await store.revokeNode("node-a", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      await expect(store.claim(claimRequest, newPrincipal)).rejects.toThrow();
    } finally { store.close(); }
  });

  test("operator suppression invalidates an outstanding lease and prevents reseeding", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("node-a", ["booth"]);
    const url = "https://booth.pm/items/42";
    await seedApprovedFixtureJob(store, url, "booth");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] });
      expect(claim.body.status).toBe("leased");
      suppressTestUrl(store, url, "creator opt-out");
      const heartbeat = await post("/v1/node/heartbeat", { schemaVersion: 1, nodeId: "node-a",
        capabilities: ["booth"], state: "fetching", activeJobId: claim.body.job.jobId,
        activeLeaseId: claim.body.job.leaseId });
      expect(heartbeat.status).toBe(403);
      const result = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
        jobId: claim.body.job.jobId, leaseId: claim.body.job.leaseId,
        idempotencyKey: "suppressed-result-001", outcome: { kind: "gone" } });
      expect(result.status).toBe(403);
      expect(store.sqlite.query("SELECT count(*) AS n FROM job_results").get()).toEqual({ n: 0 });
      expect(store.sqlite.query("SELECT count(*) AS n FROM source_versions").get()).toEqual({ n: 0 });
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] })).body.status).toBe("empty");
      await expect(store.seedJob(url, "booth")).rejects.toThrow();
      expect((store.sqlite.prepare(`SELECT kind,contributor_node_id,submission_lease_id
        FROM source_events WHERE kind='suppressed'`).get() as any)).toEqual({
          kind: "suppressed", contributor_node_id: null, submission_lease_id: null
        });
    } finally { store.close(); }
  });

  test("a later identical observation creates a check event but no duplicate version", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("node-a", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/package.json", "vpm", 1);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return await response.json() as any;
    };
    const observation = { sourceItemKey: "com.example.tool", title: "Tool", author: "Creator",
      summary: "Summary", outboundLinks: [], originUpdatedAt: null };
    try {
      let latestLeaseId = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        await allowFixtureOrigin(store, "https://example.org");
        const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
        expect(claim.status).toBe("leased");
        latestLeaseId = claim.job.leaseId;
        const result = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
          jobId: claim.job.jobId, leaseId: claim.job.leaseId, idempotencyKey: `same-content-attempt-${attempt}`,
          outcome: { kind: "changed", observation } });
        expect(result.sourceVersionCreated).toBe(attempt === 0);
        now += 24 * 60 * 60 * 1000 + 1000;
      }
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(2);
      expect((store.sqlite.prepare("SELECT kind FROM source_events ORDER BY event_id DESC LIMIT 1").get() as any).kind).toBe("unchanged");
      expect((store.sqlite.prepare(`SELECT contributor_node_id,submission_lease_id FROM source_events
        ORDER BY event_id DESC LIMIT 1`).get() as any)).toEqual({
          contributor_node_id: "node-a", submission_lease_id: latestLeaseId
        });
    } finally { store.close(); }
  });

  test("gone source evidence disappears and an identical later observation restores it without a new version", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    const principal = (await store.authenticate("vpm-node", token))!;
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "vpm-node", capabilities: ["vpm" as const] };
    const firstObservation = { sourceItemKey: "com.example.first", title: "First", author: "Creator",
      summary: "A tool", outboundLinks: [], originUpdatedAt: null };
    const secondObservation = { ...firstObservation, sourceItemKey: "com.example.second", title: "Second" };
    const submit = async (outcome: { kind: "batch"; observations: typeof firstObservation[] } |
      { kind: "partial_batch"; observations: typeof firstObservation[];
        issues: { sourceItemKey: string; code: "invalid_release_evidence" }[] } | { kind: "gone" }, key: string) => {
      await allowFixtureOrigin(store, "https://example.org");
      const claim = await store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected job lease");
      return await store.submit({ schemaVersion: 1, nodeId: "vpm-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: key, outcome }, principal);
    };
    try {
      expect((await submit({ kind: "batch", observations: [firstObservation, secondObservation] },
        "initial-vpm-listing")).sourceVersionCreated).toBe(true);
      expect(listCompleteVpmEvidence(store).length).toBe(2);
      now += 24 * 60 * 60 * 1000 + 1;
      expect((await submit({ kind: "gone" }, "entire-listing-gone")).sourceVersionCreated).toBe(false);
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_items WHERE gone_at IS NOT NULL")
        .get() as { n: number }).n).toBe(2);
      now += 24 * 60 * 60 * 1000 + 1;
      await submit({ kind: "partial_batch", observations: [firstObservation],
        issues: [{ sourceItemKey: firstObservation.sourceItemKey, code: "invalid_release_evidence" }] },
      "incomplete-listing-after-gone");
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      now += 24 * 60 * 60 * 1000 + 1;
      expect((await submit({ kind: "batch", observations: [firstObservation] },
        "listing-returns-one-item")).sourceVersionCreated).toBe(false);
      expect(listCompleteVpmEvidence(store).map((item) => item.observation.sourceItemKey))
        .toEqual(["com.example.first"]);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as { n: number }).n).toBe(2);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_events WHERE kind='restored'")
        .get() as { n: number }).n).toBe(1);
    } finally { store.close(); }
  });

  test("an expired lease cannot submit, and rate-limit backoff is shared by origin", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const aToken = await store.createNodeCredential("node-a", ["vpm"]);
    const bToken = await store.createNodeCredential("node-b", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/a", "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://example.org/b", "vpm", 1000);
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown, token: string) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const a = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken);
      now += 5 * 60 * 1000 + 1;
      const expired = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
        jobId: a.body.job.jobId, leaseId: a.body.job.leaseId, idempotencyKey: "expired-lease-key-001",
        outcome: { kind: "unchanged" } }, aToken);
      expect(expired.status).toBe(403);
      const b = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-b", capabilities: ["vpm"] }, bToken);
      expect(b.body.status).toBe("leased");
      const rateLimit = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-b",
        jobId: b.body.job.jobId, leaseId: b.body.job.leaseId, idempotencyKey: "rate-limited-key-001",
        outcome: { kind: "rate_limited", retryAfterSeconds: 60 } }, bToken);
      expect(rateLimit.status).toBe(200);
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body.status).toBe("empty");
      now += 60_001;
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body.status).toBe("leased");
    } finally { store.close(); }
  });

  test("one busy origin cannot starve another behind 100 ready jobs", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("node-a", ["vpm"]);
    for (let i = 0; i < 101; i++) await seedApprovedFixtureJob(store, `https://busy.example.org/${i}`, "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://free.example.org/item", "vpm", 1000);
    await allowFixtureOrigin(store, "https://busy.example.org", "https://free.example.org");
    const claim = async () => {
      const response = await handleNodeRequest(request("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, token), store);
      return await response.json() as any;
    };
    try {
      expect((await claim()).job.origin).toBe("https://busy.example.org");
      expect((await claim()).job.origin).toBe("https://free.example.org");
    } finally { store.close(); }
  });

  test("one repository result persists each embedded VPM package atomically", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm");
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    const observation = (sourceItemKey: string) => ({ sourceItemKey, title: sourceItemKey,
      author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
      releases: [{ version: "1.2.3", dependencyRanges: {} }] });
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "repo-batch-result-001",
        outcome: { kind: "batch", observations: [observation("com.example.one"), observation("com.example.two")] } };
      const mixedRelease = structuredClone(result);
      mixedRelease.idempotencyKey = "repo-batch-mixed-release-001";
      Object.assign(mixedRelease.outcome.observations[0], { release: { version: "1.2.3", dependencyRanges: {} } });
      expect((await post("/v1/node/jobs/result", mixedRelease)).status).toBe(409);
      const malformed = structuredClone(result);
      malformed.idempotencyKey = "repo-batch-bad-version-001";
      malformed.outcome.observations[0].releases[0].version = "v1.2.3";
      expect((await post("/v1/node/jobs/result", malformed)).status).toBe(400);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(0);
      result.outcome.observations[0].releases[0].version = "1.2.3-rc.2+build.04";
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(2);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(2);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(2);
      expect(listCompleteVpmEvidence(store).find((item) => item.observation.sourceItemKey === "com.example.one")
        ?.observation.releases?.[0]?.version).toBe("1.2.3-rc.2+build.04");
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
    } finally { store.close(); }
  });

  test("a storefront lease cannot turn product metadata into VPM release evidence", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("booth-node", ["booth"]);
    await seedApprovedFixtureJob(store, "https://booth.pm/items/123", "booth");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "booth-node", capabilities: ["booth"] });
      expect(claim.body.status).toBe("leased");
      const observation = { sourceItemKey: "booth.pm/items/123", title: "Tool", author: "Creator",
        summary: "", outboundLinks: [], originUpdatedAt: null };
      const result = { schemaVersion: 1, nodeId: "booth-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "booth-product-result-001",
        outcome: { kind: "changed", observation } };
      const forgedRelease = structuredClone(result);
      forgedRelease.idempotencyKey = "booth-forged-release-001";
      Object.assign(forgedRelease.outcome.observation, { release: { version: "1.0.0", dependencyRanges: {} } });
      const internal = await post("/v1/node/jobs/result", forgedRelease);
      expect(internal.status).toBe(409);
      expect(internal.body).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "conflict" });
      const forgedBatch = { ...result, idempotencyKey: "booth-forged-batch-001",
        outcome: { kind: "batch", observations: [observation, { ...observation, sourceItemKey: "booth.pm/items/999" }] } };
      expect((await post("/v1/node/jobs/result", forgedBatch)).status).toBe(409);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(0);
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
    } finally { store.close(); }
  });

  test("a BOOTH browse lease persists only bounded local product leads, never product facts", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("browse-node", ["booth"]);
    const browseUrl = "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=1";
    await seedApprovedFixtureJob(store, browseUrl, "booth", 0, "discovery");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "browse-node", capabilities: ["booth"] });
      expect(claim.body.status).toBe("leased");
      const parsedClaim = ClaimResponseSchema.parse(claim.body);
      if (parsedClaim.status !== "leased") throw new Error("Expected a BOOTH browse lease");
      expect(parsedClaim.job.purpose).toBe("discovery");
      const outcome = { kind: "discovery", leads: [
        { kind: "storefront_product", url: "https://booth.pm/ja/items/12345" },
        { kind: "storefront_product", url: "https://booth.pm/ja/items/67890" }
      ] };
      const base = { schemaVersion: 1, nodeId: "browse-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "booth-browse-leads-001" };
      const forgedFacts = { ...base, idempotencyKey: "booth-browse-forged-facts-001",
        outcome: { kind: "changed", observation: { sourceItemKey: "booth.pm/items/12345",
          title: "Forged product", author: "Unknown", summary: "", outboundLinks: [], originUpdatedAt: null } } };
      expect((await post("/v1/node/jobs/result", forgedFacts)).status).toBe(409);
      const forgedLead = { ...base, idempotencyKey: "booth-browse-forged-lead-001",
        outcome: { kind: "discovery", leads: [{ kind: "storefront_product",
          url: "https://other.example/items/999" }] } };
      const internal = await post("/v1/node/jobs/result", forgedLead);
      expect(internal.status).toBe(409);
      expect(internal.body).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "conflict" });
      expect((await post("/v1/node/jobs/result", { ...base, outcome })).status).toBe(200);
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(store.sqlite.query("SELECT kind,target_url,status FROM source_leads ORDER BY target_url").all())
        .toEqual([
          { kind: "storefront_product", target_url: "https://booth.pm/ja/items/12345", status: "pending_review" },
          { kind: "storefront_product", target_url: "https://booth.pm/ja/items/67890", status: "pending_review" }
        ]);
    } finally { store.close(); }
  });

  test("partial repository evidence records diagnostics without inventing missing versions", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "partial-listing-result-001",
        outcome: { kind: "partial_batch", observations: [{ sourceItemKey: "com.example.good", title: "Good",
          author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
          releases: [{ version: "1.0.0", dependencyRanges: {} }] }],
          issues: [{ sourceItemKey: "com.example.good", version: "v2.0.0", code: "invalid_version" }] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT complete FROM source_versions").get() as any).complete).toBe(0);
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      expect((store.sqlite.prepare("SELECT source_item_key,version_key,code FROM source_issues").get() as any))
        .toEqual({ source_item_key: "com.example.good", version_key: "v2.0.0", code: "invalid_version" });
      expect((store.sqlite.prepare("SELECT contributor_node_id,submission_lease_id FROM source_issues").get() as any))
        .toEqual({ contributor_node_id: "vpm-node", submission_lease_id: claim.body.job.leaseId });
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_events WHERE kind='incomplete_listing'").get() as any).n).toBe(1);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_issues").get() as any).n).toBe(1);
      now += 24 * 60 * 60 * 1000;
      await allowFixtureOrigin(store, "https://example.org");
      const retry = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      expect(retry.body.status).toBe("leased");
      const complete = { ...result, leaseId: retry.body.job.leaseId, idempotencyKey: "complete-listing-result-001",
        outcome: { kind: "batch", observations: result.outcome.observations } };
      expect((await post("/v1/node/jobs/result", complete)).status).toBe(200);
      expect((store.sqlite.prepare("SELECT version_no,complete FROM source_versions ORDER BY version_no").all() as any[]))
        .toEqual([{ version_no: 1, complete: 0 }, { version_no: 2, complete: 1 }]);
      expect(listCompleteVpmEvidence(store).map((item) => [item.sourceUrl, item.sourceVersionNo,
        item.observation.releases?.map((release) => release.version)]))
        .toEqual([["https://example.org/index.json", 2, ["1.0.0"]]]);
      expect(listCompleteVpmEvidence(store)[0]).toMatchObject({ contributorNodeId: "vpm-node",
        submissionLeaseId: retry.body.job.leaseId });
    } finally { store.close(); }
  });

  test("an incomplete later fetch cannot replace the last complete VPM read model", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    const url = "https://example.org/index.json";
    await seedApprovedFixtureJob(store, url, "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    const claim = () => post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
    const observation = (version: string) => ({ sourceItemKey: "com.example.tool", title: "Tool", author: "Creator",
      summary: "", outboundLinks: [], originUpdatedAt: null, releases: [{ version, dependencyRanges: {} }] });
    try {
      const first = await claim();
      expect((await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "vpm-node",
        jobId: first.body.job.jobId, leaseId: first.body.job.leaseId, idempotencyKey: "complete-older-result-001",
        outcome: { kind: "batch", observations: [observation("1.0.0")] } })).status).toBe(200);
      now += 24 * 60 * 60 * 1000;
      await allowFixtureOrigin(store, "https://example.org");
      const second = await claim();
      expect((await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "vpm-node",
        jobId: second.body.job.jobId, leaseId: second.body.job.leaseId, idempotencyKey: "partial-newer-result-001",
        outcome: { kind: "partial_batch", observations: [observation("1.1.0")],
          issues: [{ sourceItemKey: "com.example.tool", version: "1.2.0", code: "invalid_manifest" }] } })).status).toBe(200);
      expect((store.sqlite.prepare("SELECT version_no,complete FROM source_versions ORDER BY version_no").all() as any[]))
        .toEqual([{ version_no: 1, complete: 1 }, { version_no: 2, complete: 0 }]);
      expect(listCompleteVpmEvidence(store)[0].observation.releases?.map((release) => release.version)).toEqual(["1.0.0"]);
      suppressTestUrl(store, url, "operator stop", () => now);
      expect(listCompleteVpmEvidence(store)).toEqual([]);
    } finally { store.close(); }
  });

  test("the same package ID in two listings retains separate source evidence", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://first.example.org/index.json", "vpm", 0);
    await seedApprovedFixtureJob(store, "https://second.example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://first.example.org", "https://second.example.org");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      for (const version of ["1.0.0", "2.0.0"]) {
        const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
        expect(claim.body.status).toBe("leased");
        const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
          leaseId: claim.body.job.leaseId, idempotencyKey: `listing-result-${version}`,
          outcome: { kind: "changed", observation: { sourceItemKey: "com.example.shared",
            title: "Shared", author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
            release: { version, dependencyRanges: {} } } } };
        expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      }
      const rows = store.sqlite.prepare("SELECT source_key,source_url FROM source_items ORDER BY source_url").all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].source_key).not.toBe(rows[1].source_key);
      expect(rows.map((row) => row.source_url)).toEqual([
        "https://first.example.org/index.json", "https://second.example.org/index.json"]);
    } finally { store.close(); }
  });

  test("recipe leads cross the result schema and await review without becoming crawl jobs", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/source.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "template-recipe-leads-001",
        outcome: { kind: "discovery", leads: [
          { kind: "vpm_listing", url: "https://example.org/index.json" },
          { kind: "github_repository", url: "https://github.com/example/tool" },
          { kind: "release_zip", url: "https://example.org/tool.zip", claimedPackageId: "com.example.tool" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
      const leads = store.sqlite.prepare("SELECT kind,target_url,status FROM source_leads ORDER BY kind").all() as any[];
      expect(leads).toEqual([
        { kind: "github_repository", target_url: "https://github.com/example/tool", status: "pending_review" },
        { kind: "release_zip", target_url: "https://example.org/tool.zip", status: "pending_review" },
        { kind: "vpm_listing", target_url: "https://example.org/index.json", status: "pending_review" }
      ]);
      expect((store.sqlite.prepare(`SELECT first_seen_node_id,first_seen_lease_id,
        last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1`).get() as any)).toEqual({
          first_seen_node_id: "vpm-node", first_seen_lease_id: claim.body.job.leaseId,
          last_seen_node_id: "vpm-node", last_seen_lease_id: claim.body.job.leaseId
        });
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(0);
      expect((store.sqlite.prepare("SELECT kind FROM source_events").get() as any).kind).toBe("discovery");
      const secondToken = await store.createNodeCredential("second-vpm-node", ["vpm"]);
      store.sqlite.prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE job_id=?")
        .run("1970-01-01T00:00:00.000Z", claim.body.job.jobId);
      store.sqlite.prepare("UPDATE origin_leases SET next_allowed_at=? WHERE origin=?")
        .run("1970-01-01T00:00:00.000Z", "https://example.org");
      const secondClaim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "second-vpm-node", capabilities: ["vpm"] }, secondToken);
      expect(secondClaim.body.status).toBe("leased");
      expect((await post("/v1/node/jobs/result", {
        ...result, nodeId: "second-vpm-node", leaseId: secondClaim.body.job.leaseId,
        idempotencyKey: "template-recipe-leads-002"
      }, secondToken)).status).toBe(200);
      expect((store.sqlite.prepare(`SELECT first_seen_node_id,first_seen_lease_id,
        last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1`).get() as any)).toEqual({
          first_seen_node_id: "vpm-node", first_seen_lease_id: claim.body.job.leaseId,
          last_seen_node_id: "second-vpm-node", last_seen_lease_id: secondClaim.body.job.leaseId
        });
      expect(inspectNodeEvidence(store, "vpm-node").totals).toMatchObject({
        leadsFirstSeen: 3, leadsLastSeen: 0
      });
      expect(inspectNodeEvidence(store, "second-vpm-node").totals).toMatchObject({
        leadsFirstSeen: 0, leadsLastSeen: 3
      });
      const listingLead = store.sqlite.prepare("SELECT lead_key FROM source_leads WHERE kind='vpm_listing'").get() as { lead_key: string };
      const zipLead = store.sqlite.prepare("SELECT lead_key FROM source_leads WHERE kind='release_zip'").get() as { lead_key: string };
      await expect(store.approveDiscoveryLead(zipLead.lead_key)).rejects.toThrow();
      const listingJobId = await store.approveDiscoveryLead(listingLead.lead_key);
      expect(typeof listingJobId).toBe("string");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(2);
      expect((store.sqlite.prepare("SELECT status FROM source_leads WHERE lead_key=?").get(listingLead.lead_key) as any).status).toBe("approved");
    } finally { store.close(); }
  });

  test("creator and storefront candidate leads remain separate and cannot fetch without source access", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("curated-node", ["curated", "custom_domain"]);
    await seedApprovedFixtureJob(store, "https://directory.example.org/avatars", "curated", 0);
    await allowFixtureOrigin(store, "https://directory.example.org", "https://artist.example.org");
    const post = async (path: string, body: unknown) => handleNodeRequest(request(path, body, token), store);
    try {
      const claim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "curated-node", capabilities: ["curated"] });
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      const result = { schemaVersion: 1, nodeId: "curated-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "creator-link-chain-001",
        outcome: { kind: "discovery", leads: [
          { kind: "creator_profile", url: "https://profiles.example.org/artist" },
          { kind: "publisher_site", url: "https://artist.example.org/" },
          { kind: "storefront_product", url: "https://artist.example.org/shop/avatar" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const leads = store.sqlite.prepare(`SELECT lead_key,kind,target_url,discovered_from_url,status
        FROM source_leads ORDER BY kind`).all() as { lead_key: string; kind: string; target_url: string; discovered_from_url: string; status: string }[];
      expect(leads.map(({ kind, target_url, discovered_from_url, status }) => ({ kind, target_url, discovered_from_url, status }))).toEqual([
        { kind: "creator_profile", target_url: "https://profiles.example.org/artist",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" },
        { kind: "publisher_site", target_url: "https://artist.example.org/",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" },
        { kind: "storefront_product", target_url: "https://artist.example.org/shop/avatar",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" }
      ]);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(0);

      const creatorLead = leads.find((l) => l.kind === "creator_profile")!;
      await expect(store.approveDiscoveryLead(creatorLead.lead_key)).rejects.toThrow();

      for (const lead of leads.filter((l) => l.kind !== "creator_profile")) {
        const jobId = await store.approveDiscoveryLead(lead.lead_key);
        const queued = store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(jobId) as { platform: string; job_purpose: string };
        expect(queued).toEqual({ platform: "custom_domain", job_purpose: "metadata" });
      }

      const postApprovalClaim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "curated-node", capabilities: ["curated", "custom_domain"] });
      expect((await postApprovalClaim.json() as any).status).toBe("empty");
    } finally { store.close(); }
  });

  test("two source items linking one author site retain separate lead provenance", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("avatar-index-node", ["curated"]);
    await seedApprovedFixtureJob(store, "https://index.example.org/avatars", "curated", 0);
    await allowFixtureOrigin(store, "https://index.example.org");
    const post = async (path: string, body: unknown) => handleNodeRequest(request(path, body, token), store);
    try {
      const claim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "avatar-index-node", capabilities: ["curated"] });
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      const result = { schemaVersion: 1, nodeId: "avatar-index-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "separate-avatar-author-leads",
        outcome: { kind: "discovery", leads: [
          { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_a" },
          { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_b" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const { leads } = await store.listLeadsPage("pending_review", 100, null);
      expect(leads).toHaveLength(2);
      expect(new Set(leads.map((lead) => lead.lead_key)).size).toBe(2);
      expect(leads.map((lead) => lead.discovered_from_item_key).sort()).toEqual(["avtr_a", "avtr_b"]);
      expect(leads.every((lead) => lead.target_url === "https://artist.example.org/" &&
        lead.status === "pending_review")).toBe(true);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
    } finally { store.close(); }
  });

  test("rediscovery keeps the pre-anchor identity of an unanchored lead", async () => {
    const store = await createInitializedD1Coordinator();
    const token = await store.createNodeCredential("legacy-lead-node", ["vpm"]);
    const sourceUrl = "https://listing.example.org/source.json";
    const targetUrl = "https://listing.example.org/index.json";
    const leadKey = crypto.createHash("sha256")
      .update(JSON.stringify([sourceUrl, "vpm_listing", targetUrl, null])).digest("hex");
    await seedApprovedFixtureJob(store, sourceUrl, "vpm", 0);
    await allowFixtureOrigin(store, "https://listing.example.org");
    try {
      const claim = await handleNodeRequest(request("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "legacy-lead-node", capabilities: ["vpm"] }, token), store);
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      store.sqlite.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,claimed_package_id,status,
          first_seen_at,last_seen_at)
        VALUES (?,?,?,?,?,NULL,'pending_review',?,?)`)
        .run(leadKey, sourceUrl, leased.job.jobId, "vpm_listing", targetUrl,
          "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const result = await handleNodeRequest(request("/v1/node/jobs/result", {
        schemaVersion: 1, nodeId: "legacy-lead-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "legacy-unanchored-rediscovery",
        outcome: { kind: "discovery", leads: [{ kind: "vpm_listing", url: targetUrl }] }
      }, token), store);
      expect(result.status).toBe(200);
      const leads = store.sqlite.prepare("SELECT lead_key,discovered_from_item_key FROM source_leads").all() as any[];
      expect(leads).toEqual([{ lead_key: leadKey, discovered_from_item_key: null }]);
    } finally { store.close(); }
  });

  test("autoSeed queues candidates without granting fetching or inventing robots", async () => {
    const store = await createInitializedD1Coordinator(":memory:", undefined, true);
    try {
      const profiles = await store.listSourceAccessProfilesPage(100, null);
      expect(profiles.profiles).toHaveLength(0);
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM origin_robots").get()).toEqual({ count: 0 });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM source_access_profile_actions").get()).toEqual({ count: 0 });

      const jobs = store.sqlite.prepare("SELECT COUNT(*) AS count FROM crawl_jobs").get() as { count: number };
      expect(jobs.count).toBe(DEFAULT_SEED_JOBS.length);
      const capabilities = [...PlatformSchema.options];
      const token = await store.createNodeCredential("bootstrap-node", capabilities);
      const response = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: 1, nodeId: "bootstrap-node", capabilities
      }, token), store);
      expect(response.status).toBe(200);
      expect(ClaimResponseSchema.parse(await response.json()).status).toBe("empty");
    } finally { store.close(); }
  });

  test("repeated candidate seeding preserves disabled profiles, robots denial and blocked jobs", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-03T00:00:00.000Z"), true);
    try {
      const target = DEFAULT_SEED_JOBS[0]!;
      const url = new URL(target.url);
      const profile = await store.createSourceAccessProfile({ schemaVersion: 1, platform: target.platform,
        origin: url.origin, pathScope: url.pathname, method: "GET", purpose: target.purpose,
        minDelayMs: 1000, expiresAt: "2026-10-04T00:00:00.000Z",
        reviewReference: "OFFLINE-BOOTSTRAP-FIXTURE", reason: "Hermetic startup fixture",
        retainClasses: ["normalized_facts"], publishClasses: [] }, "fixture-operator");
      await store.recordRobotsSnapshot(url.origin, 200, "User-agent: *\nDisallow: /");
      await store.disableSourceAccessProfile(profile.profileId, "fixture-operator", "Access withdrawn");
      suppressTestUrl(store, DEFAULT_SEED_JOBS[1]!.url, "Fixture suppression");
      const profiles = store.sqlite.query("SELECT * FROM source_access_profiles").all();
      const actions = store.sqlite.query("SELECT * FROM source_access_profile_actions").all();
      const robots = store.sqlite.query("SELECT * FROM origin_robots").all();
      const jobs = store.sqlite.query("SELECT * FROM crawl_jobs ORDER BY url").all();
      await store.seedInitialJobs();
      await store.seedInitialJobs();
      expect(store.sqlite.query("SELECT * FROM source_access_profiles").all()).toEqual(profiles);
      expect(store.sqlite.query("SELECT * FROM source_access_profile_actions").all()).toEqual(actions);
      expect(store.sqlite.query("SELECT * FROM origin_robots").all()).toEqual(robots);
      expect(store.sqlite.query("SELECT * FROM crawl_jobs ORDER BY url").all()).toEqual(jobs);
    } finally { store.close(); }
  });

  test("batched claim with maxJobs enforces per-origin reservations and anti-contention", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      // Seed 2 jobs on origin 1, and 1 job each on origin 2 and 3
      await seedApprovedFixtureJob(store, "https://origin1.example.org/item1", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin1.example.org/item2", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin2.example.org/item1", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin3.example.org/item1", "vpm", 1000);
      await allowFixtureOrigin(store, "https://origin1.example.org", "https://origin2.example.org", "https://origin3.example.org");

      const token = await store.createNodeCredential("batch-node", ["vpm"]);
      const res = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-node",
        capabilities: ["vpm"],
        maxJobs: 5
      }, token), store);

      expect(res.status).toBe(200);
      const parsed = ClaimResponseSchema.parse(await res.json());
      expect(parsed.status).toBe("leased");
      if (parsed.status !== "leased") throw new Error("Expected leased status");

      // We expect 3 leased jobs: 1 from origin1, 1 from origin2, 1 from origin3.
      // The second job from origin1 must NOT be leased in the same batch (origin reservation fairness).
      expect(parsed.jobs?.length).toBe(3);
      expect(parsed.job).toEqual(parsed.jobs![0]!);
      const origins = parsed.jobs!.map((j) => j.origin);
      expect(new Set(origins).size).toBe(3);
      expect(origins).toContain("https://origin1.example.org");
      expect(origins).toContain("https://origin2.example.org");
      expect(origins).toContain("https://origin3.example.org");
    } finally {
      store.close();
    }
  });

  test("batched result submission delivers atomic per-item receipts and isolates partial failures", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await seedApprovedFixtureJob(store, "https://batch-sub1.example.org/index.json", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://batch-sub2.example.org/index.json", "vpm", 1000);
      await allowFixtureOrigin(store, "https://batch-sub1.example.org", "https://batch-sub2.example.org");

      const token = await store.createNodeCredential("batch-sub-node", ["vpm"]);
      const claimRes = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-sub-node",
        capabilities: ["vpm"],
        maxJobs: 2
      }, token), store);
      const claim = ClaimResponseSchema.parse(await claimRes.json());
      if (claim.status !== "leased" || !claim.jobs || claim.jobs.length !== 2) {
        throw new Error("Expected 2 leased jobs");
      }

      const job1 = claim.jobs[0]!;
      const job2 = claim.jobs[1]!;
      const key1 = "idemp-" + crypto.randomUUID();
      const key2 = "idemp-" + crypto.randomUUID();

      // Submit both in a single batch
      const batchRes = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-sub-node",
        results: [
          {
            jobId: job1.jobId,
            leaseId: job1.leaseId,
            idempotencyKey: key1,
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "pkg1",
                title: "Package One",
                author: "Author One",
                summary: "Summary One",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          },
          {
            jobId: job2.jobId,
            leaseId: job2.leaseId,
            idempotencyKey: key2,
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "pkg2",
                title: "Package Two",
                author: "Author Two",
                summary: "Summary Two",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          }
        ]
      }, token), store);

      expect(batchRes.status).toBe(200);
      const batchParsed = BatchResultResponseSchema.parse(await batchRes.json());
      expect(batchParsed.receipts.length).toBe(2);
      expect(batchParsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: false });
      expect(batchParsed.receipts[1]).toMatchObject({ status: "accepted", jobId: job2.jobId, duplicate: false });

      // Duplicate replay of the same batch returns accepted receipts with duplicate: true
      const replayRes = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-sub-node",
        results: [
          {
            jobId: job1.jobId,
            leaseId: job1.leaseId,
            idempotencyKey: key1,
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "pkg1",
                title: "Package One",
                author: "Author One",
                summary: "Summary One",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          }
        ]
      }, token), store);
      const replayParsed = BatchResultResponseSchema.parse(await replayRes.json());
      expect(replayParsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: true });

      // Mixed batch with invalid/expired lease and valid new job
      await seedApprovedFixtureJob(store, "https://batch-sub3.example.org/index.json", "vpm", 1000);
      await allowFixtureOrigin(store, "https://batch-sub3.example.org");
      const claim3Res = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-sub-node",
        capabilities: ["vpm"],
        maxJobs: 1
      }, token), store);
      const claim3 = ClaimResponseSchema.parse(await claim3Res.json());
      if (claim3.status !== "leased") throw new Error("Expected job 3 leased");
      const job3 = claim3.job;

      const mixedRes = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "batch-sub-node",
        results: [
          {
            jobId: crypto.randomUUID(),
            leaseId: crypto.randomUUID(),
            idempotencyKey: "bad-lease-key-" + crypto.randomUUID(),
            outcome: { kind: "rate_limited", retryAfterSeconds: 60 }
          },
          {
            jobId: job3.jobId,
            leaseId: job3.leaseId,
            idempotencyKey: "valid-key-" + crypto.randomUUID(),
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "pkg3",
                title: "Package Three",
                author: "Author Three",
                summary: "Summary Three",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          }
        ]
      }, token), store);

      expect(mixedRes.status).toBe(200);
      const mixedParsed = BatchResultResponseSchema.parse(await mixedRes.json());
      expect(mixedParsed.receipts.length).toBe(2);
      expect(mixedParsed.receipts[0]).toMatchObject({ status: "rejected", terminal: true, code: "not_found" });
      expect(mixedParsed.receipts[1]).toMatchObject({ status: "accepted", jobId: job3.jobId });
    } finally {
      store.close();
    }
  });

  test("prior receipt replay post-lease-expiry vs first late-result rejection (R54-C39D)", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const token = await store.createNodeCredential("late-node", ["vpm"]);
      await seedApprovedFixtureJob(store, "https://late-test1.example.org/pkg1.json", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://late-test2.example.org/pkg2.json", "vpm", 1000);
      await allowFixtureOrigin(store, "https://late-test1.example.org");
      await allowFixtureOrigin(store, "https://late-test2.example.org");

      // Claim job 1
      const claim1Res = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        capabilities: ["vpm"]
      }, token), store);
      const claim1 = ClaimResponseSchema.parse(await claim1Res.json());
      if (claim1.status !== "leased") throw new Error("Expected job 1 leased");
      const job1 = claim1.job;

      // Submit job 1 while lease is still live (valid submission)
      const idKey1 = "idemp-key-ontime-" + crypto.randomUUID();
      const sub1Res = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        results: [{
          jobId: job1.jobId,
          leaseId: job1.leaseId,
          idempotencyKey: idKey1,
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "ontime-pkg",
              title: "On Time Package",
              author: "Author",
              summary: "Summary",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        }]
      }, token), store);
      expect(sub1Res.status).toBe(200);
      const sub1Parsed = BatchResultResponseSchema.parse(await sub1Res.json());
      expect(sub1Parsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: false });

      // Claim job 2
      const claim2Res = await handleNodeRequest(request("/v1/node/jobs/claim", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        capabilities: ["vpm"]
      }, token), store);
      const claim2 = ClaimResponseSchema.parse(await claim2Res.json());
      if (claim2.status !== "leased") throw new Error("Expected job 2 leased");
      const job2 = claim2.job;

      // Advance clock past lease expiration (both leases are now expired)
      now += 600_000; // 10 minutes later

      // Test Case A: Prior receipt replay post-lease-expiry succeeds (exact idempotency preserved)
      const replayRes = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        results: [{
          jobId: job1.jobId,
          leaseId: job1.leaseId,
          idempotencyKey: idKey1,
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "ontime-pkg",
              title: "On Time Package",
              author: "Author",
              summary: "Summary",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        }]
      }, token), store);
      expect(replayRes.status).toBe(200);
      const replayParsed = BatchResultResponseSchema.parse(await replayRes.json());
      expect(replayParsed.receipts[0]).toMatchObject({
        status: "accepted",
        jobId: job1.jobId,
        duplicate: true
      });

      // Test Case B: First late submission for job 2 (no prior submission) is rejected with lease_expired
      const idKey2 = "idemp-key-late-" + crypto.randomUUID();
      const lateRes = await handleNodeRequest(request("/v1/node/jobs/results", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        results: [{
          jobId: job2.jobId,
          leaseId: job2.leaseId,
          idempotencyKey: idKey2,
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "late-pkg",
              title: "Late Package",
              author: "Author",
              summary: "Summary",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        }]
      }, token), store);
      expect(lateRes.status).toBe(200);
      const lateParsed = BatchResultResponseSchema.parse(await lateRes.json());
      expect(lateParsed.receipts[0]).toMatchObject({
        status: "rejected",
        jobId: job2.jobId,
        terminal: true,
        code: "lease_expired"
      });

      // Test Case C: Single endpoint /v1/node/jobs/result also rejects first late submission with 403
      const singleLateRes = await handleNodeRequest(request("/v1/node/jobs/result", {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "late-node",
        jobId: job2.jobId,
        leaseId: job2.leaseId,
        idempotencyKey: "single-late-" + crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "late-pkg-2",
            title: "Late Package 2",
            author: "Author",
            summary: "Summary",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, token), store);
      expect(singleLateRes.status).toBe(403);
    } finally {
      store.close();
    }
  });
  describe("delegated node robots preflight protocol (R24-C21)", () => {
    test("/v1/node/robots/claim: rejects unauthenticated requests and returns empty when no origins due", async () => {
      let now = Date.parse("2026-10-18T00:00:00.000Z");
      const store = await createInitializedD1Coordinator(":memory:", () => now);
      const token = await store.createNodeCredential("robot-node", ["vpm"]);
      try {
        const unauth = await handleNodeRequest(request("/v1/node/robots/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node"
        }, "bad-token"), store);
        expect(unauth.status).toBe(401);

        const emptyRes = await handleNodeRequest(request("/v1/node/robots/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node"
        }, token), store);
        expect(emptyRes.status).toBe(200);
        const emptyBody = await emptyRes.json() as { status: string; retryAfterMs: number };
        expect(emptyBody.status).toBe("empty");
        expect(emptyBody.retryAfterMs).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    test("/v1/node/robots/claim and /v1/node/robots/result: leases robots refresh, stores snapshot, and unblocks crawl jobs", async () => {
      let now = Date.parse("2026-10-18T00:00:00.000Z");
      const store = await createInitializedD1Coordinator(":memory:", () => now);
      const token = await store.createNodeCredential("robot-node", ["vpm"]);
      const targetOrigin = "https://unscraped.example.org";
      try {
        // Seed an approved job, but do not record a robots snapshot
        await seedApprovedFixtureJob(store, `${targetOrigin}/index.json`, "vpm", 0);

        // Regular claim is empty because robots snapshot is missing
        const claimBefore = await handleNodeRequest(request("/v1/node/jobs/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node",
          capabilities: ["vpm"]
        }, token), store);
        expect(claimBefore.status).toBe(200);
        expect((await claimBefore.json() as { status: string }).status).toBe("empty");

        // Robots claim leases the due origin
        const robotsClaimRes = await handleNodeRequest(request("/v1/node/robots/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node"
        }, token), store);
        expect(robotsClaimRes.status).toBe(200);
        const robotsClaimBody = await robotsClaimRes.json() as { status: string; origin: string; leaseId: string };
        expect(robotsClaimBody.status).toBe("leased");
        expect(robotsClaimBody.origin).toBe(targetOrigin);
        expect(robotsClaimBody.leaseId).toBeTruthy();

        // Submit the robots preflight result
        const robotsResultRes = await handleNodeRequest(request("/v1/node/robots/result", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node",
          origin: targetOrigin,
          leaseId: robotsClaimBody.leaseId,
          statusCode: 200,
          body: "User-agent: *\nAllow: /"
        }, token), store);
        expect(robotsResultRes.status).toBe(200);
        const robotsResultBody = await robotsResultRes.json() as { status: string; origin: string };
        expect(robotsResultBody.status).toBe("accepted");
        expect(robotsResultBody.origin).toBe(targetOrigin);

        // Replaying submission with consumed/expired lease fails with 403
        const replayRes = await handleNodeRequest(request("/v1/node/robots/result", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node",
          origin: targetOrigin,
          leaseId: robotsClaimBody.leaseId,
          statusCode: 200,
          body: "User-agent: *\nAllow: /"
        }, token), store);
        expect(replayRes.status).toBe(403);

        // Advance time past origin pacing floor (1000ms)
        now += 1500;

        // Now that robots snapshot exists and allows /, regular claim succeeds!
        const claimAfter = await handleNodeRequest(request("/v1/node/jobs/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "robot-node",
          capabilities: ["vpm"]
        }, token), store);
        expect(claimAfter.status).toBe(200);
        const claimAfterBody = await claimAfter.json() as { status: string; job?: { url: string } };
        expect(claimAfterBody.status).toBe("leased");
        expect(claimAfterBody.job?.url).toBe(`${targetOrigin}/index.json`);
      } finally {
        store.close();
      }
    });
  });

  describe("FLEET-S2 Initial Seeds and Storefront Discovery Protocol", () => {
    test("seedInitialProfiles attaches approved open VPM community listing profiles idempotently", async () => {
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-18T00:00:00.000Z"), true);
      try {
        // Initial autoSeed creates candidate jobs only, with 0 profiles
        expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM source_access_profiles").get()).toEqual({ count: 0 });

        // Explicitly seed approved initial profiles
        await store.seedInitialProfiles();

        const countRow = store.sqlite.prepare("SELECT COUNT(*) AS count FROM source_access_profiles").get() as { count: number };
        expect(countRow.count).toBe(DEFAULT_APPROVED_SOURCE_PROFILES.length);

        const profiles = store.sqlite.prepare("SELECT profile_id, platform, origin, path_scope, review_reference FROM source_access_profiles ORDER BY profile_id").all() as {
          profile_id: string; platform: string; origin: string; path_scope: string; review_reference: string;
        }[];
        expect(profiles.some(p => p.review_reference === "COMMUNITY-VPM-TEMPLATE")).toBe(true);
        expect(profiles.some(p => p.review_reference === "COMMUNITY-VPM-LISTING")).toBe(true);

        // Calling seedInitialProfiles a second time is idempotent
        await store.seedInitialProfiles();
        const countRow2 = store.sqlite.prepare("SELECT COUNT(*) AS count FROM source_access_profiles").get() as { count: number };
        expect(countRow2.count).toBe(DEFAULT_APPROVED_SOURCE_PROFILES.length);
      } finally {
        store.close();
      }
    });

    test("Ko-fi storefront seed is queued and classified as storefront_product", async () => {
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-18T00:00:00.000Z"), true);
      try {
        const kofiJob = store.sqlite.prepare("SELECT * FROM crawl_jobs WHERE url='https://ko-fi.com/s/sample-vrc-item'").get() as {
          url: string; platform: string; job_purpose: string; min_delay_ms: number;
        } | null;
        expect(kofiJob).not.toBeNull();
        expect(kofiJob?.platform).toBe("custom_domain");
        expect(kofiJob?.job_purpose).toBe("metadata");

        // classifyOutboundLeadKind identifies ko-fi.com
        expect(classifyOutboundLeadKind("https://ko-fi.com/s/sample-vrc-item")).toBe("storefront_product");
        expect(classifyOutboundLeadKind("https://ko-fi.com/creator-profile")).toBe("storefront_product");

        // Storefront leads remain separate from VPM jobs and map to custom_domain metadata
        const sampleJob = store.sqlite.prepare("SELECT job_id, url FROM crawl_jobs LIMIT 1").get() as { job_id: string; url: string };
        const kofiLeadKey = "a".repeat(64);
        const zipLeadKey = "b".repeat(64);
        store.sqlite.prepare(`INSERT INTO source_leads (lead_key, discovered_from_url, discovered_from_job_id, kind, target_url, status, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, 'storefront_product', 'https://ko-fi.com/s/sample-vrc-item', 'pending_review', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z')`).run(kofiLeadKey, sampleJob.url, sampleJob.job_id);
        const approvedKofiJobId = await store.approveDiscoveryLead(kofiLeadKey);
        const approvedKofiJob = store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(approvedKofiJobId) as { platform: string; job_purpose: string };
        expect(approvedKofiJob).toEqual({ platform: "custom_domain", job_purpose: "metadata" });
        const kofiLease = store.sqlite.prepare("SELECT min_delay_ms FROM origin_leases WHERE origin='https://ko-fi.com'").get() as { min_delay_ms: number };
        expect(kofiLease.min_delay_ms).toBeGreaterThanOrEqual(2000);
        store.sqlite.prepare(`INSERT INTO source_leads (lead_key, discovered_from_url, discovered_from_job_id, kind, target_url, status, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, 'release_zip', 'https://example.org/pkg.zip', 'pending_review', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z')`).run(zipLeadKey, sampleJob.url, sampleJob.job_id);
        await expect(store.approveDiscoveryLead(zipLeadKey)).rejects.toThrow("Only published VPM listing leads can become VPM crawl jobs");
      } finally {
        store.close();
      }
    });

    test("storefront discovery leads are partitioned into pending_review and cannot become VPM fetch jobs", async () => {
      let now = Date.parse("2026-10-18T00:00:00.000Z");
      const store = await createInitializedD1Coordinator(":memory:", () => now, false);
      try {
        const nodeToken = await store.createNodeCredential("crawler-node-leads", ["vpm", "booth", "custom_domain"]);
        await allowFixtureOrigin(store, "https://vpm.example.org", "https://booth.pm", "https://ko-fi.com");
        await store.createSourceAccessProfile({
          schemaVersion: 1,
          platform: "vpm",
          origin: "https://vpm.example.org",
          pathScope: "/index.json",
          method: "GET",
          purpose: "discovery",
          minDelayMs: 1000,
          expiresAt: "2026-10-19T00:00:00.000Z",
          reviewReference: "TEST-VPM-DISCOVERY",
          reason: "Testing lead review policy",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        }, "operator");
        const jobId = await store.seedJob("https://vpm.example.org/index.json", "vpm", 1000, undefined, "discovery");

        // Claim the job
        const claimRes = await handleNodeRequest(request("/v1/node/jobs/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "crawler-node-leads",
          capabilities: ["vpm"]
        }, nodeToken), store);
        const claimData = await claimRes.json() as { job?: { jobId: string; leaseId: string } };
        expect(claimData.job?.jobId).toBe(jobId);

        // Submit discovery result with both a booth.pm lead and a ko-fi lead
        const submitRes = await handleNodeRequest(request("/v1/node/jobs/result", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "crawler-node-leads",
          jobId,
          leaseId: claimData.job!.leaseId,
          idempotencyKey: "idempotency-lead-chain-001",
          outcome: {
            kind: "discovery",
            leads: [
              { kind: "storefront_product", url: "https://booth.pm/ja/items/123456" },
              { kind: "storefront_product", url: "https://ko-fi.com/s/sample-vrc-item" }
            ]
          }
        }, nodeToken), store);
        expect(submitRes.status).toBe(200);

        // Both storefront leads are recorded in pending_review
        const boothLead = store.sqlite.prepare("SELECT * FROM source_leads WHERE target_url='https://booth.pm/ja/items/123456'").get() as {
          lead_key: string; status: string; kind: string;
        } | null;
        expect(boothLead?.status).toBe("pending_review");
        expect(boothLead?.kind).toBe("storefront_product");

        const kofiLead = store.sqlite.prepare("SELECT * FROM source_leads WHERE target_url='https://ko-fi.com/s/sample-vrc-item'").get() as {
          lead_key: string; status: string; kind: string;
        } | null;
        expect(kofiLead?.status).toBe("pending_review");
        expect(kofiLead?.kind).toBe("storefront_product");

        // Approving storefront leads routes to storefront/custom_domain metadata queues (never VPM), and remains unclaimable without source access profiles
        const boothJobId = await store.approveDiscoveryLead(boothLead!.lead_key);
        const kofiJobId = await store.approveDiscoveryLead(kofiLead!.lead_key);
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(boothJobId)).toEqual({
          platform: "booth",
          job_purpose: "metadata"
        });
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(kofiJobId)).toEqual({
          platform: "custom_domain",
          job_purpose: "metadata"
        });

        const claimAfter = await handleNodeRequest(request("/v1/node/jobs/claim", {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "crawler-node-leads",
          capabilities: ["vpm", "booth", "custom_domain"]
        }, nodeToken), store);
        expect((await claimAfter.json() as { status: string }).status).toBe("empty");
      } finally {
        store.close();
      }
    });
  });
});

