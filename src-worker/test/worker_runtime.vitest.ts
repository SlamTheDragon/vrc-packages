import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  NodeCredentialResponseSchema,
  OperatorStatusResponseSchema,
  PublicCatalogListResponseSchema,
  SystemPurgeResponseSchema
} from "vrc-packages-api";
import { ClaimResponseSchema, PROTOCOL_VERSION, ResultResponseSchema } from "vrc-packages-network/node";
import { EXPECTED_V0_TABLE_NAMES } from "../src/storage/d1/schema/index.ts";

describe("configured coordinator Worker", () => {
  it("rejects unauthenticated initialization before writing D1 and reports uninitialized status", async () => {
    const response = await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });
    expect(response.status).toBe(401);
    const result = await env.VRCP_D1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='canonical_packages'"
    ).all();
    expect(result.results).toEqual([]);

    const statusRes = await exports.default.fetch("https://coordinator.example/v1/operator/status", {
      headers: { authorization: `Bearer ${env.OPERATOR_TOKEN}` }
    });
    expect(statusRes.status).toBe(200);
    const status = OperatorStatusResponseSchema.parse(await statusRes.json());
    expect(status.environment).toBe("development");
    expect(status.purgeEnabled).toBe(true);
    expect(status.d1SchemaState).toBe("uninitialized");
  });

  it("initializes the 17-table V0 schema with autoSeed=false and rejects autoSeed=true", async () => {
    const rejectedInit = await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: true })
    });
    expect(rejectedInit.status).toBe(400);

    const response = await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      status: "ok",
      message: "Schema initialized",
      autoSeed: false
    });

    const tablesRes = await env.VRCP_D1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).all<{ name: string }>();
    expect((tablesRes.results ?? []).map((row) => row.name)).toEqual([...EXPECTED_V0_TABLE_NAMES].sort());

    const viewsRes = await env.VRCP_D1.prepare("SELECT name FROM sqlite_master WHERE type='view'").all();
    expect(viewsRes.results).toEqual([]);

    const indexesRes = await env.VRCP_D1.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%'"
    ).all();
    expect((indexesRes.results ?? []).length).toBe(39);

    const statusRes = await exports.default.fetch("https://coordinator.example/v1/operator/status", {
      headers: { authorization: `Bearer ${env.OPERATOR_TOKEN}` }
    });
    expect(statusRes.status).toBe(200);
    const status = OperatorStatusResponseSchema.parse(await statusRes.json());
    expect(status.d1SchemaState).toBe("v0-17");
    expect(status.queueReadiness).toEqual({
      claimableJobs: 0,
      blockedJobs: 0,
      pendingLeads: 0,
      unresolvedDemandSignals: 0,
      activeNodes: 0,
      activeSteeringProfiles: 0
    });

    const catalog = await exports.default.fetch("https://coordinator.example/v1/app/index");
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toEqual({ schemaVersion: 1, packages: [], nextCursor: null });
  });

  it("supports development system purge with preview starter seeding and preserves internal tables", async () => {
    await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });

    await exports.default.fetch("https://coordinator.example/v1/operator/nodes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, nodeId: "workerd-keep-node", reason: "Retain across dev purge" })
    });

    const purgeRes = await exports.default.fetch("https://coordinator.example/v1/operator/system/purge", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({
        schemaVersion: 1,
        confirm: "PURGE_DEVELOPMENT_D1",
        preserveNodes: true,
        seedPreviewStarter: true
      })
    });
    expect(purgeRes.status).toBe(200);
    const purged = SystemPurgeResponseSchema.parse(await purgeRes.json());
    expect(purged).toEqual({
      schemaVersion: 1,
      status: "purged",
      d1SchemaState: "v0-17",
      preservedNodes: 1,
      seededProfiles: 16
    });

    const profiles = await env.VRCP_D1.prepare("SELECT platform FROM steering_profiles").all<{ platform: string }>();
    expect((profiles.results ?? []).length).toBe(16);
    expect((profiles.results ?? []).some((p) => p.platform === "curated")).toBe(false);
  });

  it("runs CORS PATCH preflight and end-to-end steering, node claim, observation, and unverified catalog projection", async () => {
    const preflight = await exports.default.fetch("https://coordinator.example/v1/operator/jobs/11111111-1111-4111-8111-111111111111", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:4321",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "Authorization, Content-Type"
      }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, PATCH, DELETE, OPTIONS");

    await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });

    const profileRes = await exports.default.fetch("https://coordinator.example/v1/operator/steering-profiles", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({
        schemaVersion: 1,
        platform: "vpm",
        hostMatchMode: "exact",
        hostPattern: "workerd-repo.example",
        pathScope: "/index.json",
        queryMode: "none",
        method: "GET",
        purpose: "metadata",
        minDelayMs: 1000,
        expiresAt: "2099-01-01T00:00:00.000Z",
        reviewReference: "WORKERD-V0-E2E",
        reason: "Workerd end-to-end steering profile",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      })
    });
    expect(profileRes.status).toBe(201);

    const jobRes = await exports.default.fetch("https://coordinator.example/v1/operator/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({
        schemaVersion: 1,
        url: "https://workerd-repo.example/index.json",
        platform: "vpm",
        purpose: "metadata",
        minDelayMs: 1000,
        reason: "Workerd e2e job"
      })
    });
    expect(jobRes.status).toBe(200);

    const nodeRes = await exports.default.fetch("https://coordinator.example/v1/operator/nodes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, nodeId: "workerd-e2e-node", reason: "Workerd e2e node" })
    });
    expect(nodeRes.status).toBe(201);
    const issued = NodeCredentialResponseSchema.parse(await nodeRes.json());

    const robotsClaimRes = await exports.default.fetch("https://coordinator.example/v1/node/robots/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.token}`
      },
      body: JSON.stringify({ schemaVersion: PROTOCOL_VERSION, nodeId: issued.nodeId })
    });
    expect(robotsClaimRes.status).toBe(200);
    const robotsClaim = (await robotsClaimRes.json()) as { status: string; origin: string; leaseId: string };
    expect(robotsClaim.status).toBe("leased");

    const robotsResultRes = await exports.default.fetch("https://coordinator.example/v1/node/robots/result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.token}`
      },
      body: JSON.stringify({
        schemaVersion: PROTOCOL_VERSION,
        nodeId: issued.nodeId,
        origin: robotsClaim.origin,
        leaseId: robotsClaim.leaseId,
        statusCode: 200,
        body: "User-agent: *\nAllow: /"
      })
    });
    expect(robotsResultRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const claimRes = await exports.default.fetch("https://coordinator.example/v1/node/jobs/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.token}`
      },
      body: JSON.stringify({
        schemaVersion: PROTOCOL_VERSION,
        nodeId: issued.nodeId,
        capabilities: issued.capabilities
      })
    });
    expect(claimRes.status).toBe(200);
    const claim = ClaimResponseSchema.parse(await claimRes.json());
    expect(claim.status).toBe("leased");
    if (claim.status !== "leased") throw new Error("Expected leased job");

    const submitRes = await exports.default.fetch("https://coordinator.example/v1/node/jobs/result", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${issued.token}`
      },
      body: JSON.stringify({
        schemaVersion: PROTOCOL_VERSION,
        nodeId: issued.nodeId,
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "workerd-e2e-vpm-001",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.workerd.e2e-tool",
            title: "Workerd E2E Tool",
            author: "Workerd Creator",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            releases: [{ version: "1.0.0", dependencyRanges: {} }]
          }
        }
      })
    });
    expect(submitRes.status).toBe(200);
    expect(ResultResponseSchema.parse(await submitRes.json()).sourceVersionCreated).toBe(true);

    const catalogRes = await exports.default.fetch("https://coordinator.example/v1/app/index");
    expect(catalogRes.status).toBe(200);
    const catalog = PublicCatalogListResponseSchema.parse(await catalogRes.json());
    const pkg = catalog.packages.find((entry) => entry.canonicalId === "com.workerd.e2e-tool");
    expect(pkg?.verificationStatus).toBe("unverified");
    expect(pkg?.sources.length).toBe(1);
    expect(pkg?.sources[0]?.storefrontUrl).toBe("https://workerd-repo.example/index.json");
  });

  it("serves JSON 404s instead of the unused Hello World scaffold", async () => {
    const response = await exports.default.fetch("https://coordinator.example/");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ schemaVersion: 1, code: "not_found", error: "Not Found" });
  });
});
