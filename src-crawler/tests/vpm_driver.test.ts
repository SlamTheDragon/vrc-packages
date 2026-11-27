import { describe, expect, test } from "bun:test";
import { CrawlJobSchema } from "vrc-packages-network/node";
import { defaultDriverContext } from "../src/adapters/observation_adapter.ts";
import { VpmDriver } from "../src/drivers/vpm_driver.ts";

describe("VpmDriver bounded releases and yank filtering", () => {
  const driver = new VpmDriver();
  const baseJob = CrawlJobSchema.parse({
    jobId: "vpm-job-1",
    leaseId: "11111111-1111-4111-8111-111111111111",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    platform: "vpm",
    purpose: "metadata",
    url: "https://example.vpm.dev/vpm.json",
    origin: "https://example.vpm.dev",
    maxPaginationDepth: 0,
    retainClasses: ["normalized_facts", "creator_prose"],
    etag: null,
    lastModified: null
  });

  test("retains newest 20 valid SemVer releases for packages with >100 versions instead of dropping as invalid_package", () => {
    const versions: Record<string, unknown> = {};
    for (let i = 0; i < 150; i++) {
      const ver = `1.${Math.floor(i / 20)}.${i % 20}`;
      versions[ver] = {
        name: "com.example.mature-optimizer",
        version: ver,
        displayName: "Mature Optimizer",
        description: "Non-destructive avatar optimization tool",
        author: "creator",
        url: `https://example.vpm.dev/pkg-${ver}.zip`,
        zipSHA256: "a".repeat(64)
      };
    }

    const body = JSON.stringify({
      name: "Example Repo",
      url: "https://example.vpm.dev/vpm.json",
      packages: { "com.example.mature-optimizer": { versions } }
    });

    const outcome = driver.parseResponse(baseJob, body, "application/json", defaultDriverContext);
    expect(outcome.kind).toBe("batch");
    if (outcome.kind !== "batch") throw new Error("Expected batch outcome");
    expect(outcome.observations).toHaveLength(1);
    const obs = outcome.observations[0]!;
    expect(obs.sourceItemKey).toBe("com.example.mature-optimizer");
    expect(obs.releases).toHaveLength(20);
    expect(obs.releases?.[0]?.version).toBe("1.7.9");
  });

  test("filters yanked DO NOT INSTALL packages out of active observations as accounted issues", () => {
    const body = JSON.stringify({
      name: "Example Repo",
      url: "https://example.vpm.dev/vpm.json",
      packages: {
        "com.example.good": {
          versions: {
            "1.0.0": {
              name: "com.example.good",
              version: "1.0.0",
              displayName: "Good Package",
              description: "Healthy active tool",
              author: "creator",
              url: "https://example.vpm.dev/good-1.0.0.zip",
              zipSHA256: "b".repeat(64)
            }
          }
        },
        "com.example.yanked-stub": {
          versions: {
            "3.0.3": {
              name: "com.example.yanked-stub",
              version: "3.0.3",
              displayName: "DO NOT INSTALL THIS PACKAGE. THIS IS ONLY FOR COMPATIBILITY UNTIL VRCHAT SUPPORTS YANK.",
              description: "Deprecated stub",
              author: "creator",
              "vrc-get": { yanked: "This package is discontinued." },
              url: "https://example.vpm.dev/yanked-3.0.3.zip",
              zipSHA256: "c".repeat(64)
            }
          }
        }
      }
    });

    const outcome = driver.parseResponse(baseJob, body, "application/json", defaultDriverContext);
    expect(outcome.kind).toBe("partial_batch");
    if (outcome.kind !== "partial_batch") throw new Error("Expected partial_batch outcome");
    expect(outcome.observations.map((o) => o.sourceItemKey)).toEqual(["com.example.good"]);
    expect(outcome.issues).toContainEqual({
      sourceItemKey: "com.example.yanked-stub",
      version: "3.0.3",
      code: "invalid_package"
    });
  });

  test("bounds oversized repository outcomes under 240_000 bytes by trimming releases per package", () => {
    const packages: Record<string, unknown> = {};
    for (let p = 0; p < 50; p++) {
      const id = `com.example.pkg${p}`;
      const versions: Record<string, unknown> = {};
      for (let v = 0; v < 20; v++) {
        const ver = `1.0.${v}`;
        versions[ver] = {
          name: id,
          version: ver,
          displayName: `Package ${p} Title`,
          description: "D".repeat(900),
          author: "creator",
          vpmDependencies: {
            "com.vrchat.avatars": ">=3.7.0",
            "nadena.dev.ndmf": ">=1.5.0"
          },
          url: `https://example.vpm.dev/${id}-${ver}-very-long-download-path-segment-${"x".repeat(60)}.zip`,
          zipSHA256: "d".repeat(64)
        };
      }
      packages[id] = { versions };
    }

    const body = JSON.stringify({ name: "Heavy Repo", packages });
    const outcome = driver.parseResponse(baseJob, body, "application/json", defaultDriverContext);
    expect(outcome.kind).toBe("batch");
    if (outcome.kind !== "batch") throw new Error("Expected trimmed batch outcome");
    expect(JSON.stringify(outcome).length).toBeLessThanOrEqual(240_000);
    expect(outcome.observations).toHaveLength(50);
    expect((outcome.observations[0]?.releases?.length ?? 99) <= 5).toBe(true);
  });
});
