import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("wrangler.toml configures three isolated targets (top-level dev, env.preview, env.production)", () => {
  const config = readFileSync(resolve(import.meta.dir, "../wrangler.toml"), "utf8");

  // 1. Top-level default worker is dev
  expect(config).toMatch(/^name\s*=\s*"vrc-package-crawler-dev"/m);

  // 2. Three distinct D1 declarations all exposing VRCP_D1 without shared non-zero database IDs
  const d1Matches = [...config.matchAll(
    /\[\[(?:(env\.(?:preview|production))\.)?d1_databases\]\]\s+binding\s*=\s*"([^"]+)"\s+database_name\s*=\s*"([^"]+)"\s+database_id\s*=\s*"([^"]+)"/g
  )];
  expect(d1Matches).toHaveLength(3);
  expect(d1Matches.map((m) => m[1] ?? "top")).toEqual(["top", "env.preview", "env.production"]);
  expect(d1Matches.map((m) => m[2])).toEqual(["VRCP_D1", "VRCP_D1", "VRCP_D1"]);
  expect(d1Matches.map((m) => m[3])).toEqual([
    "vrc-package-crawler-dev",
    "vrc-package-crawler-preview",
    "vrc-package-crawler"
  ]);
  const dbIds = d1Matches.map((m) => m[4]);
  expect(new Set(dbIds).size).toBe(3);
  expect(config).not.toContain('binding = "VRCP_PREVIEW_D1"');

  // 3. Top-level dev and preview sections set VRCP_ENV="development" + localhost CORS allowlist
  const topVars = config.match(/\[vars\]\s+VRCP_ENV\s*=\s*"([^"]+)"\s+CORS_ALLOWED_ORIGINS\s*=\s*"([^"]+)"/);
  expect(topVars?.[1]).toBe("development");
  expect(topVars?.[2]).toContain("http://localhost:4321");

  expect(config).toMatch(/\[env\.preview\]\s+name\s*=\s*"vrc-package-crawler-preview"/);
  const previewVars = config.match(
    /\[env\.preview\.vars\]\s+VRCP_ENV\s*=\s*"([^"]+)"\s+CORS_ALLOWED_ORIGINS\s*=\s*"([^"]+)"/
  );
  expect(previewVars?.[1]).toBe("development");
  expect(previewVars?.[2]).toContain("http://localhost:4321");
  expect(config).toMatch(/\[\[env\.preview\.kv_namespaces\]\]\s+binding\s*=\s*"RATE_LIMIT_KV"/);

  // 4. Production target sets VRCP_ENV="production" and must NOT expose localhost CORS defaults
  expect(config).toMatch(/\[env\.production\]\s+name\s*=\s*"vrc-package-crawler"/);
  const prodSection = config.slice(config.indexOf("[env.production]"));
  expect(prodSection).toMatch(/\[env\.production\.vars\]\s+VRCP_ENV\s*=\s*"production"/);
  expect(prodSection).not.toContain("CORS_ALLOWED_ORIGINS");
  expect(prodSection).not.toContain("localhost");
  expect(prodSection).not.toContain("127.0.0.1");
});
