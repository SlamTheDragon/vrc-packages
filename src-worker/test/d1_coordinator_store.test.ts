import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Coordinator } from "../src/storage/d1/coordinator.ts";
import workerEntry, { type Env } from "../src/worker_entry.ts";
import {
  PlatformSchema,
  type Platform,
  ResultResponseSchema,
  BatchResultResponseSchema,
  ClaimRequestSchema
} from "vrc-packages-network/node";
import {
  PREVIEW_STARTER_PROFILE_COUNT,
  buildPreviewStarterSteeringProfiles
} from "../src/storage/default_seeds.ts";
import {
  CatalogListResponseSchema,
  decodeCatalogCursor,
  InitializeCoordinatorResponseSchema,
  PublicCatalogListResponseSchema,
  VRCPackageClient
} from "vrc-packages-api";
import { handlePublicCatalogRequest } from "../src/api/public_handler.ts";
import { InMemoryRateLimiter } from "../src/api/rate_limiter.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { sha256Hex } from "../src/storage/d1/utils.ts";
import { createMockD1Database } from "./support/d1_test_fixtures.ts";

export { createMockD1Database };

const EXPECTED_V0_TABLES = [
  "canonical_packages",
  "catalog_tickets",
  "coordinator_meta",
  "crawl_jobs",
  "downstream_signals",
  "job_results",
  "listing_relations",
  "listing_sources",
  "nodes",
  "operator_audit_log",
  "origin_state",
  "registered_apps",
  "registered_users",
  "source_items",
  "source_leads",
  "steering_profiles",
  "suppressed_targets"
].sort();

describe("Cloudflare D1 Coordinator Store & Edge Worker Adapter (V0)", () => {
  it("rejects unsupported fixture operations and rolls back foreign batch statements", async () => {
    const sqlite = new Database(":memory:");
    const other = new Database(":memory:");
    try {
      const db = createMockD1Database(sqlite);
      const foreign = createMockD1Database(other);
      await db.exec("CREATE TABLE fixture_contract (value TEXT)");
      await foreign.exec("CREATE TABLE fixture_contract (value TEXT)");
      expect(() => db.withSession()).toThrow("does not implement sessions");
      await expect(db.dump()).rejects.toThrow("does not implement dump");
      await expect(db.prepare("SELECT 1").raw()).rejects.toThrow("does not implement raw");
      await expect(
        db.batch([
          db.prepare("INSERT INTO fixture_contract VALUES ('local')"),
          foreign.prepare("INSERT INTO fixture_contract VALUES ('foreign')")
        ])
      ).rejects.toThrow("foreign statement");
      expect(await db.prepare("SELECT COUNT(*) AS count FROM fixture_contract").first()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
      other.close();
    }
  });

  async function metadataFixture(platform: Platform, target: string, purpose: "metadata" | "discovery" = "metadata") {
    const sqlite = new Database(":memory:");
    const d1 = createMockD1Database(sqlite);
    const store = new Coordinator(d1);
    await store.initSchema({ autoSeed: false });
    const url = new URL(target);
    await store.createSteeringProfile(
      {
        schemaVersion: 1,
        platform,
        hostMatchMode: "exact",
        hostPattern: url.hostname.toLowerCase(),
        pathScope: url.pathname,
        queryMode: url.search ? "exact" : "none",
        ...(url.search ? { queryScope: url.search.slice(1) } : {}),
        method: "GET",
        purpose,
        minDelayMs: 1000,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reviewReference: "OFFLINE-METADATA-BOUNDARY",
        reason: "Hermetic metadata trust boundary",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      },
      "fixture-operator"
    );
    await store.recordRobotsSnapshot(url.origin, 404);
    await store.seedJob(target, platform, { minDelayMs: 1000, purpose });
    const nodeId = `metadata-${platform}`;
    const { token } = await store.createNodeCredential(nodeId, [platform]);
    const principal = (await store.authenticate(nodeId, token))!;
    const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: [platform] }, principal);
    if (claim.status !== "leased") throw new Error("Expected metadata fixture lease");
    const limiter = new InMemoryRateLimiter();
    const post = (body: unknown, path = "/v1/node/jobs/result") =>
      handleNodeRequest(
        new Request(`https://offline.invalid${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body)
        }),
        store,
        limiter
      );
    const observation = {
      sourceItemKey: `${url.host}${url.pathname}`,
      title: "Metadata fixture",
      author: "Fixture creator",
      summary: "",
      outboundLinks: [] as string[],
      originUpdatedAt: null
    };
    const result = {
      schemaVersion: 1,
      nodeId,
      jobId: claim.job.jobId,
      leaseId: claim.job.leaseId,
      idempotencyKey: "metadata-boundary-result",
      outcome: { kind: "changed", observation }
    };
    const snapshot = () =>
      Object.fromEntries(
        [
          "source_items",
          "job_results",
          "canonical_packages",
          "listing_sources",
          "listing_relations",
          "source_leads",
          "crawl_jobs",
          "origin_state"
        ].map((table) => [table, sqlite.query(`SELECT * FROM ${table}`).all()])
      );
    return { sqlite, d1, store, post, result, observation, snapshot };
  }

  async function associationEvidence(
    store: Coordinator,
    sourceUrl: string,
    outboundLinks: string[],
    platform: "vpm" | "github" = "vpm"
  ) {
    const target = new URL(sourceUrl);
    const nodeId = `association-evidence-${platform}`;
    const canonicalId = "com.fixture.association";
    const delay = platform === "github" ? 60_000 : 1000;
    await store.createSteeringProfile(
      {
        schemaVersion: 1,
        platform,
        hostMatchMode: "exact",
        hostPattern: target.hostname.toLowerCase(),
        pathScope: target.pathname,
        queryMode: target.search ? "exact" : "none",
        ...(target.search ? { queryScope: target.search.slice(1) } : {}),
        method: "GET",
        purpose: "metadata",
        minDelayMs: delay,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reviewReference: "OFFLINE-URL-EQUIVALENCE",
        reason: "Hermetic accepted source fixture",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      },
      "fixture-operator"
    );
    await store.recordRobotsSnapshot(target.origin, 404);
    await store.seedJob(target.href, platform, { minDelayMs: delay, purpose: "metadata" });
    const { token } = await store.createNodeCredential(nodeId, [platform]);
    const principal = (await store.authenticate(nodeId, token))!;
    const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: [platform] }, principal);
    if (claim.status !== "leased") throw new Error("Expected association evidence lease");
    expect(
      (
        await store.submit(
          {
            schemaVersion: 1,
            nodeId,
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "association-evidence-result",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: platform === "vpm" ? canonicalId : "github:999",
                title: "Accepted source fixture",
                author: "Fixture creator",
                summary: "",
                outboundLinks,
                originUpdatedAt: null
              }
            }
          },
          principal
        )
      ).status
    ).toBe("accepted");
    return canonicalId;
  }

  it.each(["source_item", "outbound_lead", "job_lead"] as const)(
    "preserves generic URL components during %s association",
    async (route) => {
      const variants: [string, (base: string) => string, boolean][] = [
        ["exact", (base) => base, true],
        [
          "host case and default port",
          (base) => {
            const url = new URL(base);
            return `https://${url.hostname.toUpperCase()}:443${url.pathname}${url.search}`;
          },
          true
        ],
        [
          "path case",
          (base) => {
            const url = new URL(base);
            url.pathname = url.pathname.toUpperCase();
            return url.href;
          },
          false
        ],
        ["query key case", (base) => base.replace("Edition=", "edition="), false],
        ["query value case", (base) => base.replace("Gold", "gold"), false],
        [
          "path slash",
          (base) => {
            const url = new URL(base);
            url.pathname += "/";
            return url.href;
          },
          false
        ],
        ["query value slash", (base) => base + "/", false],
        [
          "absent query",
          (base) => {
            const url = new URL(base);
            url.search = "";
            return url.href;
          },
          false
        ],
        ["fragment", (base) => base + "#details", false]
      ];
      for (const [label, variant, matches] of variants) {
        const jobUrl = "https://booth.pm/ja/items/66666?Edition=Gold";
        const fixture = await metadataFixture("booth", jobUrl);
        try {
          const reference = route === "job_lead" ? jobUrl : "https://publisher.example/Tools/Widget?Edition=Gold";
          const candidate = variant(reference);
          const canonicalId = await associationEvidence(
            fixture.store,
            route === "source_item" ? reference : "https://vpm-evidence.example/index.json",
            route === "outbound_lead" ? [reference] : route === "job_lead" ? [candidate] : []
          );
          const result = {
            ...fixture.result,
            outcome: {
              kind: "changed",
              observation: { ...fixture.observation, outboundLinks: route === "job_lead" ? [] : [candidate] }
            }
          };
          const response = await fixture.post(result);
          expect(response.status, label).toBe(200);
          const publicResponse = await handlePublicCatalogRequest(
            new Request("https://offline.invalid/v1/app/index"),
            fixture.store,
            new InMemoryRateLimiter()
          );
          const packages = PublicCatalogListResponseSchema.parse(await publicResponse.json()).packages;
          const sources = await fixture.store.getListingSourcesForCanonical(canonicalId);
          const crossSources = sources.filter((s) => s.platform === "booth");
          expect(crossSources.length, label).toBe(matches ? 1 : 0);
          expect(packages.find((item) => item.canonicalId === canonicalId)?.sources.filter((s) => s.platform === "booth").length, label).toBe(0);
          expect(Boolean(await fixture.store.getCanonicalPackage(fixture.observation.sourceItemKey)), label).toBe(!matches);
          if (!matches) {
            expect(
              packages.find((item) => item.canonicalId === fixture.observation.sourceItemKey)?.sources[0]?.storefrontUrl,
              label
            ).toBe(jobUrl);
          }
          const settled = fixture.snapshot();
          expect(ResultResponseSchema.parse(await (await fixture.post(result)).json()).duplicate).toBe(true);
          expect(fixture.snapshot()).toEqual(settled);
        } finally {
          fixture.sqlite.close();
        }
      }
    }
  );

  it("serializes VPM lead identities without changing retained outbound evidence", async () => {
    const fixture = await metadataFixture("booth", "https://booth.pm/ja/items/66667");
    try {
      const sourceUrl = "https://vpm-evidence.example/index.json";
      const links = [
        "https://PUBLISHER.EXAMPLE:443/Tools/Widget",
        "https://publisher.example/Tools/Widget",
        "https://publisher.example/tools/widget"
      ];
      await associationEvidence(fixture.store, sourceUrl, links);
      const leads = await fixture.store.listLeadsPage("pending_review", 10, null);
      expect(leads.leads.map((lead) => lead.target_url).sort()).toEqual([
        "https://publisher.example/Tools/Widget",
        "https://publisher.example/tools/widget"
      ]);
      const retained = fixture.sqlite
        .query("SELECT payload_json FROM source_items WHERE source_key=?")
        .get(`vpm:${sourceUrl}:com.fixture.association`) as { payload_json: string };
      expect((JSON.parse(retained.payload_json) as { outboundLinks: string[] }).outboundLinks).toEqual(links);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("retains explicit GitHub owner/repository case matching without folding generic source URLs", async () => {
    const fixture = await metadataFixture("booth", "https://booth.pm/ja/items/66668");
    try {
      const canonicalId = await associationEvidence(fixture.store, "https://vpm-evidence.example/index.json", [
        "https://github.com/Fixture/Tool"
      ]);
      await associationEvidence(
        fixture.store,
        "https://api.github.com/repos/Fixture/Tool",
        ["https://github.com/Fixture/Tool"],
        "github"
      );
      const result = {
        ...fixture.result,
        outcome: {
          kind: "changed",
          observation: { ...fixture.observation, outboundLinks: ["https://github.com/FIXTURE/TOOL"] }
        }
      };
      expect((await fixture.post(result)).status).toBe(200);
      const sources = await fixture.store.getListingSourcesForCanonical(canonicalId);
      expect(sources.some((s) => s.platform === "booth" && s.reviewState === "provisional")).toBe(true);
      expect(
        fixture.sqlite
          .query("SELECT review_state FROM listing_sources WHERE canonical_id=? AND source_key LIKE 'github:%'")
          .get(canonicalId)
      ).toEqual({ review_state: "provisional" });
    } finally {
      fixture.sqlite.close();
    }
  });

  it("serializes discovery lead identities and preserves case-distinct targets on exact replay", async () => {
    const fixture = await metadataFixture("vpm", "https://directory.example/catalog", "discovery");
    try {
      const result = {
        ...fixture.result,
        outcome: {
          kind: "discovery",
          leads: [
            { kind: "publisher_site", url: "https://PUBLISHER.EXAMPLE:443/Tools/Widget" },
            { kind: "publisher_site", url: "https://publisher.example/Tools/Widget" },
            { kind: "publisher_site", url: "https://publisher.example/tools/widget" }
          ]
        }
      };
      expect((await fixture.post(result)).status).toBe(200);
      const leads = await fixture.store.listLeadsPage("pending_review", 10, null);
      expect(leads.leads.map((lead) => lead.target_url).sort()).toEqual([
        "https://publisher.example/Tools/Widget",
        "https://publisher.example/tools/widget"
      ]);
      expect(leads.leads.every((lead) => lead.target_host === "publisher.example")).toBe(true);
      expect(fixture.sqlite.query("SELECT * FROM source_items").all()).toEqual([]);
      const settled = fixture.snapshot();
      expect(ResultResponseSchema.parse(await (await fixture.post(result)).json()).duplicate).toBe(true);
      expect(fixture.snapshot()).toEqual(settled);
    } finally {
      fixture.sqlite.close();
    }
  });

  it.each([
    ["booth", "https://booth.pm/ja/items/12345"],
    ["gumroad", "https://creator.gumroad.com/l/tool"],
    ["jinxxy", "https://jinxxy.com/creator/tool"],
    ["itch", "https://creator.itch.io/tool"],
    ["shopify", "https://merchant.example/products/tool"],
    ["sellfy", "https://sellfy.com/p/tool/"],
    ["custom_domain", "https://creator.example/products/tool"]
  ] as const)("binds %s metadata to its assigned item before durable writes", async (platform, target) => {
    const fixture = await metadataFixture(platform, target);
    try {
      const victimId = "com.fixture.unrelated";
      await fixture.store.upsertCanonicalPackage({
        canonicalId: victimId,
        umbrella: "tools",
        category: "tool",
        lifecycle: "active",
        displayName: "Unrelated original"
      });
      const before = fixture.snapshot();
      const targetUrl = new URL(target);
      const invalid = [
        { sourceItemKey: victimId },
        { sourceItemKey: `${targetUrl.host}/another-product` },
        { title: " \t\n " },
        ...[
          "https://unrelated.example/product",
          `${target}another-product`,
          `${target}?edition=other`,
          `${target}#unverified`,
          `https://user:password@${targetUrl.host}${targetUrl.pathname}`,
          `https://${targetUrl.hostname}:444${targetUrl.pathname}`
        ].map((storefrontUrl) => ({ storefrontUrl }))
      ];
      for (const patch of invalid) {
        const response = await fixture.post({
          ...fixture.result,
          outcome: { kind: "changed", observation: { ...fixture.observation, ...patch } }
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ schemaVersion: 1, code: "conflict" });
        expect(fixture.snapshot()).toEqual(before);
      }
      const badItem = {
        ...fixture.result,
        outcome: {
          kind: "changed",
          observation: { ...fixture.observation, storefrontUrl: "https://unrelated.example/product" }
        }
      };
      const batch = await fixture.post(
        {
          schemaVersion: 1,
          nodeId: fixture.result.nodeId,
          results: [
            {
              jobId: badItem.jobId,
              leaseId: badItem.leaseId,
              idempotencyKey: badItem.idempotencyKey,
              outcome: badItem.outcome
            },
            {
              jobId: badItem.jobId,
              leaseId: badItem.leaseId,
              idempotencyKey: "metadata-forged-release",
              outcome: {
                kind: "changed",
                observation: { ...fixture.observation, release: { version: "1.0.0", dependencyRanges: {} } }
              }
            }
          ]
        },
        "/v1/node/jobs/results"
      );
      expect(batch.status).toBe(200);
      const receipts = BatchResultResponseSchema.parse(await batch.json()).receipts;
      expect(receipts).toHaveLength(2);
      for (const receipt of receipts) expect(receipt).toMatchObject({ status: "rejected", terminal: false, code: "conflict" });
      expect(fixture.snapshot()).toEqual(before);

      const valid = {
        ...fixture.result,
        outcome: {
          kind: "changed",
          observation: {
            ...fixture.observation,
            storefrontUrl: `${target}?utm_source=fixture`,
            price: 0,
            currency: "USD",
            availability: "available"
          }
        }
      };
      const accepted = await fixture.post(valid);
      expect(accepted.status).toBe(200);
      expect(ResultResponseSchema.parse(await accepted.json())).toMatchObject({ status: "accepted", duplicate: false });
      const sources = await fixture.store.getListingSourcesForCanonical(fixture.observation.sourceItemKey);
      expect(sources).toHaveLength(1);
      expect(sources[0]?.storefrontUrl).toBe(target);
      expect((await fixture.store.getCanonicalPackage(victimId))?.displayName).toBe("Unrelated original");
      const settled = fixture.snapshot();
      const replay = await fixture.post(valid);
      expect(ResultResponseSchema.parse(await replay.json()).duplicate).toBe(true);
      expect(fixture.snapshot()).toEqual(settled);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("rejects malformed HTTP metadata without poisoning a live job or its public projection", async () => {
    const fixture = await metadataFixture("booth", "https://booth.pm/ja/items/55555");
    try {
      const before = fixture.snapshot();
      for (const patch of [
        { title: "x".repeat(501) },
        { summary: "x".repeat(1025) },
        { platformTags: ["x".repeat(101)] },
        { outboundLinks: ["javascript:alert(1)"] },
        { outboundLinks: ["http://unrelated.example/product"] },
        { price: "free" },
        { originUpdatedAt: "not-a-date" },
        { unrecognized: true }
      ]) {
        const response = await fixture.post({
          ...fixture.result,
          outcome: { kind: "changed", observation: { ...fixture.observation, ...patch } }
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ schemaVersion: 1, code: "invalid_payload" });
        expect(fixture.snapshot()).toEqual(before);
      }
      const corrected = await fixture.post(fixture.result);
      expect(corrected.status).toBe(200);
      expect(ResultResponseSchema.parse(await corrected.json()).status).toBe("accepted");
      const page = await fixture.store.listCanonicalPackagesPage(100, null);
      expect(page.packages[0]?.canonicalId).toBe(fixture.observation.sourceItemKey);
      expect(page.packages[0]?.sources[0]?.storefrontUrl).toBe("https://booth.pm/ja/items/55555");
    } finally {
      fixture.sqlite.close();
    }
  });

  it.each([
    ["vpm", "https://packages.example/index.json"],
    ["github", "https://api.github.com/repos/fixture/tool"]
  ] as const)("does not let %s metadata manufacture storefront authority", async (platform, target) => {
    const fixture = await metadataFixture(platform, target);
    try {
      const before = fixture.snapshot();
      for (const patch of [
        { price: 0 },
        { currency: "USD" },
        { availability: "available" },
        { storefrontUrl: "https://unrelated.example/product" }
      ]) {
        const response = await fixture.post({
          ...fixture.result,
          outcome: { kind: "changed", observation: { ...fixture.observation, ...patch } }
        });
        expect(response.status).toBe(409);
        expect(fixture.snapshot()).toEqual(before);
      }
      expect((await fixture.post(fixture.result)).status).toBe(200);
      expect(fixture.sqlite.query("SELECT * FROM listing_sources WHERE platform NOT IN ('vpm','github')").all()).toEqual([]);
    } finally {
      fixture.sqlite.close();
    }
  });

  async function claimRaceFixture(targets: string[]) {
    const sqlite = new Database(":memory:");
    const db = createMockD1Database(sqlite);
    let now = Date.parse("2026-10-03T00:00:00.000Z");
    const store = new Coordinator(db, () => now);
    await store.initSchema({ autoSeed: false });
    for (const origin of new Set(targets.map((target) => new URL(target).origin))) {
      await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "exact",
          hostPattern: new URL(origin).hostname.toLowerCase(),
          pathScope: "/",
          queryMode: "none",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: "2026-10-04T00:00:00.000Z",
          reviewReference: "OFFLINE-RACE-FIXTURE",
          reason: "Hermetic claim concurrency fixture",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "fixture-operator"
      );
      await store.recordRobotsSnapshot(origin, 200, "User-agent: *\nAllow: /");
    }
    for (const target of targets) {
      await store.seedJob(target, "vpm", { minDelayMs: 1000, purpose: "metadata" });
    }
    const principals = await Promise.all(
      ["race-node-a", "race-node-b"].map(async (nodeId) => {
        const { token } = await store.createNodeCredential(nodeId, ["vpm"]);
        return (await store.authenticate(nodeId, token))!;
      })
    );
    const claimBoth = () =>
      Promise.all(
        principals.map((principal) =>
          store.claim({ schemaVersion: 1, nodeId: principal.nodeId, capabilities: ["vpm"] }, principal)
        )
      );
    return { db, sqlite, store, claimBoth, advance: (milliseconds: number) => { now += milliseconds; } };
  }

  it("preserves earlier bot refusals and replaces both matchers with the snapshot", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      for (const bot of ["VRCPDiscoveryBot", "VRCDiscoveryBot"]) {
        await fixture.store.recordRobotsSnapshot(
          "https://race.example",
          200,
          `User-agent: *\nAllow: /\nUser-agent: ${bot}\nDisallow: /index.json`
        );
        expect((await fixture.claimBoth()).every((result) => result.status === "empty")).toBe(true);
      }
      await fixture.store.recordRobotsSnapshot(
        "https://race.example",
        200,
        "User-agent: VRCPDiscoveryBot\nAllow: /\nUser-agent: VRCDiscoveryBot\nAllow: /"
      );
      expect((await fixture.claimBoth()).filter((result) => result.status === "leased")).toHaveLength(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("reserves robots refresh atomically and preserves pacing across release", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const origin = "https://race.example";
      expect(await fixture.store.reserveRobotsRefresh(origin)).toBeNull();
      fixture.sqlite.run(
        "UPDATE origin_state SET robots_snapshot_id=NULL, robots_status_code=NULL, robots_body=NULL, robots_fetched_at=NULL, robots_expires_at=NULL"
      );
      const reservations = await Promise.all([
        fixture.store.reserveRobotsRefresh(origin),
        fixture.store.reserveRobotsRefresh(origin)
      ]);
      expect(reservations.filter(Boolean)).toHaveLength(1);
      const leaseId = reservations.find(Boolean)!;
      expect(await fixture.store.releaseRobotsRefresh(origin, "wrong-lease")).toBe(false);
      await fixture.store.recordRobotsSnapshot(origin, 200, "User-agent: *\nAllow: /");
      fixture.advance(1000);
      expect((await fixture.claimBoth()).every((result) => result.status === "empty")).toBe(true);
      expect(await fixture.store.completeRobotsRefresh(origin, leaseId, 200, "User-agent: *\nAllow: /")).toBe(true);
      expect(await fixture.store.completeRobotsRefresh(origin, leaseId, 404)).toBe(false);
      expect((await fixture.claimBoth()).filter((result) => result.status === "leased")).toHaveLength(1);
      fixture.sqlite.run(
        "UPDATE origin_state SET robots_snapshot_id=NULL, robots_status_code=NULL, robots_body=NULL, robots_fetched_at=NULL, robots_expires_at=NULL"
      );
      expect(await fixture.store.reserveRobotsRefresh(origin)).toBeNull();
    } finally {
      fixture.sqlite.close();
    }
  });

  it("completeRobotsRefresh statement-order regression clears crawl_jobs.robots_deferred_until BEFORE clearing refresh_lease_id", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const origin = "https://race.example";
      fixture.sqlite.run(
        "UPDATE origin_state SET robots_snapshot_id=NULL, robots_status_code=NULL, robots_body=NULL, robots_fetched_at=NULL, robots_expires_at=NULL"
      );
      const leaseId = (await fixture.store.reserveRobotsRefresh(origin))!;
      expect(leaseId).toBeTruthy();

      // Mark the job as robots-deferred while refresh lease is active and next_fetch_at is due at refresh time
      fixture.sqlite.run(
        "UPDATE crawl_jobs SET robots_deferred_until='2099-01-01T00:00:00.000Z', next_fetch_at='2026-10-03T00:00:00.500Z' WHERE origin=?",
        [origin]
      );

      fixture.advance(1000);
      const completed = await fixture.store.completeRobotsRefresh(origin, leaseId, 200, "User-agent: *\nAllow: /");
      expect(completed).toBe(true);

      const jobRow = fixture.sqlite
        .query("SELECT robots_deferred_until, next_fetch_at FROM crawl_jobs WHERE origin=?")
        .get(origin) as { robots_deferred_until: string | null; next_fetch_at: string };
      expect(jobRow.robots_deferred_until).toBeNull();
      expect(jobRow.next_fetch_at).toBe("2026-10-03T00:00:01.000Z");

      const originRow = fixture.sqlite
        .query("SELECT refresh_lease_id, refresh_lease_expires_at, robots_snapshot_id FROM origin_state WHERE origin=?")
        .get(origin) as {
        refresh_lease_id: string | null;
        refresh_lease_expires_at: string | null;
        robots_snapshot_id: string | null;
      };
      expect(originRow.refresh_lease_id).toBeNull();
      expect(originRow.refresh_lease_expires_at).toBeNull();
      expect(originRow.robots_snapshot_id).not.toBeNull();

      // Immediate claim succeeds without lingering robots deferral
      const claims = await fixture.claimBoth();
      expect(claims.filter((c) => c.status === "leased")).toHaveLength(1);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("rejects replaced, expired and unauthorized robots completions", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const origin = "https://race.example";
      fixture.sqlite.run(
        "UPDATE origin_state SET robots_snapshot_id=NULL, robots_status_code=NULL, robots_body=NULL, robots_fetched_at=NULL, robots_expires_at=NULL"
      );
      const oldLease = (await fixture.store.reserveRobotsRefresh(origin))!;
      fixture.advance(45_000);
      expect(await fixture.store.completeRobotsRefresh(origin, oldLease, 404)).toBe(false);
      const replacement = (await fixture.store.reserveRobotsRefresh(origin))!;
      expect(replacement).not.toBe(oldLease);
      expect(await fixture.store.releaseRobotsRefresh(origin, oldLease)).toBe(false);
      expect(await fixture.store.completeRobotsRefresh(origin, oldLease, 404)).toBe(false);
      fixture.sqlite.run("UPDATE steering_profiles SET disabled_at='2026-10-03T00:00:45.000Z'");
      expect(await fixture.store.completeRobotsRefresh(origin, replacement, 404)).toBe(false);
      expect(
        fixture.sqlite.query("SELECT COUNT(*) AS count FROM origin_state WHERE robots_snapshot_id IS NOT NULL").get()
      ).toEqual({ count: 0 });
      expect(await fixture.store.releaseRobotsRefresh(origin, replacement)).toBe(true);
      fixture.advance(1000);
      expect(await fixture.store.reserveRobotsRefresh(origin)).toBeNull();
    } finally {
      fixture.sqlite.close();
    }
  });

  it("checks scoped source authority inside the refresh reservation write", async () => {
    for (const mutation of [
      "UPDATE steering_profiles SET disabled_at='2026-10-03T00:00:00.000Z'",
      "UPDATE steering_profiles SET path_scope='/unrelated/'",
      "INSERT INTO suppressed_targets VALUES ('https://race.example/index.json','url','Fixture','2026-10-03T00:00:00.000Z')"
    ]) {
      const fixture = await claimRaceFixture(["https://race.example/index.json"]);
      try {
        fixture.sqlite.run(
          "UPDATE origin_state SET robots_snapshot_id=NULL, robots_status_code=NULL, robots_body=NULL, robots_fetched_at=NULL, robots_expires_at=NULL"
        );
        const before = fixture.sqlite.query("SELECT * FROM origin_state").get();
        fixture.sqlite.run(mutation);
        expect(await fixture.store.reserveRobotsRefresh("https://race.example")).toBeNull();
        expect(fixture.sqlite.query("SELECT * FROM origin_state").get()).toEqual(before);
      } finally {
        fixture.sqlite.close();
      }
    }
  });

  it("revokes node credentials with atomic audit and rejects cached lease authority", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const { token } = await fixture.store.createNodeCredential("race-node-a", ["vpm"]);
      const principal = (await fixture.store.authenticate("race-node-a", token))!;
      const claimed = await fixture.store.claim({ schemaVersion: 1, nodeId: principal.nodeId, capabilities: ["vpm"] }, principal);
      if (claimed.status !== "leased") throw new Error("Expected lease");
      const origin = fixture.sqlite.query("SELECT * FROM origin_state").get();
      const client = new VRCPackageClient({
        baseUrl: "https://worker.example",
        operatorToken: "a".repeat(64),
        fetch: Object.assign(
          async (input: RequestInfo | URL, init?: RequestInit) =>
            workerEntry.fetch(new Request(input, init), { VRCP_D1: fixture.db, OPERATOR_TOKEN: "a".repeat(64) }),
          { preconnect() {} }
        )
      });
      const revokePath = `https://worker.example/v1/operator/nodes/${principal.nodeId}/revoke`;
      for (const [payload, authorized, status] of [
        [{ schemaVersion: 1, reason: "Fixture" }, false, 401],
        [{ schemaVersion: 2, reason: "Fixture" }, true, 400],
        [{ schemaVersion: 1, reason: " " }, true, 400],
        [{ schemaVersion: 1, reason: "Fixture", extra: true }, true, 400]
      ] as const) {
        const result = await workerEntry.fetch(
          new Request(revokePath, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(authorized ? { authorization: `Bearer ${"a".repeat(64)}` } : {})
            },
            body: JSON.stringify(payload)
          }),
          { VRCP_D1: fixture.db, OPERATOR_TOKEN: "a".repeat(64) }
        );
        expect(result.status).toBe(status);
      }
      expect(
        fixture.sqlite
          .query("SELECT COUNT(*) AS count FROM operator_audit_log WHERE entity_type='node' AND action='revoke'")
          .get()
      ).toEqual({ count: 0 });

      fixture.sqlite.run(
        "CREATE TRIGGER reject_revoke_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='node' AND NEW.action='revoke' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;"
      );
      await expect(client.operator.nodes.revoke(principal.nodeId, "Fixture revocation")).rejects.toThrow();
      expect(fixture.sqlite.query("SELECT revoked_at FROM nodes WHERE node_id=?").get(principal.nodeId)).toEqual({
        revoked_at: null
      });
      fixture.sqlite.run("DROP TRIGGER reject_revoke_audit");

      const response = await client.operator.nodes.revoke(principal.nodeId, "Fixture revocation");
      expect(response.status).toBe("revoked");
      expect(Object.keys(response).sort()).toEqual(["nodeId", "schemaVersion", "status"]);
      const firstRevocation = fixture.sqlite
        .query("SELECT revoked_at FROM nodes WHERE node_id=?")
        .get(principal.nodeId);
      fixture.advance(1000);
      await client.operator.nodes.revoke(principal.nodeId, "Repeated revocation");
      expect(fixture.sqlite.query("SELECT revoked_at FROM nodes WHERE node_id=?").get(principal.nodeId)).toEqual(
        firstRevocation
      );
      expect(fixture.sqlite.query("SELECT * FROM origin_state").get()).toEqual(origin);
      await expect(
        fixture.store.claim({ schemaVersion: 1, nodeId: principal.nodeId, capabilities: ["vpm"] }, principal)
      ).rejects.toThrow("revoked");
      await expect(
        fixture.store.heartbeat(
          {
            schemaVersion: 1,
            nodeId: principal.nodeId,
            capabilities: ["vpm"],
            state: "fetching",
            activeJobId: claimed.job.jobId,
            activeLeaseId: claimed.job.leaseId
          },
          principal
        )
      ).rejects.toThrow("revoked");
      await expect(
        fixture.store.submit(
          {
            schemaVersion: 1,
            nodeId: principal.nodeId,
            jobId: claimed.job.jobId,
            leaseId: claimed.job.leaseId,
            idempotencyKey: "revoked-result",
            outcome: { kind: "unchanged" }
          },
          principal
        )
      ).rejects.toThrow("revoked");
      expect(
        fixture.sqlite
          .query("SELECT actor,reason FROM operator_audit_log WHERE entity_type='node' AND action='revoke' ORDER BY action_id")
          .all()
      ).toEqual([
        { actor: "operator-api", reason: "Fixture revocation" },
        { actor: "operator-api", reason: "Repeated revocation" }
      ]);
      await expect(client.operator.nodes.revoke("missing-node", "Fixture")).rejects.toThrow("Node not found");
    } finally {
      fixture.sqlite.close();
    }
  });

  it("rejects unauthorized, malformed, unsafe, suppressed (url/origin/domain) and conflicting operator jobs", async () => {
    const sqlite = new Database(":memory:");
    try {
      const db = createMockD1Database(sqlite);
      const store = new Coordinator(db);
      await store.initSchema({ autoSeed: false });
      const token = "a".repeat(64);
      const input = {
        schemaVersion: 1,
        url: "https://seed.example/index.json",
        platform: "vpm",
        purpose: "metadata",
        minDelayMs: 1000,
        reason: "Fixture"
      };
      await store.seedJob(input.url, "vpm");
      sqlite.run("INSERT INTO suppressed_targets VALUES (?,?,?,?)", [
        "https://suppressed-url.example/index.json",
        "url",
        "Fixture",
        new Date().toISOString()
      ]);
      sqlite.run("INSERT INTO suppressed_targets VALUES (?,?,?,?)", [
        "https://suppressed-origin.example",
        "origin",
        "Fixture origin block",
        new Date().toISOString()
      ]);
      sqlite.run("INSERT INTO suppressed_targets VALUES (?,?,?,?)", [
        "suppressed-domain.example",
        "domain",
        "Fixture domain block",
        new Date().toISOString()
      ]);

      const cases = [
        [input, "wrong", 401],
        [{ ...input, schemaVersion: 2 }, token, 400],
        [{ ...input, steeringProfileId: "implicit-approval" }, token, 400],
        [{ ...input, reason: " " }, token, 400],
        [{ ...input, minDelayMs: -1 }, token, 400],
        [{ ...input, url: "http://seed.example/index.json" }, token, 400],
        [{ ...input, url: "https://localhost/index.json" }, token, 409],
        [{ ...input, url: "https://127.0.0.1/index.json" }, token, 409],
        [{ ...input, url: "https://user:password@seed.example/index.json" }, token, 409],
        [{ ...input, url: "https://suppressed-url.example/index.json" }, token, 409],
        [{ ...input, url: "https://suppressed-origin.example/any.json" }, token, 409],
        [{ ...input, url: "https://sub.suppressed-domain.example/any.json" }, token, 409],
        [{ ...input, platform: "curated", minDelayMs: 50_000 }, token, 400],
        [{ ...input, platform: "custom_domain", minDelayMs: 50_000 }, token, 409],
        [{ ...input, purpose: "discovery", minDelayMs: 50_000 }, token, 409]
      ] as const;
      const before = sqlite.query("SELECT * FROM crawl_jobs").all();
      for (const [body, bearer, status] of cases) {
        const response = await workerEntry.fetch(
          new Request("https://worker.example/v1/operator/jobs", {
            method: "POST",
            headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
            body: JSON.stringify(body)
          }),
          { VRCP_D1: db, OPERATOR_TOKEN: token }
        );
        expect(response.status).toBe(status);
        expect(
          sqlite.query("SELECT COUNT(*) AS count FROM operator_audit_log WHERE entity_type='job'").get()
        ).toEqual({ count: 0 });
      }
      expect(sqlite.query("SELECT * FROM crawl_jobs").all()).toEqual(before);
      expect(sqlite.query("SELECT min_delay_ms FROM origin_state").get()).toEqual({ min_delay_ms: 1000 });
    } finally {
      sqlite.close();
    }
  });

  it("queues and audits operator jobs through the SDK without granting steering access", async () => {
    const sqlite = new Database(":memory:");
    try {
      const db = createMockD1Database(sqlite);
      const store = new Coordinator(db);
      await store.initSchema({ autoSeed: false });
      const env: Env = { VRCP_D1: db, OPERATOR_TOKEN: "a".repeat(64) };
      const client = new VRCPackageClient({
        baseUrl: "https://worker.example",
        operatorToken: env.OPERATOR_TOKEN,
        fetch: Object.assign(
          async (input: RequestInfo | URL, init?: RequestInit) => workerEntry.fetch(new Request(input, init), env),
          { preconnect() {} }
        )
      });
      const input = {
        schemaVersion: 1 as const,
        url: "https://seed.example/index.json",
        platform: "vpm" as const,
        purpose: "metadata" as const,
        minDelayMs: 1000,
        reason: "Offline operator candidate"
      };
      const first = await client.operator.jobs.enqueue(input);
      const second = await client.operator.jobs.enqueue(input);
      expect(first.jobId).toBe(second.jobId);
      expect(sqlite.query("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 1 });
      expect(
        sqlite
          .query(
            "SELECT actor,reason,entity_id FROM operator_audit_log WHERE entity_type='job' AND action='seed' ORDER BY action_id"
          )
          .all()
      ).toEqual([
        { actor: "operator-api", reason: input.reason, entity_id: first.jobId },
        { actor: "operator-api", reason: input.reason, entity_id: first.jobId }
      ]);
      expect(sqlite.query("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({ count: 0 });
      expect(
        sqlite.query("SELECT COUNT(*) AS count FROM origin_state WHERE robots_snapshot_id IS NOT NULL").get()
      ).toEqual({ count: 0 });

      const { token } = await store.createNodeCredential("enqueue-test", ["vpm"]);
      const principal = (await store.authenticate("enqueue-test", token))!;
      expect((await store.claim({ schemaVersion: 1, nodeId: principal.nodeId, capabilities: ["vpm"] }, principal)).status).toBe(
        "empty"
      );

      const rawToken = "raw-token-without-capability-prefix-that-should-be-rejected";
      const rawHash = await sha256Hex(rawToken);
      sqlite.run("INSERT INTO nodes(node_id, token_hash, capabilities_json) VALUES (?, ?, ?)", [
        "raw-node",
        rawHash,
        JSON.stringify(["vpm"])
      ]);
      expect(await store.authenticate("raw-node", rawToken)).toBeNull();

      sqlite.run(
        "CREATE TRIGGER reject_seed_audit BEFORE INSERT ON operator_audit_log WHEN NEW.entity_type='job' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;"
      );
      await expect(client.operator.jobs.enqueue({ ...input, url: "https://other.example/index.json" })).rejects.toThrow();
      expect(sqlite.query("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 1 });
      expect(sqlite.query("SELECT COUNT(*) AS count FROM origin_state").get()).toEqual({ count: 1 });
      await expect(client.operator.jobs.enqueue({ ...input, minDelayMs: 50_000 })).rejects.toThrow();
      expect(sqlite.query("SELECT min_delay_ms FROM origin_state").get()).toEqual({ min_delay_ms: 1000 });
    } finally {
      sqlite.close();
    }
  });

  it("rejects conflicting seed contracts without changing an existing job or origin pacing", async () => {
    const sqlite = new Database(":memory:");
    try {
      const store = new Coordinator(createMockD1Database(sqlite));
      await store.initSchema({ autoSeed: false });
      const url = "https://seed.example/index.json";
      const id = await store.seedJob(url, "vpm", { minDelayMs: 1000, purpose: "metadata" });
      const beforeJob = sqlite.query("SELECT * FROM crawl_jobs").get();
      const beforeOrigin = sqlite.query("SELECT * FROM origin_state").get();
      await expect(store.seedJob(url, "custom_domain", { minDelayMs: 50_000, purpose: "metadata" })).rejects.toThrow(
        "different reviewed platform"
      );
      await expect(store.seedJob(url, "vpm", { minDelayMs: 50_000, purpose: "discovery" })).rejects.toThrow(
        "different reviewed purpose"
      );
      expect(sqlite.query("SELECT * FROM crawl_jobs").get()).toEqual(beforeJob);
      expect(sqlite.query("SELECT * FROM origin_state").get()).toEqual(beforeOrigin);
      expect(await store.seedJob(url, "vpm", { minDelayMs: 2000, purpose: "metadata" })).toBe(id);
      expect(sqlite.query("SELECT min_delay_ms FROM origin_state").get()).toEqual({ min_delay_ms: 2000 });
    } finally {
      sqlite.close();
    }
  });

  it("POST /v1/operator/init enforces autoSeed: false (rejects true) and never seeds jobs or profiles", async () => {
    const sqlite = new Database(":memory:");
    try {
      const env: Env = { VRCP_D1: createMockD1Database(sqlite), OPERATOR_TOKEN: "a".repeat(64) };

      const rejectTrue = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/init", {
          method: "POST",
          headers: { authorization: `Bearer ${env.OPERATOR_TOKEN}`, "content-type": "application/json" },
          body: JSON.stringify({ schemaVersion: 1, autoSeed: true })
        }),
        env
      );
      expect(rejectTrue.status).toBe(400);

      for (const body of [{ schemaVersion: 1 }, { schemaVersion: 1, autoSeed: false }]) {
        const res = await workerEntry.fetch(
          new Request("https://worker.example/v1/operator/init", {
            method: "POST",
            headers: { authorization: `Bearer ${env.OPERATOR_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify(body)
          }),
          env
        );
        expect(res.status).toBe(200);
        const parsed = InitializeCoordinatorResponseSchema.parse(await res.json());
        expect(parsed).toEqual({
          schemaVersion: 1,
          status: "ok",
          message: "Schema initialized",
          autoSeed: false
        });
      }

      expect(sqlite.query("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS count FROM steering_profiles").get()).toEqual({ count: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS count FROM origin_state").get()).toEqual({ count: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("rejects invalid initialization payloads before any database operation", async () => {
    const token = "a".repeat(64);
    const cases = [
      ["{", "application/json", 400],
      ["{}", "application/json", 400],
      [JSON.stringify({ schemaVersion: 2 }), "application/json", 400],
      [JSON.stringify({ schemaVersion: 1, autoSeed: true }), "application/json", 400],
      [JSON.stringify({ schemaVersion: 1, autoSeed: "false" }), "application/json", 400],
      [JSON.stringify({ schemaVersion: 1, approved: true }), "application/json", 400],
      ["null", "application/json", 400],
      ["", "application/json", 400],
      [JSON.stringify({ schemaVersion: 1 }), "text/plain", 415],
      [JSON.stringify({ schemaVersion: 1, padding: "x".repeat(256 * 1024) }), "application/json", 413]
    ] as const;
    for (const [body, contentType, expectedStatus] of cases) {
      let operations = 0;
      const db: Env["VRCP_D1"] = {
        prepare() {
          operations++;
          throw new Error("Unexpected database operation");
        },
        async batch() {
          operations++;
          throw new Error("Unexpected database operation");
        },
        async exec() {
          operations++;
          throw new Error("Unexpected database operation");
        },
        withSession() {
          operations++;
          throw new Error("Unexpected database operation");
        },
        async dump() {
          operations++;
          throw new Error("Unexpected database operation");
        }
      };
      const response = await workerEntry.fetch(
        new Request("https://worker.example/v1/operator/init", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": contentType },
          body
        }),
        { VRCP_D1: db, OPERATOR_TOKEN: token }
      );
      expect(response.status).toBe(expectedStatus);
      expect(operations).toBe(0);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json() as { schemaVersion: number }).schemaVersion).toBe(1);
    }
  });

  it("authenticates initialization before reading its body", async () => {
    let reads = 0;
    const request = new Request("https://worker.example/v1/operator/init", { method: "POST" });
    Object.defineProperty(request, "body", {
      get() {
        reads++;
        throw new Error("Body read before auth");
      }
    });
    request.json = async () => {
      reads++;
      throw new Error("Body read before auth");
    };
    const response = await workerEntry.fetch(request, {
      VRCP_D1: createMockD1Database(),
      OPERATOR_TOKEN: "a".repeat(64)
    });
    expect(response.status).toBe(401);
    expect(reads).toBe(0);
  });

  it("enforces exact 17-table / 0-view / 39-index V0 schema and idempotent initialization", async () => {
    const sqlite = new Database(":memory:");
    try {
      const store = new Coordinator(createMockD1Database(sqlite));
      await store.initSchema({ autoSeed: false });
      await store.initSchema({ autoSeed: false });

      const tables = (
        sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name").all() as {
          name: string;
        }[]
      ).map((r) => r.name);
      expect(tables).toEqual(EXPECTED_V0_TABLES);

      const views = sqlite.query("SELECT name FROM sqlite_master WHERE type='view'").all();
      expect(views).toEqual([]);

      const indexes = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name")
        .all() as { name: string }[];
      expect(indexes).toHaveLength(39);

      const pkgCols = sqlite.query("PRAGMA table_info(canonical_packages)").all() as { name: string }[];
      for (const col of [
        "tombstone_reason",
        "verification_status",
        "verified_by_app_id",
        "attributes_json",
        "published_at",
        "timestamp_confidence",
        "content_rating"
      ]) {
        expect(pkgCols.some((c) => c.name === col)).toBe(true);
      }
    } finally {
      sqlite.close();
    }
  });

  it("buildPreviewStarterSteeringProfiles defines 16 non-overlapping starter grants across all 8 concrete V0 platforms", () => {
    const profiles = buildPreviewStarterSteeringProfiles();
    expect(profiles).toHaveLength(PREVIEW_STARTER_PROFILE_COUNT);
    expect(profiles).toHaveLength(16);
    expect(profiles.map((p) => String(p.platform))).not.toContain("curated");
    expect(new Set(profiles.map((p) => p.platform))).toEqual(
      new Set(["vpm", "github", "booth", "gumroad", "jinxxy", "itch", "shopify", "sellfy"])
    );
    expect(profiles.some((p) => p.platform === "vpm" && p.hostMatchMode === "any_vpm_https")).toBe(true);
    for (const profile of profiles) {
      const serialized = JSON.stringify(profile);
      expect(serialized).not.toContain("template-");
      expect(serialized).not.toContain("/sample-");
    }
  });

  it("4-lane priority claim orders lanes 1..4 strictly and skips busy/deferred origins fairly", async () => {
    const sqlite = new Database(":memory:");
    let now = Date.parse("2026-11-05T00:00:00.000Z");
    const store = new Coordinator(createMockD1Database(sqlite), () => now);
    try {
      await store.initSchema({ autoSeed: false });
      await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "any_vpm_https",
          hostPattern: "*",
          pathScope: "/",
          queryMode: "none",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: "2099-01-01T00:00:00.000Z",
          reviewReference: "LANE-TEST",
          reason: "Allow priority lane testing",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "operator"
      );

      for (const origin of ["https://busy.example", "https://free.example", "https://lane4.example"]) {
        await store.recordRobotsSnapshot(origin, 200, "User-agent: *\nAllow: /");
      }

      // Busy origin has 2 Lane-1 jobs; free origin has 1 Lane-2 job; lane4 origin has 1 Lane-4 job
      const lane1A = await store.seedJob("https://busy.example/a.json", "vpm", { minDelayMs: 1000, priorityLane: 1 });
      now += 10;
      const lane1B = await store.seedJob("https://busy.example/b.json", "vpm", { minDelayMs: 1000, priorityLane: 1 });
      now += 10;
      const lane2Job = await store.seedJob("https://free.example/c.json", "vpm", { minDelayMs: 1000, priorityLane: 2 });
      now += 10;
      const lane4Job = await store.seedJob("https://lane4.example/d.json", "vpm", { minDelayMs: 1000, priorityLane: 4 });

      const { token } = await store.createNodeCredential("priority-node", ["vpm"]);
      const principal = (await store.authenticate("priority-node", token))!;

      const first = await store.claim(ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: "priority-node", capabilities: ["vpm"] }), principal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") return;
      expect(first.job.jobId).toBe(lane1A);
      expect(first.job.priorityLane).toBe(1);

      // Next claim: busy.example/b.json is blocked by busy.example active_job_id, so fair skipping picks lane2Job!
      const second = await store.claim(ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: "priority-node", capabilities: ["vpm"] }), principal);
      expect(second.status).toBe("leased");
      if (second.status !== "leased") return;
      expect(second.job.jobId).toBe(lane2Job);
      expect(second.job.priorityLane).toBe(2);

      // Third claim picks lane4Job (since lane1B origin is still leased)
      const third = await store.claim(ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: "priority-node", capabilities: ["vpm"] }), principal);
      expect(third.status).toBe("leased");
      if (third.status !== "leased") return;
      expect(third.job.jobId).toBe(lane4Job);
      expect(third.job.priorityLane).toBe(4);

      // After completing first lease and advancing pacing window, lane1B can now be claimed
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "priority-node",
          jobId: lane1A,
          leaseId: first.job.leaseId,
          idempotencyKey: "complete-lane1a",
          outcome: { kind: "unchanged" }
        },
        principal
      );
      now += 2000;
      const fourth = await store.claim(ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: "priority-node", capabilities: ["vpm"] }), principal);
      expect(fourth.status).toBe("leased");
      if (fourth.status === "leased") {
        expect(fourth.job.jobId).toBe(lane1B);
      }
    } finally {
      sqlite.close();
    }
  });

  it("HTTP 304 unchanged fast-path updates only crawl_jobs, origin_state, and job_results", async () => {
    const sqlite = new Database(":memory:");
    const store = new Coordinator(createMockD1Database(sqlite));
    try {
      await store.initSchema({ autoSeed: false });
      await store.createSteeringProfile(
        {
          schemaVersion: 1,
          platform: "vpm",
          hostMatchMode: "exact",
          hostPattern: "vpm.example.com",
          pathScope: "/index.json",
          queryMode: "none",
          method: "GET",
          purpose: "metadata",
          minDelayMs: 1000,
          expiresAt: "2099-01-01T00:00:00.000Z",
          reviewReference: "304-FAST-PATH",
          reason: "Test unchanged fast path",
          retainClasses: ["normalized_facts"],
          publishClasses: ["normalized_facts"]
        },
        "operator"
      );
      await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");
      await store.seedJob("https://vpm.example.com/index.json", "vpm", { minDelayMs: 1000, purpose: "metadata" });

      const { token } = await store.createNodeCredential("node-304", ["vpm"]);
      const principal = (await store.authenticate("node-304", token))!;
      const claim = await store.claim({ schemaVersion: 1, nodeId: "node-304", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") return;

      const submitRes = await store.submit(
        {
          schemaVersion: 1,
          nodeId: "node-304",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: "unchanged-304-key",
          outcome: { kind: "unchanged" }
        },
        principal
      );
      expect(submitRes).toMatchObject({ status: "accepted", duplicate: false, sourceVersionCreated: false });

      expect(sqlite.query("SELECT COUNT(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS n FROM canonical_packages").get()).toEqual({ n: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS n FROM listing_sources").get()).toEqual({ n: 0 });
      expect(sqlite.query("SELECT COUNT(*) AS n FROM job_results").get()).toEqual({ n: 1 });
      const job = sqlite.query("SELECT state, lease_id FROM crawl_jobs WHERE job_id=?").get(claim.job.jobId) as {
        state: string;
        lease_id: string | null;
      };
      expect(job.state).toBe("done");
      expect(job.lease_id).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("reserves one lease when two nodes race for the same job", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const results = await fixture.claimBoth();
      expect(results.filter((result) => result.status === "leased")).toHaveLength(1);
      expect(results.filter((result) => result.status === "empty")).toHaveLength(1);
      const winner = results.find((result) => result.status === "leased")!;
      if (winner.status !== "leased") throw new Error("Expected one race winner");
      const job = fixture.sqlite.query("SELECT lease_id FROM crawl_jobs").get() as { lease_id: string };
      expect(job.lease_id).toBe(winner.job.leaseId);
      const origin = fixture.sqlite.query("SELECT active_job_id FROM origin_state").get() as { active_job_id: string };
      expect(origin.active_job_id).toBe(winner.job.jobId);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("serializes different jobs sharing an origin and permits independent origins", async () => {
    for (const [targets, expectedLeases] of [
      [["https://race.example/a.json", "https://race.example/b.json"], 1],
      [["https://race.example/a.json", "https://other.example/b.json"], 2]
    ] as const) {
      const fixture = await claimRaceFixture([...targets]);
      try {
        const results = await fixture.claimBoth();
        expect(results.filter((result) => result.status === "leased")).toHaveLength(expectedLeases);
        const leased = fixture.sqlite.query("SELECT job_id FROM crawl_jobs WHERE state='leased'").all();
        expect(leased).toHaveLength(expectedLeases);
      } finally {
        fixture.sqlite.close();
      }
    }
  });

  it("reclaims an expired job with exactly one new lease", async () => {
    const fixture = await claimRaceFixture(["https://race.example/index.json"]);
    try {
      const first = (await fixture.claimBoth()).find((result) => result.status === "leased")!;
      if (first.status !== "leased") throw new Error("Expected initial lease");
      fixture.advance(5 * 60 * 1000 + 1);
      const results = await fixture.claimBoth();
      const winners = results.filter((result) => result.status === "leased");
      expect(winners).toHaveLength(1);
      if (winners[0]?.status !== "leased") throw new Error("Expected reclaimed lease");
      expect(winners[0].job.jobId).toBe(first.job.jobId);
      expect(winners[0].job.leaseId).not.toBe(first.job.leaseId);
    } finally {
      fixture.sqlite.close();
    }
  });

  it("does not reserve from stale steering profile, node credential or robots evidence", async () => {
    for (const mutation of [
      "UPDATE steering_profiles SET disabled_at='2026-10-03T00:00:00.000Z'",
      "UPDATE nodes SET revoked_at='2026-10-03T00:00:00.000Z'",
      "UPDATE origin_state SET robots_snapshot_id='replaced-snapshot',robots_body='User-agent: *\nDisallow: /'",
      "UPDATE origin_state SET min_delay_ms=min_delay_ms+1000",
      "UPDATE origin_state SET refresh_lease_id='refresh-race',refresh_lease_expires_at='2026-10-03T00:05:00.000Z' WHERE origin='https://race.example'"
    ]) {
      const fixture = await claimRaceFixture(["https://race.example/index.json"]);
      try {
        const originalBatch = fixture.db.batch.bind(fixture.db);
        fixture.db.batch = async (statements) => {
          fixture.sqlite.run(mutation);
          return originalBatch(statements);
        };
        expect((await fixture.claimBoth()).filter((result) => result.status === "leased")).toHaveLength(0);
        expect(fixture.sqlite.query("SELECT job_id FROM crawl_jobs WHERE state='leased'").all()).toHaveLength(0);
      } finally {
        fixture.sqlite.close();
      }
    }
  });

  it("Node registration and bearer authentication", async () => {
    const store = new Coordinator(createMockD1Database());
    await store.initSchema({ autoSeed: false });

    const { token, capabilities } = await store.createNodeCredential("node-alpha", ["vpm", "github"]);
    expect(capabilities).toEqual(["vpm", "github"]);
    expect(token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    expect(token.length).toBe(73);

    const principal = await store.authenticate("node-alpha", token);
    expect(principal).not.toBeNull();
    expect(principal?.nodeId).toBe("node-alpha");
    expect(principal?.capabilities).toEqual(["vpm", "github"]);
    expect(typeof principal?.credentialVersion).toBe("string");

    expect(await store.authenticate("node-alpha", "vrcp_" + "0".repeat(64) + "0006")).toBeNull();
    expect(await store.authenticate("node-unknown", token)).toBeNull();
  });

  it("Heartbeat and Worker edge fetch entrypoint routing", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema({ autoSeed: false });

    const operatorToken = "a".repeat(64);
    const env: Env = { VRCP_D1: mockDb, OPERATOR_TOKEN: operatorToken };

    const notFoundRes = await workerEntry.fetch(new Request("https://coordinator.internal/not-a-real-endpoint"), env);
    expect(notFoundRes.status).toBe(404);
    expect(((await notFoundRes.json()) as { error: string }).error).toBe("Not Found");

    const unauthOperatorRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/operator/steering-profiles"),
      env
    );
    expect(unauthOperatorRes.status).toBe(401);

    const authOperatorRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/operator/steering-profiles", {
        headers: { Authorization: `Bearer ${operatorToken}` }
      }),
      env
    );
    expect(authOperatorRes.status).toBe(200);
    const operatorJson = (await authOperatorRes.json()) as { profiles: unknown[] };
    expect(Array.isArray(operatorJson.profiles)).toBe(true);

    // Retired source-profiles route returns 404 even with operator auth
    const retiredRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/operator/source-profiles", {
        headers: { Authorization: `Bearer ${operatorToken}` }
      }),
      env
    );
    expect(retiredRes.status).toBe(404);
  });

  it("supports listing_sources CRUD, auto-delist on gone, cross-source verification, and catalog deltas", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema({ autoSeed: false });

    const { token } = await store.createNodeCredential("node-vpm-verifier", ["vpm", "booth", "custom_domain"]);
    const principal = (await store.authenticate("node-vpm-verifier", token))!;

    await store.createSteeringProfile(
      {
        schemaVersion: 1,
        platform: "vpm",
        hostMatchMode: "exact",
        hostPattern: "vpm.example.com",
        pathScope: "/index.json",
        queryMode: "none",
        method: "GET",
        purpose: "discovery",
        minDelayMs: 1000,
        expiresAt: "2099-01-01T00:00:00.000Z",
        reviewReference: "REV-VPM-01",
        reason: "VPM repo profile",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      },
      "operator-admin"
    );
    await store.createSteeringProfile(
      {
        schemaVersion: 1,
        platform: "custom_domain",
        hostMatchMode: "exact",
        hostPattern: "store.vrcfury.com",
        pathScope: "/tools/",
        queryMode: "none",
        method: "GET",
        purpose: "metadata",
        minDelayMs: 2000,
        expiresAt: "2099-01-01T00:00:00.000Z",
        reviewReference: "REV-CUSTOM-01",
        reason: "Custom domain profile",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      },
      "operator-admin"
    );
    await store.createSteeringProfile(
      {
        schemaVersion: 1,
        platform: "booth",
        hostMatchMode: "exact",
        hostPattern: "booth.pm",
        pathScope: "/ja/items/",
        queryMode: "none",
        method: "GET",
        purpose: "metadata",
        minDelayMs: 1500,
        expiresAt: "2099-01-01T00:00:00.000Z",
        reviewReference: "REV-BOOTH-02",
        reason: "Booth metadata profile",
        retainClasses: ["normalized_facts"],
        publishClasses: ["normalized_facts"]
      },
      "operator-admin"
    );

    await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");
    await store.recordRobotsSnapshot("https://store.vrcfury.com", 200, "User-agent: *\nAllow: /");
    await store.recordRobotsSnapshot("https://booth.pm", 200, "User-agent: *\nAllow: /");

    await store.seedJob("https://vpm.example.com/index.json", "vpm", { minDelayMs: 1000, purpose: "discovery" });
    const claim1 = await store.claim({ schemaVersion: 1, nodeId: "node-vpm-verifier", capabilities: ["vpm"] }, principal);
    if (claim1.status !== "leased") throw new Error("Expected leased status");

    await store.submit(
      {
        schemaVersion: 1,
        nodeId: "node-vpm-verifier",
        jobId: claim1.job.jobId,
        leaseId: claim1.job.leaseId,
        idempotencyKey: "submit-vpm-vrcfury",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.vrcfury.vrcfury",
            title: "VRCFury",
            summary: "",
            author: "VRCFury Contributors",
            outboundLinks: ["https://github.com/vrcfury/vrcfury", "https://store.vrcfury.com/tools/vrcfury"],
            originUpdatedAt: null,
            platformTags: ["tool"]
          }
        }
      },
      principal
    );

    const leadsRes = await store.listLeadsPage("pending_review", 10, null);
    const storefrontLead = leadsRes.leads.find((l) => l.target_url === "https://store.vrcfury.com/tools/vrcfury");
    expect(storefrontLead?.target_host).toBe("store.vrcfury.com");
    expect(storefrontLead?.claimed_package_id).toBe("com.vrcfury.vrcfury");

    await store.approveLead(storefrontLead!.lead_key, 2000, "operator-test", "Verifying VRCFury custom domain");
    const claim2 = await store.claim(
      { schemaVersion: 1, nodeId: "node-vpm-verifier", capabilities: ["custom_domain"] },
      principal
    );
    expect(claim2.status).toBe("leased");
    if (claim2.status !== "leased") throw new Error("Expected leased verification job");

    await store.submit(
      {
        schemaVersion: 1,
        nodeId: "node-vpm-verifier",
        jobId: claim2.job.jobId,
        leaseId: claim2.job.leaseId,
        idempotencyKey: "submit-custom-vrcfury",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "store.vrcfury.com/tools/vrcfury",
            title: "VRCFury Tool Suite",
            summary: "",
            author: "VRCFury",
            outboundLinks: ["https://github.com/vrcfury/vrcfury"],
            originUpdatedAt: null,
            price: 0,
            currency: "USD",
            availability: "available",
            platformTags: ["tool"]
          }
        }
      },
      principal
    );

    const sources = await store.getListingSourcesForCanonical("com.vrcfury.vrcfury");
    expect(sources).toHaveLength(2);
    expect(sources.some((s) => s.platform === "custom_domain" && s.storefrontUrl === "https://store.vrcfury.com/tools/vrcfury")).toBe(
      true
    );

    // Booth item gone -> auto-delists canonical & listing_source
    await store.seedJob("https://booth.pm/ja/items/99999", "booth", { minDelayMs: 1500, purpose: "metadata" });
    const b1 = await store.claim({ schemaVersion: 1, nodeId: "node-vpm-verifier", capabilities: ["booth"] }, principal);
    if (b1.status !== "leased") throw new Error("Expected booth claim 1");
    await store.submit(
      {
        schemaVersion: 1,
        nodeId: "node-vpm-verifier",
        jobId: b1.job.jobId,
        leaseId: b1.job.leaseId,
        idempotencyKey: "booth-create-gone-test",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth.pm/ja/items/99999",
            title: "Temporary Prop",
            summary: "",
            author: "Artist",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 500,
            currency: "JPY",
            availability: "available"
          }
        }
      },
      principal
    );
    expect((await store.getCanonicalPackage("booth.pm/ja/items/99999"))?.lifecycle).toBe("active");

    await mockDb
      .prepare("UPDATE crawl_jobs SET state='pending', next_fetch_at='2020-01-01T00:00:00.000Z' WHERE url=?")
      .bind("https://booth.pm/ja/items/99999")
      .run();
    await mockDb
      .prepare("UPDATE origin_state SET next_allowed_at='2020-01-01T00:00:00.000Z' WHERE origin=?")
      .bind("https://booth.pm")
      .run();
    const b2 = await store.claim({ schemaVersion: 1, nodeId: "node-vpm-verifier", capabilities: ["booth"] }, principal);
    if (b2.status !== "leased") throw new Error("Expected booth claim 2");
    await store.submit(
      {
        schemaVersion: 1,
        nodeId: "node-vpm-verifier",
        jobId: b2.job.jobId,
        leaseId: b2.job.leaseId,
        idempotencyKey: "booth-gone-final",
        outcome: { kind: "gone" }
      },
      principal
    );
    expect((await store.getCanonicalPackage("booth.pm/ja/items/99999"))?.lifecycle).toBe("delisted");
    const goneSources = await store.getListingSourcesForCanonical("booth.pm/ja/items/99999");
    expect(goneSources[0]?.availability).toBe("delisted");
  });

  it("enforces canonical timestamp confidence hierarchy and bulk tag query timestamp ordering", async () => {
    const store = new Coordinator(createMockD1Database());
    await store.initSchema({ autoSeed: false });

    const olderTime = "2021-01-01T00:00:00.000Z";
    await store.upsertCanonicalPackage({
      canonicalId: "com.example.older-tool",
      umbrella: "tools",
      category: "avatar_tool",
      lifecycle: "active",
      displayName: "Older Avatar Tool",
      tags: ["avatar_tool"],
      publishedAt: olderTime,
      timestampConfidence: "confirmed",
      createdAt: "2026-10-01T10:00:00.000Z"
    });

    const newerTime = "2024-06-15T12:00:00.000Z";
    await store.upsertCanonicalPackage({
      canonicalId: "com.example.newer-tool",
      umbrella: "tools",
      category: "avatar_tool",
      lifecycle: "active",
      displayName: "Newer Avatar Tool",
      tags: ["avatar_tool"],
      publishedAt: newerTime,
      timestampConfidence: "confirmed",
      createdAt: "2026-10-01T08:00:00.000Z"
    });

    const observedTime = "2023-03-20T00:00:00.000Z";
    await store.upsertCanonicalPackage({
      canonicalId: "com.example.observed-tool",
      umbrella: "tools",
      category: "avatar_tool",
      lifecycle: "active",
      displayName: "Observed Avatar Tool",
      tags: ["avatar_tool"],
      createdAt: observedTime
    });

    const tagSearch = await store.searchCatalogPackages({
      schemaVersion: 1,
      queryOrigin: "user_authored",
      tags: ["avatar_tool"],
      limit: 10
    });
    expect(tagSearch.items.map((i) => i.canonicalId)).toEqual([
      "com.example.newer-tool",
      "com.example.observed-tool",
      "com.example.older-tool"
    ]);
  });

  it("initializes distinct catalog epochs and handles catalog deltas and operator pagination", async () => {
    const sqlite = new Database(":memory:");
    const store = new Coordinator(createMockD1Database(sqlite));
    try {
      await store.initSchema({ autoSeed: false });
      const epoch = await store.getCatalogEpoch();
      expect(epoch).toMatch(/^epoch-d1-[0-9a-f-]{36}$/);
      const reset = await store.resetCatalogEpoch();
      expect(reset).not.toBe(epoch);

      const env: Env = { VRCP_D1: createMockD1Database(sqlite), OPERATOR_TOKEN: "f".repeat(64) };
      for (let i = 1; i <= 3; i++) {
        const ts = new Date(Date.now() + i * 1000).toISOString();
        await store.upsertCanonicalPackage({
          canonicalId: `pkg-00${i}`,
          umbrella: "tools",
          category: "tooling",
          lifecycle: "active",
          displayName: `Package ${i}`,
          createdAt: ts,
          updatedAt: ts
        });
      }
      const opRes = await workerEntry.fetch(
        new Request("https://coordinator.test/v1/operator/catalog?limit=2", {
          headers: { Authorization: `Bearer ${env.OPERATOR_TOKEN}` }
        }),
        env
      );
      expect(opRes.status).toBe(200);
      const opPage1 = CatalogListResponseSchema.parse(await opRes.json());
      expect(opPage1.packages).toHaveLength(2);
      expect(opPage1.nextCursor).toBeTruthy();
      const opPage2 = await store.listCanonicalPackagesPage(2, decodeCatalogCursor(opPage1.nextCursor!));
      expect(opPage2.packages).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
});
