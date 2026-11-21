import { describe, expect, test } from "bun:test";
import worker, { type Env } from "../src/worker_entry.ts";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { RATE_LIMIT_POLICIES, defaultRateLimiter } from "../src/api/rate_limiter.ts";
import { parseAllowedOrigins } from "../src/api/cors.ts";

const operatorToken = "a".repeat(64);
const allowedOrigins = "http://localhost:4321,http://127.0.0.1:4321,https://admin.vrcpackages.example";

describe("Origin-Validated Browser CORS and OPTIONS Preflight (R47-C27-CORS)", () => {
  test("parseAllowedOrigins normalizes exact http/https origins and rejects paths or malformed entries", () => {
    const parsed = parseAllowedOrigins(
      " http://localhost:4321 , https://admin.vrcpackages.example/path , ftp://bad.example , not-a-url , http://127.0.0.1:4173 "
    );
    expect([...parsed]).toEqual(["http://localhost:4321", "http://127.0.0.1:4173"]);
  });

  test("allowlisted OPTIONS preflight on authenticated routes returns 204 before auth with ACAO and Vary: Origin", async () => {
    const store = await createInitializedD1Coordinator();
    const env: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken,
      CORS_ALLOWED_ORIGINS: allowedOrigins
    };
    try {
      for (const path of [
        "/v1/operator/catalog",
        "/v1/operator/init",
        "/v1/moderator/ratings",
        "/v1/user/apps",
        "/v1/app/register",
        "/v1/app/report",
        "/v1/app/index/search",
        "/v1/app/claims/intake"
      ]) {
        const res = await worker.fetch(
          new Request(`https://worker.example${path}`, {
            method: "OPTIONS",
            headers: {
              Origin: "http://localhost:4321",
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "Authorization, Content-Type"
            }
          }),
          env
        );
        expect(res.status).toBe(204);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4321");
        expect(res.headers.get("Vary")).toBe("Origin");
        expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
        expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
        expect(res.headers.get("Access-Control-Max-Age")).toBe("600");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
      }
    } finally {
      store.close();
    }
  });

  test("unlisted, missing, or unconfigured Origin OPTIONS preflight on authenticated routes returns 403 cors_origin_forbidden without ACAO", async () => {
    const store = await createInitializedD1Coordinator();
    const envWithAllowlist: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken,
      CORS_ALLOWED_ORIGINS: allowedOrigins
    };
    const envUnset: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken
    };
    try {
      for (const [targetEnv, originHeader] of [
        [envWithAllowlist, "https://evil.example"],
        [envWithAllowlist, null],
        [envUnset, "http://localhost:4321"]
      ] as const) {
        const headers = new Headers();
        if (originHeader) headers.set("Origin", originHeader);
        const res = await worker.fetch(
          new Request("https://worker.example/v1/operator/catalog", {
            method: "OPTIONS",
            headers
          }),
          targetEnv
        );
        expect(res.status).toBe(403);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
        expect(res.headers.get("Vary")).toBe("Origin");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(await res.json()).toEqual({
          schemaVersion: 1,
          code: "cors_origin_forbidden",
          error: "Origin not allowed"
        });
      }
    } finally {
      store.close();
    }
  });

  test("allowlisted GET/POST and 401/429 responses on authenticated routes include exact ACAO, Expose-Headers, and Vary: Origin", async () => {
    const store = await createInitializedD1Coordinator();
    const env: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken,
      CORS_ALLOWED_ORIGINS: allowedOrigins
    };
    defaultRateLimiter.reset();
    try {
      const okRes = await worker.fetch(
        new Request("https://worker.example/v1/operator/catalog", {
          method: "GET",
          headers: {
            Origin: "https://admin.vrcpackages.example",
            Authorization: `Bearer ${operatorToken}`
          }
        }),
        env
      );
      expect(okRes.status).toBe(200);
      expect(okRes.headers.get("Access-Control-Allow-Origin")).toBe("https://admin.vrcpackages.example");
      expect(okRes.headers.get("Access-Control-Expose-Headers")).toBe(
        "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
      );
      expect(okRes.headers.get("Vary")).toBe("Origin");

      const unauthRes = await worker.fetch(
        new Request("https://worker.example/v1/operator/catalog", {
          method: "GET",
          headers: {
            Origin: "http://localhost:4321"
          }
        }),
        env
      );
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4321");
      expect(unauthRes.headers.get("Access-Control-Expose-Headers")).toBe(
        "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
      );
      expect(unauthRes.headers.get("Vary")).toBe("Origin");

      const user = await store.issueUserToken("cors-app-owner");
      const regRes = await worker.fetch(
        new Request("https://worker.example/v1/app/register", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:4321",
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
            "cf-connecting-ip": "203.0.113.77"
          },
          body: JSON.stringify({ schemaVersion: 1, appName: "CORS Registered App" })
        }),
        env
      );
      expect(regRes.status).toBe(201);
      expect(regRes.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:4321");
      expect(regRes.headers.get("Vary")).toBe("Origin");

      for (let i = 0; i < RATE_LIMIT_POLICIES.APP_REGISTER.limit; i++) {
        defaultRateLimiter.check("app:register:203.0.113.88", RATE_LIMIT_POLICIES.APP_REGISTER);
      }
      const rateLimitedRes = await worker.fetch(
        new Request("https://worker.example/v1/app/register", {
          method: "POST",
          headers: {
            Origin: "http://localhost:4321",
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
            "cf-connecting-ip": "203.0.113.88"
          },
          body: JSON.stringify({ schemaVersion: 1, appName: "Rate Limited App" })
        }),
        env
      );
      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4321");
      expect(rateLimitedRes.headers.get("Access-Control-Expose-Headers")).toBe(
        "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
      );
      expect(rateLimitedRes.headers.get("Vary")).toBe("Origin");
    } finally {
      defaultRateLimiter.reset();
      store.close();
    }
  });

  test("unlisted or absent Origin on GET /v1/operator/catalog and POST /v1/app/report emits zero ACAO header", async () => {
    const store = await createInitializedD1Coordinator();
    const env: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken,
      CORS_ALLOWED_ORIGINS: allowedOrigins
    };
    try {
      for (const originHeader of ["https://unlisted.example", null]) {
        const headers = new Headers({ Authorization: `Bearer ${operatorToken}` });
        if (originHeader) headers.set("Origin", originHeader);
        const res = await worker.fetch(
          new Request("https://worker.example/v1/operator/catalog", {
            method: "GET",
            headers
          }),
          env
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      }
    } finally {
      store.close();
    }
  });

  test("node lease routes (/v1/node/*) remain strictly non-CORS on POST and OPTIONS", async () => {
    const store = await createInitializedD1Coordinator();
    const env: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken,
      CORS_ALLOWED_ORIGINS: allowedOrigins
    };
    try {
      const optRes = await worker.fetch(
        new Request("https://worker.example/v1/node/jobs/claim", {
          method: "OPTIONS",
          headers: { Origin: "http://localhost:4321" }
        }),
        env
      );
      expect(optRes.status).toBe(404);
      expect(optRes.headers.get("Access-Control-Allow-Origin")).toBeNull();

      const postRes = await worker.fetch(
        new Request("https://worker.example/v1/node/jobs/claim", {
          method: "POST",
          headers: {
            Origin: "http://localhost:4321",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ schemaVersion: 1, nodeId: "node-1", capabilities: ["vpm"] })
        }),
        env
      );
      expect(postRes.status).toBe(401);
      expect(postRes.headers.get("Access-Control-Allow-Origin")).toBeNull();
    } finally {
      store.close();
    }
  });

  test("public catalog routes (/v1/app/index and /v1/app/index/delta) preserve wildcard ACAO on GET and OPTIONS", async () => {
    const store = await createInitializedD1Coordinator();
    const env: Env = {
      VRCP_D1: store.db as unknown as D1Database,
      OPERATOR_TOKEN: operatorToken
    };
    try {
      for (const path of ["/v1/app/index", "/v1/app/index/delta"]) {
        const optRes = await worker.fetch(
          new Request(`https://worker.example${path}`, {
            method: "OPTIONS",
            headers: { Origin: "https://any-public-reader.example" }
          }),
          env
        );
        expect(optRes.status).toBe(204);
        expect(optRes.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(optRes.headers.get("Access-Control-Allow-Methods")).toBe("GET, OPTIONS");
        expect(optRes.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
        expect(optRes.headers.get("Access-Control-Max-Age")).toBe("600");
        expect(optRes.headers.get("Cache-Control")).toBe("public, max-age=60");

        const getRes = await worker.fetch(
          new Request(`https://worker.example${path}`, {
            method: "GET",
            headers: { Origin: "https://any-public-reader.example" }
          }),
          env
        );
        expect(getRes.status).toBe(200);
        expect(getRes.headers.get("Access-Control-Allow-Origin")).toBe("*");
      }
    } finally {
      store.close();
    }
  });
});
