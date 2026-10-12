import { describe, expect, test } from "bun:test";
import * as sdk from "vrc-packages-api";
import * as operator from "../src/api/protocol/operator_protocol.ts";
import * as profiles from "../src/domain/access/source_access_profile.ts";
import { handlePublicCatalogRequest } from "../src/api/public_handler.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleDownstreamRequest } from "../src/api/downstream_handler.ts";
import { handleModeratorRequest } from "../src/api/moderator_handler.ts";
import { InMemoryRateLimiter } from "../src/api/rate_limiter.ts";
import { LocalCoordinatorStore } from "./support/local_sqlite.ts";

const timestamp = "2026-10-13T00:00:00.000Z";
const operatorToken = "a".repeat(64);

function get(path: string, cursor: string | null, token?: string): Request {
  const url = new URL(path, "https://pagination.invalid");
  url.searchParams.set("limit", "1");
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  return new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

async function body(result: Promise<Response>): Promise<unknown> {
  const response = await result;
  expect(response.status).toBe(200);
  return response.json();
}

describe("distributed pagination contracts through real Worker handlers", () => {
  test("operator and profile cursors use the distributed SDK implementations", () => {
    for (const name of ["LeadCursorSchema", "encodeLeadCursor", "decodeLeadCursor",
      "TakedownCursorSchema", "encodeTakedownCursor", "decodeTakedownCursor",
      "DelegatedClaimCursorSchema", "encodeDelegatedClaimCursor", "decodeDelegatedClaimCursor",
      "OperatorAppCursorSchema", "encodeOperatorAppCursor", "decodeOperatorAppCursor"] as const) {
      expect(operator[name]).toBe(sdk[name]);
    }
    for (const name of ["ProfileCursorSchema", "encodeProfileCursor", "decodeProfileCursor"] as const) {
      expect(profiles[name]).toBe(sdk[name]);
    }
    const cursor = { createdAt: timestamp, profileId: "abcdefab-cdef-4abc-8def-abcdefabcdef" };
    expect(profiles.decodeProfileCursor(profiles.encodeProfileCursor(cursor))).toEqual(cursor);
    expect(profiles.decodeProfileCursor(profiles.encodeProfileCursor(cursor) + "=")).toBeNull();
  });

  for (const character of ["界", "\u0000"]) {
    test(`500-character ${character === "界" ? "Unicode" : "JSON-escaped"} IDs survive catalog, delta, search, operator and moderator pagination`, async () => {
      const store = new LocalCoordinatorStore();
      const limiter = new InMemoryRateLimiter();
      const ids = [character.repeat(499) + "a", character.repeat(499) + "b"];
      try {
        for (const [index, id] of ids.entries()) {
          store.db.prepare(`INSERT INTO canonical_packages
            (canonical_id, umbrella, category, lifecycle, display_name, created_at, updated_at)
            VALUES (?, 'tools', 'tool', 'active', ?, ?, ?)`)
            .run(id, `Long ID ${index}`, timestamp, timestamp);
        }
        const app = store.registerApp({ schemaVersion: 1, appName: "Pagination fixture" });
        const moderator = store.issueUserToken("pagination-moderator", "fixture@example.invalid", true, true);
        const routes = [
          { name: "public", ascending: false, decode: sdk.decodeCatalogCursor,
            load: async (cursor: string | null) => {
              const page = sdk.PublicCatalogListResponseSchema.parse(await body(
                handlePublicCatalogRequest(get("/v1/app/index", cursor), store, limiter)));
              return { ids: page.packages.map(item => item.canonicalId), nextCursor: page.nextCursor };
            } },
          { name: "delta", ascending: true, decode: sdk.decodeCatalogDeltaCursor,
            load: async (cursor: string | null) => {
              const page = sdk.CatalogDeltaResponseSchema.parse(await body(
                handlePublicCatalogRequest(get("/v1/app/index/delta", cursor), store, limiter)));
              return { ids: page.deltas.map(item => item.canonicalId), nextCursor: page.nextCursor };
            } },
          { name: "operator", ascending: false, decode: sdk.decodeCatalogCursor,
            load: async (cursor: string | null) => {
              const page = sdk.CatalogListResponseSchema.parse(await body(
                handleOperatorRequest(get("/v1/operator/catalog", cursor, operatorToken), store, operatorToken, limiter)));
              return { ids: page.packages.map(item => item.canonicalId), nextCursor: page.nextCursor };
            } },
          { name: "moderator", ascending: false, decode: sdk.decodeModeratorRatingCursor,
            load: async (cursor: string | null) => {
              const page = sdk.ModeratorRatingListResponseSchema.parse(await body(
                handleModeratorRequest(get("/v1/moderator/ratings", cursor, moderator.token), store, limiter)));
              return { ids: page.ratings.map(item => item.canonicalId), nextCursor: page.nextCursor };
            } },
          { name: "search", ascending: false, decode: sdk.decodeCatalogCursor,
            load: async (cursor: string | null) => {
              const request = new Request("https://pagination.invalid/v1/app/index/search", {
                method: "POST", headers: { authorization: `Bearer ${app.appToken}`, "content-type": "application/json" },
                body: JSON.stringify({ schemaVersion: 1, query: "Long ID", limit: 1, cursor })
              });
              const page = sdk.CatalogSearchResponseSchema.parse(await body(
                handleDownstreamRequest(request, store, operatorToken, limiter)));
              return { ids: page.items.map(item => item.canonicalId), nextCursor: page.nextCursor };
            } }
        ];
        for (const route of routes) {
          const expected = route.ascending ? ids : [...ids].reverse();
          const first = await route.load(null);
          expect(first.ids).toEqual(expected.slice(0, 1));
          expect(first.nextCursor).not.toBeNull();
          expect(first.nextCursor!.length).toBeGreaterThan(256);
          expect(first.nextCursor!.length).toBeLessThanOrEqual(8192);
          expect(route.decode(first.nextCursor!)?.canonicalId).toBe(expected[0]);
          const second = await route.load(first.nextCursor!);
          expect(second.ids).toEqual(expected.slice(1));
          expect(second.nextCursor).toBeNull();
        }
        for (const cursor of ["a".repeat(8193), sdk.encodeCatalogCursor({ createdAt: timestamp, canonicalId: ids[0]! }) + "="]) {
          for (const path of ["/v1/app/index", "/v1/app/index/delta"]) {
            expect((await handlePublicCatalogRequest(get(path, cursor), store, limiter)).status).toBe(400);
          }
          expect((await handleOperatorRequest(get("/v1/operator/catalog", cursor, operatorToken),
            store, operatorToken, limiter)).status).toBe(400);
          expect((await handleModeratorRequest(get("/v1/moderator/ratings", cursor, moderator.token), store, limiter)).status).toBe(400);
        }
      } finally { store.close(); }
    });
  }
});
