import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTestOutputDir } from "./helpers/test_directory.ts";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import type { Coordinator } from "../src/storage/d1/coordinator.ts";
import type { Database } from "bun:sqlite";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { parseCapabilityToken } from "../src/domain/security/capability_token.ts";
import { PROTOCOL_VERSION, type Platform } from "vrc-packages-network/node";
import { OPERATOR_PROTOCOL_VERSION } from "vrc-packages-api";

describe("Workforce Distribution & Capability-Encoded Node Tokens", () => {
  let tempDir: string;
  let dbPath: string;
  let store: Coordinator & { sqlite: Database; close: () => void };
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

  test("issueNodeCredential issues vrcp_<auth_token><capability> token matching assigned capabilities", async () => {
    const token = await store.issueNodeCredential(
      {
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        nodeId: "node-vpm-gh",
        capabilities: ["vpm", "github"],
        reason: "Provision vpm worker"
      },
      "admin-operator"
    );

    expect(token.startsWith("vrcp_")).toBe(true);
    expect(token.length).toBe(73);

    const parsed = parseCapabilityToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);

    const principal = await store.authenticate("node-vpm-gh", token);
    expect(principal).not.toBeNull();
    expect(principal!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);
  });

  test("POST /v1/operator/nodes issues capability-encoded token and auto-evaluates workforce when omitted", async () => {
    const now = new Date().toISOString();
    store.sqlite.exec(`
      INSERT INTO crawl_jobs (job_id, platform, url, origin, state, next_fetch_at, created_at)
      VALUES
        ('job-b1', 'booth', 'https://booth.pm/items/1', 'https://booth.pm', 'pending', '${now}', '${now}'),
        ('job-b2', 'booth', 'https://booth.pm/items/2', 'https://booth.pm', 'pending', '${now}', '${now}'),
        ('job-s1', 'shopify', 'https://shopify.com/products/1', 'https://shopify.com', 'pending', '${now}', '${now}');
    `);

    // Operator registers node without explicit capabilities; coordinator auto-balances workforce
    const req = new Request("http://127.0.0.1:8787/v1/operator/nodes", {
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
    });

    const res = await handleOperatorRequest(req, store, operatorToken);
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;

    expect(data.nodeId).toBe("node-auto-balanced");
    expect(data.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    expect(data.capabilities).toContain("booth");

    const parsed = parseCapabilityToken(data.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual(data.capabilities.sort());
  });

  test("Node claim rejects unauthorized capabilities not granted by capability token", async () => {
    const token = await store.createNodeCredential("node-vpm-only", ["vpm"]);

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
    const body = (await res.json()) as any;
    expect(body.error).toContain("Capability not granted to node");
  });

  test("Downstream demand feedback signal dynamically reorients workforce distribution", async () => {
    const app = await store.registerApp({
      schemaVersion: 1,
      appName: "VRC Community Client"
    });

    await store.recordDownstreamFeedback(app.appId, {
      signalType: "search_miss",
      requestedPlatform: "sellfy",
      query: "custom 3D avatar rig"
    });
    await store.recordDownstreamFeedback(app.appId, {
      signalType: "search_miss",
      requestedPlatform: "sellfy",
      query: "face tracking blendshapes"
    });

    const enabledCaps = await store.evaluateWorkforceDistribution();
    expect(enabledCaps).toContain("sellfy");
  });
});
