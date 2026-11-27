import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTestOutputDir } from "./helpers/test_directory.ts";
import { createInitializedD1Coordinator, type InitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { handleDownstreamRequest } from "../src/api/downstream_handler.ts";
import {
  CatalogSearchResponseSchema,
  CreatorClaimIntakeResponseSchema,
  DOWNSTREAM_PROTOCOL_VERSION,
  RegisterAppResponseSchema,
  ReportSubmissionResponseSchema,
  VRCPackageClient,
  type ReportSubmissionRequest
} from "vrc-packages-api";

interface ErrorPayload {
  schemaVersion: number;
  code: string;
  error: string;
}

describe("Downstream Client Protocol, Demand Signals, Relationship Feedback & Claims (V0)", () => {
  let tempDir: string;
  let dbPath: string;
  let store: InitializedD1Coordinator;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(getTestOutputDir(), "vrcp-downstream-test-"));
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

  const request = async (path: string, method: string, body?: unknown, token?: string): Promise<Request> => {
    let bearer = token;
    if (path === "/v1/app/register" && bearer === undefined) {
      bearer = (await store.issueUserToken("registration-fixture")).token;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (bearer) {
      headers["Authorization"] = `Bearer ${bearer}`;
    }
    return new Request(`http://127.0.0.1:8787${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  test("actual report HTTP receipts satisfy the SDK for demand, issue, relationship_feedback, and removal", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Receipt fixture" });
    await store.reviewAppCandidate(app.appId, { candidateStatus: "trusted" }, "moderator-fixture");
    const nowIso = new Date(store.now()).toISOString();
    store.sqlite
      .prepare(
        `INSERT INTO source_items (source_key, platform, source_url, latest_digest, observed_at)
         VALUES ('vpm:https://rel.example/index.json:pkg-rel', 'vpm', 'https://rel.example/index.json', 'd1', ?)`
      )
      .run(nowIso);
    store.sqlite
      .prepare(
        `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, created_at, updated_at)
         VALUES ('pkg-rel', 'tools', 'tool', 'active', 'Rel Package', ?, ?)`
      )
      .run(nowIso, nowIso);
    const relationId = crypto.randomUUID();
    store.sqlite
      .prepare(
        `INSERT INTO listing_relations (
           relation_id, source_key, source_canonical_id, target_canonical_id, target_avatar_base,
           relation_type, scope, confidence, evidence_source, created_at, updated_at
         ) VALUES (?, 'vpm:https://rel.example/index.json:pkg-rel', 'pkg-rel', NULL, 'Kikyo',
           'compatible_with_avatar', 'named_base', 0.95, 'creator_declared', ?, ?)`
      )
      .run(relationId, nowIso, nowIso);

    const statuses: number[] = [];
    const client = new VRCPackageClient({
      baseUrl: "https://worker.example",
      appToken: app.appToken,
      fetch: Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await handleDownstreamRequest(new Request(input, init), store);
          statuses.push(response.status);
          expect(response.headers.get("cache-control")).toBe("no-store");
          return response;
        },
        { preconnect() {} }
      )
    });
    const reports: ReportSubmissionRequest[] = [
      {
        schemaVersion: 1,
        reportType: "demand_signal",
        signalKind: "search_miss",
        query: "receipt fixture",
        zeroHits: true,
        reason: "Expected tool missing"
      },
      {
        schemaVersion: 1,
        reportType: "issue_report",
        reportKind: "broken_link",
        targetUrl: "https://receipt.example/product",
        reason: " Product link returns 404 ",
        metadata: { reason: "Caller metadata must not replace the report reason", source: "fixture" }
      },
      {
        schemaVersion: 1,
        reportType: "relationship_feedback",
        canonicalId: "pkg-rel",
        targetAvatarBase: "Kikyo",
        relationType: "compatible_with_avatar",
        vote: "up",
        reason: "Verified working on Kikyo v1.3"
      },
      {
        schemaVersion: 1,
        reportType: "removal_request",
        canonicalId: "receipt-target",
        reason: "Incorrect attribution"
      }
    ];
    for (const report of reports) {
      const receipt = await client.reports.submit(report);
      expect(Object.keys(receipt).sort()).toEqual(["schemaVersion", "status", "reportId", "recordedAt"].sort());
      if (report.reportType === "demand_signal") {
        const row = store.sqlite
          .prepare("SELECT app_id, signal_type, metadata_json FROM downstream_signals WHERE signal_id=?")
          .get(receipt.reportId) as { app_id: string; signal_type: string; metadata_json: string | null };
        expect(row.app_id).toBe(app.appId);
        expect(row.signal_type).toBe("search_miss");
        expect(row.metadata_json).toBeNull();
      } else if (report.reportType === "relationship_feedback") {
        const sigRow = store.sqlite
          .prepare("SELECT app_id, signal_type, target_canonical_id FROM downstream_signals WHERE signal_id=?")
          .get(receipt.reportId) as { app_id: string; signal_type: string; target_canonical_id: string };
        expect(sigRow.app_id).toBe(app.appId);
        expect(sigRow.signal_type).toBe("relationship_feedback");
        expect(sigRow.target_canonical_id).toBe("pkg-rel");
        const relRow = store.sqlite
          .prepare("SELECT feedback_up_count, feedback_down_count FROM listing_relations WHERE relation_id=?")
          .get(relationId) as { feedback_up_count: number; feedback_down_count: number };
        expect(relRow.feedback_up_count).toBe(1);
        expect(relRow.feedback_down_count).toBe(0);
      } else {
        const row = store.sqlite
          .prepare("SELECT app_id, ticket_type, reason, payload_json FROM catalog_tickets WHERE ticket_id=?")
          .get(receipt.reportId) as { app_id: string; ticket_type: string; reason: string; payload_json: string };
        expect(row.app_id).toBe(app.appId);
        expect(row.reason).toBe(report.reason!.trim());
        if (report.reportType === "issue_report") {
          expect(row.ticket_type).toBe("metadata_issue");
          const payload = JSON.parse(row.payload_json) as { metadata?: { source?: string } };
          expect(payload.metadata?.source).toBe("fixture");
        } else {
          expect(row.ticket_type).toBe("removal_report");
        }
      }
    }
    expect(statuses).toEqual([200, 200, 200, 202]);
  });

  test("app registration rejects anonymous callers and records owner_user_id in registered_apps", async () => {
    const input = { schemaVersion: 1 as const, appName: "Owned app" };
    const anonymous = new Request("https://worker.example/v1/app/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    });
    expect((await handleDownstreamRequest(anonymous, store)).status).toBe(401);

    const user = await store.issueUserToken("app-owner");
    const response = await handleDownstreamRequest(await request("/v1/app/register", "POST", input, user.token), store);
    expect(response.status).toBe(201);
    expect(response.headers.get("X-RateLimit-Limit")).toBeDefined();
    const app = RegisterAppResponseSchema.parse(await response.json());

    const owner = store.sqlite
      .prepare("SELECT owner_user_id FROM registered_apps WHERE app_id=?")
      .get(app.appId) as { owner_user_id: string | null };
    expect(owner.owner_user_id).toBe(user.userId);

    const activeUser = await store.issueUserToken("rollback-owner");
    store.sqlite.exec(
      "CREATE TRIGGER reject_app_owner BEFORE INSERT ON registered_apps WHEN NEW.owner_user_id IS NOT NULL BEGIN SELECT RAISE(ABORT,'Owner write rejected'); END;"
    );
    await expect(store.registerApp(input, activeUser.userId)).rejects.toThrow("Owner write rejected");
    store.sqlite.exec("DROP TRIGGER reject_app_owner;");

    store.sqlite
      .prepare("UPDATE registered_users SET revoked_at=? WHERE user_id=?")
      .run(new Date().toISOString(), user.userId);
    await expect(store.registerApp(input, user.userId)).rejects.toThrow();

    expect((store.sqlite.prepare("SELECT COUNT(*) AS count FROM registered_apps").get() as { count: number }).count).toBe(
      1
    );

    const operatorToken = "a".repeat(64);
    expect(
      (await handleDownstreamRequest(await request("/v1/app/register", "POST", input, "b".repeat(64)), store, operatorToken))
        .status
    ).toBe(401);
    expect(
      (await handleDownstreamRequest(await request("/v1/app/register", "POST", input, operatorToken), store, operatorToken))
        .status
    ).toBe(201);
    expect(
      (
        store.sqlite
          .prepare("SELECT COUNT(*) AS count FROM registered_apps WHERE owner_user_id IS NOT NULL")
          .get() as { count: number }
      ).count
    ).toBe(1);
  });

  test("singular report records removal ticket for review without catalog or demand changes", async () => {
    const registered = await store.registerApp({ schemaVersion: 1, appName: "Removal test" });
    const payload = {
      schemaVersion: 1,
      reportType: "removal_request",
      canonicalId: "target-1",
      reason: "Incorrect attribution"
    };
    expect((await handleDownstreamRequest(await request("/v1/app/report", "POST", payload), store)).status).toBe(401);
    expect(
      (
        await handleDownstreamRequest(
          await request("/v1/app/report", "POST", { ...payload, reason: "" }, registered.appToken),
          store
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleDownstreamRequest(
          await request(
            "/v1/app/report",
            "POST",
            { schemaVersion: 1, reportType: "removal_request", reason: "No target" },
            registered.appToken
          ),
          store
        )
      ).status
    ).toBe(400);

    const untrustedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", payload, registered.appToken),
      store
    );
    expect(untrustedRes.status).toBe(403);
    const untrustedBody = (await untrustedRes.json()) as ErrorPayload;
    expect(untrustedBody.error).toContain("trusted registered app status required");

    await store.reviewAppCandidate(registered.appId, { candidateStatus: "trusted" }, "moderator-test");

    const response = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", payload, registered.appToken),
      store
    );
    expect(response.status).toBe(202);
    const body = ReportSubmissionResponseSchema.parse(await response.json());
    const row = store.sqlite
      .prepare("SELECT app_id, ticket_type, review_status, payload_json FROM catalog_tickets WHERE ticket_id=?")
      .get(body.reportId) as { app_id: string; ticket_type: string; review_status: string; payload_json: string };
    expect(row.app_id).toBe(registered.appId);
    expect(row.ticket_type).toBe("removal_report");
    expect(row.review_status).toBe("pending");
    expect(JSON.parse(row.payload_json)).toEqual(payload);

    for (const table of ["downstream_signals", "suppressed_targets", "canonical_packages", "crawl_jobs"] as const) {
      expect((store.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count).toBe(0);
    }
    expect(
      (await handleDownstreamRequest(await request("/v1/app/reports", "POST", payload, registered.appToken), store))
        .status
    ).toBe(404);
  });

  test("POST /v1/app/register creates downstream application with vrcp_app_ token", async () => {
    const res = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "ALCOM Desktop Manager",
        contactEmail: "alcom@example.org",
        description: "Package discovery client for VRChat"
      }),
      store
    );

    expect(res.status).toBe(201);
    const data = RegisterAppResponseSchema.parse(await res.json());
    expect(data.schemaVersion).toBe(1);
    expect(data.appName).toBe("ALCOM Desktop Manager");
    expect(data.appId).toBeDefined();
    expect(data.appToken).toMatch(/^vrcp_app_[a-f0-9]{64}$/);
    expect(data.permissions).toContain("catalog:search");
    expect(data.permissions).toContain("demand:feedback");

    const legacyRes = await handleDownstreamRequest(
      await request("/v1/apps/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "Legacy App"
      }),
      store
    );
    expect(legacyRes.status).toBe(404);
  });

  test("POST /v1/app/report requires authentication and ingests demand signals", async () => {
    const regRes = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", {
        schemaVersion: 1,
        appName: "VCC Mobile Companion"
      }),
      store
    );
    const { appToken } = RegisterAppResponseSchema.parse(await regRes.json());

    const unauthRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", {
        schemaVersion: 1,
        reportType: "demand_signal",
        signalKind: "search_miss",
        query: "physbone optimizer"
      }),
      store
    );
    expect(unauthRes.status).toBe(401);

    const badTokenRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "demand_signal",
          signalKind: "search_miss",
          query: "physbone optimizer"
        },
        "vrcp_app_0000000000000000000000000000000000000000000000000000000000000000"
      ),
      store
    );
    expect(badTokenRes.status).toBe(401);

    const feedbackRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "demand_signal",
          signalKind: "search_miss",
          query: "novel shader generator",
          zeroHits: true
        },
        appToken
      ),
      store
    );
    expect(feedbackRes.status).toBe(200);
    const feedbackData = ReportSubmissionResponseSchema.parse(await feedbackRes.json());
    expect(feedbackData.schemaVersion).toBe(1);
    expect(feedbackData.status).toBe("accepted");
    expect(feedbackData.reportId).toBeDefined();
    expect(feedbackData.recordedAt).toBeDefined();

    const refreshRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "demand_signal",
          signalKind: "refresh_demand",
          targetUrl: "https://github.com/example-author/stale-tool"
        },
        appToken
      ),
      store
    );
    expect(refreshRes.status).toBe(200);

    const legacyRes = await handleDownstreamRequest(
      await request(
        "/v1/apps/feedback",
        "POST",
        {
          schemaVersion: 1,
          reportType: "demand_signal",
          signalKind: "search_miss",
          query: "physbone optimizer"
        },
        appToken
      ),
      store
    );
    expect(legacyRes.status).toBe(404);
  });

  test("POST /v1/app/report relationship_feedback increments feedback_up_count and feedback_down_count", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Feedback Client" });
    const nowIso = new Date(store.now()).toISOString();
    store.sqlite
      .prepare(
        `INSERT INTO source_items (source_key, platform, source_url, latest_digest, observed_at)
         VALUES ('vpm:https://fb.example/index.json:pkg-fb', 'vpm', 'https://fb.example/index.json', 'd-fb', ?)`
      )
      .run(nowIso);
    store.sqlite
      .prepare(
        `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, created_at, updated_at)
         VALUES ('pkg-fb', 'tools', 'tool', 'active', 'Feedback Tool', ?, ?)`
      )
      .run(nowIso, nowIso);
    const relationId = crypto.randomUUID();
    store.sqlite
      .prepare(
        `INSERT INTO listing_relations (
           relation_id, source_key, source_canonical_id, target_canonical_id, target_avatar_base,
           relation_type, scope, confidence, evidence_source, created_at, updated_at
         ) VALUES (?, 'vpm:https://fb.example/index.json:pkg-fb', 'pkg-fb', 'com.example.dep', NULL,
           'depends_on', 'exact', 0.9, 'vpm_manifest', ?, ?)`
      )
      .run(relationId, nowIso, nowIso);

    const upRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "relationship_feedback",
          canonicalId: "pkg-fb",
          relatedCanonicalId: "com.example.dep",
          relationType: "depends_on",
          vote: "up",
          reason: "Confirmed dependency works"
        },
        app.appToken
      ),
      store
    );
    expect(upRes.status).toBe(200);

    const downRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "relationship_feedback",
          canonicalId: "pkg-fb",
          relatedCanonicalId: "com.example.dep",
          relationType: "depends_on",
          vote: "down",
          reason: "Broken on latest Unity"
        },
        app.appToken
      ),
      store
    );
    expect(downRes.status).toBe(200);

    const relRow = store.sqlite
      .prepare("SELECT feedback_up_count, feedback_down_count FROM listing_relations WHERE relation_id = ?")
      .get(relationId) as { feedback_up_count: number; feedback_down_count: number };
    expect(relRow.feedback_up_count).toBe(1);
    expect(relRow.feedback_down_count).toBe(1);
  });

  test("removed random sampling routes return 404", async () => {
    for (const path of ["/v1/app/index/random", "/v1/app/index/random?limit=2", "/v1/catalog/random"]) {
      const response = await handleDownstreamRequest(await request(path, "GET"), store);
      expect(response.status).toBe(404);
    }
  });

  test("POST /v1/app/index/search performs text search and keyset pagination", async () => {
    const reg = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Search Tester" }),
      store
    );
    const { appToken } = RegisterAppResponseSchema.parse(await reg.json());

    const t1 = new Date(Date.now() - 3000).toISOString();
    const t2 = new Date(Date.now() - 2000).toISOString();
    const t3 = new Date(Date.now() - 1000).toISOString();

    store.sqlite.exec(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
      VALUES
        ('pkg-1', 'tools', 'editor_tool', 'active', 'Super VRChat Tool', 'com.vrc.tool', '${t1}', '${t1}'),
        ('pkg-2', 'tools', 'avatar_tool', 'active', 'Avatar Optimizer', 'com.vrc.opt', '${t2}', '${t2}'),
        ('pkg-3', 'assets', 'shader', 'active', 'Toon Water Shader', NULL, '${t3}', '${t3}');
    `);

    const searchRes = await handleDownstreamRequest(
      await request(
        "/v1/app/index/search",
        "POST",
        {
          schemaVersion: 1,
          query: "Optimizer",
          queryOrigin: "user_authored"
        },
        appToken
      ),
      store
    );
    expect(searchRes.status).toBe(200);
    const searchBody = CatalogSearchResponseSchema.parse(await searchRes.json());
    expect(searchBody.items.length).toBe(1);
    expect(searchBody.items[0]?.displayName).toBe("Avatar Optimizer");
    expect(searchBody.totalEstimated).toBe(1);

    const pageRes = await handleDownstreamRequest(
      await request(
        "/v1/app/index/search",
        "POST",
        {
          schemaVersion: 1,
          umbrella: "tools",
          limit: 1,
          queryOrigin: "user_authored"
        },
        appToken
      ),
      store
    );
    expect(pageRes.status).toBe(200);
    const pageBody = CatalogSearchResponseSchema.parse(await pageRes.json());
    expect(pageBody.items.length).toBe(1);
    expect(pageBody.nextCursor).toBeDefined();
    expect(pageBody.totalEstimated).toBe(2);

    const legacySearch = await handleDownstreamRequest(
      await request(
        "/v1/catalog/search",
        "POST",
        {
          schemaVersion: 1,
          query: "Optimizer"
        },
        appToken
      ),
      store
    );
    expect(legacySearch.status).toBe(404);
  });

  test("delegated creator attestation intake requires BOTH trusted candidateStatus AND claims:delegate permission", async () => {
    const reg = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "VRChat Creator Companion",
        contactEmail: "creator@companion.test"
      }),
      store
    );
    expect(reg.status).toBe(201);
    const { appId, appToken } = RegisterAppResponseSchema.parse(await reg.json());

    const nowSec = Math.floor(Date.now() / 1000);
    const validAttestation = {
      appId,
      action: "creator_ownership_claim" as const,
      frontUrl: "https://shop.booth.pm/items/999888",
      creatorId: "creator_booth_123",
      challengeToken: "chal_valid_tok_123456",
      expiresAt: nowSec + 3600,
      nonce: "nonce_unique_123456"
    };
    const validSignature = "sig_ed25519_valid_signature_123";

    const anonRes = await handleDownstreamRequest(
      await request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature
      }),
      store
    );
    expect(anonRes.status).toBe(401);

    // 1. Neither trusted nor claims:delegate
    const unauthorizedAppRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(unauthorizedAppRes.status).toBe(403);
    const unauthData = (await unauthorizedAppRes.json()) as ErrorPayload;
    expect(unauthData.error).toBe("Application requires trusted candidate status and claims:delegate permission");

    // 2. claims:delegate WITHOUT candidateStatus='trusted' still returns 403
    await store.setAppDelegation(appId, true, "operator");
    const nonTrustedRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(nonTrustedRes.status).toBe(403);

    // 3. Trusted candidateStatus WITHOUT claims:delegate also returns 403
    store.sqlite
      .prepare("UPDATE registered_apps SET candidate_status='trusted', permissions_json=? WHERE app_id=?")
      .run(JSON.stringify(["catalog:read", "catalog:search", "demand:feedback"]), appId);
    const noPermRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(noPermRes.status).toBe(403);

    // 4. Both candidateStatus === 'trusted' AND claims:delegate granted
    await store.reviewAppCandidate(appId, { candidateStatus: "trusted", grantDelegation: true }, "moderator");

    const mismatchRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: {
            ...validAttestation,
            appId: "00000000-0000-4000-8000-000000000000"
          },
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(mismatchRes.status).toBe(403);

    const expiredRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: {
            ...validAttestation,
            nonce: "nonce_expired_123456",
            expiresAt: nowSec - 10
          },
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(expiredRes.status).toBe(400);

    const acceptRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature,
          reason: "Authoritative storefront claim",
          contactEmail: "creator@booth.test"
        },
        appToken
      ),
      store
    );
    expect(acceptRes.status).toBe(202);
    const acceptData = CreatorClaimIntakeResponseSchema.parse(await acceptRes.json());
    expect(acceptData.schemaVersion).toBe(1);
    expect(acceptData.status).toBe("accepted");
    expect(acceptData.claimId).toBeDefined();
    expect(acceptData.reviewStatus).toBe("pending");
    expect(acceptData.recordedAt).toBeDefined();

    const claimRow = store.sqlite
      .prepare(
        `SELECT app_id, target_url, creator_id, challenge_token, expires_at, nonce, signature,
                review_status, reason, contact_email, payload_json
         FROM catalog_tickets WHERE ticket_id = ? AND ticket_type = 'delegated_claim'`
      )
      .get(acceptData.claimId) as {
      app_id: string;
      target_url: string;
      creator_id: string;
      challenge_token: string;
      expires_at: number;
      nonce: string;
      signature: string;
      review_status: string;
      reason: string;
      contact_email: string;
      payload_json: string;
    };
    expect(claimRow.app_id).toBe(appId);
    expect(claimRow.target_url).toBe("https://shop.booth.pm/items/999888");
    expect(claimRow.creator_id).toBe("creator_booth_123");
    expect(claimRow.challenge_token).toBe("chal_valid_tok_123456");
    expect(claimRow.expires_at).toBe(validAttestation.expiresAt);
    expect(claimRow.nonce).toBe("nonce_unique_123456");
    expect(claimRow.signature).toBe(validSignature);
    expect(claimRow.review_status).toBe("pending");
    expect(claimRow.reason).toBe("Authoritative storefront claim");
    expect(claimRow.contact_email).toBe("creator@booth.test");

    expect((store.sqlite.prepare("SELECT COUNT(*) AS c FROM crawl_jobs").get() as { c: number }).c).toBe(0);
    expect((store.sqlite.prepare("SELECT COUNT(*) AS c FROM suppressed_targets").get() as { c: number }).c).toBe(0);

    const duplicateRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature,
          reason: "Authoritative storefront claim",
          contactEmail: "creator@booth.test"
        },
        appToken
      ),
      store
    );
    expect(duplicateRes.status).toBe(202);
    const duplicateData = CreatorClaimIntakeResponseSchema.parse(await duplicateRes.json());
    expect(duplicateData.claimId).toBe(acceptData.claimId);
    expect(duplicateData.recordedAt).toBe(acceptData.recordedAt);

    const tamperedRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: "tampered_signature_xyz_123456",
          reason: "Authoritative storefront claim",
          contactEmail: "creator@booth.test"
        },
        appToken
      ),
      store
    );
    expect(tamperedRes.status).toBe(409);
    const tamperedData = (await tamperedRes.json()) as ErrorPayload;
    expect(tamperedData.code).toBe("conflict");

    await store.setAppDelegation(appId, false, "operator");
    const revokedRes = await handleDownstreamRequest(
      await request(
        "/v1/app/claims/intake",
        "POST",
        {
          schemaVersion: 1,
          attestation: validAttestation,
          signature: validSignature
        },
        appToken
      ),
      store
    );
    expect(revokedRes.status).toBe(403);
  });

  test("catalog search enforces age rating boundary based on user age verification", async () => {
    const now = new Date(store.now()).toISOString();
    const pkgs = [
      { id: "pkg-general-1", rating: "general", name: "Safe Tool" },
      { id: "pkg-mature-1", rating: "mature", name: "Mature Shader" },
      { id: "pkg-adult-1", rating: "adult_restricted", name: "Explicit Avatar Asset" },
      { id: "pkg-prohibited-1", rating: "prohibited", name: "Prohibited Malicious Asset" }
    ];
    for (const p of pkgs) {
      store.sqlite
        .prepare(
          `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, content_rating)
        VALUES (?, 'tools', 'tool', 'active', ?, ?, ?, ?, ?)`
        )
        .run(p.id, p.name, p.id, now, now, p.rating);
    }

    const userUnverified = await store.issueUserToken("unverified-user", undefined, false);
    const regRes1 = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Unverified App" }, userUnverified.token),
      store
    );
    expect(regRes1.status).toBe(201);
    const app1 = RegisterAppResponseSchema.parse(await regRes1.json());

    const searchRes1 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app1.appToken),
      store
    );
    expect(searchRes1.status).toBe(200);
    const searchData1 = CatalogSearchResponseSchema.parse(await searchRes1.json());
    expect(searchData1.items.map((i) => i.canonicalId)).toEqual(["pkg-general-1"]);
    expect(searchData1.items[0]?.contentRating).toBe("general");

    const searchResAdultUnverified = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app1.appToken),
      store
    );
    expect(searchResAdultUnverified.status).toBe(200);
    const searchDataAdultUnverified = CatalogSearchResponseSchema.parse(await searchResAdultUnverified.json());
    expect(searchDataAdultUnverified.items.map((i) => i.canonicalId)).toEqual(["pkg-general-1"]);
    expect(searchDataAdultUnverified.items[0]?.contentRating).toBe("general");

    const userVerified = await store.issueUserToken("verified-adult-user", undefined, true);
    const regRes2 = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Verified App" }, userVerified.token),
      store
    );
    expect(regRes2.status).toBe(201);
    const app2 = RegisterAppResponseSchema.parse(await regRes2.json());

    const searchRes2 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app2.appToken),
      store
    );
    expect(searchRes2.status).toBe(200);
    const searchData2 = CatalogSearchResponseSchema.parse(await searchRes2.json());
    const ids = searchData2.items.map((i) => i.canonicalId);
    expect(ids).toContain("pkg-general-1");
    expect(ids).toContain("pkg-mature-1");
    expect(ids).toContain("pkg-adult-1");
    expect(ids).not.toContain("pkg-prohibited-1");

    const searchResAdultVerified = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app2.appToken),
      store
    );
    expect(searchResAdultVerified.status).toBe(200);
    const searchDataAdultVerified = CatalogSearchResponseSchema.parse(await searchResAdultVerified.json());
    expect(searchDataAdultVerified.items.map((i) => i.canonicalId)).toEqual(["pkg-adult-1"]);

    const searchResProhibited = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "prohibited" }, app2.appToken),
      store
    );
    expect(searchResProhibited.status).toBe(200);
    const searchDataProhibited = CatalogSearchResponseSchema.parse(await searchResProhibited.json());
    expect(searchDataProhibited.items).toHaveLength(0);
  });

  test("tracks downstream application request activity and flags intensive-use candidates at threshold", async () => {
    const user = await store.issueUserToken("active-developer", "dev@example.com", false);
    const regRes = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Intensive App" }, user.token),
      store
    );
    expect(regRes.status).toBe(201);
    const app = RegisterAppResponseSchema.parse(await regRes.json());

    const loadRow = () =>
      store.sqlite
        .prepare(
          "SELECT request_count, last_active_at, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?"
        )
        .get(app.appId) as {
        request_count: number;
        last_active_at: string | null;
        candidate_status: string;
        candidate_flags_json: string;
      };

    let row = loadRow();
    expect(row.request_count).toBe(0);
    expect(row.last_active_at).toBeNull();
    expect(row.candidate_status).toBe("none");
    expect(JSON.parse(row.candidate_flags_json)).toEqual([]);

    const searchRes1 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );
    expect(searchRes1.status).toBe(200);

    row = loadRow();
    expect(row.request_count).toBe(1);
    expect(row.last_active_at).not.toBeNull();
    expect(row.candidate_status).toBe("none");

    for (let i = 2; i <= 49; i++) {
      await handleDownstreamRequest(
        await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
        store
      );
    }

    row = loadRow();
    expect(row.request_count).toBe(49);
    expect(row.candidate_status).toBe("none");

    await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );

    row = loadRow();
    expect(row.request_count).toBe(50);
    expect(row.candidate_status).toBe("review_pending");
    const flags = JSON.parse(row.candidate_flags_json) as string[];
    expect(flags).toContain("intensive_usage");
    expect(flags).toContain("high_frequency_api");
  });

  test("enforces application permissions for search and demand/relationship feedback", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Permission test" });
    store.sqlite
      .prepare("UPDATE registered_apps SET permissions_json = ? WHERE app_id = ?")
      .run(JSON.stringify([]), app.appId);

    const searchRes = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );
    expect(searchRes.status).toBe(403);
    const searchBody = (await searchRes.json()) as ErrorPayload;
    expect(searchBody.error).toContain("Application is not authorized for catalog searches");

    const feedbackRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        { schemaVersion: 1, reportType: "demand_signal", query: "test", reason: "missing" },
        app.appToken
      ),
      store
    );
    expect(feedbackRes.status).toBe(403);
    const feedbackBody = (await feedbackRes.json()) as ErrorPayload;
    expect(feedbackBody.error).toContain("Application is not authorized for demand or relationship feedback");

    const relFeedbackRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "relationship_feedback",
          canonicalId: "pkg-1",
          targetAvatarBase: "Kikyo",
          relationType: "compatible_with_avatar",
          vote: "down"
        },
        app.appToken
      ),
      store
    );
    expect(relFeedbackRes.status).toBe(403);

    await store.reviewAppCandidate(app.appId, { candidateStatus: "trusted" }, "moderator-test");
    const removalRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        { schemaVersion: 1, reportType: "removal_request", canonicalId: "pkg-1", reason: "opt out" },
        app.appToken
      ),
      store
    );
    expect(removalRes.status).toBe(202);
  });

  test("POST /v1/app/report partitions issue reports into rating_dispute, safety_quarantine, and metadata_issue", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Report Partitioning Test" });

    const ratingRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "issue_report",
          reportKind: "explicit_false_positive",
          canonicalId: "com.example.rating-pkg",
          reason: "Item is safe for general audiences"
        },
        app.appToken
      ),
      store
    );
    expect(ratingRes.status).toBe(200);
    const ratingData = ReportSubmissionResponseSchema.parse(await ratingRes.json());
    expect(ratingData.status).toBe("accepted");

    const ratingRow = store.sqlite
      .prepare("SELECT ticket_type, canonical_id, reason, review_status FROM catalog_tickets WHERE ticket_id = ?")
      .get(ratingData.reportId) as { ticket_type: string; canonical_id: string; reason: string; review_status: string };
    expect(ratingRow.ticket_type).toBe("rating_dispute");
    expect(ratingRow.canonical_id).toBe("com.example.rating-pkg");
    expect(ratingRow.reason).toBe("Item is safe for general audiences");
    expect(ratingRow.review_status).toBe("pending");

    const safetyRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "issue_report",
          reportKind: "inappropriate",
          canonicalId: "com.example.safety-pkg",
          reason: "Suspected unlawful material"
        },
        app.appToken
      ),
      store
    );
    expect(safetyRes.status).toBe(200);
    const safetyData = ReportSubmissionResponseSchema.parse(await safetyRes.json());

    const safetyRow = store.sqlite
      .prepare("SELECT ticket_type, canonical_id, reason, review_status FROM catalog_tickets WHERE ticket_id = ?")
      .get(safetyData.reportId) as { ticket_type: string; canonical_id: string; reason: string; review_status: string };
    expect(safetyRow.ticket_type).toBe("safety_quarantine");
    expect(safetyRow.canonical_id).toBe("com.example.safety-pkg");
    expect(safetyRow.reason).toBe("Suspected unlawful material");
    expect(safetyRow.review_status).toBe("pending");

    const metaRes = await handleDownstreamRequest(
      await request(
        "/v1/app/report",
        "POST",
        {
          schemaVersion: 1,
          reportType: "issue_report",
          reportKind: "broken_link",
          targetUrl: "https://example.org/broken-url",
          reason: "Target returns 404"
        },
        app.appToken
      ),
      store
    );
    expect(metaRes.status).toBe(200);
    const metaData = ReportSubmissionResponseSchema.parse(await metaRes.json());

    const metaRow = store.sqlite
      .prepare(
        "SELECT ticket_type, target_url, reason, review_status, payload_json FROM catalog_tickets WHERE ticket_id = ?"
      )
      .get(metaData.reportId) as {
      ticket_type: string;
      target_url: string;
      reason: string;
      review_status: string;
      payload_json: string;
    };
    expect(metaRow.ticket_type).toBe("metadata_issue");
    expect(metaRow.target_url).toBe("https://example.org/broken-url");
    expect(metaRow.reason).toBe("Target returns 404");
    expect(metaRow.review_status).toBe("pending");
    const metaPayload = JSON.parse(metaRow.payload_json) as { reportType: string; reportKind: string };
    expect(metaPayload.reportType).toBe("issue_report");
    expect(metaPayload.reportKind).toBe("broken_link");
  });

  test("POST /v1/app/report gates creator takedowns on trusted app status and routes into catalog_tickets", async () => {
    const untrustedApp = await store.registerApp({ schemaVersion: 1, appName: "Untrusted Takedown Submitter" });
    const takedownPayload = {
      schemaVersion: 1,
      reportType: "removal_request",
      canonicalId: "com.example.infringing-pkg",
      reason: "Creator requested package delisting"
    };

    const untrustedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", takedownPayload, untrustedApp.appToken),
      store
    );
    expect(untrustedRes.status).toBe(403);
    const errBody = (await untrustedRes.json()) as ErrorPayload;
    expect(errBody.error).toContain("trusted registered app status required");

    const review = await store.reviewAppCandidate(
      untrustedApp.appId,
      { candidateStatus: "trusted", notes: "Verified creator tool" },
      "moderator-lead"
    );
    expect(review.candidateStatus).toBe("trusted");
    expect(review.permissions).toContain("takedowns:submit");

    const trustedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", takedownPayload, untrustedApp.appToken),
      store
    );
    expect(trustedRes.status).toBe(202);
    const receipt = ReportSubmissionResponseSchema.parse(await trustedRes.json());
    expect(receipt.status).toBe("accepted");

    const ticket = store.sqlite
      .prepare(
        "SELECT ticket_id, ticket_type, app_id, canonical_id, requester_type, reason, review_status FROM catalog_tickets WHERE ticket_id = ?"
      )
      .get(receipt.reportId) as {
      ticket_id: string;
      ticket_type: string;
      app_id: string;
      canonical_id: string;
      requester_type: string;
      reason: string;
      review_status: string;
    };
    expect(ticket.ticket_type).toBe("removal_report");
    expect(ticket.app_id).toBe(untrustedApp.appId);
    expect(ticket.canonical_id).toBe("com.example.infringing-pkg");
    expect(ticket.requester_type).toBe("app");
    expect(ticket.reason).toBe("Creator requested package delisting");
    expect(ticket.review_status).toBe("pending");

    await store.setAppDelegation(untrustedApp.appId, false, "operator-lead", "Revoke delegation");
    const revokedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", takedownPayload, untrustedApp.appToken),
      store
    );
    expect(revokedRes.status).toBe(403);
  });
});
