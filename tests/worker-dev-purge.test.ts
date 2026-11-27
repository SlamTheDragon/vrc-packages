import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  DEFAULT_LOCAL_DEV_ORIGIN,
  PURGE_CONFIRMATION_TOKEN,
  executeDevPurge,
  parsePurgeArgs,
  purgeFetch,
  validatePurgeTarget
} from "../scripts/worker-dev-purge.mjs";
import { previewOrigin } from "../scripts/worker-preview-init.mjs";

const VALID_OPERATOR_TOKEN = "a".repeat(64);

test("validatePurgeTarget accepts loopback HTTP and preview origin, rejecting production and foreign URLs", () => {
  expect(validatePurgeTarget("http://127.0.0.1:8787")).toEqual({
    origin: "http://127.0.0.1:8787",
    isPreview: false
  });
  expect(validatePurgeTarget("http://localhost:8787/")).toEqual({
    origin: "http://localhost:8787",
    isPreview: false
  });
  expect(validatePurgeTarget(previewOrigin)).toEqual({
    origin: previewOrigin,
    isPreview: true
  });

  for (const invalid of [
    "not-a-url",
    "https://vrc-package-crawler.slamthedragon.workers.dev",
    "https://evil.example.invalid",
    "https://127.0.0.1:8787",
    "http://user:pass@127.0.0.1:8787",
    "http://127.0.0.1:8787/extra",
    "http://127.0.0.1:8787/?confirm=1",
    `${previewOrigin}#frag`
  ]) {
    expect(() => validatePurgeTarget(invalid)).toThrow();
  }
});

test("parsePurgeArgs parses plan-only and execute flags cleanly and rejects invalid options", () => {
  expect(parsePurgeArgs([])).toEqual({
    execute: false,
    target: DEFAULT_LOCAL_DEV_ORIGIN,
    preserveNodes: true,
    seedPreviewStarter: false,
    confirm: ""
  });
  expect(
    parsePurgeArgs([
      "--execute",
      "--target",
      "http://localhost:8788",
      "--confirm",
      PURGE_CONFIRMATION_TOKEN,
      "--seed-starter",
      "--drop-nodes"
    ])
  ).toEqual({
    execute: true,
    target: "http://localhost:8788",
    preserveNodes: false,
    seedPreviewStarter: true,
    confirm: PURGE_CONFIRMATION_TOKEN
  });

  expect(() => parsePurgeArgs(["--unknown"])).toThrow();
  expect(() => parsePurgeArgs(["--target"])).toThrow();
  expect(() => parsePurgeArgs(["--confirm"])).toThrow();
});

test("purgeFetch allows only GET status and confirmed POST purge without redirects", async () => {
  const seen: string[] = [];
  const fetchMock = purgeFetch(async (url, init: any) => {
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    seen.push(`${init.method}:${url}`);
    return Response.json({ status: "ok" });
  }, DEFAULT_LOCAL_DEV_ORIGIN);

  expect((await fetchMock(`${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/status`, { method: "GET" })).status).toBe(200);
  expect(
    (
      await fetchMock(`${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/system/purge`, {
        method: "POST",
        body: JSON.stringify({ schemaVersion: 1, confirm: PURGE_CONFIRMATION_TOKEN })
      })
    ).status
  ).toBe(200);
  expect(seen).toEqual([
    `${"GET"}:${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/status`,
    `${"POST"}:${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/system/purge`
  ]);

  await expect(fetchMock(`${previewOrigin}/v1/operator/status`, { method: "GET" })).rejects.toThrow(
    "Unexpected development purge request"
  );
  await expect(fetchMock(`${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/jobs`, { method: "GET" })).rejects.toThrow(
    "Unexpected development purge request"
  );
  await expect(
    fetchMock(`${DEFAULT_LOCAL_DEV_ORIGIN}/v1/operator/system/purge`, {
      method: "POST",
      body: JSON.stringify({ schemaVersion: 1, confirm: "WRONG" })
    })
  ).rejects.toThrow("explicit confirmation");
});

test("executeDevPurge fails closed on missing secrets, wrong confirm, production status, and unapproved preview", async () => {
  await expect(
    executeDevPurge(class {}, {
      env: { OPERATOR_TOKEN: "short" },
      confirm: PURGE_CONFIRMATION_TOKEN
    })
  ).rejects.toThrow("64-hex OPERATOR_TOKEN");

  await expect(
    executeDevPurge(class {}, {
      env: { OPERATOR_TOKEN: VALID_OPERATOR_TOKEN },
      confirm: "WRONG"
    })
  ).rejects.toThrow("explicit --confirm");

  await expect(
    executeDevPurge(class {}, {
      env: { OPERATOR_TOKEN: VALID_OPERATOR_TOKEN },
      target: previewOrigin,
      confirm: PURGE_CONFIRMATION_TOKEN,
      requirePreviewGuard: () => {
        throw new Error("Preview guard blocked");
      }
    })
  ).rejects.toThrow("Preview guard blocked");

  let purgeCalled = false;
  class ProdStatusClient {
    operator = {
      status: async () => ({ environment: "production", purgeEnabled: true }),
      systemPurge: async () => {
        purgeCalled = true;
        return {};
      }
    };
  }
  await expect(
    executeDevPurge(ProdStatusClient, {
      env: { OPERATOR_TOKEN: VALID_OPERATOR_TOKEN },
      confirm: PURGE_CONFIRMATION_TOKEN
    })
  ).rejects.toThrow("production or purge disabled");
  expect(purgeCalled).toBe(false);

  class DisabledPurgeClient {
    operator = {
      status: async () => ({ environment: "development", purgeEnabled: false }),
      systemPurge: async () => {
        purgeCalled = true;
        return {};
      }
    };
  }
  await expect(
    executeDevPurge(DisabledPurgeClient, {
      env: { OPERATOR_TOKEN: VALID_OPERATOR_TOKEN },
      confirm: PURGE_CONFIRMATION_TOKEN
    })
  ).rejects.toThrow("production or purge disabled");
  expect(purgeCalled).toBe(false);
});

test("executeDevPurge verifies development status then calls systemPurge with starter seed flag", async () => {
  const calls: unknown[] = [];
  class OkClient {
    constructor(opts: any) {
      calls.push({ baseUrl: opts.baseUrl, hasToken: opts.operatorToken === VALID_OPERATOR_TOKEN });
    }
    operator = {
      status: async () => {
        calls.push("status");
        return {
          schemaVersion: 1,
          environment: "development",
          purgeEnabled: true,
          d1SchemaState: "v0-17"
        };
      },
      systemPurge: async (req: unknown) => {
        calls.push(req);
        return {
          schemaVersion: 1,
          status: "purged",
          d1SchemaState: "v0-17",
          preservedNodes: 2,
          seededProfiles: 16
        };
      }
    };
  }

  const result = await executeDevPurge(OkClient, {
    env: { OPERATOR_TOKEN: VALID_OPERATOR_TOKEN },
    target: DEFAULT_LOCAL_DEV_ORIGIN,
    confirm: PURGE_CONFIRMATION_TOKEN,
    preserveNodes: true,
    seedPreviewStarter: true
  });

  expect(result).toEqual({
    target: DEFAULT_LOCAL_DEV_ORIGIN,
    environment: "development",
    status: "purged",
    d1SchemaState: "v0-17",
    preservedNodes: 2,
    seededProfiles: 16
  });
  expect(calls).toEqual([
    { baseUrl: DEFAULT_LOCAL_DEV_ORIGIN, hasToken: true },
    "status",
    {
      schemaVersion: 1,
      confirm: PURGE_CONFIRMATION_TOKEN,
      preserveNodes: true,
      seedPreviewStarter: true
    }
  ]);
});

test("CLI plans safely without secrets and redacts OPERATOR_TOKEN on failure", () => {
  const secretToken = "f".repeat(64);
  const plan = spawnSync("bun", ["scripts/worker-dev-purge.mjs"], {
    encoding: "utf8",
    env: { ...process.env, OPERATOR_TOKEN: secretToken }
  });
  expect(plan.status).toBe(0);
  expect(JSON.parse(plan.stdout)).toMatchObject({
    purpose: "plan-only",
    target: DEFAULT_LOCAL_DEV_ORIGIN,
    preserveNodes: true,
    seedPreviewStarter: false
  });
  expect(plan.stdout + plan.stderr).not.toContain(secretToken);

  const denied = spawnSync("bun", ["scripts/worker-dev-purge.mjs", "--execute", "--confirm", "WRONG"], {
    encoding: "utf8",
    env: { ...process.env, OPERATOR_TOKEN: secretToken }
  });
  expect(denied.status).toBe(1);
  expect(denied.stdout + denied.stderr).not.toContain(secretToken);
});
