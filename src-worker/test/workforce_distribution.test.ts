import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTestOutputDir } from "./helpers/test_directory.ts";
import { approveFixtureSource, seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";
import { createInitializedD1Coordinator, type InitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { parseCapabilityToken } from "../src/domain/security/capability_token.ts";
import { PROTOCOL_VERSION, type Platform } from "vrc-packages-network/node";
import { NodeCredentialResponseSchema, OPERATOR_PROTOCOL_VERSION } from "vrc-packages-api";

interface ErrorPayload {
  error: string;
}

describe("Workforce Distribution & Capability-Encoded Node Tokens (V0)", () => {
  let tempDir: string;
  let dbPath: string;
  let store: InitializedD1Coordinator;
  const operatorToken = "a".repeat(64);

  beforeEach(async () => {
    tempDir = mkdtempSync(join(getTestOutputDir(), "vrcp-workforce-test-"));
    expect(dirname(tempDir)).toBe(getTestOutputDir());
    dbPath = join(tempDir, "coordinator.db");
    store = await createInitializedD1Coordinator(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("createNodeCredential issues vrcp_<auth_token><capability> token and returns { token, capabilities }", async () => {
    const issued = await store.createNodeCredential("node-vpm-gh", ["vpm", "github"]);

    expect(issued.token.startsWith("vrcp_")).toBe(true);
    expect(issued.token.length).toBe(73);
    expect([...issued.capabilities].sort()).toEqual(["github", "vpm"] as Platform[]);

    const parsed = parseCapabilityToken(issued.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);

    const principal = await store.authenticate("node-vpm-gh", issued.token);
    expect(principal).not.toBeNull();
    expect(principal!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);
  });

  test("issueNodeCredential omits explicit capabilities and POST /v1/operator/nodes rejects unknown capability input", async () => {
    await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/1", "booth");
    await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/2", "booth");
    await seedApprovedFixtureJob(store, "https://shop.example.com/products/1", "shopify");

    // Verify IssueNodeCredential rejects removed capabilities field
    const invalidRes = await handleOperatorRequest(
      new Request("http://127.0.0.1:8787/v1/operator/nodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`
        },
        body: JSON.stringify({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: "node-rejected",
          capabilities: ["booth"],
          reason: "Should be rejected by strict V0 schema"
        })
      }),
      store,
      operatorToken
    );
    expect(invalidRes.status).toBe(400);

    const validRes = await handleOperatorRequest(
      new Request("http://127.0.0.1:8787/v1/operator/nodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`
        },
        body: JSON.stringify({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: "node-auto-balanced",
          reason: "Auto balanced node deployment"
        })
      }),
      store,
      operatorToken
    );
    expect(validRes.status).toBe(201);
    const data = NodeCredentialResponseSchema.parse(await validRes.json());

    expect(data.nodeId).toBe("node-auto-balanced");
    expect(data.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    expect(data.capabilities).toContain("booth");
    expect(data.capabilities).toContain("shopify");

    const parsed = parseCapabilityToken(data.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual([...data.capabilities].sort());
  });

  test("evaluateWorkforceDistribution burst fairness: no +1 floor on zero demand and accounts for newly issued nodes with last_seen_at IS NULL", async () => {
    // 1. Even with zero demand, scores tie at 0 and respect activeWorkers ascending
    const idleNode = await store.createNodeCredential("existing-idle-booth", ["booth"]);
    expect(idleNode.capabilities).toEqual(["booth"]);
    const zeroDemandRanked = await store.evaluateWorkforceDistribution(["booth", "vpm"]);
    // vpm has 0 activeWorkers (including last_seen_at IS NULL), booth has 1 activeWorker -> vpm ranks first
    expect(zeroDemandRanked).toEqual(["vpm", "booth"]);

    // 2. Seed demand across booth (2 claimable jobs), shopify (2 claimable jobs), github (2 claimable jobs), vpm (2 claimable jobs)
    await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/101", "booth");
    await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/102", "booth");
    await seedApprovedFixtureJob(store, "https://merchant1.example/products/a", "shopify");
    await seedApprovedFixtureJob(store, "https://merchant1.example/products/b", "shopify");
    await seedApprovedFixtureJob(store, "https://api.github.com/repos/vrchat-test/tool-a", "github");
    await seedApprovedFixtureJob(store, "https://api.github.com/repos/vrchat-test/tool-b", "github");
    await approveFixtureSource(store, "https://vpm.example.com/index.json", "vpm");
    await store.seedJob("https://vpm.example.com/index.json", "vpm", { minDelayMs: 1000, purpose: "metadata" });

    // Remove the earlier booth node so all platforms start at 0 active workers
    store.sqlite.prepare("UPDATE nodes SET revoked_at = ? WHERE node_id = ?").run(
      new Date().toISOString(),
      "existing-idle-booth"
    );

    // Multi-node burst: provisioning 3 nodes sequentially without heartbeats (last_seen_at IS NULL)
    // distributes capabilities fairly rather than piling onto the same top 3 platforms
    const burst1 = await store.issueNodeCredential(
      { schemaVersion: OPERATOR_PROTOCOL_VERSION, nodeId: "burst-node-1", reason: "Burst provisioning 1" },
      "operator"
    );
    expect(burst1.capabilities).toEqual(["booth", "github", "shopify"]);

    // Because burst-node-1 has last_seen_at IS NULL (not yet heartbeated), it MUST count as active for booth/github/shopify
    const burst2 = await store.issueNodeCredential(
      { schemaVersion: OPERATOR_PROTOCOL_VERSION, nodeId: "burst-node-2", reason: "Burst provisioning 2" },
      "operator"
    );
    expect(burst2.capabilities[0]).toBe("vpm");
  });

  test("stale last_seen_at nodes and revoked last_seen_at=NULL nodes are excluded from active workforce count", async () => {
    await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/201", "booth");
    await seedApprovedFixtureJob(store, "https://api.github.com/repos/vrchat-test/tool-201", "github");

    const staleTime = new Date(store.now() - 10 * 60 * 1000).toISOString();
    await store.createNodeCredential("stale-booth", ["booth"]);
    store.sqlite.prepare("UPDATE nodes SET last_seen_at = ? WHERE node_id = ?").run(staleTime, "stale-booth");

    await store.createNodeCredential("revoked-booth", ["booth"]);
    store.sqlite
      .prepare("UPDATE nodes SET revoked_at = ? WHERE node_id = ?")
      .run(new Date().toISOString(), "revoked-booth");

    await store.createNodeCredential("fresh-github", ["github"]);

    // booth has 0 active workers (stale + revoked excluded), github has 1 (fresh-github last_seen_at IS NULL)
    const ranked = await store.evaluateWorkforceDistribution(["booth", "github"]);
    expect(ranked[0]).toBe("booth");
  });

  test("Node claim rejects unauthorized capabilities not granted by capability token", async () => {
    const { token } = await store.createNodeCredential("node-vpm-only", ["vpm"]);

    const claimReq = new Request("http://127.0.0.1:8787/v1/node/jobs/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "node-vpm-only",
        capabilities: ["booth"]
      })
    });

    const res = await handleNodeRequest(claimReq, store);
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorPayload;
    expect(body.error).toContain("Capability not granted to node");
  });

  test("Downstream demand signals in downstream_signals dynamically reorient workforce distribution", async () => {
    const app = await store.registerApp({
      schemaVersion: 1,
      appName: "VRC Community Client"
    });
    const nowIso = new Date(store.now()).toISOString();
    store.sqlite
      .prepare(
        `INSERT INTO downstream_signals(signal_id, app_id, signal_type, query, zero_hits, requested_platform, recorded_at)
         VALUES (?, ?, 'search_miss', 'custom 3D avatar rig', 1, 'sellfy', ?),
                (?, ?, 'search_miss', 'face tracking blendshapes', 1, 'sellfy', ?)`
      )
      .run(crypto.randomUUID(), app.appId, nowIso, crypto.randomUUID(), app.appId, nowIso);

    const enabledCaps = await store.evaluateWorkforceDistribution();
    expect(enabledCaps).toContain("sellfy");
  });
});
