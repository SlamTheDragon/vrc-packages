import { describe, expect, spyOn, test } from "bun:test";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import type { Coordinator } from "../src/storage/d1/coordinator.ts";
import type { Database } from "bun:sqlite";
import { handlePublicCatalogRequest } from "../src/api/public_handler.ts";
import {
  CATALOG_PROTOCOL_VERSION,
  PublicCatalogListResponseSchema,
  CatalogDeltaResponseSchema,
  decodeCatalogDeltaCursor,
  encodeCatalogDeltaCursor,
  decodeCatalogCursor,
  encodeCatalogCursor,
  VRCPackageClient
} from "vrc-packages-api";
import { PROTOCOL_VERSION } from "vrc-packages-network/node";
import { InMemoryRateLimiter } from "../src/api/rate_limiter.ts";

function publicGet(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET"
  });
}

function seedVpmAndCatalogItem(
  store: Coordinator & { sqlite: Database },
  pkgId: string,
  canonicalId: string,
  displayName: string,
  lifecycle: "active" | "deprecated" | "quarantined" | "delisted" = "active"
): void {
  const sourceKey = `vpm:${pkgId}`;
  const now = new Date(store.now()).toISOString();

  store.sqlite
    .prepare(
      `INSERT INTO source_items (source_key, platform, source_url, latest_digest, latest_version_no, gone_at)
    VALUES (?, 'vpm', ?, 'digest-1', 1, NULL)`
    )
    .run(sourceKey, `https://vpm.example.com/${pkgId}.json`);

  store.sqlite
    .prepare(
      `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
    VALUES (?, 'tools', 'tool', ?, ?, ?, ?, ?)`
    )
    .run(canonicalId, lifecycle, displayName, pkgId, now, now);

  store.sqlite
    .prepare(
      `INSERT INTO identity_links (link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at)
    VALUES (?, ?, ?, 'vpm_id', 1.0, 'accepted', ?)`
    )
    .run(crypto.randomUUID(), sourceKey, canonicalId, now);

  store.sqlite
    .prepare(
      `INSERT INTO package_fronts (front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at)
    VALUES (?, ?, ?, 'vpm', ?, NULL, NULL, 'available', ?)`
    )
    .run(crypto.randomUUID(), canonicalId, sourceKey, `https://vpm.example.com/${pkgId}`, now);
}

describe("Public Consumer Catalog Protocol (/v1/app/index & /v1/app/index/delta)", () => {
  test("storage failures disclose no exception details and cannot be cached", async () => {
    const privateDetail = "private-storage-detail-not-for-http-or-logs";
    const captured: unknown[][] = [];
    const log = spyOn(console, "error").mockImplementation((...args) => {
      captured.push(args);
    });
    const store = await createInitializedD1Coordinator();
    const limiter = new InMemoryRateLimiter();
    try {
      for (const cause of [new Error(privateDetail), privateDetail, { privateDetail }]) {
        store.listCanonicalPackagesPage = () => {
          throw cause;
        };
        store.listCatalogDeltasPage = () => {
          throw cause;
        };
        for (const path of ["/v1/app/index", "/v1/app/index/delta"]) {
          const response = await handlePublicCatalogRequest(publicGet(path), store, limiter);
          expect(response.status).toBe(500);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(response.headers.get("access-control-allow-origin")).toBe("*");
          expect(await response.json()).toEqual({
            schemaVersion: 1,
            code: "internal_error",
            error: "Public catalog query failed"
          });
        }
      }
      expect(captured).toHaveLength(6);
      expect(JSON.stringify(captured)).not.toContain(privateDetail);
      expect(JSON.stringify(captured)).toContain("Public catalog request failed");
    } finally {
      log.mockRestore();
      store.close();
    }
  });

  test("invalid queries and unsupported methods cannot cache an error response", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      for (const path of ["/v1/app/index?limit=0", "/v1/app/index/delta?cursor=invalid!"]) {
        const response = await handlePublicCatalogRequest(publicGet(path), store, new InMemoryRateLimiter());
        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      const response = await handlePublicCatalogRequest(
        new Request("https://coordinator.invalid/v1/app/index", { method: "POST" }),
        store
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      store.close();
    }
  });

  test("SDK public index sends limit 100 and cursor unchanged through the real handler", async () => {
    const store = await createInitializedD1Coordinator();
    const cursor = encodeCatalogCursor({ createdAt: "2026-10-03T00:00:00.000Z", canonicalId: "page-boundary" });
    const listPage = store.listCanonicalPackagesPage.bind(store);
    let calls = 0;
    store.listCanonicalPackagesPage = (limit, decoded) => {
      calls++;
      expect(limit).toBe(100);
      expect(decoded).toEqual(decodeCatalogCursor(cursor));
      return listPage(limit, decoded);
    };
    const client = new VRCPackageClient({
      baseUrl: "https://coordinator.invalid",
      fetch: Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          expect(request.method).toBe("GET");
          expect(request.headers.has("authorization")).toBe(false);
          expect(request.body).toBeNull();
          expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
          expect(url.searchParams.get("limit")).toBe("100");
          expect(url.searchParams.get("cursor")).toBe(cursor);
          return handlePublicCatalogRequest(request, store);
        },
        { preconnect() {} }
      )
    });
    try {
      const params = { limit: 100, cursor };
      expect(PublicCatalogListResponseSchema.parse(await client.index.query(params))).toEqual({
        schemaVersion: 1,
        packages: [],
        nextCursor: null
      });
      expect(calls).toBe(1);
    } finally {
      store.close();
    }
  });

  test("SDK public index preserves the wire receipt and continues to the next catalog page", async () => {
    const store = await createInitializedD1Coordinator();
    const requests: URL[] = [];
    const client = new VRCPackageClient({
      baseUrl: "https://coordinator.invalid",
      fetch: Object.assign(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          requests.push(new URL(request.url));
          expect(request.method).toBe("GET");
          expect(request.headers.has("authorization")).toBe(false);
          return handlePublicCatalogRequest(request, store);
        },
        { preconnect() {} }
      )
    });
    try {
      seedVpmAndCatalogItem(store, "sdk.one", "com.example.sdk1", "SDK Package 1");
      seedVpmAndCatalogItem(store, "sdk.two", "com.example.sdk2", "SDK Package 2");
      seedVpmAndCatalogItem(store, "sdk.three", "com.example.sdk3", "SDK Package 3");
      const first = PublicCatalogListResponseSchema.parse(await client.index.query({ limit: 2 }));
      expect(first.schemaVersion).toBe(1);
      expect(first.packages).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const params = { limit: 2, cursor: first.nextCursor! };
      const second = PublicCatalogListResponseSchema.parse(await client.index.query(params));
      expect(second.schemaVersion).toBe(1);
      expect(second.packages).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(requests).toHaveLength(2);
      expect([...requests[0]!.searchParams.keys()]).toEqual(["limit"]);
      expect([...requests[1]!.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
      expect(requests[1]!.searchParams.get("cursor")).toBe(first.nextCursor);
      expect(new Set([...first.packages, ...second.packages].map((item) => item.canonicalId)).size).toBe(3);
    } finally {
      store.close();
    }
  });

  test("SDK public index rejects malformed success receipts instead of inventing a catalog", async () => {
    const store = await createInitializedD1Coordinator();
    let calls = 0;
    try {
      for (const malformed of [
        { packages: [], nextCursor: null },
        { schemaVersion: 1, packages: [] },
        { schemaVersion: 1, packages: [], nextCursor: null, count: 0 },
        { schemaVersion: 1, packages: [{ canonicalId: "incomplete-package" }], nextCursor: null }
      ]) {
        const client = new VRCPackageClient({
          baseUrl: "https://coordinator.invalid",
          fetch: Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) => {
              calls++;
              const response = await handlePublicCatalogRequest(new Request(input, init), store);
              expect(response.status).toBe(200);
              return Response.json(malformed);
            },
            { preconnect() {} }
          )
        });
        await expect(client.index.query()).rejects.toThrow();
      }
      expect(calls).toBe(4);
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index: returns empty catalog when no packages indexed", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const response = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("public, max-age=60");

      const body = PublicCatalogListResponseSchema.parse(await response.json());
      expect(body.schemaVersion).toBe(CATALOG_PROTOCOL_VERSION);
      expect(body.packages).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index: rejects invalid query parameters", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const res1 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=0"), store);
      expect(res1.status).toBe(400);

      const res2 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=101"), store);
      expect(res2.status).toBe(400);

      const res3 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=abc"), store);
      expect(res3.status).toBe(400);

      const res4 = await handlePublicCatalogRequest(publicGet("/v1/app/index?cursor=invalid!cursor"), store);
      expect(res4.status).toBe(400);

      const res5 = await handlePublicCatalogRequest(publicGet("/v1/app/index?unknown=param"), store);
      expect(res5.status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index: supports keyset pagination", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = PublicCatalogListResponseSchema.parse(await page1Res.json());
      expect(page1.packages).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedCursor = decodeCatalogCursor(page1.nextCursor!);
      expect(decodedCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/app/index?limit=2&cursor=${page1.nextCursor}`),
        store
      );
      expect(page2Res.status).toBe(200);
      const page2 = PublicCatalogListResponseSchema.parse(await page2Res.json());
      expect(page2.packages).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index/delta: emits upserts and delist tombstones with epoch", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const initialEpoch = await store.getCatalogEpoch();
      expect(initialEpoch.length).toBeGreaterThan(0);

      seedVpmAndCatalogItem(store, "pkg.active", "com.example.active", "Active Tool", "active");
      seedVpmAndCatalogItem(store, "pkg.delisted", "com.example.delisted", "Delisted Tool", "delisted");

      const res = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta?limit=10"), store);
      expect(res.status).toBe(200);

      const body = CatalogDeltaResponseSchema.parse(await res.json());
      expect(body.schemaVersion).toBe(CATALOG_PROTOCOL_VERSION);
      expect(body.epoch).toBe(initialEpoch);
      expect(body.deltas).toHaveLength(2);

      const activeDelta = body.deltas.find((d) => d.canonicalId === "com.example.active");
      expect(activeDelta?.action).toBe("upsert");
      expect(activeDelta?.package).toBeDefined();
      expect(activeDelta?.package?.displayName).toBe("Active Tool");
      expect(activeDelta?.package?.fronts).toHaveLength(1);

      const delistedDelta = body.deltas.find((d) => d.canonicalId === "com.example.delisted");
      expect(delistedDelta?.action).toBe("delist");
      expect(delistedDelta?.package).toBeUndefined();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index/delta: supports keyset delta cursor pagination", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = CatalogDeltaResponseSchema.parse(await page1Res.json());
      expect(page1.deltas).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedDeltaCursor = decodeCatalogDeltaCursor(page1.nextCursor!);
      expect(decodedDeltaCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/app/index/delta?limit=2&cursor=${page1.nextCursor}`),
        store
      );
      expect(page2Res.status).toBe(200);
      const page2 = CatalogDeltaResponseSchema.parse(await page2Res.json());
      expect(page2.deltas).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("resetCatalogEpoch: invalidates epoch after catalog reset", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const epoch1 = await store.getCatalogEpoch();
      const epoch2 = await store.resetCatalogEpoch();
      expect(epoch2).not.toBe(epoch1);
      expect(await store.getCatalogEpoch()).toBe(epoch2);
    } finally {
      store.close();
    }
  });

  test("public catalog requests serialize without authentication and retired aliases return 404", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      seedVpmAndCatalogItem(store, "pkg.http", "com.example.http", "HTTP Package");

      const appIndexRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store);
      expect(appIndexRes.status).toBe(200);
      const appIndexBody = PublicCatalogListResponseSchema.parse(await appIndexRes.json());
      expect(appIndexBody.packages).toHaveLength(1);
      expect(appIndexBody.packages[0].canonicalId).toBe("com.example.http");

      const appDeltaRes = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      expect(appDeltaRes.status).toBe(200);
      const appDeltaBody = CatalogDeltaResponseSchema.parse(await appDeltaRes.json());
      expect(appDeltaBody.deltas).toHaveLength(1);
      expect(appDeltaBody.deltas[0].action).toBe("upsert");
      expect(appDeltaBody.deltas[0].canonicalId).toBe("com.example.http");

      const retiredCatalog = await handlePublicCatalogRequest(publicGet("/v1/catalog"), store);
      expect(retiredCatalog.status).toBe(404);

      const retiredDelta = await handlePublicCatalogRequest(publicGet("/v1/catalog/delta"), store);
      expect(retiredDelta.status).toBe(404);
    } finally {
      store.close();
    }
  });

  test("public catalog and delta endpoints never serve age-rated or prohibited content", async () => {
    const store = await createInitializedD1Coordinator();
    const now = new Date(store.now()).toISOString();
    try {
      const packages = [
        { id: "pkg-gen", rating: "general", name: "General Package" },
        { id: "pkg-mat", rating: "mature", name: "Mature Package" },
        { id: "pkg-adu", rating: "adult_restricted", name: "Adult Restricted Package" },
        { id: "pkg-pro", rating: "prohibited", name: "Prohibited Package" }
      ];

      for (const p of packages) {
        store.sqlite
          .prepare(
            `INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, content_rating)
          VALUES (?, 'tools', 'tool', 'active', ?, ?, ?, ?, ?)`
          )
          .run(p.id, p.name, p.id, now, now, p.rating);
      }

      const catalogRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store);
      expect(catalogRes.status).toBe(200);
      const catalogBody = PublicCatalogListResponseSchema.parse(await catalogRes.json());
      expect(catalogBody.packages).toHaveLength(1);
      expect(catalogBody.packages[0].canonicalId).toBe("pkg-gen");
      expect(catalogBody.packages[0].contentRating).toBe("general");

      const deltaRes = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      expect(deltaRes.status).toBe(200);
      const deltaBody = CatalogDeltaResponseSchema.parse(await deltaRes.json());
      expect(deltaBody.deltas).toHaveLength(1);
      expect(deltaBody.deltas[0].canonicalId).toBe("pkg-gen");
      if (deltaBody.deltas[0].action === "upsert") {
        expect(deltaBody.deltas[0].package?.contentRating).toBe("general");
      }
    } finally {
      store.close();
    }
  });

  test("public delta endpoint emits delist tombstones on rating withdrawal and hard deletion", async () => {
    let mockTime = 1000000;
    const store = await createInitializedD1Coordinator(":memory:", () => mockTime);
    try {
      mockTime = 1001000;
      seedVpmAndCatalogItem(store, "pkg.gen1", "com.example.pkg1", "Package 1", "active");
      mockTime = 1002000;
      seedVpmAndCatalogItem(store, "pkg.gen2", "com.example.pkg2", "Package 2", "active");
      mockTime = 1003000;
      seedVpmAndCatalogItem(store, "pkg.gen3", "com.example.pkg3", "Package 3", "active");

      const initialDeltas = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      expect(initialDeltas.status).toBe(200);
      const initialBody = CatalogDeltaResponseSchema.parse(await initialDeltas.json());
      expect(initialBody.deltas).toHaveLength(3);
      expect(initialBody.deltas.every((d) => d.action === "upsert")).toBe(true);

      mockTime = 1004000;
      const adjustRes = await store.adjustPackageRating(
        "com.example.pkg1",
        "adult_restricted",
        "moderator-1",
        "Restricted content"
      );
      expect(adjustRes).not.toBeNull();
      expect(adjustRes?.previousRating).toBe("general");
      expect(adjustRes?.newRating).toBe("adult_restricted");

      mockTime = 1005000;
      const deleteRes = await store.deleteCanonicalPackage("com.example.pkg2");
      expect(deleteRes).toBe(true);

      const afterMutationDeltas = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      expect(afterMutationDeltas.status).toBe(200);
      const afterMutationBody = CatalogDeltaResponseSchema.parse(await afterMutationDeltas.json());
      expect(afterMutationBody.deltas).toHaveLength(3);

      const pkg3Delta = afterMutationBody.deltas.find((d) => d.canonicalId === "com.example.pkg3");
      expect(pkg3Delta?.action).toBe("upsert");
      expect(pkg3Delta?.package?.displayName).toBe("Package 3");

      const pkg1Delta = afterMutationBody.deltas.find((d) => d.canonicalId === "com.example.pkg1");
      expect(pkg1Delta?.action).toBe("delist");
      expect(pkg1Delta?.package).toBeUndefined();

      const pkg2Delta = afterMutationBody.deltas.find((d) => d.canonicalId === "com.example.pkg2");
      expect(pkg2Delta?.action).toBe("delist");
      expect(pkg2Delta?.package).toBeUndefined();

      const pkg3Cursor = encodeCatalogDeltaCursor({
        updatedAt: pkg3Delta!.updatedAt,
        canonicalId: pkg3Delta!.canonicalId
      });
      const cursorDeltas = await handlePublicCatalogRequest(
        publicGet(`/v1/app/index/delta?cursor=${pkg3Cursor}`),
        store
      );
      expect(cursorDeltas.status).toBe(200);
      const cursorBody = CatalogDeltaResponseSchema.parse(await cursorDeltas.json());
      expect(cursorBody.deltas).toHaveLength(2);
      expect(cursorBody.deltas.map((d) => d.canonicalId)).toEqual(["com.example.pkg1", "com.example.pkg2"]);
      expect(cursorBody.deltas.every((d) => d.action === "delist")).toBe(true);

      mockTime = 1006000;
      const delistReq = await store.submitDelistRequest({
        canonicalId: "com.example.pkg3",
        requesterId: "owner",
        reason: "Delisted by request",
        requesterType: "admin_operator"
      });
      expect(delistReq.status).toBe("accepted");

      const finalDeltas = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      const finalBody = CatalogDeltaResponseSchema.parse(await finalDeltas.json());
      expect(finalBody.deltas).toHaveLength(3);
      expect(finalBody.deltas.every((d) => d.action === "delist")).toBe(true);
      expect(finalBody.deltas.map((d) => d.canonicalId)).toEqual([
        "com.example.pkg1",
        "com.example.pkg2",
        "com.example.pkg3"
      ]);
    } finally {
      store.close();
    }
  });

  describe("Publication Classes Enforcement (R13-C3 / Q-PUBLICATION)", () => {
    test("withholds packages whose source profile sets publishClasses: [] from public catalog listing", async () => {
      const store = await createInitializedD1Coordinator();
      const limiter = new InMemoryRateLimiter();
      try {
        const nodeId = "pub-test-node";
        const token = await store.createNodeCredential(nodeId, ["vpm"]);
        const principal = (await store.authenticate(nodeId, token))!;

        await store.createSourceAccessProfile(
          {
            schemaVersion: 1,
            platform: "vpm",
            origin: "https://restricted.example.com",
            pathScope: "/index.json",
            method: "GET",
            purpose: "metadata",
            minDelayMs: 1000,
            expiresAt: "2099-01-01T00:00:00Z",
            reviewReference: "REV-RESTRICTED-01",
            reason: "No publication authority testing",
            retainClasses: ["normalized_facts", "creator_prose"],
            publishClasses: []
          },
          "operator-admin"
        );

        await store.recordRobotsSnapshot("https://restricted.example.com", 200, "User-agent: *\nAllow: /");
        await store.seedJob("https://restricted.example.com/index.json", "vpm", 1000, undefined, "metadata");

        const claim = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
        expect(claim.status).toBe("leased");
        if (claim.status !== "leased") return;

        const pkgId = "com.restricted.hidden-tool";
        const submitRes = await store.submit(
          {
            schemaVersion: 1,
            nodeId,
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "submit-restricted-01",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: pkgId,
                title: "Restricted Tool (Should Not Publish)",
                summary: "A private tool without publication authority",
                author: "Internal Team",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          },
          principal
        );
        expect(submitRes.status).toBe("accepted");

        const publicRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store, limiter);
        expect(publicRes.status).toBe(200);
        const catalog = PublicCatalogListResponseSchema.parse(await publicRes.json());
        expect(catalog.packages.find((p) => p.canonicalId === pkgId)).toBeUndefined();

        const deltaRes = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store, limiter);
        expect(deltaRes.status).toBe(200);
        const deltas = CatalogDeltaResponseSchema.parse(await deltaRes.json());
        const deltaItem = deltas.deltas.find((d) => d.canonicalId === pkgId);
        expect(deltaItem).toBeDefined();
        expect(deltaItem?.action).toBe("delist");
        expect(deltaItem?.package).toBeUndefined();
      } finally {
        store.close();
      }
    });

    test("publishes authorized package normally when profile sets publishClasses: [normalized_facts]", async () => {
      const store = await createInitializedD1Coordinator();
      const limiter = new InMemoryRateLimiter();
      try {
        const nodeId = "pub-test-node-2";
        const token = await store.createNodeCredential(nodeId, ["vpm"]);
        const principal = (await store.authenticate(nodeId, token))!;

        await store.createSourceAccessProfile(
          {
            schemaVersion: 1,
            platform: "vpm",
            origin: "https://authorized.example.com",
            pathScope: "/index.json",
            method: "GET",
            purpose: "metadata",
            minDelayMs: 1000,
            expiresAt: "2099-01-01T00:00:00Z",
            reviewReference: "REV-AUTHORIZED-01",
            reason: "Approved metadata publication",
            retainClasses: ["normalized_facts", "creator_prose"],
            publishClasses: ["normalized_facts"]
          },
          "operator-admin"
        );

        await store.recordRobotsSnapshot("https://authorized.example.com", 200, "User-agent: *\nAllow: /");
        await store.seedJob("https://authorized.example.com/index.json", "vpm", 1000, undefined, "metadata");

        const claim = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
        expect(claim.status).toBe("leased");
        if (claim.status !== "leased") return;

        const pkgId = "com.authorized.public-tool";
        const submitRes = await store.submit(
          {
            schemaVersion: 1,
            nodeId,
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "submit-authorized-01",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: pkgId,
                title: "Authorized Public Tool",
                summary: "A public tool with normalized_facts publication rights",
                author: "Community Dev",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          },
          principal
        );
        expect(submitRes.status).toBe("accepted");

        const publicRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store, limiter);
        expect(publicRes.status).toBe(200);
        const catalog = PublicCatalogListResponseSchema.parse(await publicRes.json());
        const pkg = catalog.packages.find((p) => p.canonicalId === pkgId);
        expect(pkg).toBeDefined();
        expect(pkg?.displayName).toBe("Authorized Public Tool");
        expect(pkg?.acceptedLinks).toHaveLength(1);

        const deltaRes = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store, limiter);
        expect(deltaRes.status).toBe(200);
        const deltas = CatalogDeltaResponseSchema.parse(await deltaRes.json());
        const deltaItem = deltas.deltas.find((d) => d.canonicalId === pkgId);
        expect(deltaItem).toBeDefined();
        expect(deltaItem?.action).toBe("upsert");
        expect(deltaItem?.package?.displayName).toBe("Authorized Public Tool");
      } finally {
        store.close();
      }
    });

    test("filters restricted fronts and links when package has mixed publication authority", async () => {
      const store = await createInitializedD1Coordinator();
      const limiter = new InMemoryRateLimiter();
      try {
        const nodeId = "pub-test-node-3";
        const token = await store.createNodeCredential(nodeId, ["vpm", "booth"]);
        const principal = (await store.authenticate(nodeId, token))!;

        await store.createSourceAccessProfile(
          {
            schemaVersion: 1,
            platform: "vpm",
            origin: "https://vpm.mixed.example.com",
            pathScope: "/index.json",
            method: "GET",
            purpose: "metadata",
            minDelayMs: 1000,
            expiresAt: "2099-01-01T00:00:00Z",
            reviewReference: "REV-VPM-AUTHORIZED",
            reason: "Approved VPM",
            retainClasses: ["normalized_facts", "creator_prose"],
            publishClasses: ["normalized_facts"]
          },
          "operator-admin"
        );

        await store.createSourceAccessProfile(
          {
            schemaVersion: 1,
            platform: "booth",
            origin: "https://booth.pm",
            pathScope: "/ja/items/99999",
            method: "GET",
            purpose: "metadata",
            minDelayMs: 1000,
            expiresAt: "2099-01-01T00:00:00Z",
            reviewReference: "REV-BOOTH-RESTRICTED",
            reason: "Private booth probe without storefront publication",
            retainClasses: ["normalized_facts", "creator_prose"],
            publishClasses: []
          },
          "operator-admin"
        );

        await store.recordRobotsSnapshot("https://vpm.mixed.example.com", 200, "User-agent: *\nAllow: /");
        await store.recordRobotsSnapshot("https://booth.pm", 200, "User-agent: *\nAllow: /");

        await store.seedJob("https://vpm.mixed.example.com/index.json", "vpm", 1000, undefined, "metadata");
        const claimVpm = await store.claim(
          { schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] },
          principal
        );
        expect(claimVpm.status).toBe("leased");
        if (claimVpm.status !== "leased") return;

        const canonicalId = "com.mixed.pkg";
        await store.submit(
          {
            schemaVersion: 1,
            nodeId,
            jobId: claimVpm.job.jobId,
            leaseId: claimVpm.job.leaseId,
            idempotencyKey: "submit-mixed-vpm",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: canonicalId,
                title: "Mixed Authority Package",
                summary: "A package with mixed source profiles",
                author: "Dev",
                outboundLinks: ["https://booth.pm/ja/items/99999"],
                originUpdatedAt: null
              }
            }
          },
          principal
        );

        await store.seedJob("https://booth.pm/ja/items/99999", "booth", 1000, undefined, "metadata");
        const claimBooth = await store.claim(
          { schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] },
          principal
        );
        expect(claimBooth.status).toBe("leased");
        if (claimBooth.status !== "leased") return;

        await store.submit(
          {
            schemaVersion: 1,
            nodeId,
            jobId: claimBooth.job.jobId,
            leaseId: claimBooth.job.leaseId,
            idempotencyKey: "submit-mixed-booth",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "booth.pm/ja/items/99999",
                title: "Booth Storefront Listing",
                author: "Dev",
                summary: "Storefront description",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          },
          principal
        );

        const boothSourceKey = "booth:https://booth.pm/ja/items/99999:booth.pm/ja/items/99999";
        await store.createIdentityLink({
          sourceKey: boothSourceKey,
          canonicalId,
          evidenceKind: "cross_storefront_link",
          confidence: 1.0,
          reviewState: "accepted"
        });

        const publicRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store, limiter);
        expect(publicRes.status).toBe(200);
        const catalog = PublicCatalogListResponseSchema.parse(await publicRes.json());
        const pkg = catalog.packages.find((p) => p.canonicalId === canonicalId);
        expect(pkg).toBeDefined();

        expect(pkg?.acceptedLinks).toHaveLength(1);
        expect(pkg?.acceptedLinks[0].sourceKey).toContain("vpm");
        expect(pkg?.fronts.find((f) => f.platform === "booth")).toBeUndefined();
      } finally {
        store.close();
      }
    });
  });
});
