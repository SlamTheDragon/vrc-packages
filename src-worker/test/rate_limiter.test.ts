import { describe, expect, test } from "bun:test";
import {
  InMemoryRateLimiter,
  KvRateLimiter,
  CloudflareBindingRateLimiter,
  createRateLimiter,
  type IKVNamespace,
  type CloudflareRateLimiterBinding,
  extractClientIp,
  rateLimitResponse,
  applyRateLimitHeaders,
  RATE_LIMIT_POLICIES
} from "../src/api/rate_limiter.ts";
import { handlePublicCatalogRequest } from "../src/api/public_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { handleDownstreamRequest } from "../src/api/downstream_handler.ts";
import { LocalCoordinatorStore } from "./support/local_sqlite.js";
import { CATALOG_PROTOCOL_VERSION } from "vrc-packages-api";

describe("Inbound 429 Rate Limiter & Abuse Protection", () => {
  describe("InMemoryRateLimiter Unit Tests", () => {
    test("allows requests up to the configured limit and decrements remaining", () => {
      const limiter = new InMemoryRateLimiter();
      const policy = { limit: 3, windowSeconds: 60 };
      const key = "test:ip:1";

      const r1 = limiter.check(key, policy, 1000);
      expect(r1.allowed).toBe(true);
      expect(r1.limit).toBe(3);
      expect(r1.remaining).toBe(2);

      const r2 = limiter.check(key, policy, 2000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check(key, policy, 3000);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // Exceeded
      const r4 = limiter.check(key, policy, 4000);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetAfterSeconds).toBeGreaterThan(0);
    });

    test("resets window after expiration", () => {
      const limiter = new InMemoryRateLimiter();
      const policy = { limit: 2, windowSeconds: 10 };
      const key = "test:ip:2";

      const r1 = limiter.check(key, policy, 1000);
      expect(r1.allowed).toBe(true);
      const r2 = limiter.check(key, policy, 2000);
      expect(r2.allowed).toBe(true);
      const r3 = limiter.check(key, policy, 3000);
      expect(r3.allowed).toBe(false);

      // Advance time past the 10s window (1000 + 10000 = 11000)
      const r4 = limiter.check(key, policy, 12000);
      expect(r4.allowed).toBe(true);
      expect(r4.remaining).toBe(1);
    });

    test("extracts client IP from Cloudflare and proxy headers", () => {
      const reqCf = new Request("http://localhost", {
        headers: { "cf-connecting-ip": "203.0.113.195" }
      });
      expect(extractClientIp(reqCf)).toBe("203.0.113.195");

      const reqXff = new Request("http://localhost", {
        headers: { "x-forwarded-for": "198.51.100.17, 10.0.0.1" }
      });
      expect(extractClientIp(reqXff)).toBe("198.51.100.17");

      const reqRealIp = new Request("http://localhost", {
        headers: { "x-real-ip": "192.0.2.1" }
      });
      expect(extractClientIp(reqRealIp)).toBe("192.0.2.1");

      const reqNone = new Request("http://localhost");
      expect(extractClientIp(reqNone)).toBe("127.0.0.1");
    });

    test("rateLimitResponse formats RFC-compliant headers and schema envelope", async () => {
      const result = {
        allowed: false,
        limit: 60,
        remaining: 0,
        resetAfterSeconds: 45
      };
      const res = rateLimitResponse(result, 1, "Rate limit exceeded test");
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("Content-Type")).toContain("application/json");

      const body = await res.json();
      expect(body).toEqual({
        schemaVersion: 1,
        code: "rate_limited",
        error: "Rate limit exceeded test"
      });
    });

    test("applyRateLimitHeaders attaches limit headers to responses", () => {
      const original = new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      const result = { allowed: true, limit: 120, remaining: 119, resetAfterSeconds: 60 };
      const decorated = applyRateLimitHeaders(original, result);

      expect(decorated.headers.get("X-RateLimit-Limit")).toBe("120");
      expect(decorated.headers.get("X-RateLimit-Remaining")).toBe("119");
    });
  });

  describe("Public Catalog Endpoint Rate Limiting", () => {
    test("rejects with 429 when public catalog policy is exceeded", async () => {
      const store = new LocalCoordinatorStore();
      const limiter = new InMemoryRateLimiter();

      // Exhaust limit of 60 requests
      const testIp = "192.168.1.100";
      for (let i = 0; i < RATE_LIMIT_POLICIES.PUBLIC_CATALOG.limit; i++) {
        const req = new Request("http://localhost/v1/app/index", {
          method: "GET",
          headers: { "cf-connecting-ip": testIp }
        });
        const res = await handlePublicCatalogRequest(req, store, limiter);
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(RATE_LIMIT_POLICIES.PUBLIC_CATALOG.limit - 1 - i));
      }

      // Next request must be throttled with 429
      const blockedReq = new Request("http://localhost/v1/app/index", {
        method: "GET",
        headers: { "cf-connecting-ip": testIp }
      });
      const blockedRes = await handlePublicCatalogRequest(blockedReq, store, limiter);
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
      const body = await blockedRes.json();
      expect(body).toMatchObject({ code: "rate_limited", schemaVersion: CATALOG_PROTOCOL_VERSION });

      // A different IP is still permitted
      const otherReq = new Request("http://localhost/v1/app/index", {
        method: "GET",
        headers: { "cf-connecting-ip": "192.168.1.101" }
      });
      const otherRes = await handlePublicCatalogRequest(otherReq, store, limiter);
      expect(otherRes.status).toBe(200);
    });
  });

  describe("Node Endpoint Rate Limiting (Pre-Stream Check)", () => {
    test("rejects rogue node with 429 before stream parsing when limit exceeded", async () => {
      const store = new LocalCoordinatorStore();
      const limiter = new InMemoryRateLimiter();
      const testIp = "10.10.10.1";
      const bearer = "Bearer vrcp_node_valid_credential_1234567890abcdef";
      const tokenPrefix = "vrcp_node_valid_";

      for (let i = 0; i < RATE_LIMIT_POLICIES.NODE_CLAIM.limit; i++) {
        limiter.check(`node:claim:${testIp}:${tokenPrefix}`, RATE_LIMIT_POLICIES.NODE_CLAIM);
      }

      // Next node claim request must receive 429 immediately
      const blockedReq = new Request("http://localhost/v1/node/jobs/claim", {
        method: "POST",
        headers: {
          "authorization": bearer,
          "content-type": "application/json",
          "cf-connecting-ip": testIp
        },
        body: JSON.stringify({ nodeId: "node-1" })
      });

      const blockedRes = await handleNodeRequest(blockedReq, store, limiter);
      expect(blockedRes.status).toBe(429);
      const body = await blockedRes.json();
      expect(body).toMatchObject({ code: "rate_limited" });
      expect(blockedRes.headers.get("Retry-After")).toBeDefined();
    });
  });

  describe("Downstream Search Rate Limiting", () => {
    test("rejects downstream app with 429 when search rate limit exceeded", async () => {
      const store = new LocalCoordinatorStore();
      const limiter = new InMemoryRateLimiter();

      // Register an app first
      const registerRes = await store.registerApp({
        schemaVersion: 1,
        appName: "Search Rate Test App"
      });
      const appToken = registerRes.appToken;
      const appId = registerRes.appId;

      // Exhaust search quota (120 req/min)
      for (let i = 0; i < RATE_LIMIT_POLICIES.APP_SEARCH.limit; i++) {
        limiter.check(`app:search:${appId}`, RATE_LIMIT_POLICIES.APP_SEARCH);
      }

      const blockedReq = new Request("http://localhost/v1/app/index/search", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${appToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ schemaVersion: 1, query: "avatar" })
      });

      const blockedRes = await handleDownstreamRequest(blockedReq, store, "", limiter);
      expect(blockedRes.status).toBe(429);
      const body = await blockedRes.json();
      expect(body).toMatchObject({ code: "rate_limited" });
    });
  });

  describe("KvRateLimiter Unit Tests", () => {
    function createMockKv(): IKVNamespace & { store: Map<string, { value: string; expirationTtl?: number }> } {
      const store = new Map<string, { value: string; expirationTtl?: number }>();
      return {
        store,
        async get(key: string) {
          const entry = store.get(key);
          return entry ? entry.value : null;
        },
        async put(key: string, value: string, options?: { expirationTtl?: number }) {
          store.set(key, { value, expirationTtl: options?.expirationTtl });
        },
        async delete(key: string) {
          store.delete(key);
        }
      };
    }

    test("allows requests up to the configured limit and decrements remaining in KV", async () => {
      const mockKv = createMockKv();
      const limiter = new KvRateLimiter(mockKv);
      const policy = { limit: 3, windowSeconds: 60 };
      const key = "test:ip:kv1";
      const now = 10_000;

      const r1 = await limiter.check(key, policy, now);
      expect(r1.allowed).toBe(true);
      expect(r1.limit).toBe(3);
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.check(key, policy, now + 1000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.check(key, policy, now + 2000);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // Exceeded
      const r4 = await limiter.check(key, policy, now + 3000);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetAfterSeconds).toBeGreaterThan(0);
    });

    test("resets window when time advances to next window bucket", async () => {
      const mockKv = createMockKv();
      const limiter = new KvRateLimiter(mockKv);
      const policy = { limit: 2, windowSeconds: 60 };
      const key = "test:ip:kv2";
      const bucket0Now = 10_000;

      const r1 = await limiter.check(key, policy, bucket0Now);
      expect(r1.allowed).toBe(true);
      const r2 = await limiter.check(key, policy, bucket0Now + 1000);
      expect(r2.allowed).toBe(true);
      const r3 = await limiter.check(key, policy, bucket0Now + 2000);
      expect(r3.allowed).toBe(false);

      // Advance time into next window bucket
      const bucket1Now = 65_000;
      const r4 = await limiter.check(key, policy, bucket1Now);
      expect(r4.allowed).toBe(true);
      expect(r4.remaining).toBe(1);
    });

    test("handles KV write/read exceptions gracefully and fails open", async () => {
      const failingKv: IKVNamespace = {
        async get() {
          throw new Error("KV offline");
        },
        async put() {
          throw new Error("KV put failed");
        }
      };
      const limiter = new KvRateLimiter(failingKv);
      const policy = { limit: 5, windowSeconds: 60 };
      const res = await limiter.check("failing:key", policy);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4);
    });

    test("enforces 429 when plugged into handlePublicCatalogRequest", async () => {
      const store = new LocalCoordinatorStore();
      const mockKv = createMockKv();
      const limiter = new KvRateLimiter(mockKv);

      const now = Date.now();
      const bucket = Math.floor(now / 60000);
      await mockKv.put(`rl:public:198.51.100.99:${bucket}`, "60");

      const req = new Request("http://localhost/v1/app/index", {
        headers: { "cf-connecting-ip": "198.51.100.99" }
      });
      const res = await handlePublicCatalogRequest(req, store, limiter);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeDefined();
      const body = await res.json();
      expect(body).toMatchObject({ code: "rate_limited" });
    });
  });

  describe("CloudflareBindingRateLimiter & Factory Unit Tests", () => {
    test("CloudflareBindingRateLimiter forwards to native limit binding", async () => {
      let passedKey = "";
      const mockBinding: CloudflareRateLimiterBinding = {
        async limit(options) {
          passedKey = options.key;
          return { success: options.key.includes("allow") };
        }
      };
      const limiter = new CloudflareBindingRateLimiter(mockBinding);
      const policy = { limit: 10, windowSeconds: 60 };

      const r1 = await limiter.check("test:allow:1", policy);
      expect(r1.allowed).toBe(true);
      expect(passedKey).toBe("test:allow:1");

      const r2 = await limiter.check("test:block:1", policy);
      expect(r2.allowed).toBe(false);
      expect(passedKey).toBe("test:block:1");
    });

    test("createRateLimiter selects KvRateLimiter when RATE_LIMIT_KV is present", () => {
      const mockKv: IKVNamespace = {
        async get() { return null; },
        async put() {}
      };
      const limiter = createRateLimiter({ RATE_LIMIT_KV: mockKv });
      expect(limiter).toBeInstanceOf(KvRateLimiter);
    });

    test("createRateLimiter selects CloudflareBindingRateLimiter when RATE_LIMITER is present", () => {
      const mockBinding: CloudflareRateLimiterBinding = {
        async limit() { return { success: true }; }
      };
      const limiter = createRateLimiter({ RATE_LIMITER: mockBinding });
      expect(limiter).toBeInstanceOf(CloudflareBindingRateLimiter);
    });

    test("createRateLimiter defaults to InMemoryRateLimiter when no bindings are present", () => {
      const limiter = createRateLimiter();
      expect(limiter).toBeInstanceOf(InMemoryRateLimiter);
    });
  });
});

