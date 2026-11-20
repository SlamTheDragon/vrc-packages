import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  APPROVED_PREVIEW_VPM_JOBS,
  APPROVED_PREVIEW_VPM_PROFILES,
  previewCrawlFetch,
  runPreviewLiveCrawl,
  sanitizeBinaryErrorOutput
} from "../scripts/worker-preview-live-crawl.mjs";
import { previewOrigin, requirePreviewInitialization } from "../scripts/worker-preview-init.mjs";

function validPreviewEnv(overrides: Record<string, string> = {}) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "SlamTheDragon/vrc-packages",
    VRCP_WORKER_OPERATION_ENV: "cloudflare-preview",
    GITHUB_WORKFLOW_REF: "SlamTheDragon/vrc-packages/.github/workflows/cloudflare-worker.yml@refs/tags/cloudflare-worker/v2026.10.12-pre",
    GITHUB_REF: "refs/tags/cloudflare-worker/v2026.10.12-pre",
    GITHUB_EVENT_NAME: "push",
    OPERATOR_TOKEN: "a".repeat(64),
    ...overrides
  };
}

test("requirePreviewInitialization rejects non-CI or wrong-workflow environments for live crawl", () => {
  expect(() => requirePreviewInitialization({ ...validPreviewEnv(), GITHUB_ACTIONS: "false" })).toThrow();
  expect(() => requirePreviewInitialization({ ...validPreviewEnv(), VRCP_WORKER_OPERATION_ENV: "production" })).toThrow();
  expect(() => requirePreviewInitialization({ ...validPreviewEnv(), OPERATOR_TOKEN: "short" })).toThrow();
  expect(() => requirePreviewInitialization({
    ...validPreviewEnv(),
    GITHUB_WORKFLOW_REF: "SlamTheDragon/vrc-packages/.github/workflows/other.yml@refs/heads/main"
  })).toThrow();
  expect(() => requirePreviewInitialization(validPreviewEnv())).not.toThrow();
});

test("previewCrawlFetch rejects non-preview origins and embedded credentials", async () => {
  const guarded = previewCrawlFetch(async () => new Response("{}", { status: 200 }));
  await expect(guarded("https://evil.example.invalid/v1/app/index")).rejects.toThrow("Unexpected preview live-crawl origin");
  await expect(guarded("https://user:pass@vrc-package-crawler-preview.slamthedragon.workers.dev/v1/app/index")).rejects.toThrow("Unexpected preview live-crawl origin");
  const ok = await guarded(`${previewOrigin}/v1/app/index?limit=1`);
  expect(ok.status).toBe(200);
});

test("runPreviewLiveCrawl provisions approved VPM profiles, executes compiled node without leaking secrets, and always revokes node", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-live-crawl-test-"));
  try {
    const fakeBin = join(dir, "vrcp-crawler-node-test");
    writeFileSync(fakeBin, "fake-binary");

    const calls: string[] = [];
    const createdProfiles: any[] = [];
    const seenChildEnvs: Record<string, string | undefined>[] = [];
    let issuedNodeId = "";
    let cycle = 0;

    class MockClient {
      operator = {
        sourceProfiles: {
          list: async () => ({ schemaVersion: 1, profiles: [], nextCursor: null }),
          create: async (req: any) => {
            createdProfiles.push(req);
            calls.push(`profile:${req.origin}${req.pathScope}`);
            return { schemaVersion: 1, profile: { ...req, profileId: `p-${createdProfiles.length}`, createdAt: new Date().toISOString(), disabledAt: null } };
          },
          disable: async (profileId: string, reason: string) => {
            calls.push(`disable:${profileId}:${reason}`);
            return { schemaVersion: 1, profile: { profileId } };
          }
        },
        jobs: {
          enqueue: async (req: any) => {
            calls.push(`enqueue:${req.url}`);
            return { schemaVersion: 1, jobId: `job-${calls.length}` };
          }
        },
        nodes: {
          issue: async (req: any) => {
            issuedNodeId = req.nodeId;
            calls.push(`issue:${req.capabilities.join(",")}`);
            return { schemaVersion: 1, nodeId: req.nodeId, token: `vrcp_${"b".repeat(68)}` };
          },
          revoke: async (nodeId: string, reason: string) => {
            calls.push(`revoke:${nodeId}:${reason}`);
            return { schemaVersion: 1, nodeId, status: "revoked" };
          }
        },
        leads: {
          list: async () => ({
            schemaVersion: 1,
            leads: cycle >= 2 ? [{ lead_key: "a".repeat(64), target_url: APPROVED_PREVIEW_VPM_JOBS[1].url }] : [],
            nextCursor: null
          })
        }
      };
      index = {
        query: async () => ({
          schemaVersion: 1,
          packages: cycle >= 2 ? [{ canonicalId: "com.vrchat.demo-template", displayName: "Demo Template" }] : [],
          nextCursor: null
        }),
        syncDeltas: async () => ({
          schemaVersion: 1,
          epoch: "epoch-d1-test",
          deltas: cycle >= 2 ? [{ action: "upsert", canonicalId: "com.vrchat.demo-template", updatedAt: new Date().toISOString() }] : [],
          nextCursor: null
        })
      };
    }

    const result = await runPreviewLiveCrawl(MockClient, {
      env: { ...validPreviewEnv(), CLOUDFLARE_API_TOKEN: "secret-cf", GH_TOKEN: "secret-gh" },
      binaryPath: fakeBin,
      cycleDelayMs: 0,
      maxCycles: 4,
      runBinary: (_bin: string, args: string[], opts: any) => {
        cycle++;
        calls.push(`exec:${args.join(" ")}`);
        seenChildEnvs.push(opts.env);
        return "";
      }
    });

    expect(result.executed).toBe(true);
    expect(result.cyclesRun).toBe(2);
    expect(result.nodeRevoked).toBe(true);
    expect(result.canonicalPackages).toEqual([{ canonicalId: "com.vrchat.demo-template", displayName: "Demo Template" }]);
    expect(result.deltaCount).toBe(1);
    expect(result.leadsCount).toBe(1);
    expect(createdProfiles).toHaveLength(APPROVED_PREVIEW_VPM_PROFILES.length);
    for (const req of createdProfiles) {
      expect(req.expiresInDays).toBeUndefined();
      expect(typeof req.expiresAt).toBe("string");
      expect(Date.parse(req.expiresAt)).toBeGreaterThan(Date.now());
      expect(req.publishClasses).toEqual(["normalized_facts"]);
    }
    const templateProfileReq = createdProfiles.find(p => p.origin === "https://vrchat-community.github.io");
    expect(templateProfileReq?.retainClasses).toEqual(["normalized_facts", "creator_prose"]);
    expect(templateProfileReq?.publishClasses).toEqual(["normalized_facts"]);
    expect(calls.filter(c => c.startsWith("profile:")).length).toBe(APPROVED_PREVIEW_VPM_PROFILES.length);
    expect(calls.filter(c => c.startsWith("enqueue:")).length).toBe(APPROVED_PREVIEW_VPM_JOBS.length);
    expect(calls).toContain("issue:vpm");
    expect(calls.some(c => c.startsWith(`revoke:${issuedNodeId}:`))).toBe(true);
    expect(seenChildEnvs[0].OPERATOR_TOKEN).toBeUndefined();
    expect(seenChildEnvs[0].CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(seenChildEnvs[0].GH_TOKEN).toBeUndefined();
    expect(seenChildEnvs[0].NODE_CAPABILITIES).toBe("vpm");
    expect(seenChildEnvs[0].COORDINATOR_URL).toBe(previewOrigin);

    // Even when node execution fails, ephemeral node MUST still be revoked.
    const revokeCallsOnError: string[] = [];
    class FailMockClient extends MockClient {
      operator = {
        ...this.operator,
        nodes: {
          issue: async (req: any) => ({ schemaVersion: 1, nodeId: req.nodeId, token: `vrcp_${"c".repeat(68)}` }),
          revoke: async (nodeId: string) => {
            revokeCallsOnError.push(nodeId);
            return { schemaVersion: 1, nodeId, status: "revoked" };
          }
        }
      };
    }

    await expect(runPreviewLiveCrawl(FailMockClient, {
      env: validPreviewEnv(),
      binaryPath: fakeBin,
      runBinary: () => { throw new Error("simulated crash"); }
    })).rejects.toThrow("simulated crash");
    expect(revokeCallsOnError).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runPreviewLiveCrawl replaces profiles missing creator_prose, overly wide publishClasses, and ignores exactQuery grants", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-live-crawl-replace-"));
  try {
    const fakeBin = join(dir, "vrcp-crawler-node-test");
    writeFileSync(fakeBin, "fake-binary");

    const disabledIds: string[] = [];
    const createdOrigins: { origin: string; retainClasses: string[]; publishClasses: string[] }[] = [];
    const futureIso = new Date(Date.now() + 86_400_000).toISOString();

    class ExistingProfilesClient {
      operator = {
        sourceProfiles: {
          list: async () => ({
            schemaVersion: 1,
            profiles: [
              // Matches template-package but lacks creator_prose -> MUST disable and recreate.
              {
                profileId: "prof-missing-prose",
                platform: "vpm",
                origin: "https://vrchat-community.github.io",
                pathScope: "/template-package/",
                method: "GET",
                purpose: "discovery",
                minDelayMs: 1000,
                expiresAt: futureIso,
                disabledAt: null,
                retainClasses: ["normalized_facts"],
                publishClasses: ["normalized_facts"]
              },
              // Matches template-package-listing with overly wide publishClasses -> MUST disable and recreate.
              {
                profileId: "prof-wide-publish",
                platform: "vpm",
                origin: "https://raw.githubusercontent.com",
                pathScope: "/vrchat-community/template-package-listing/",
                method: "GET",
                purpose: "discovery",
                minDelayMs: 1000,
                expiresAt: futureIso,
                disabledAt: null,
                retainClasses: ["normalized_facts"],
                publishClasses: ["normalized_facts", "creator_prose"]
              },
              // Scoped with exactQuery on template-package -> MUST NOT match or be reused.
              {
                profileId: "prof-exact-query",
                platform: "vpm",
                origin: "https://vrchat-community.github.io",
                pathScope: "/template-package/",
                exactQuery: "v=1",
                method: "GET",
                purpose: "discovery",
                minDelayMs: 1000,
                expiresAt: futureIso,
                disabledAt: null,
                retainClasses: ["normalized_facts", "creator_prose"],
                publishClasses: ["normalized_facts"]
              }
            ],
            nextCursor: null
          }),
          create: async (req: any) => {
            createdOrigins.push({ origin: req.origin, retainClasses: req.retainClasses, publishClasses: req.publishClasses });
            return { schemaVersion: 1, profile: { ...req, profileId: `new-${createdOrigins.length}`, createdAt: futureIso, disabledAt: null } };
          },
          disable: async (profileId: string) => {
            disabledIds.push(profileId);
            return { schemaVersion: 1, profile: { profileId, disabledAt: futureIso } };
          }
        },
        jobs: { enqueue: async () => ({ schemaVersion: 1, jobId: "job-1" }) },
        nodes: {
          issue: async (req: any) => ({ schemaVersion: 1, nodeId: req.nodeId, token: `vrcp_${"d".repeat(68)}` }),
          revoke: async (nodeId: string) => ({ schemaVersion: 1, nodeId, status: "revoked" })
        },
        leads: { list: async () => ({ schemaVersion: 1, leads: [{ lead_key: "a".repeat(64) }], nextCursor: null }) }
      };
      index = {
        query: async () => ({ schemaVersion: 1, packages: [{ canonicalId: "com.vrchat.demo-template", displayName: "Demo" }], nextCursor: null }),
        syncDeltas: async () => ({ schemaVersion: 1, epoch: "epoch-1", deltas: [{ action: "upsert", canonicalId: "com.vrchat.demo-template", updatedAt: futureIso }], nextCursor: null })
      };
    }

    await runPreviewLiveCrawl(ExistingProfilesClient, {
      env: validPreviewEnv(),
      binaryPath: fakeBin,
      cycleDelayMs: 0,
      maxCycles: 3,
      runBinary: () => ""
    });

    expect(disabledIds).toEqual(["prof-missing-prose", "prof-wide-publish"]);
    expect(createdOrigins).toEqual([
      { origin: "https://vrchat-community.github.io", retainClasses: ["normalized_facts", "creator_prose"], publishClasses: ["normalized_facts"] },
      { origin: "https://raw.githubusercontent.com", retainClasses: ["normalized_facts"], publishClasses: ["normalized_facts"] }
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sanitizeBinaryErrorOutput redacts credentials and bounds message length", () => {
  const noisy = `Auth failed Bearer secret-token-123 and node vrcp_${"a".repeat(68)} and app vrcp_app_xyz ` + "x".repeat(500);
  const cleaned = sanitizeBinaryErrorOutput(noisy);
  expect(cleaned).not.toContain("secret-token-123");
  expect(cleaned).not.toContain("vrcp_");
  expect(cleaned).toContain("Bearer [REDACTED]");
  expect(cleaned).toContain("[REDACTED]");
  expect(cleaned.length).toBeLessThanOrEqual(400);
});
