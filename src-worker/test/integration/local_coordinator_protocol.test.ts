import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { CrawlerRules } from "@trybyte/robotstxt-parser";
import {
  BatchResultResponseSchema,
  ClaimResponseSchema,
  NODE_API_JSON_SCHEMAS,
  PROTOCOL_VERSION,
  PlatformSchema,
  ResultResponseSchema
} from "vrc-packages-network/node";
import { handleNodeRequest } from "../../src/api/handler.ts";
import { handleOperatorRequest } from "../../src/api/operator_handler.ts";
import { type Coordinator, classifyOutboundLeadKind } from "../../src/storage/d1/coordinator.ts";
import {
  RobotsMatcherCache,
  buildRobotsCacheKey
} from "../../src/storage/d1/planes/shared_context.ts";
import { EXPECTED_V0_TABLE_NAMES } from "../../src/storage/d1/schema/index.ts";
import { buildPreviewStarterSteeringProfiles } from "../../src/storage/default_seeds.ts";
import { approveFixtureSource, seedApprovedFixtureJob } from "../helpers/source_access_fixture.ts";
import { getTestOutputDir } from "../helpers/test_directory.ts";
import {
  createInitializedD1Coordinator,
  inspectNodeEvidence,
  listCompleteVpmEvidence,
  suppressTestUrl
} from "../support/d1_test_fixtures.ts";

interface HttpErrorBody {
  schemaVersion: number;
  code: string;
  error: string;
}

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

async function postNodeJson(
  store: Coordinator,
  path: string,
  body: unknown,
  token: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleNodeRequest(request(path, body, token), store);
  const parsed = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

describe("local coordinator protocol", () => {
  test("conflicting seed contracts preserve queue identity and pacing", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const url = "https://seed.example/index.json";
      const id = await store.seedJob(url, "vpm", { minDelayMs: 1000, purpose: "metadata" });
      const job = store.sqlite.query("SELECT * FROM crawl_jobs").get();
      const origin = store.sqlite.query("SELECT * FROM origin_state").get();
      await expect(store.seedJob(url, "booth", { minDelayMs: 50_000, purpose: "metadata" })).rejects.toThrow(
        "different reviewed platform"
      );
      await expect(store.seedJob(url, "vpm", { minDelayMs: 50_000, purpose: "discovery" })).rejects.toThrow(
        "different reviewed purpose"
      );
      expect(store.sqlite.query("SELECT * FROM crawl_jobs").get()).toEqual(job);
      expect(store.sqlite.query("SELECT * FROM origin_state").get()).toEqual(origin);
      expect(await store.seedJob(url, "vpm", { minDelayMs: 2000, purpose: "metadata" })).toBe(id);
      expect(store.sqlite.query("SELECT min_delay_ms FROM origin_state").get()).toEqual({ min_delay_ms: 2000 });
    } finally {
      store.close();
    }
  });

  test("queued robots batch ignores origins without a currently due job", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await seedApprovedFixtureJob(store, "https://dormant.example.org/item", "vpm", 0);
      store.sqlite
        .prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE origin=?")
        .run(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), "https://dormant.example.org");
      expect(await store.claimDueRobotsRefresh()).toBeNull();
    } finally {
      store.close();
    }
  });

  test("claimDueRobotsRefresh filters by node capabilities and balances round-robin order", async () => {
    let now = Date.parse("2026-10-18T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      await seedApprovedFixtureJob(store, "https://itch.io/tools/tag-vrchat", "itch", 0, "discovery");
      await seedApprovedFixtureJob(store, "https://vpm-a.example.org/index.json", "vpm", 0, "metadata");
      await seedApprovedFixtureJob(store, "https://vpm-b.example.org/index.json", "vpm", 0, "metadata");

      const itchOnly = await store.claimDueRobotsRefresh(["itch"]);
      expect(itchOnly?.origin).toBe("https://itch.io");

      const firstVpm = await store.claimDueRobotsRefresh(["vpm"]);
      expect(firstVpm?.origin).toBe("https://vpm-a.example.org");

      const secondVpm = await store.claimDueRobotsRefresh(["vpm"]);
      expect(secondVpm?.origin).toBe("https://vpm-b.example.org");

      expect(await store.claimDueRobotsRefresh(["vpm"])).toBeNull();
      expect(await store.completeRobotsRefresh(secondVpm!.origin, secondVpm!.leaseId, 404)).toBe(true);
      now += 100;
      expect(await store.completeRobotsRefresh(firstVpm!.origin, firstVpm!.leaseId, 404)).toBe(true);

      now += 24 * 60 * 60 * 1000 + 1;
      const nextRound = await store.claimDueRobotsRefresh(["vpm"]);
      expect(nextRound?.origin).toBe("https://vpm-b.example.org");
    } finally {
      store.close();
    }
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
      expect(await firstStore.completeRobotsRefresh(first.origin, first.leaseId, 200, "User-agent: *\nAllow: /")).toBe(
        false
      );
      expect(await firstStore.releaseRobotsRefresh(first.origin, first.leaseId)).toBe(false);
      expect(await secondStore.completeRobotsRefresh(replacement.origin, replacement.leaseId, 404)).toBe(true);
      expect(await firstStore.claimDueRobotsRefresh()).toBeNull();
      const { token } = await firstStore.createNodeCredential("queued-node", ["vpm"]);
      const principal = (await firstStore.authenticate("queued-node", token))!;
      now += 1000;
      expect((await firstStore.claim({ schemaVersion: 1, nodeId: "queued-node", capabilities: ["vpm"] }, principal)).status).toBe(
        "leased"
      );
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
      const { token: oldToken } = await store.createNodeCredential("old-node", ["vpm"]);
      const { token: newToken } = await store.createNodeCredential("new-node", ["vpm"]);
      const oldPrincipal = (await store.authenticate("old-node", oldToken))!;
      const first = await store.claim({ schemaVersion: 1, nodeId: "old-node", capabilities: ["vpm"] }, oldPrincipal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected initial job lease");
      store.close();
      now += 120_001;
      store = await createInitializedD1Coordinator(databasePath, () => now);
      const newPrincipal = (await store.authenticate("new-node", newToken))!;
      const replacement = await store.claim({ schemaVersion: 1, nodeId: "new-node", capabilities: ["vpm"] }, newPrincipal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement job lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      const stalePrincipal = (await store.authenticate("old-node", oldToken))!;
      await expect(
        store.submit(
          {
            schemaVersion: 1,
            nodeId: "old-node",
            jobId: first.job.jobId,
            leaseId: first.job.leaseId,
            idempotencyKey: "stale-after-restart",
            outcome: { kind: "unchanged" }
          },
          stalePrincipal
        )
      ).rejects.toThrow("live lease");
      expect(
        (
          await store.submit(
            {
              schemaVersion: 1,
              nodeId: "new-node",
              jobId: replacement.job.jobId,
              leaseId: replacement.job.leaseId,
              idempotencyKey: "replacement-after-restart",
              outcome: { kind: "unchanged" }
            },
            newPrincipal
          )
        ).duplicate
      ).toBe(false);
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n).toBe(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("robots snapshots gate exact URLs, fail closed, expire, and reconsider deferred jobs", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("robots-node", ["vpm"]);
    const principal = (await store.authenticate("robots-node", token))!;
    const claimRequest = { schemaVersion: 1 as const, nodeId: "robots-node", capabilities: ["vpm" as const] };
    try {
      await seedApprovedFixtureJob(store, "https://denied.example.org/private/one", "vpm", 0);
      await seedApprovedFixtureJob(store, "https://allowed.example.org/public", "vpm", 0);
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      await expect(store.recordRobotsSnapshot("http://denied.example.org", 200, "")).rejects.toThrow();
      await store.recordRobotsSnapshot(
        "https://denied.example.org",
        200,
        "User-agent: VRCDiscoveryBot\nDisallow: /private/\nAllow: /public/"
      );
      await store.recordRobotsSnapshot("https://allowed.example.org", 503);
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      const denied = store.sqlite
        .prepare("SELECT robots_deferred_until FROM crawl_jobs WHERE url=?")
        .get("https://denied.example.org/private/one") as { robots_deferred_until: string | null };
      expect(denied.robots_deferred_until).toBeTruthy();
      await store.recordRobotsSnapshot("https://allowed.example.org", 404);
      const allowed = await store.claim(claimRequest, principal);
      expect(allowed.status).toBe("leased");
      if (allowed.status !== "leased") throw new Error("Expected allowed URL lease");
      expect(allowed.job.url).toBe("https://allowed.example.org/public");
      await store.recordRobotsSnapshot("https://allowed.example.org", 200, "User-agent: *\nDisallow: /public");
      await expect(
        store.submit(
          {
            schemaVersion: 1,
            nodeId: "robots-node",
            jobId: allowed.job.jobId,
            leaseId: allowed.job.leaseId,
            idempotencyKey: "robots-revoked-before-submit",
            outcome: { kind: "unchanged" }
          },
          principal
        )
      ).rejects.toThrow("robots policy");
      await store.recordRobotsSnapshot("https://denied.example.org", 404);
      const reconsidered = await store.claim(claimRequest, principal);
      expect(reconsidered.status).toBe("leased");
      if (reconsidered.status === "leased") expect(reconsidered.job.url).toBe("https://denied.example.org/private/one");
      now += 25 * 60 * 60 * 1000;
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
    } finally {
      store.close();
    }
  });

  test("RobotsMatcherCache enforces bounded LRU eviction and origin clearing", () => {
    const cache = new RobotsMatcherCache(2);
    const rules = [] as readonly CrawlerRules[];
    const key1 = buildRobotsCacheKey("https://a.example", "snap-1", 200, "2026-10-01T00:00:00.000Z");
    const key2 = buildRobotsCacheKey("https://b.example", "snap-2", 200, "2026-10-01T00:00:00.000Z");
    const key3 = buildRobotsCacheKey("https://c.example", "snap-3", 200, "2026-10-01T00:00:00.000Z");

    cache.set(key1, rules);
    cache.set(key2, rules);
    expect(cache.get(key1)).toBe(rules);
    cache.set(key3, rules);
    expect(cache.size).toBe(2);
    expect(cache.get(key2)).toBeUndefined();
    expect(cache.get(key1)).toBe(rules);
    expect(cache.get(key3)).toBe(rules);

    cache.evictOrigin("https://a.example");
    expect(cache.size).toBe(1);
    expect(cache.get(key1)).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });

  test("more than 100 robots-denied ready jobs cannot hide an allowed job", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("robots-node", ["vpm"]);
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
    } finally {
      store.close();
    }
  });

  test("operator seeding rejects obvious private and credential-bearing targets", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      for (const url of [
        "https://127.0.0.1/data",
        "https://[::1]/data",
        "https://localhost/data",
        "https://user:pass@example.org/data",
        "https://example.org:8443/data",
        "https://example.org/data#fragment",
        "https://example.org./data"
      ]) {
        await expect(store.seedJob(url, "vpm")).rejects.toThrow();
      }
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
    } finally {
      store.close();
    }
  });

  test("operator cannot seed a known robots-disallowed itch search path", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await expect(store.seedJob("https://itch.io/search?q=vrchat", "itch")).rejects.toThrow("disallowed");
      expect((store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
      expect(await seedApprovedFixtureJob(store, "https://itch.io/tools/tag-vrchat", "itch")).toBeTruthy();
    } finally {
      store.close();
    }
  });

  test("GitHub seeding permits only the public repository API and applies unauthenticated pacing", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      for (const url of [
        "https://github.com/vrc-get/vrc-get",
        "https://api.github.com/search/repositories?q=vrc",
        "https://api.github.com/repos/vrc-get/vrc-get/readme",
        "https://api.github.com/repos/vrc-get/vrc-get?x=1"
      ]) {
        await expect(store.seedJob(url, "github")).rejects.toThrow();
      }
      await seedApprovedFixtureJob(store, "https://api.github.com/repos/vrc-get/vrc-get", "github", 1000);
      expect(
        (store.sqlite.prepare("SELECT min_delay_ms FROM origin_state WHERE origin=?").get("https://api.github.com") as {
          min_delay_ms: number;
        }).min_delay_ms
      ).toBe(60_000);
    } finally {
      store.close();
    }
  });

  test("initializes V0 17-table D1 schema with provenance columns and 39 indexes idempotently", async () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrcp-coordinator-migrate-"));
    const databasePath = join(directory, "coordinator.db");
    try {
      const store = await createInitializedD1Coordinator(databasePath);
      try {
        store.sqlite
          .prepare(
            `INSERT INTO source_items
             (source_key,platform,source_url,latest_digest,payload_json,observed_at) VALUES (?,?,?,?,?,?)`
          )
          .run("old-source", "vpm", "https://example.org/index.json", "digest", "{}", "2026-01-01T00:00:00.000Z");
        await store.initSchema({ autoSeed: false });

        const tables = (
          store.sqlite
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all() as { name: string }[]
        ).map((row) => row.name);
        expect(tables).toEqual([...EXPECTED_V0_TABLE_NAMES].sort());
        expect(store.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='view'").all()).toEqual([]);

        const itemCols = (store.sqlite.prepare("PRAGMA table_info(source_items)").all() as { name: string }[]).map(
          (col) => col.name
        );
        for (const col of [
          "complete",
          "issues_json",
          "contributor_node_id",
          "submission_lease_id",
          "steering_profile_id",
          "gone_at"
        ]) {
          expect(itemCols).toContain(col);
        }
        expect((store.sqlite.prepare("SELECT gone_at FROM source_items WHERE source_key='old-source'").get() as {
          gone_at: string | null;
        }).gone_at).toBeNull();

        const jobCols = (store.sqlite.prepare("PRAGMA table_info(crawl_jobs)").all() as { name: string }[]).map(
          (col) => col.name
        );
        for (const col of ["priority_lane", "recrawl_interval_ms", "pagination_depth", "steering_profile_id"]) {
          expect(jobCols).toContain(col);
        }

        const leadCols = (store.sqlite.prepare("PRAGMA table_info(source_leads)").all() as { name: string }[]).map(
          (col) => col.name
        );
        for (const col of [
          "target_host",
          "first_seen_node_id",
          "first_seen_lease_id",
          "first_seen_profile_id",
          "last_seen_node_id",
          "last_seen_lease_id",
          "last_seen_profile_id",
          "discovered_from_item_key"
        ]) {
          expect(leadCols).toContain(col);
        }
      } finally {
        store.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("exports the production runtime schemas as JSON Schema", async () => {
    expect(NODE_API_JSON_SCHEMAS.claimRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.resultRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.heartbeatRequest.oneOf?.length).toBe(2);
  });

  test("heartbeat is schema-validated, scoped, and bound to a live claimed job", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("node-a", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown, credential = token) => postNodeJson(store, path, body, credential);
    const idle = { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], state: "idle" };
    try {
      expect((await post("/v1/node/heartbeat", idle)).body).toEqual({
        schemaVersion: 1,
        status: "alive",
        serverTime: "2026-09-27T00:00:00.000Z"
      });
      expect(store.sqlite.prepare("SELECT state,last_seen_at FROM nodes").get()).toEqual({
        state: "idle",
        last_seen_at: "2026-09-27T00:00:00.000Z"
      });
      expect((await post("/v1/node/heartbeat", { ...idle, activeJobId: "job" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, schemaVersion: 2 })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", idle, "wrong-token")).status).toBe(401);
      expect(
        (
          await post("/v1/node/heartbeat", {
            ...idle,
            state: "fetching",
            activeJobId: "not-held",
            activeLeaseId: crypto.randomUUID()
          })
        ).status
      ).toBe(403);
      const claimRes = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
      const parsedClaim = ClaimResponseSchema.parse(claimRes.body);
      expect(parsedClaim.status).toBe("leased");
      if (parsedClaim.status !== "leased") throw new Error("Expected lease");
      expect(parsedClaim.job.purpose).toBe("metadata");
      now += 1000;
      expect(
        (
          await post("/v1/node/heartbeat", {
            ...idle,
            state: "fetching",
            activeJobId: parsedClaim.job.jobId,
            activeLeaseId: crypto.randomUUID()
          })
        ).status
      ).toBe(403);
      expect(
        (
          await post("/v1/node/heartbeat", {
            ...idle,
            state: "fetching",
            activeJobId: parsedClaim.job.jobId,
            activeLeaseId: parsedClaim.job.leaseId
          })
        ).status
      ).toBe(200);
      expect(store.sqlite.prepare("SELECT state,active_job_id,last_seen_at FROM nodes").get()).toEqual({
        state: "fetching",
        active_job_id: parsedClaim.job.jobId,
        last_seen_at: "2026-09-27T00:00:01.000Z"
      });
      await store.revokeNode("node-a", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      expect((await post("/v1/node/heartbeat", idle)).status).toBe(401);
    } finally {
      store.close();
    }
  });

  test("a replaced lease held by the same node cannot keep an old fetch alive", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("same-node", ["vpm"]);
    const principal = (await store.authenticate("same-node", token))!;
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const claimRequest = { schemaVersion: 1 as const, nodeId: "same-node", capabilities: ["vpm" as const] };
    try {
      const first = await store.claim(claimRequest, principal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected first lease");
      now += 120_001;
      const replacement = await store.claim(claimRequest, principal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      await expect(
        store.heartbeat(
          { ...claimRequest, state: "fetching", activeJobId: first.job.jobId, activeLeaseId: first.job.leaseId },
          principal
        )
      ).rejects.toThrow("active job");
      expect(
        (
          await store.heartbeat(
            {
              ...claimRequest,
              state: "fetching",
              activeJobId: replacement.job.jobId,
              activeLeaseId: replacement.job.leaseId
            },
            principal
          )
        ).status
      ).toBe("alive");
    } finally {
      store.close();
    }
  });

  test("serialized node requests reject malformed payloads and unsupported schema versions", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("node-a", ["vpm"]);
    const fetchHandler = (req: Request) => handleNodeRequest(req, store);
    try {
      const bodies: unknown[] = [
        { schemaVersion: 999, nodeId: "node-a", capabilities: ["vpm"] },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], extra: true },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["not-a-driver"] },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["curated"] }
      ];
      for (const body of bodies) {
        const rejected = await fetchHandler(request("/v1/node/jobs/claim", body, token));
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "invalid_payload" });
      }
      const invalidHeartbeat = {
        schemaVersion: 1,
        nodeId: "node-a",
        capabilities: ["vpm"],
        state: "idle",
        activeJobId: "not-allowed"
      };
      const rejectedHeartbeat = await fetchHandler(request("/v1/node/heartbeat", invalidHeartbeat, token));
      expect(rejectedHeartbeat.status).toBe(400);
      expect(await rejectedHeartbeat.json()).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "invalid_payload" });
      const malformed = new Request("http://localhost/v1/node/jobs/claim", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{"
      });
      expect((await fetchHandler(malformed)).status).toBe(400);
      const oversized = new Request("http://localhost/v1/node/jobs/claim", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: " ".repeat(256 * 1024 + 1)
      });
      expect((await fetchHandler(oversized)).status).toBe(413);
    } finally {
      store.close();
    }
  });

  test("serialized results preserve platformTags and derive canonical package category", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);

    try {
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
      expect(pkg1?.verificationStatus).toBe("unverified");

      const row1 = store.sqlite.prepare("SELECT category FROM canonical_packages WHERE vpm_id=?").get(vpmId1) as {
        category: string;
      } | null;
      expect(row1?.category).toBe("avatar_tool");

      const untaggedUrl = "https://untagged.example.org/index.json";
      await seedApprovedFixtureJob(store, untaggedUrl, "vpm", 0);
      await allowFixtureOrigin(store, "https://untagged.example.org");

      const claim2 = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: PROTOCOL_VERSION, nodeId: "vpm-node", capabilities: ["vpm"] }))
          .body
      );
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
      expect((await store.getCanonicalPackage(vpmId2))?.category).toBe("vpm_package");

      const emptyTagsUrl = "https://emptytags.example.org/index.json";
      await seedApprovedFixtureJob(store, emptyTagsUrl, "vpm", 0);
      await allowFixtureOrigin(store, "https://emptytags.example.org");

      const claim3 = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: PROTOCOL_VERSION, nodeId: "vpm-node", capabilities: ["vpm"] }))
          .body
      );
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
      expect((await store.getCanonicalPackage(vpmId3))?.category).toBe("vpm_package");
    } finally {
      store.close();
    }
  });

  test("scoped credentials, origin leases, source_items provenance, idempotency, and revocation", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token: aToken } = await store.createNodeCredential("node-a", ["vpm"]);
    const { token: bToken } = await store.createNodeCredential("node-b", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.com/one", "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://example.com/two", "vpm", 1000);
    await allowFixtureOrigin(store, "https://example.com");
    const claimBody = (nodeId: string) => ({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] });
    const post = (path: string, body: unknown, token: string) => postNodeJson(store, path, body, token);
    try {
      const unauthMalformed = new Request("http://127.0.0.1/v1/node/jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json {{{"
      });
      expect((await handleNodeRequest(unauthMalformed, store)).status).toBe(401);
      expect((await post("/v1/node/jobs/claim", claimBody("node-a"), "bad-token")).status).toBe(401);
      expect((await post("/v1/node/jobs/claim", { ...claimBody("node-a"), capabilities: ["booth"] }, aToken)).status).toBe(
        403
      );
      const first = await post("/v1/node/jobs/claim", claimBody("node-a"), aToken);
      expect(first.status).toBe(200);
      const job = ClaimResponseSchema.parse(first.body);
      expect(job.status).toBe("leased");
      if (job.status !== "leased") throw new Error("Expected lease");
      const blockedByOrigin = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).body
      );
      expect(blockedByOrigin.status).toBe("empty");

      const result = {
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "node-a",
        jobId: job.job.jobId,
        leaseId: job.job.leaseId,
        idempotencyKey: "test-result-key-001",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.tool",
            title: "Tool",
            author: "Author",
            summary: "Useful",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      };
      expect((await post("/v1/node/jobs/result", result, bToken)).status).toBe(401);
      const accepted = await post("/v1/node/jobs/result", result, aToken);
      expect(ResultResponseSchema.parse(accepted.body).sourceVersionCreated).toBe(true);
      const duplicate = await post("/v1/node/jobs/result", result, aToken);
      expect(ResultResponseSchema.parse(duplicate.body).duplicate).toBe(true);
      expect((await post("/v1/node/jobs/result", { ...result, outcome: { kind: "gone" } }, aToken)).status).toBe(409);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 1 });
      expect(
        store.sqlite.prepare("SELECT contributor_node_id,submission_lease_id FROM source_items").get()
      ).toEqual({ contributor_node_id: "node-a", submission_lease_id: job.job.leaseId });
      expect(inspectNodeEvidence(store, "node-a")).toMatchObject({
        totals: { submissions: 1, sourceItems: 1, leadsFirstSeen: 0, leadsLastSeen: 0 },
        items: [{ source_key: expect.any(String), submission_lease_id: job.job.leaseId }]
      });
      expect(() => inspectNodeEvidence(store, "unknown-node")).toThrow("Node not found");

      now += 1000;
      const second = ClaimResponseSchema.parse((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).body);
      expect(second.status).toBe("leased");
      await store.revokeNode("node-b", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      expect((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).status).toBe(401);
    } finally {
      store.close();
    }
  });

  test("a principal authenticated before credential rotation cannot later claim or submit", async () => {
    const store = await createInitializedD1Coordinator();
    const { token: oldToken } = await store.createNodeCredential("node-a", ["vpm"]);
    const oldPrincipal = (await store.authenticate("node-a", oldToken))!;
    await seedApprovedFixtureJob(store, "https://example.org/package.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const claimRequest = { schemaVersion: 1 as const, nodeId: "node-a", capabilities: ["vpm" as const] };
    try {
      const claim = await store.claim(claimRequest, oldPrincipal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected lease");
      const { token: newToken } = await store.createNodeCredential("node-a", ["vpm"]);
      await expect(store.claim(claimRequest, oldPrincipal)).rejects.toThrow();
      const resultRequest = {
        schemaVersion: 1 as const,
        nodeId: "node-a",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "credential-rotation-result-001",
        outcome: { kind: "unchanged" as const }
      };
      await expect(store.submit(resultRequest, oldPrincipal)).rejects.toThrow();
      const newPrincipal = (await store.authenticate("node-a", newToken))!;
      expect((await store.submit(resultRequest, newPrincipal)).status).toBe("accepted");
      await store.revokeNode("node-a", { schemaVersion: 1, reason: "Fixture revocation" }, "fixture");
      await expect(store.claim(claimRequest, newPrincipal)).rejects.toThrow();
    } finally {
      store.close();
    }
  });

  test("operator suppression invalidates an outstanding lease and prevents reseeding", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("node-a", ["booth"]);
    const url = "https://booth.pm/items/42";
    await seedApprovedFixtureJob(store, url, "booth");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = (path: string, body: unknown, credential = token) => postNodeJson(store, path, body, credential);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected booth lease");
      suppressTestUrl(store, url, "creator opt-out");
      const heartbeat = await post("/v1/node/heartbeat", {
        schemaVersion: 1,
        nodeId: "node-a",
        capabilities: ["booth"],
        state: "fetching",
        activeJobId: claim.job.jobId,
        activeLeaseId: claim.job.leaseId
      });
      expect(heartbeat.status).toBe(403);
      const result = await post("/v1/node/jobs/result", {
        schemaVersion: 1,
        nodeId: "node-a",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "suppressed-result-001",
        outcome: { kind: "gone" }
      });
      expect(result.status).toBe(403);
      expect(store.sqlite.query("SELECT count(*) AS n FROM job_results").get()).toEqual({ n: 0 });
      expect(store.sqlite.query("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(
        ClaimResponseSchema.parse(
          (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] })).body
        ).status
      ).toBe("empty");
      await expect(store.seedJob(url, "booth")).rejects.toThrow();
      expect(
        store.sqlite.prepare("SELECT entity_type,entity_id,action FROM operator_audit_log WHERE action='suppress'").get()
      ).toEqual({ entity_type: "suppressed_target", entity_id: url, action: "suppress" });
    } finally {
      store.close();
    }
  });

  test("a later identical observation updates observed_at without creating a new digest version", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("node-a", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/package.json", "vpm", 1);
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    const observation = {
      sourceItemKey: "com.example.tool",
      title: "Tool",
      author: "Creator",
      summary: "Summary",
      outboundLinks: [],
      originUpdatedAt: null
    };
    try {
      let latestLeaseId = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        await allowFixtureOrigin(store, "https://example.org");
        const claim = ClaimResponseSchema.parse(
          (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] })).body
        );
        expect(claim.status).toBe("leased");
        if (claim.status !== "leased") throw new Error("Expected lease");
        latestLeaseId = claim.job.leaseId;
        const result = ResultResponseSchema.parse(
          (
            await post("/v1/node/jobs/result", {
              schemaVersion: 1,
              nodeId: "node-a",
              jobId: claim.job.jobId,
              leaseId: claim.job.leaseId,
              idempotencyKey: `same-content-attempt-${attempt}`,
              outcome: { kind: "changed", observation }
            })
          ).body
        );
        expect(result.sourceVersionCreated).toBe(attempt === 0);
        now += 6 * 60 * 60 * 1000 + 1000;
      }
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 1 });
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM job_results").get()).toEqual({ n: 2 });
      expect(
        store.sqlite.prepare("SELECT contributor_node_id,submission_lease_id FROM source_items").get()
      ).toEqual({ contributor_node_id: "node-a", submission_lease_id: latestLeaseId });
    } finally {
      store.close();
    }
  });

  test("gone source evidence disappears and an identical later observation restores it without creating a new version", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    const principal = (await store.authenticate("vpm-node", token))!;
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "vpm-node", capabilities: ["vpm" as const] };
    const firstObservation = {
      sourceItemKey: "com.example.first",
      title: "First",
      author: "Creator",
      summary: "A tool",
      outboundLinks: [],
      originUpdatedAt: null
    };
    const secondObservation = { ...firstObservation, sourceItemKey: "com.example.second", title: "Second" };
    const submit = async (
      outcome:
        | { kind: "batch"; observations: typeof firstObservation[] }
        | {
            kind: "partial_batch";
            observations: typeof firstObservation[];
            issues: { sourceItemKey: string; code: "invalid_release_evidence" }[];
          }
        | { kind: "gone" },
      key: string
    ) => {
      await allowFixtureOrigin(store, "https://example.org");
      const claim = await store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected job lease");
      return await store.submit(
        {
          schemaVersion: 1,
          nodeId: "vpm-node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: key,
          outcome
        },
        principal
      );
    };
    try {
      expect((await submit({ kind: "batch", observations: [firstObservation, secondObservation] }, "initial-vpm-listing")).sourceVersionCreated).toBe(
        true
      );
      expect(listCompleteVpmEvidence(store).length).toBe(2);
      now += 6 * 60 * 60 * 1000 + 1;
      expect((await submit({ kind: "gone" }, "entire-listing-gone")).sourceVersionCreated).toBe(false);
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items WHERE gone_at IS NOT NULL").get()).toEqual({ n: 2 });
      now += 24 * 60 * 60 * 1000 + 1;
      await submit(
        {
          kind: "partial_batch",
          observations: [firstObservation],
          issues: [{ sourceItemKey: firstObservation.sourceItemKey, code: "invalid_release_evidence" }]
        },
        "incomplete-listing-after-gone"
      );
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      now += 6 * 60 * 60 * 1000 + 1;
      expect((await submit({ kind: "batch", observations: [firstObservation] }, "listing-returns-one-item")).sourceVersionCreated).toBe(
        true
      );
      expect(listCompleteVpmEvidence(store).map((item) => item.observation.sourceItemKey)).toEqual(["com.example.first"]);
    } finally {
      store.close();
    }
  });

  test("an expired lease cannot submit, and rate-limit backoff is shared by origin", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token: aToken } = await store.createNodeCredential("node-a", ["vpm"]);
    const { token: bToken } = await store.createNodeCredential("node-b", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/a", "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://example.org/b", "vpm", 1000);
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown, token: string) => postNodeJson(store, path, body, token);
    try {
      const aClaim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body
      );
      if (aClaim.status !== "leased") throw new Error("Expected A lease");
      now += 120_001;
      const expired = await post(
        "/v1/node/jobs/result",
        {
          schemaVersion: 1,
          nodeId: "node-a",
          jobId: aClaim.job.jobId,
          leaseId: aClaim.job.leaseId,
          idempotencyKey: "expired-lease-key-001",
          outcome: { kind: "unchanged" }
        },
        aToken
      );
      expect(expired.status).toBe(403);
      const bClaim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-b", capabilities: ["vpm"] }, bToken)).body
      );
      expect(bClaim.status).toBe("leased");
      if (bClaim.status !== "leased") throw new Error("Expected B lease");
      const rateLimit = await post(
        "/v1/node/jobs/result",
        {
          schemaVersion: 1,
          nodeId: "node-b",
          jobId: bClaim.job.jobId,
          leaseId: bClaim.job.leaseId,
          idempotencyKey: "rate-limited-key-001",
          outcome: { kind: "rate_limited", retryAfterSeconds: 60 }
        },
        bToken
      );
      expect(rateLimit.status).toBe(200);
      expect(
        ClaimResponseSchema.parse(
          (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body
        ).status
      ).toBe("empty");
      now += 60_001;
      expect(
        ClaimResponseSchema.parse(
          (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body
        ).status
      ).toBe("leased");
    } finally {
      store.close();
    }
  });

  test("one busy origin cannot starve another behind 100 ready jobs", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("node-a", ["vpm"]);
    for (let i = 0; i < 101; i++) await seedApprovedFixtureJob(store, `https://busy.example.org/${i}`, "vpm", 1000);
    await seedApprovedFixtureJob(store, "https://free.example.org/item", "vpm", 1000);
    await allowFixtureOrigin(store, "https://busy.example.org", "https://free.example.org");
    const claim = async () =>
      ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] },
            token
          )
        ).body
      );
    try {
      const first = await claim();
      const second = await claim();
      expect(first.status === "leased" ? first.job.origin : null).toBe("https://busy.example.org");
      expect(second.status === "leased" ? second.job.origin : null).toBe("https://free.example.org");
    } finally {
      store.close();
    }
  });

  test("batched maxJobs>1 claim and concurrent origin race across >100 same-origin jobs reach secondary origins without OFFSET starvation", async () => {
    const batchStore = await createInitializedD1Coordinator();
    try {
      const { token } = await batchStore.createNodeCredential("node-batch", ["vpm"]);
      for (let i = 0; i < 101; i++) {
        await seedApprovedFixtureJob(batchStore, `https://busy.example.org/${i}`, "vpm", 1000);
      }
      await seedApprovedFixtureJob(batchStore, "https://free.example.org/item", "vpm", 1000);
      await allowFixtureOrigin(batchStore, "https://busy.example.org", "https://free.example.org");

      const batched = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            batchStore,
            "/v1/node/jobs/claim",
            { schemaVersion: 1, nodeId: "node-batch", capabilities: ["vpm"], maxJobs: 5 },
            token
          )
        ).body
      );
      expect(batched.status).toBe("leased");
      if (batched.status === "leased") {
        expect((batched.jobs ?? []).map((job) => job.origin)).toEqual([
          "https://busy.example.org",
          "https://free.example.org"
        ]);
      }
    } finally {
      batchStore.close();
    }

    const raceStore = await createInitializedD1Coordinator();
    try {
      const { token: winnerToken } = await raceStore.createNodeCredential("node-winner", ["vpm"]);
      const { token: racerToken } = await raceStore.createNodeCredential("node-racer", ["vpm"]);
      for (let i = 0; i < 101; i++) {
        await seedApprovedFixtureJob(raceStore, `https://busy.example.org/${i}`, "vpm", 1000);
      }
      await seedApprovedFixtureJob(raceStore, "https://free.example.org/item", "vpm", 1000);
      await allowFixtureOrigin(raceStore, "https://busy.example.org", "https://free.example.org");

      const racerPrincipal = (await raceStore.authenticate("node-racer", racerToken))!;
      const winnerPrincipal = (await raceStore.authenticate("node-winner", winnerToken))!;
      const dbRef = raceStore.db;
      const originalBatch = dbRef.batch.bind(dbRef);
      let injectedCompetingClaim = false;
      dbRef.batch = async (stmts) => {
        if (!injectedCompetingClaim) {
          injectedCompetingClaim = true;
          // Temporarily restore batch so the competing node wins busy.example.org right before racer commits.
          dbRef.batch = originalBatch;
          const winnerClaim = await raceStore.claim(
            { schemaVersion: 1, nodeId: winnerPrincipal.nodeId, capabilities: ["vpm"], maxJobs: 1 },
            winnerPrincipal
          );
          expect(winnerClaim.status).toBe("leased");
          if (winnerClaim.status === "leased") {
            expect(winnerClaim.job.origin).toBe("https://busy.example.org");
          }
        }
        return originalBatch(stmts);
      };

      const racerClaim = await raceStore.claim(
        { schemaVersion: 1, nodeId: racerPrincipal.nodeId, capabilities: ["vpm"], maxJobs: 1 },
        racerPrincipal
      );
      expect(injectedCompetingClaim).toBe(true);
      expect(racerClaim.status).toBe("leased");
      if (racerClaim.status === "leased") {
        expect(racerClaim.job.origin).toBe("https://free.example.org");
      }
    } finally {
      raceStore.close();
    }
  });

  test("one repository result persists each embedded VPM package atomically", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm");
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    const observation = (sourceItemKey: string) => ({
      sourceItemKey,
      title: sourceItemKey,
      author: "Creator",
      summary: "",
      outboundLinks: [],
      originUpdatedAt: null,
      releases: [{ version: "1.2.3", dependencyRanges: {} }]
    });
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected VPM lease");
      const result = {
        schemaVersion: 1,
        nodeId: "vpm-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "repo-batch-result-001",
        outcome: { kind: "batch" as const, observations: [observation("com.example.one"), observation("com.example.two")] }
      };
      const mixedRelease = structuredClone(result);
      mixedRelease.idempotencyKey = "repo-batch-mixed-release-001";
      Object.assign(mixedRelease.outcome.observations[0]!, { release: { version: "1.2.3", dependencyRanges: {} } });
      expect((await post("/v1/node/jobs/result", mixedRelease)).status).toBe(409);
      const malformed = structuredClone(result);
      malformed.idempotencyKey = "repo-batch-bad-version-001";
      malformed.outcome.observations[0]!.releases[0]!.version = "v1.2.3";
      expect((await post("/v1/node/jobs/result", malformed)).status).toBe(400);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      result.outcome.observations[0]!.releases[0]!.version = "1.2.3-rc.2+build.04";
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 2 });
      expect(
        listCompleteVpmEvidence(store).find((item) => item.observation.sourceItemKey === "com.example.one")?.observation
          .releases?.[0]?.version
      ).toBe("1.2.3-rc.2+build.04");
      expect(ResultResponseSchema.parse((await post("/v1/node/jobs/result", result)).body).duplicate).toBe(true);
    } finally {
      store.close();
    }
  });

  test("a storefront lease cannot turn product metadata into VPM release evidence", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("booth-node", ["booth"]);
    await seedApprovedFixtureJob(store, "https://booth.pm/items/123", "booth");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "booth-node", capabilities: ["booth"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected booth lease");
      const observation = {
        sourceItemKey: "booth.pm/items/123",
        title: "Tool",
        author: "Creator",
        summary: "",
        outboundLinks: [],
        originUpdatedAt: null
      };
      const result = {
        schemaVersion: 1,
        nodeId: "booth-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "booth-product-result-001",
        outcome: { kind: "changed" as const, observation }
      };
      const forgedRelease = structuredClone(result);
      forgedRelease.idempotencyKey = "booth-forged-release-001";
      Object.assign(forgedRelease.outcome.observation, { release: { version: "1.0.0", dependencyRanges: {} } });
      const internal = await post("/v1/node/jobs/result", forgedRelease);
      expect(internal.status).toBe(409);
      expect(internal.body).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "conflict" });
      const forgedBatch = {
        ...result,
        idempotencyKey: "booth-forged-batch-001",
        outcome: { kind: "batch", observations: [observation, { ...observation, sourceItemKey: "booth.pm/items/999" }] }
      };
      expect((await post("/v1/node/jobs/result", forgedBatch)).status).toBe(409);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 1 });
    } finally {
      store.close();
    }
  });

  test("a BOOTH browse lease persists only bounded local product leads, never product facts", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("browse-node", ["booth"]);
    const browseUrl =
      "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=1";
    await seedApprovedFixtureJob(store, browseUrl, "booth", 0, "discovery");
    await allowFixtureOrigin(store, "https://booth.pm");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "browse-node", capabilities: ["booth"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected a BOOTH browse lease");
      expect(claim.job.purpose).toBe("discovery");
      const outcome = {
        kind: "discovery",
        leads: [
          { kind: "storefront_product", url: "https://booth.pm/ja/items/12345" },
          { kind: "storefront_product", url: "https://booth.pm/ja/items/67890" }
        ]
      };
      const base = {
        schemaVersion: 1,
        nodeId: "browse-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "booth-browse-leads-001"
      };
      const forgedFacts = {
        ...base,
        idempotencyKey: "booth-browse-forged-facts-001",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth.pm/items/12345",
            title: "Forged product",
            author: "Unknown",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      };
      expect((await post("/v1/node/jobs/result", forgedFacts)).status).toBe(409);
      const forgedLead = {
        ...base,
        idempotencyKey: "booth-browse-forged-lead-001",
        outcome: {
          kind: "discovery",
          leads: [{ kind: "storefront_product", url: "https://other.example/items/999" }]
        }
      };
      const internal = await post("/v1/node/jobs/result", forgedLead);
      expect(internal.status).toBe(409);
      expect(internal.body).toMatchObject({ schemaVersion: PROTOCOL_VERSION, code: "conflict" });
      expect((await post("/v1/node/jobs/result", { ...base, outcome })).status).toBe(200);
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(
        store.sqlite.query("SELECT kind,target_url,target_host,status FROM source_leads ORDER BY target_url").all()
      ).toEqual([
        {
          kind: "storefront_product",
          target_url: "https://booth.pm/ja/items/12345",
          target_host: "booth.pm",
          status: "pending_review"
        },
        {
          kind: "storefront_product",
          target_url: "https://booth.pm/ja/items/67890",
          target_host: "booth.pm",
          status: "pending_review"
        }
      ]);
    } finally {
      store.close();
    }
  });

  test("discovery nextPageLead honors queryMode='pagination' and stops at maxPaginationDepth", async () => {
    let now = Date.parse("2026-10-18T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("page-node", ["booth"]);
    const principal = (await store.authenticate("page-node", token))!;
    try {
      await approveFixtureSource(store, "https://booth.pm/ja/browse/3D?page=1", "booth", "discovery", {
        pathScope: "/ja/browse/3D",
        queryMode: "pagination",
        queryScope: "page",
        minDelayMs: 1000,
        maxPaginationDepth: 1
      });
      await allowFixtureOrigin(store, "https://booth.pm");
      await store.seedJob("https://booth.pm/ja/browse/3D?page=1", "booth", {
        purpose: "discovery",
        minDelayMs: 0,
        paginationDepth: 0
      });

      const page1Claim = await store.claim({ schemaVersion: 1, nodeId: "page-node", capabilities: ["booth"] }, principal);
      if (page1Claim.status !== "leased") throw new Error("Expected page 1 lease");
      expect(page1Claim.job.paginationDepth).toBe(0);
      expect(page1Claim.job.maxPaginationDepth).toBe(1);

      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "page-node",
          jobId: page1Claim.job.jobId,
          leaseId: page1Claim.job.leaseId,
          idempotencyKey: "page-1-result",
          outcome: {
            kind: "discovery",
            leads: [{ kind: "storefront_product", url: "https://booth.pm/ja/items/1001" }],
            nextPageLead: "https://booth.pm/ja/browse/3D?page=2"
          }
        },
        principal
      );

      const page2Row = store.sqlite
        .prepare("SELECT pagination_depth, url FROM crawl_jobs WHERE url=?")
        .get("https://booth.pm/ja/browse/3D?page=2") as { pagination_depth: number; url: string } | null;
      expect(page2Row).toEqual({ pagination_depth: 1, url: "https://booth.pm/ja/browse/3D?page=2" });

      now += 1000;
      const page2Claim = await store.claim({ schemaVersion: 1, nodeId: "page-node", capabilities: ["booth"] }, principal);
      if (page2Claim.status !== "leased") throw new Error("Expected page 2 lease");
      expect(page2Claim.job.paginationDepth).toBe(1);

      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "page-node",
          jobId: page2Claim.job.jobId,
          leaseId: page2Claim.job.leaseId,
          idempotencyKey: "page-2-result",
          outcome: {
            kind: "discovery",
            leads: [],
            nextPageLead: "https://booth.pm/ja/browse/3D?page=3"
          }
        },
        principal
      );

      expect(store.sqlite.prepare("SELECT url FROM crawl_jobs WHERE url=?").get("https://booth.pm/ja/browse/3D?page=3")).toBeNull();
    } finally {
      store.close();
    }
  });

  test("tiered recrawls (4h/6h/24h) and minimal HTTP 304 unchanged fast path preserve source evidence", async () => {
    let now = Date.parse("2026-10-18T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("tier-node", ["vpm", "booth"]);
    const principal = (await store.authenticate("tier-node", token))!;
    try {
      await seedApprovedFixtureJob(store, "https://vpm.example.org/index.json", "vpm", 0, "metadata");
      await seedApprovedFixtureJob(store, "https://booth.pm/items/555", "booth", 0, "metadata");
      await seedApprovedFixtureJob(
        store,
        "https://booth.pm/ja/browse/3D?page=1",
        "booth",
        0,
        "discovery"
      );
      await allowFixtureOrigin(store, "https://vpm.example.org", "https://booth.pm");

      expect(store.sqlite.prepare("SELECT priority_lane, recrawl_interval_ms FROM crawl_jobs WHERE url=?").get("https://vpm.example.org/index.json")).toEqual({
        priority_lane: 1,
        recrawl_interval_ms: 21_600_000
      });
      expect(store.sqlite.prepare("SELECT priority_lane, recrawl_interval_ms FROM crawl_jobs WHERE url=?").get("https://booth.pm/ja/browse/3D?page=1")).toEqual({
        priority_lane: 2,
        recrawl_interval_ms: 14_400_000
      });
      expect(store.sqlite.prepare("SELECT priority_lane, recrawl_interval_ms FROM crawl_jobs WHERE url=?").get("https://booth.pm/items/555")).toEqual({
        priority_lane: 3,
        recrawl_interval_ms: 86_400_000
      });

      const firstClaim = await store.claim({ schemaVersion: 1, nodeId: "tier-node", capabilities: ["vpm"] }, principal);
      if (firstClaim.status !== "leased") throw new Error("Expected VPM lease");
      const initialSubmit = await store.submit(
        {
          schemaVersion: 1,
          nodeId: "tier-node",
          jobId: firstClaim.job.jobId,
          leaseId: firstClaim.job.leaseId,
          idempotencyKey: "tier-initial-vpm",
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.tiered",
              title: "Tiered Package",
              author: "Creator",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null,
              releases: [{ version: "1.0.0", dependencyRanges: {} }]
            }
          }
        },
        principal
      );
      expect(initialSubmit.sourceVersionCreated).toBe(true);
      const beforeItem = store.sqlite
        .prepare("SELECT observed_at, submission_lease_id FROM source_items WHERE source_key=?")
        .get("vpm:https://vpm.example.org/index.json:com.example.tiered");
      const beforePkg = store.sqlite
        .prepare("SELECT updated_at FROM canonical_packages WHERE canonical_id=?")
        .get("com.example.tiered");

      now += 21_600_001;
      await allowFixtureOrigin(store, "https://vpm.example.org");
      const recrawlClaim = await store.claim({ schemaVersion: 1, nodeId: "tier-node", capabilities: ["vpm"] }, principal);
      if (recrawlClaim.status !== "leased") throw new Error("Expected 6h recrawl lease");
      const unchangedReceipt = await store.submit(
        {
          schemaVersion: 1,
          nodeId: "tier-node",
          jobId: recrawlClaim.job.jobId,
          leaseId: recrawlClaim.job.leaseId,
          idempotencyKey: "tier-304-unchanged",
          outcome: { kind: "unchanged" }
        },
        principal
      );
      expect(unchangedReceipt.sourceVersionCreated).toBe(false);
      expect(
        store.sqlite
          .prepare("SELECT observed_at, submission_lease_id FROM source_items WHERE source_key=?")
          .get("vpm:https://vpm.example.org/index.json:com.example.tiered")
      ).toEqual(beforeItem);
      expect(
        store.sqlite.prepare("SELECT updated_at FROM canonical_packages WHERE canonical_id=?").get("com.example.tiered")
      ).toEqual(beforePkg);
    } finally {
      store.close();
    }
  });

  test("partial repository evidence records diagnostics without inventing missing versions", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected lease");
      const result = {
        schemaVersion: 1,
        nodeId: "vpm-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "partial-listing-result-001",
        outcome: {
          kind: "partial_batch",
          observations: [
            {
              sourceItemKey: "com.example.good",
              title: "Good",
              author: "Creator",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null,
              releases: [{ version: "1.0.0", dependencyRanges: {} }]
            }
          ],
          issues: [{ sourceItemKey: "com.example.good", version: "v2.0.0", code: "invalid_version" }]
        }
      };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect(
        store.sqlite.prepare("SELECT complete,issues_json,contributor_node_id,submission_lease_id FROM source_items").get()
      ).toEqual({
        complete: 0,
        issues_json: JSON.stringify([{ sourceItemKey: "com.example.good", version: "v2.0.0", code: "invalid_version" }]),
        contributor_node_id: "vpm-node",
        submission_lease_id: claim.job.leaseId
      });
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      expect(ResultResponseSchema.parse((await post("/v1/node/jobs/result", result)).body).duplicate).toBe(true);
      now += 6 * 60 * 60 * 1000 + 1;
      await allowFixtureOrigin(store, "https://example.org");
      const retry = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
      );
      if (retry.status !== "leased") throw new Error("Expected retry lease");
      const complete = {
        ...result,
        leaseId: retry.job.leaseId,
        idempotencyKey: "complete-listing-result-001",
        outcome: { kind: "batch", observations: result.outcome.observations }
      };
      expect((await post("/v1/node/jobs/result", complete)).status).toBe(200);
      expect(store.sqlite.prepare("SELECT complete FROM source_items").get()).toEqual({ complete: 1 });
      expect(
        listCompleteVpmEvidence(store).map((item) => [
          item.sourceUrl,
          item.observation.releases?.map((release) => release.version)
        ])
      ).toEqual([["https://example.org/index.json", ["1.0.0"]]]);
      expect(listCompleteVpmEvidence(store)[0]).toMatchObject({
        contributorNodeId: "vpm-node",
        submissionLeaseId: retry.job.leaseId
      });
    } finally {
      store.close();
    }
  });

  test("an incomplete later fetch removes package completeness until restored", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    const url = "https://example.org/index.json";
    await seedApprovedFixtureJob(store, url, "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    const claim = async () =>
      ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
      );
    const observation = (version: string) => ({
      sourceItemKey: "com.example.tool",
      title: "Tool",
      author: "Creator",
      summary: "",
      outboundLinks: [],
      originUpdatedAt: null,
      releases: [{ version, dependencyRanges: {} }]
    });
    try {
      const first = await claim();
      if (first.status !== "leased") throw new Error("Expected first lease");
      expect(
        (
          await post("/v1/node/jobs/result", {
            schemaVersion: 1,
            nodeId: "vpm-node",
            jobId: first.job.jobId,
            leaseId: first.job.leaseId,
            idempotencyKey: "complete-older-result-001",
            outcome: { kind: "batch", observations: [observation("1.0.0")] }
          })
        ).status
      ).toBe(200);
      expect(listCompleteVpmEvidence(store)[0]?.observation.releases?.map((release) => release.version)).toEqual(["1.0.0"]);
      now += 6 * 60 * 60 * 1000 + 1;
      await allowFixtureOrigin(store, "https://example.org");
      const second = await claim();
      if (second.status !== "leased") throw new Error("Expected second lease");
      expect(
        (
          await post("/v1/node/jobs/result", {
            schemaVersion: 1,
            nodeId: "vpm-node",
            jobId: second.job.jobId,
            leaseId: second.job.leaseId,
            idempotencyKey: "partial-newer-result-001",
            outcome: {
              kind: "partial_batch",
              observations: [observation("1.1.0")],
              issues: [{ sourceItemKey: "com.example.tool", version: "1.2.0", code: "invalid_manifest" }]
            }
          })
        ).status
      ).toBe(200);
      expect(store.sqlite.prepare("SELECT complete FROM source_items").get()).toEqual({ complete: 0 });
      expect(listCompleteVpmEvidence(store)).toEqual([]);
      suppressTestUrl(store, url, "operator stop", () => now);
      expect(listCompleteVpmEvidence(store)).toEqual([]);
    } finally {
      store.close();
    }
  });

  test("the same package ID in two listings retains separate source evidence", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://first.example.org/index.json", "vpm", 0);
    await seedApprovedFixtureJob(store, "https://second.example.org/index.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://first.example.org", "https://second.example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      for (const version of ["1.0.0", "2.0.0"]) {
        const claim = ClaimResponseSchema.parse(
          (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
        );
        if (claim.status !== "leased") throw new Error("Expected lease");
        const result = {
          schemaVersion: 1,
          nodeId: "vpm-node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: `listing-result-${version}`,
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.shared",
              title: "Shared",
              author: "Creator",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null,
              release: { version, dependencyRanges: {} }
            }
          }
        };
        expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      }
      const rows = store.sqlite
        .prepare("SELECT source_key,source_url FROM source_items ORDER BY source_url")
        .all() as { source_key: string; source_url: string }[];
      expect(rows).toHaveLength(2);
      expect(rows[0]!.source_key).not.toBe(rows[1]!.source_key);
      expect(rows.map((row) => row.source_url)).toEqual([
        "https://first.example.org/index.json",
        "https://second.example.org/index.json"
      ]);
    } finally {
      store.close();
    }
  });

  test("recipe leads cross the result schema and await review without becoming crawl jobs", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("vpm-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://example.org/source.json", "vpm", 0);
    await allowFixtureOrigin(store, "https://example.org");
    const post = (path: string, body: unknown, credential = token) => postNodeJson(store, path, body, credential);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected lease");
      const result = {
        schemaVersion: 1,
        nodeId: "vpm-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "template-recipe-leads-001",
        outcome: {
          kind: "discovery",
          leads: [
            { kind: "vpm_listing", url: "https://example.org/index.json" },
            { kind: "github_repository", url: "https://github.com/example/tool" },
            { kind: "release_zip", url: "https://example.org/tool.zip", claimedPackageId: "com.example.tool" }
          ]
        }
      };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect(ResultResponseSchema.parse((await post("/v1/node/jobs/result", result)).body).duplicate).toBe(true);
      const leads = store.sqlite.prepare("SELECT kind,target_url,target_host,status FROM source_leads ORDER BY kind").all();
      expect(leads).toEqual([
        {
          kind: "github_repository",
          target_url: "https://github.com/example/tool",
          target_host: "github.com",
          status: "pending_review"
        },
        {
          kind: "release_zip",
          target_url: "https://example.org/tool.zip",
          target_host: "example.org",
          status: "pending_review"
        },
        {
          kind: "vpm_listing",
          target_url: "https://example.org/index.json",
          target_host: "example.org",
          status: "pending_review"
        }
      ]);
      expect(
        store.sqlite
          .prepare("SELECT first_seen_node_id,first_seen_lease_id,last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1")
          .get()
      ).toEqual({
        first_seen_node_id: "vpm-node",
        first_seen_lease_id: claim.job.leaseId,
        last_seen_node_id: "vpm-node",
        last_seen_lease_id: claim.job.leaseId
      });
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      const { token: secondToken } = await store.createNodeCredential("second-vpm-node", ["vpm"]);
      store.sqlite
        .prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE job_id=?")
        .run("1970-01-01T00:00:00.000Z", claim.job.jobId);
      store.sqlite
        .prepare("UPDATE origin_state SET next_allowed_at=? WHERE origin=?")
        .run("1970-01-01T00:00:00.000Z", "https://example.org");
      const secondClaim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "second-vpm-node", capabilities: ["vpm"] }, secondToken))
          .body
      );
      if (secondClaim.status !== "leased") throw new Error("Expected second lease");
      expect(
        (
          await post(
            "/v1/node/jobs/result",
            {
              ...result,
              nodeId: "second-vpm-node",
              leaseId: secondClaim.job.leaseId,
              idempotencyKey: "template-recipe-leads-002"
            },
            secondToken
          )
        ).status
      ).toBe(200);
      expect(
        store.sqlite
          .prepare("SELECT first_seen_node_id,first_seen_lease_id,last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1")
          .get()
      ).toEqual({
        first_seen_node_id: "vpm-node",
        first_seen_lease_id: claim.job.leaseId,
        last_seen_node_id: "second-vpm-node",
        last_seen_lease_id: secondClaim.job.leaseId
      });
      expect(inspectNodeEvidence(store, "vpm-node").totals).toMatchObject({ leadsFirstSeen: 3, leadsLastSeen: 0 });
      expect(inspectNodeEvidence(store, "second-vpm-node").totals).toMatchObject({ leadsFirstSeen: 0, leadsLastSeen: 3 });
      const listingLead = store.sqlite
        .prepare("SELECT lead_key FROM source_leads WHERE kind='vpm_listing'")
        .get() as { lead_key: string };
      const zipLead = store.sqlite
        .prepare("SELECT lead_key FROM source_leads WHERE kind='release_zip'")
        .get() as { lead_key: string };
      await expect(store.approveLead(zipLead.lead_key, undefined, "operator", "Invalid target check")).rejects.toThrow(
        "cannot become a crawl job"
      );
      const listingJobId = await store.approveLead(listingLead.lead_key, undefined, "operator", "Approve VPM listing");
      expect(typeof listingJobId).toBe("string");
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 2 });
      expect(store.sqlite.prepare("SELECT status FROM source_leads WHERE lead_key=?").get(listingLead.lead_key)).toEqual({
        status: "approved"
      });
    } finally {
      store.close();
    }
  });

  test("creator and storefront candidate leads remain separate and cannot fetch without steering profiles", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("directory-node", ["vpm", "custom_domain"]);
    await seedApprovedFixtureJob(store, "https://directory.example.org/avatars", "vpm", 0, "discovery");
    await allowFixtureOrigin(store, "https://directory.example.org", "https://artist.example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "directory-node", capabilities: ["vpm"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected discovery lease");
      const result = {
        schemaVersion: 1,
        nodeId: "directory-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "creator-link-chain-001",
        outcome: {
          kind: "discovery",
          leads: [
            { kind: "creator_profile", url: "https://profiles.example.org/artist" },
            { kind: "publisher_site", url: "https://artist.example.org/" },
            { kind: "storefront_product", url: "https://artist.example.org/shop/avatar" }
          ]
        }
      };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const leads = store.sqlite
        .prepare(
          `SELECT lead_key,kind,target_url,discovered_from_url,status
           FROM source_leads ORDER BY kind`
        )
        .all() as {
        lead_key: string;
        kind: string;
        target_url: string;
        discovered_from_url: string;
        status: string;
      }[];
      expect(leads.map(({ kind, target_url, discovered_from_url, status }) => ({ kind, target_url, discovered_from_url, status }))).toEqual([
        {
          kind: "creator_profile",
          target_url: "https://profiles.example.org/artist",
          discovered_from_url: "https://directory.example.org/avatars",
          status: "pending_review"
        },
        {
          kind: "publisher_site",
          target_url: "https://artist.example.org/",
          discovered_from_url: "https://directory.example.org/avatars",
          status: "pending_review"
        },
        {
          kind: "storefront_product",
          target_url: "https://artist.example.org/shop/avatar",
          discovered_from_url: "https://directory.example.org/avatars",
          status: "pending_review"
        }
      ]);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });

      const creatorLead = leads.find((l) => l.kind === "creator_profile")!;
      await expect(store.approveLead(creatorLead.lead_key, undefined, "operator", "Creator profile")).rejects.toThrow();

      for (const lead of leads.filter((l) => l.kind !== "creator_profile")) {
        const jobId = await store.approveLead(lead.lead_key, undefined, "operator", "Approve storefront lead");
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(jobId)).toEqual({
          platform: "custom_domain",
          job_purpose: "metadata"
        });
      }

      const postApprovalClaim = ClaimResponseSchema.parse(
        (
          await post("/v1/node/jobs/claim", {
            schemaVersion: 1,
            nodeId: "directory-node",
            capabilities: ["vpm", "custom_domain"]
          })
        ).body
      );
      expect(postApprovalClaim.status).toBe("empty");
    } finally {
      store.close();
    }
  });

  test("two source items linking one author site retain separate lead provenance", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("avatar-index-node", ["vpm"]);
    await seedApprovedFixtureJob(store, "https://index.example.org/avatars", "vpm", 0, "discovery");
    await allowFixtureOrigin(store, "https://index.example.org");
    const post = (path: string, body: unknown) => postNodeJson(store, path, body, token);
    try {
      const claim = ClaimResponseSchema.parse(
        (await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "avatar-index-node", capabilities: ["vpm"] })).body
      );
      if (claim.status !== "leased") throw new Error("Expected lease");
      const result = {
        schemaVersion: 1,
        nodeId: "avatar-index-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "separate-avatar-author-leads",
        outcome: {
          kind: "discovery",
          leads: [
            { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_a" },
            { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_b" }
          ]
        }
      };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const { leads } = await store.listLeadsPage("pending_review", 100, null);
      expect(leads).toHaveLength(2);
      expect(new Set(leads.map((lead) => lead.lead_key)).size).toBe(2);
      expect(leads.map((lead) => lead.discovered_from_item_key).sort()).toEqual(["avtr_a", "avtr_b"]);
      expect(
        leads.every((lead) => lead.target_url === "https://artist.example.org/" && lead.status === "pending_review")
      ).toBe(true);
      expect(store.sqlite.prepare("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
    } finally {
      store.close();
    }
  });

  test("rediscovery keeps the pre-anchor identity of an unanchored lead", async () => {
    const store = await createInitializedD1Coordinator();
    const { token } = await store.createNodeCredential("legacy-lead-node", ["vpm"]);
    const sourceUrl = "https://listing.example.org/source.json";
    const targetUrl = "https://listing.example.org/index.json";
    const leadKey = crypto
      .createHash("sha256")
      .update(JSON.stringify([sourceUrl, "vpm_listing", targetUrl, null]))
      .digest("hex");
    await seedApprovedFixtureJob(store, sourceUrl, "vpm", 0, "discovery");
    await allowFixtureOrigin(store, "https://listing.example.org");
    try {
      const claim = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: 1, nodeId: "legacy-lead-node", capabilities: ["vpm"] },
            token
          )
        ).body
      );
      if (claim.status !== "leased") throw new Error("Expected lease");
      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,target_host,claimed_package_id,status,
             first_seen_at,last_seen_at)
           VALUES (?,?,?,?,?,?,NULL,'pending_review',?,?)`
        )
        .run(
          leadKey,
          sourceUrl,
          claim.job.jobId,
          "vpm_listing",
          targetUrl,
          "listing.example.org",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z"
        );
      const result = await postNodeJson(
        store,
        "/v1/node/jobs/result",
        {
          schemaVersion: 1,
          nodeId: "legacy-lead-node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: "legacy-unanchored-rediscovery",
          outcome: { kind: "discovery", leads: [{ kind: "vpm_listing", url: targetUrl }] }
        },
        token
      );
      expect(result.status).toBe(200);
      const leads = store.sqlite.prepare("SELECT lead_key,discovered_from_item_key FROM source_leads").all();
      expect(leads).toEqual([{ lead_key: leadKey, discovered_from_item_key: null }]);
    } finally {
      store.close();
    }
  });

  test("initSchema creates zero jobs/profiles and POST /v1/operator/init rejects autoSeed=true", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({ count: 0 });
      expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 0 });

      const opToken = "a".repeat(64);
      const initReject = await handleOperatorRequest(
        new Request("http://localhost/v1/operator/init", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${opToken}` },
          body: JSON.stringify({ schemaVersion: 1, autoSeed: true })
        }),
        store,
        opToken
      );
      expect(initReject.status).toBe(400);
      const body = (await initReject.json()) as HttpErrorBody;
      expect(body.code).toBe("invalid_payload");

      const capabilities = [...PlatformSchema.options];
      const { token } = await store.createNodeCredential("bootstrap-node", capabilities);
      const response = await postNodeJson(
        store,
        "/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "bootstrap-node", capabilities },
        token
      );
      expect(response.status).toBe(200);
      expect(ClaimResponseSchema.parse(response.body).status).toBe("empty");
    } finally {
      store.close();
    }
  });

  test("batched claim with maxJobs enforces per-origin reservations and anti-contention", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      await seedApprovedFixtureJob(store, "https://origin1.example.org/item1", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin1.example.org/item2", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin2.example.org/item1", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://origin3.example.org/item1", "vpm", 1000);
      await allowFixtureOrigin(
        store,
        "https://origin1.example.org",
        "https://origin2.example.org",
        "https://origin3.example.org"
      );

      const { token } = await store.createNodeCredential("batch-node", ["vpm"]);
      const res = await postNodeJson(
        store,
        "/v1/node/jobs/claim",
        { schemaVersion: PROTOCOL_VERSION, nodeId: "batch-node", capabilities: ["vpm"], maxJobs: 5 },
        token
      );

      expect(res.status).toBe(200);
      const parsed = ClaimResponseSchema.parse(res.body);
      expect(parsed.status).toBe("leased");
      if (parsed.status !== "leased") throw new Error("Expected leased status");

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

      const { token } = await store.createNodeCredential("batch-sub-node", ["vpm"]);
      const claim = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: PROTOCOL_VERSION, nodeId: "batch-sub-node", capabilities: ["vpm"], maxJobs: 2 },
            token
          )
        ).body
      );
      if (claim.status !== "leased" || !claim.jobs || claim.jobs.length !== 2) {
        throw new Error("Expected 2 leased jobs");
      }

      const job1 = claim.jobs[0]!;
      const job2 = claim.jobs[1]!;
      const key1 = "idemp-" + crypto.randomUUID();
      const key2 = "idemp-" + crypto.randomUUID();

      const batchRes = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
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
        },
        token
      );

      expect(batchRes.status).toBe(200);
      const batchParsed = BatchResultResponseSchema.parse(batchRes.body);
      expect(batchParsed.receipts.length).toBe(2);
      expect(batchParsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: false });
      expect(batchParsed.receipts[1]).toMatchObject({ status: "accepted", jobId: job2.jobId, duplicate: false });

      const replayRes = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
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
        },
        token
      );
      const replayParsed = BatchResultResponseSchema.parse(replayRes.body);
      expect(replayParsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: true });

      await seedApprovedFixtureJob(store, "https://batch-sub3.example.org/index.json", "vpm", 1000);
      await allowFixtureOrigin(store, "https://batch-sub3.example.org");
      const claim3 = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: PROTOCOL_VERSION, nodeId: "batch-sub-node", capabilities: ["vpm"], maxJobs: 1 },
            token
          )
        ).body
      );
      if (claim3.status !== "leased") throw new Error("Expected job 3 leased");
      const job3 = claim3.job;

      const mixedRes = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
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
        },
        token
      );

      expect(mixedRes.status).toBe(200);
      const mixedParsed = BatchResultResponseSchema.parse(mixedRes.body);
      expect(mixedParsed.receipts.length).toBe(2);
      expect(mixedParsed.receipts[0]).toMatchObject({ status: "rejected", terminal: true, code: "not_found" });
      expect(mixedParsed.receipts[1]).toMatchObject({ status: "accepted", jobId: job3.jobId });
    } finally {
      store.close();
    }
  });

  test("prior receipt replay post-lease-expiry vs first late-result rejection", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const { token } = await store.createNodeCredential("late-node", ["vpm"]);
      await seedApprovedFixtureJob(store, "https://late-test1.example.org/pkg1.json", "vpm", 1000);
      await seedApprovedFixtureJob(store, "https://late-test2.example.org/pkg2.json", "vpm", 1000);
      await allowFixtureOrigin(store, "https://late-test1.example.org", "https://late-test2.example.org");

      const claim1 = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: PROTOCOL_VERSION, nodeId: "late-node", capabilities: ["vpm"] },
            token
          )
        ).body
      );
      if (claim1.status !== "leased") throw new Error("Expected job 1 leased");
      const job1 = claim1.job;

      const idKey1 = "idemp-key-ontime-" + crypto.randomUUID();
      const sub1Res = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "late-node",
          results: [
            {
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
            }
          ]
        },
        token
      );
      expect(sub1Res.status).toBe(200);
      const sub1Parsed = BatchResultResponseSchema.parse(sub1Res.body);
      expect(sub1Parsed.receipts[0]).toMatchObject({ status: "accepted", jobId: job1.jobId, duplicate: false });

      const claim2 = ClaimResponseSchema.parse(
        (
          await postNodeJson(
            store,
            "/v1/node/jobs/claim",
            { schemaVersion: PROTOCOL_VERSION, nodeId: "late-node", capabilities: ["vpm"] },
            token
          )
        ).body
      );
      if (claim2.status !== "leased") throw new Error("Expected job 2 leased");
      const job2 = claim2.job;

      now += 600_000;

      const replayRes = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "late-node",
          results: [
            {
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
            }
          ]
        },
        token
      );
      expect(replayRes.status).toBe(200);
      expect(BatchResultResponseSchema.parse(replayRes.body).receipts[0]).toMatchObject({
        status: "accepted",
        jobId: job1.jobId,
        duplicate: true
      });

      const lateRes = await postNodeJson(
        store,
        "/v1/node/jobs/results",
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: "late-node",
          results: [
            {
              jobId: job2.jobId,
              leaseId: job2.leaseId,
              idempotencyKey: "idemp-key-late-" + crypto.randomUUID(),
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
            }
          ]
        },
        token
      );
      expect(lateRes.status).toBe(200);
      expect(BatchResultResponseSchema.parse(lateRes.body).receipts[0]).toMatchObject({
        status: "rejected",
        jobId: job2.jobId,
        terminal: true,
        code: "lease_expired"
      });

      const singleLateRes = await postNodeJson(
        store,
        "/v1/node/jobs/result",
        {
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
        },
        token
      );
      expect(singleLateRes.status).toBe(403);
    } finally {
      store.close();
    }
  });

  describe("delegated node robots preflight protocol", () => {
    test("/v1/node/robots/claim: rejects unauthenticated requests and returns empty when no origins due", async () => {
      const now = Date.parse("2026-10-18T00:00:00.000Z");
      const store = await createInitializedD1Coordinator(":memory:", () => now);
      const { token } = await store.createNodeCredential("robot-node", ["vpm"]);
      try {
        const unauth = await postNodeJson(
          store,
          "/v1/node/robots/claim",
          { schemaVersion: PROTOCOL_VERSION, nodeId: "robot-node" },
          "bad-token"
        );
        expect(unauth.status).toBe(401);

        const emptyRes = await postNodeJson(
          store,
          "/v1/node/robots/claim",
          { schemaVersion: PROTOCOL_VERSION, nodeId: "robot-node" },
          token
        );
        expect(emptyRes.status).toBe(200);
        const emptyBody = emptyRes.body as { status: string; retryAfterMs: number };
        expect(emptyBody.status).toBe("empty");
        expect(emptyBody.retryAfterMs).toBeGreaterThan(0);
      } finally {
        store.close();
      }
    });

    test("/v1/node/robots/claim and /v1/node/robots/result: leases robots refresh, stores snapshot, and unblocks crawl jobs", async () => {
      let now = Date.parse("2026-10-18T00:00:00.000Z");
      const store = await createInitializedD1Coordinator(":memory:", () => now);
      const { token } = await store.createNodeCredential("robot-node", ["vpm"]);
      const targetOrigin = "https://unscraped.example.org";
      try {
        await seedApprovedFixtureJob(store, `${targetOrigin}/index.json`, "vpm", 0);

        const claimBefore = await postNodeJson(
          store,
          "/v1/node/jobs/claim",
          { schemaVersion: PROTOCOL_VERSION, nodeId: "robot-node", capabilities: ["vpm"] },
          token
        );
        expect(claimBefore.status).toBe(200);
        expect(ClaimResponseSchema.parse(claimBefore.body).status).toBe("empty");

        const robotsClaimRes = await postNodeJson(
          store,
          "/v1/node/robots/claim",
          { schemaVersion: PROTOCOL_VERSION, nodeId: "robot-node" },
          token
        );
        expect(robotsClaimRes.status).toBe(200);
        const robotsClaimBody = robotsClaimRes.body as { status: string; origin: string; leaseId: string };
        expect(robotsClaimBody.status).toBe("leased");
        expect(robotsClaimBody.origin).toBe(targetOrigin);
        expect(robotsClaimBody.leaseId).toBeTruthy();

        const robotsResultRes = await postNodeJson(
          store,
          "/v1/node/robots/result",
          {
            schemaVersion: PROTOCOL_VERSION,
            nodeId: "robot-node",
            origin: targetOrigin,
            leaseId: robotsClaimBody.leaseId,
            statusCode: 200,
            body: "User-agent: *\nAllow: /"
          },
          token
        );
        expect(robotsResultRes.status).toBe(200);
        expect(robotsResultRes.body).toMatchObject({ status: "accepted", origin: targetOrigin });

        const replayRes = await postNodeJson(
          store,
          "/v1/node/robots/result",
          {
            schemaVersion: PROTOCOL_VERSION,
            nodeId: "robot-node",
            origin: targetOrigin,
            leaseId: robotsClaimBody.leaseId,
            statusCode: 200,
            body: "User-agent: *\nAllow: /"
          },
          token
        );
        expect(replayRes.status).toBe(403);

        now += 1500;
        const claimAfter = ClaimResponseSchema.parse(
          (
            await postNodeJson(
              store,
              "/v1/node/jobs/claim",
              { schemaVersion: PROTOCOL_VERSION, nodeId: "robot-node", capabilities: ["vpm"] },
              token
            )
          ).body
        );
        expect(claimAfter.status).toBe("leased");
        if (claimAfter.status === "leased") expect(claimAfter.job.url).toBe(`${targetOrigin}/index.json`);
      } finally {
        store.close();
      }
    });
  });

  describe("V0 preview starter seeding and storefront discovery isolation", () => {
    test("purgeDevelopmentDatabase seeds 16 starter profiles only on explicit opt-in and excludes curated", async () => {
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-18T00:00:00.000Z"));
      try {
        expect(store.sqlite.prepare("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({ count: 0 });
        expect(buildPreviewStarterSteeringProfiles().map((profile) => String(profile.platform))).not.toContain(
          "curated"
        );

        const purged = await store.purgeDevelopmentDatabase(
          { schemaVersion: 1, confirm: "PURGE_DEVELOPMENT_D1", preserveNodes: true, seedPreviewStarter: true },
          "dev-operator"
        );
        expect(purged.seededProfiles).toBe(16);
        const rows = store.sqlite
          .prepare("SELECT platform, host_match_mode, host_pattern, path_scope FROM steering_profiles ORDER BY profile_id")
          .all() as { platform: string; host_match_mode: string; host_pattern: string; path_scope: string }[];
        expect(rows).toHaveLength(16);
        expect(rows.some((row) => row.host_match_mode === "any_vpm_https")).toBe(true);
        expect(new Set(rows.map((row) => row.platform))).toEqual(
          new Set(["vpm", "github", "booth", "gumroad", "jinxxy", "itch", "shopify", "sellfy"])
        );
        for (const row of rows) {
          expect(row.host_pattern).not.toContain("template-");
          expect(row.path_scope).not.toContain("/sample-");
        }
      } finally {
        store.close();
      }
    });

    test("Payhip storefront lead resolves to custom_domain metadata and rejects release_zip promotion", async () => {
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-18T00:00:00.000Z"));
      try {
        expect(classifyOutboundLeadKind("https://payhip.com/b/creator-asset-01")).toBe("storefront_product");
        expect(classifyOutboundLeadKind("https://payhip.com/creator-shop")).toBe("storefront_product");

        const seedJobId = await store.seedJob("https://vpm.example.org/index.json", "vpm", {
          purpose: "discovery"
        });
        const payhipLeadKey = "a".repeat(64);
        const zipLeadKey = "b".repeat(64);
        store.sqlite
          .prepare(
            `INSERT INTO source_leads
             (lead_key, discovered_from_url, discovered_from_job_id, kind, target_url, target_host, status, first_seen_at, last_seen_at)
             VALUES (?, 'https://vpm.example.org/index.json', ?, 'storefront_product', 'https://payhip.com/b/creator-asset-01', 'payhip.com', 'pending_review', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z')`
          )
          .run(payhipLeadKey, seedJobId);
        const approvedPayhipJobId = await store.approveLead(payhipLeadKey, undefined, "operator", "Approve Payhip lead");
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(approvedPayhipJobId)).toEqual({
          platform: "custom_domain",
          job_purpose: "metadata"
        });
        expect(
          (store.sqlite.prepare("SELECT min_delay_ms FROM origin_state WHERE origin='https://payhip.com'").get() as {
            min_delay_ms: number;
          }).min_delay_ms
        ).toBeGreaterThanOrEqual(2000);

        store.sqlite
          .prepare(
            `INSERT INTO source_leads
             (lead_key, discovered_from_url, discovered_from_job_id, kind, target_url, target_host, status, first_seen_at, last_seen_at)
             VALUES (?, 'https://vpm.example.org/index.json', ?, 'release_zip', 'https://example.org/pkg.zip', 'example.org', 'pending_review', '2026-10-18T00:00:00.000Z', '2026-10-18T00:00:00.000Z')`
          )
          .run(zipLeadKey, seedJobId);
        await expect(store.approveLead(zipLeadKey, undefined, "operator", "Invalid target")).rejects.toThrow(
          "cannot become a crawl job"
        );
      } finally {
        store.close();
      }
    });

    test("storefront discovery leads are partitioned into pending_review and cannot become VPM fetch jobs", async () => {
      const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-10-18T00:00:00.000Z"));
      try {
        const { token: nodeToken } = await store.createNodeCredential("crawler-node-leads", ["vpm", "booth", "custom_domain"]);
        await allowFixtureOrigin(store, "https://vpm.example.org", "https://booth.pm", "https://payhip.com");
        await seedApprovedFixtureJob(store, "https://vpm.example.org/index.json", "vpm", 1000, "discovery");

        const claim = ClaimResponseSchema.parse(
          (
            await postNodeJson(
              store,
              "/v1/node/jobs/claim",
              { schemaVersion: PROTOCOL_VERSION, nodeId: "crawler-node-leads", capabilities: ["vpm"] },
              nodeToken
            )
          ).body
        );
        if (claim.status !== "leased") throw new Error("Expected VPM discovery lease");

        const submitRes = await postNodeJson(
          store,
          "/v1/node/jobs/result",
          {
            schemaVersion: PROTOCOL_VERSION,
            nodeId: "crawler-node-leads",
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "idempotency-lead-chain-001",
            outcome: {
              kind: "discovery",
              leads: [
                { kind: "storefront_product", url: "https://booth.pm/ja/items/123456" },
                { kind: "storefront_product", url: "https://payhip.com/b/creator-asset-01" }
              ]
            }
          },
          nodeToken
        );
        expect(submitRes.status).toBe(200);

        const boothLead = store.sqlite
          .prepare("SELECT lead_key, status, kind FROM source_leads WHERE target_url='https://booth.pm/ja/items/123456'")
          .get() as { lead_key: string; status: string; kind: string } | null;
        expect(boothLead?.status).toBe("pending_review");
        expect(boothLead?.kind).toBe("storefront_product");

        const payhipLead = store.sqlite
          .prepare("SELECT lead_key, status, kind FROM source_leads WHERE target_url='https://payhip.com/b/creator-asset-01'")
          .get() as { lead_key: string; status: string; kind: string } | null;
        expect(payhipLead?.status).toBe("pending_review");
        expect(payhipLead?.kind).toBe("storefront_product");

        const boothJobId = await store.approveLead(boothLead!.lead_key, undefined, "operator", "Approve booth item");
        const payhipJobId = await store.approveLead(payhipLead!.lead_key, undefined, "operator", "Approve Payhip item");
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(boothJobId)).toEqual({
          platform: "booth",
          job_purpose: "metadata"
        });
        expect(store.sqlite.prepare("SELECT platform, job_purpose FROM crawl_jobs WHERE job_id=?").get(payhipJobId)).toEqual({
          platform: "custom_domain",
          job_purpose: "metadata"
        });

        const claimAfter = ClaimResponseSchema.parse(
          (
            await postNodeJson(
              store,
              "/v1/node/jobs/claim",
              {
                schemaVersion: PROTOCOL_VERSION,
                nodeId: "crawler-node-leads",
                capabilities: ["vpm", "booth", "custom_domain"]
              },
              nodeToken
            )
          ).body
        );
        expect(claimAfter.status).toBe("empty");
      } finally {
        store.close();
      }
    });
  });
});
