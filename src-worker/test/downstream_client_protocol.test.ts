import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTestOutputDir } from "./helpers/test_directory.ts";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import type { Coordinator } from "../src/storage/d1/coordinator.ts";
import type { Database } from "bun:sqlite";
import { handleDownstreamRequest } from "../src/api/downstream_handler.ts";
import { DOWNSTREAM_PROTOCOL_VERSION, VRCPackageClient, type ReportSubmissionRequest } from "vrc-packages-api";

describe("Downstream Client Protocol & Demand Feedback Signals", () => {
  let tempDir: string;
  let dbPath: string;
  let store: Coordinator & { sqlite: Database; close: () => void };

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
    if (path === "/v1/app/register" && token === undefined) {
      token = (await store.issueUserToken("registration-fixture")).token;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return new Request(`http://127.0.0.1:8787${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  test("actual report HTTP receipts satisfy the SDK for demand, issue and removal", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Receipt fixture" });
    await store.reviewAppCandidate(app.appId, { candidateStatus: "trusted" }, "moderator-fixture");
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
          .prepare("SELECT app_id, metadata_json FROM downstream_demand_signals WHERE signal_id=?")
          .get(receipt.reportId) as { app_id: string; metadata_json: string };
        expect(row.app_id).toBe(app.appId);
        const metadata = JSON.parse(row.metadata_json);
        expect(metadata.reason).toBe(report.reason!.trim());
        expect(metadata.reportType).toBe(report.reportType);
      } else {
        const row = store.sqlite
          .prepare("SELECT app_id, ticket_type, reason, payload_json FROM catalog_tickets WHERE ticket_id=?")
          .get(receipt.reportId) as { app_id: string; ticket_type: string; reason: string; payload_json: string };
        expect(row.app_id).toBe(app.appId);
        expect(row.reason).toBe(report.reason!.trim());
        if (report.reportType === "issue_report") {
          expect(row.ticket_type).toBe("metadata_issue");
          const payload = JSON.parse(row.payload_json);
          expect(payload.metadata?.source).toBe("fixture");
        } else {
          expect(row.ticket_type).toBe("removal_report");
        }
      }
    }
    expect(statuses).toEqual([200, 200, 202]);
  });

  test("app registration rejects anonymous callers and records authenticated ownership", async () => {
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
    const app = (await response.json()) as { appId: string };
    const owner = store.sqlite.prepare("SELECT user_id FROM user_app_ownership WHERE app_id=?").get(app.appId) as any;
    expect(owner.user_id).toBe(user.userId);
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
    expect((store.sqlite.prepare("SELECT COUNT(*) AS count FROM registered_apps").get() as any).count).toBe(1);
    const operatorToken = "a".repeat(64);
    expect(
      (await handleDownstreamRequest(await request("/v1/app/register", "POST", input, "b".repeat(64)), store, operatorToken))
        .status
    ).toBe(401);
    expect(
      (await handleDownstreamRequest(await request("/v1/app/register", "POST", input, operatorToken), store, operatorToken))
        .status
    ).toBe(201);
    expect((store.sqlite.prepare("SELECT COUNT(*) AS count FROM user_app_ownership").get() as any).count).toBe(1);
  });

  test("singular report records removal for review without catalog or demand changes", async () => {
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
    const untrustedBody = (await untrustedRes.json()) as any;
    expect(untrustedBody.error).toContain("trusted registered app status required");

    await store.reviewAppCandidate(registered.appId, { candidateStatus: "trusted" }, "moderator-test");

    const response = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", payload, registered.appToken),
      store
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { reportId: string };
    const row = store.sqlite
      .prepare("SELECT app_id, review_status, payload_json FROM catalog_reports WHERE report_id=?")
      .get(body.reportId) as any;
    expect(row.app_id).toBe(registered.appId);
    expect(row.review_status).toBe("pending");
    expect(JSON.parse(row.payload_json)).toEqual(payload);
    for (const table of [
      "downstream_demand_signals",
      "creator_opt_outs",
      "suppressed_urls",
      "canonical_packages",
      "crawl_jobs"
    ]) {
      expect((store.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as any).count).toBe(0);
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
    const data = (await res.json()) as any;
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
    const { appToken } = (await regRes.json()) as { appToken: string };

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
    const feedbackData = (await feedbackRes.json()) as any;
    expect(feedbackData.schemaVersion).toBe(1);
    expect(feedbackData.status).toBe("accepted");
    expect(feedbackData.reportId).toBeDefined();
    expect(feedbackData.signalId).toBeUndefined();
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
    const { appToken } = (await reg.json()) as { appToken: string };

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
    const searchBody = (await searchRes.json()) as any;
    expect(searchBody.items.length).toBe(1);
    expect(searchBody.items[0].displayName).toBe("Avatar Optimizer");
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
    const pageBody = (await pageRes.json()) as any;
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

  test("delegated creator attestation intake accepts valid claims and enforces replay protection", async () => {
    const reg = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "VRChat Creator Companion",
        contactEmail: "creator@companion.test"
      }),
      store
    );
    expect(reg.status).toBe(201);
    const { appId, appToken } = (await reg.json()) as { appId: string; appToken: string };

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
    const unauthData = (await unauthorizedAppRes.json()) as any;
    expect(unauthData.error).toBe("Application is not authorized for delegated creator claims");

    await store.setAppDelegation(appId, true, "operator");

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
    const acceptData = (await acceptRes.json()) as any;
    expect(acceptData.schemaVersion).toBe(1);
    expect(acceptData.status).toBe("accepted");
    expect(acceptData.claimId).toBeDefined();
    expect(acceptData.reviewStatus).toBe("pending");
    expect(acceptData.recordedAt).toBeDefined();

    const claimRow = store.sqlite
      .prepare("SELECT * FROM delegated_creator_claims WHERE claim_id = ?")
      .get(acceptData.claimId) as any;
    expect(claimRow.app_id).toBe(appId);
    expect(claimRow.action).toBe("creator_ownership_claim");
    expect(claimRow.front_url).toBe("https://shop.booth.pm/items/999888");
    expect(claimRow.creator_id).toBe("creator_booth_123");
    expect(claimRow.challenge_token).toBe("chal_valid_tok_123456");
    expect(claimRow.expires_at).toBe(validAttestation.expiresAt);
    expect(claimRow.nonce).toBe("nonce_unique_123456");
    expect(claimRow.signature).toBe(validSignature);
    expect(claimRow.review_status).toBe("pending");
    expect(claimRow.reason).toBe("Authoritative storefront claim");
    expect(claimRow.contact_email).toBe("creator@booth.test");

    expect((store.sqlite.prepare("SELECT COUNT(*) AS c FROM crawl_jobs").get() as any).c).toBe(0);
    expect((store.sqlite.prepare("SELECT COUNT(*) AS c FROM suppressed_urls").get() as any).c).toBe(0);

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
    const duplicateData = (await duplicateRes.json()) as any;
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
    const tamperedData = (await tamperedRes.json()) as any;
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
    const app1 = (await regRes1.json()) as { appToken: string };

    const searchRes1 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app1.appToken),
      store
    );
    expect(searchRes1.status).toBe(200);
    const searchData1 = (await searchRes1.json()) as any;
    expect(searchData1.items.map((i: any) => i.canonicalId)).toEqual(["pkg-general-1"]);
    expect(searchData1.items[0].contentRating).toBe("general");

    const searchResAdultUnverified = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app1.appToken),
      store
    );
    expect(searchResAdultUnverified.status).toBe(200);
    const searchDataAdultUnverified = (await searchResAdultUnverified.json()) as any;
    expect(searchDataAdultUnverified.items.map((i: any) => i.canonicalId)).toEqual(["pkg-general-1"]);
    expect(searchDataAdultUnverified.items[0].contentRating).toBe("general");

    const userVerified = await store.issueUserToken("verified-adult-user", undefined, true);
    const regRes2 = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Verified App" }, userVerified.token),
      store
    );
    expect(regRes2.status).toBe(201);
    const app2 = (await regRes2.json()) as { appToken: string };

    const searchRes2 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app2.appToken),
      store
    );
    expect(searchRes2.status).toBe(200);
    const searchData2 = (await searchRes2.json()) as any;
    const ids = searchData2.items.map((i: any) => i.canonicalId);
    expect(ids).toContain("pkg-general-1");
    expect(ids).toContain("pkg-mature-1");
    expect(ids).toContain("pkg-adult-1");
    expect(ids).not.toContain("pkg-prohibited-1");

    const searchResAdultVerified = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app2.appToken),
      store
    );
    expect(searchResAdultVerified.status).toBe(200);
    const searchDataAdultVerified = (await searchResAdultVerified.json()) as any;
    expect(searchDataAdultVerified.items.map((i: any) => i.canonicalId)).toEqual(["pkg-adult-1"]);

    const searchResProhibited = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "prohibited" }, app2.appToken),
      store
    );
    expect(searchResProhibited.status).toBe(200);
    const searchDataProhibited = (await searchResProhibited.json()) as any;
    expect(searchDataProhibited.items).toHaveLength(0);
  });

  test("tracks downstream application request activity and flags intensive-use candidates at threshold (R54-C38A2)", async () => {
    const user = await store.issueUserToken("active-developer", "dev@example.com", false);
    const regRes = await handleDownstreamRequest(
      await request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Intensive App" }, user.token),
      store
    );
    expect(regRes.status).toBe(201);
    const app = (await regRes.json()) as { appId: string; appToken: string };

    let row = store.sqlite
      .prepare(
        "SELECT request_count, last_active_at, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?"
      )
      .get(app.appId) as any;
    expect(row.request_count).toBe(0);
    expect(row.last_active_at).toBeNull();
    expect(row.candidate_status).toBe("none");
    expect(JSON.parse(row.candidate_flags_json)).toEqual([]);

    const searchRes1 = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );
    expect(searchRes1.status).toBe(200);

    row = store.sqlite
      .prepare(
        "SELECT request_count, last_active_at, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?"
      )
      .get(app.appId) as any;
    expect(row.request_count).toBe(1);
    expect(row.last_active_at).not.toBeNull();
    expect(row.candidate_status).toBe("none");

    for (let i = 2; i <= 49; i++) {
      await handleDownstreamRequest(
        await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
        store
      );
    }

    row = store.sqlite
      .prepare("SELECT request_count, candidate_status FROM registered_apps WHERE app_id = ?")
      .get(app.appId) as any;
    expect(row.request_count).toBe(49);
    expect(row.candidate_status).toBe("none");

    await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );

    row = store.sqlite
      .prepare("SELECT request_count, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?")
      .get(app.appId) as any;
    expect(row.request_count).toBe(50);
    expect(row.candidate_status).toBe("review_pending");
    const flags = JSON.parse(row.candidate_flags_json);
    expect(flags).toContain("intensive_usage");
    expect(flags).toContain("high_frequency_api");
  });

  test("enforces application permissions for search and demand feedback", async () => {
    const app = await store.registerApp({ schemaVersion: 1, appName: "Permission test" });
    store.sqlite
      .prepare("UPDATE registered_apps SET permissions_json = ? WHERE app_id = ?")
      .run(JSON.stringify([]), app.appId);

    const searchRes = await handleDownstreamRequest(
      await request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
      store
    );
    expect(searchRes.status).toBe(403);
    const searchBody = (await searchRes.json()) as any;
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
    const feedbackBody = (await feedbackRes.json()) as any;
    expect(feedbackBody.error).toContain("Application is not authorized for demand feedback");

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

  test("POST /v1/app/report partitions issue reports into rating_dispute, safety_quarantine, and metadata_issue (R56-C56C)", async () => {
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
    const ratingData = (await ratingRes.json()) as any;
    expect(ratingData.status).toBe("accepted");
    expect(ratingData.reportId).toBeDefined();

    const ratingRow = store.sqlite
      .prepare("SELECT ticket_type, canonical_id, reason, review_status FROM catalog_tickets WHERE ticket_id = ?")
      .get(ratingData.reportId) as any;
    expect(ratingRow).toBeDefined();
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
    const safetyData = (await safetyRes.json()) as any;
    expect(safetyData.status).toBe("accepted");
    expect(safetyData.reportId).toBeDefined();

    const safetyRow = store.sqlite
      .prepare("SELECT ticket_type, canonical_id, reason, review_status FROM catalog_tickets WHERE ticket_id = ?")
      .get(safetyData.reportId) as any;
    expect(safetyRow).toBeDefined();
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
    const metaData = (await metaRes.json()) as any;
    expect(metaData.status).toBe("accepted");
    expect(metaData.reportId).toBeDefined();

    const metaRow = store.sqlite
      .prepare("SELECT ticket_type, target_url, reason, review_status, payload_json FROM catalog_tickets WHERE ticket_id = ?")
      .get(metaData.reportId) as any;
    expect(metaRow).toBeDefined();
    expect(metaRow.ticket_type).toBe("metadata_issue");
    expect(metaRow.target_url).toBe("https://example.org/broken-url");
    expect(metaRow.reason).toBe("Target returns 404");
    expect(metaRow.review_status).toBe("pending");
    const metaPayload = JSON.parse(metaRow.payload_json);
    expect(metaPayload.reportType).toBe("issue_report");
    expect(metaPayload.reportKind).toBe("broken_link");
  });

  test("POST /v1/app/report gates creator takedowns on trusted app status and routes into catalog_tickets (R54-C38)", async () => {
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
    const errBody = (await untrustedRes.json()) as any;
    expect(errBody.error).toContain("trusted registered app status required");

    const review = await store.reviewAppCandidate(
      untrustedApp.appId,
      { candidateStatus: "trusted", notes: "Verified verified creator tool" },
      "moderator-lead"
    );
    expect(review.candidateStatus).toBe("trusted");
    expect(review.permissions).toContain("takedowns:submit");

    const trustedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", takedownPayload, untrustedApp.appToken),
      store
    );
    expect(trustedRes.status).toBe(202);
    const receipt = (await trustedRes.json()) as any;
    expect(receipt.status).toBe("accepted");
    expect(receipt.reportId).toBeDefined();

    const ticket = store.sqlite
      .prepare(
        "SELECT ticket_id, ticket_type, app_id, canonical_id, requester_type, reason, review_status FROM catalog_tickets WHERE ticket_id = ?"
      )
      .get(receipt.reportId) as any;
    expect(ticket).toBeDefined();
    expect(ticket.ticket_type).toBe("removal_report");
    expect(ticket.app_id).toBe(untrustedApp.appId);
    expect(ticket.canonical_id).toBe("com.example.infringing-pkg");
    expect(ticket.requester_type).toBe("app");
    expect(ticket.reason).toBe("Creator requested package delisting");
    expect(ticket.review_status).toBe("pending");

    const reportView = store.sqlite
      .prepare("SELECT report_id, app_id, report_type, review_status FROM catalog_reports WHERE report_id = ?")
      .get(receipt.reportId) as any;
    expect(reportView).toBeDefined();
    expect(reportView.report_type).toBe("removal_report");
    expect(reportView.app_id).toBe(untrustedApp.appId);
    expect(reportView.review_status).toBe("pending");

    await store.setAppDelegation(untrustedApp.appId, false, "operator-lead", "Revoke delegation");
    const revokedRes = await handleDownstreamRequest(
      await request("/v1/app/report", "POST", takedownPayload, untrustedApp.appToken),
      store
    );
    expect(revokedRes.status).toBe(403);
  });
});
