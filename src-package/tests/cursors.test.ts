import { describe, expect, test } from "bun:test";
import * as sdk from "../src/index.ts";
import { CURSOR_TOKEN_MAX_LENGTH, CursorTimestampSchema, encodeCursor } from "../src/encoding/cursor.ts";

const time = "2026-10-13T00:00:00.000Z";
const id = "00000000-0000-4000-8000-000000000001";
const families = [
  { value: { createdAt: time, canonicalId: "界".repeat(500) },
    encode: sdk.encodeCatalogCursor, decode: sdk.decodeCatalogCursor,
    query: sdk.PublicCatalogListQuerySchema, response: sdk.PublicCatalogListResponseSchema, body: { packages: [] } },
  { value: { updatedAt: time, canonicalId: "界".repeat(500) },
    encode: sdk.encodeCatalogDeltaCursor, decode: sdk.decodeCatalogDeltaCursor,
    query: sdk.CatalogDeltaQuerySchema, response: sdk.CatalogDeltaResponseSchema, body: { epoch: "test", deltas: [] } },
  { value: { updatedAt: time, canonicalId: "界".repeat(500) },
    encode: sdk.encodeModeratorRatingCursor, decode: sdk.decodeModeratorRatingCursor,
    query: sdk.ModeratorRatingListQuerySchema, response: sdk.ModeratorRatingListResponseSchema, body: { ratings: [] } },
  { value: { status: "pending_review", firstSeenAt: time, leadKey: "a".repeat(64) },
    encode: sdk.encodeLeadCursor, decode: sdk.decodeLeadCursor,
    query: sdk.OperatorLeadListQuerySchema, response: sdk.LeadListResponseSchema, body: { leads: [] } },
  { value: { createdAt: time, profileId: id },
    encode: sdk.encodeProfileCursor, decode: sdk.decodeProfileCursor,
    query: sdk.OperatorProfileListQuerySchema, response: sdk.SourceAccessProfileListResponseSchema, body: { profiles: [] } },
  { value: { createdAt: time, ruleId: id },
    encode: sdk.encodeRuleCursor, decode: sdk.decodeRuleCursor,
    query: sdk.OperatorRuleListQuerySchema, response: sdk.AutoQueueRuleListResponseSchema, body: { rules: [] } },
  { value: { recordedAt: time, takedownId: id },
    encode: sdk.encodeTakedownCursor, decode: sdk.decodeTakedownCursor,
    query: sdk.OperatorTakedownListQuerySchema, response: sdk.TakedownListResponseSchema, body: { records: [] } },
  { value: { recordedAt: time, claimId: id },
    encode: sdk.encodeDelegatedClaimCursor, decode: sdk.decodeDelegatedClaimCursor,
    query: sdk.OperatorClaimListQuerySchema, response: sdk.DelegatedClaimListResponseSchema, body: { records: [] } },
  { value: { createdAt: time, appId: id },
    encode: sdk.encodeOperatorAppCursor, decode: sdk.decodeOperatorAppCursor,
    query: sdk.OperatorAppListQuerySchema, response: sdk.OperatorAppListResponseSchema, body: { apps: [] } }
] as const;

describe("bounded UTF-8 pagination contracts", () => {
  for (const [index, family] of families.entries()) {
    test("cursor family " + index + " emits a token accepted by its request and response", () => {
      const token = family.encode(family.value as never);
      expect(token.startsWith("u1_")).toBe(/[^\x00-\x7f]/.test(JSON.stringify(family.value)));
      expect(token.length).toBeLessThanOrEqual(CURSOR_TOKEN_MAX_LENGTH);
      expect(family.decode(token)).toEqual(family.value);
      expect(family.query.safeParse({ cursor: token }).success).toBe(true);
      expect(family.response.safeParse({ schemaVersion: 1, ...family.body, nextCursor: token }).success).toBe(true);
      for (const malformed of ["", token + "=", "u2_" + token.slice(3), "u1_A", "u1__w",
        "u1_" + "A".repeat(CURSOR_TOKEN_MAX_LENGTH), encodeCursor({ wrong: true }),
        encodeCursor({ ...family.value, extra: true }), btoa("{}")]) {
        expect(family.decode(malformed)).toBeNull();
        expect(family.query.safeParse({ cursor: malformed }).success).toBe(false);
        expect(family.response.safeParse({ schemaVersion: 1, ...family.body, nextCursor: malformed }).success).toBe(false);
      }
    });
  }

  test("all accepted ID characters fit the wire budget without truncation", () => {
    for (const canonicalId of ["x".repeat(500), "界".repeat(500), "🦊".repeat(250),
      "\u0000".repeat(500), "\ud800".repeat(500), "é".repeat(500)]) {
      const time128 = "2026-10-13T00:00:00." + "1".repeat(107) + "Z";
      expect(time128.length).toBe(128);
      const cursor = { createdAt: time128, canonicalId };
      const token = sdk.encodeCatalogCursor(cursor);
      expect(sdk.decodeCatalogCursor(token)).toEqual(cursor);
      expect(sdk.PublicCatalogListQuerySchema.safeParse({ cursor: token }).success).toBe(true);
      expect(sdk.CatalogSearchRequestSchema.safeParse({ schemaVersion: 1, cursor: token }).success).toBe(true);
      expect(sdk.OperatorCatalogListQuerySchema.safeParse({ cursor: token }).success).toBe(true);
      expect(sdk.CatalogSearchResponseSchema.safeParse({ schemaVersion: 1, items: [], nextCursor: token }).success).toBe(true);
      expect(token.length).toBeGreaterThan(256);
    }
    expect(() => sdk.encodeCatalogCursor({ createdAt: time, canonicalId: "x".repeat(501) })).toThrow();
    expect(CursorTimestampSchema.safeParse("2026-10-13T00:00:00." + "1".repeat(108) + "Z").success).toBe(false);
    expect(() => encodeCursor({ data: "x".repeat(10_000) })).toThrow();
  });

  test("canonical representation rejects duplicate keys, whitespace and alternate member order", () => {
    const payloads = [
      '{"createdAt":"' + time + '","canonicalId":"a","canonicalId":"b"}',
      '{ "createdAt":"' + time + '","canonicalId":"a"}',
      '{"canonicalId":"a","createdAt":"' + time + '"}'
    ];
    for (const payload of payloads) {
      const token = "u1_" + btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      expect(sdk.decodeCatalogCursor(token)).toBeNull();
    }
  });

  test("ASCII bytes stay stable and old Latin-1 tokens cannot alias UTF-8 IDs", () => {
    const ascii = { createdAt: time, canonicalId: "com.example.package" };
    expect(sdk.encodeCatalogCursor(ascii)).toBe(btoa(JSON.stringify(ascii)).replace(/=+$/, ""));
    expect(sdk.decodeCatalogCursor(sdk.encodeCatalogCursor(ascii))).toEqual(ascii);
    for (const canonicalId of ["é", "Ã©"]) {
      const old = btoa(JSON.stringify({ ...ascii, canonicalId })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      expect(sdk.decodeCatalogCursor(old)).toBeNull();
      expect(sdk.decodeCatalogCursor(sdk.encodeCatalogCursor({ ...ascii, canonicalId }))?.canonicalId).toBe(canonicalId);
    }
  });

  test("long Unicode cursor crosses SDK HTTP serialization unchanged", async () => {
    const cursor = sdk.encodeCatalogCursor({ createdAt: time, canonicalId: "界".repeat(500) });
    const requests: Request[] = [];
    const client = new sdk.VRCPackageClient({ baseUrl: "https://fixture.test", appToken: "fixture",
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        const received = request.method === "GET"
          ? sdk.PublicCatalogListQuerySchema.parse({ cursor: new URL(request.url).searchParams.get("cursor") }).cursor
          : sdk.CatalogSearchRequestSchema.parse(await request.json()).cursor;
        expect(received).toBe(cursor);
        return Response.json(request.method === "GET"
          ? { schemaVersion: 1, packages: [], nextCursor: cursor }
          : { schemaVersion: 1, items: [], nextCursor: cursor });
      }, { preconnect() {} }) });
    expect((await client.index.query({ cursor })).nextCursor).toBe(cursor);
    expect((await client.index.search({ queryOrigin: "user_authored", cursor })).nextCursor).toBe(cursor);
    expect(requests).toHaveLength(2);
  });
});
