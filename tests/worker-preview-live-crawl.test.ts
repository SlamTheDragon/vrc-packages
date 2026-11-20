import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  APPROVED_PREVIEW_VPM_JOBS,
  APPROVED_PREVIEW_VPM_PROFILES,
  previewCrawlFetch,
  runPreviewLiveCrawl
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
    const seenChildEnvs: Record<string, string | undefined>[] = [];
    let issuedNodeId = "";
    let cycle = 0;

    class MockClient {
      operator = {
        sourceProfiles: {
          list: async () => ({ items: [] }),
          create: async (req: any) => {
            calls.push(`profile:${req.origin}${req.pathScope}`);
            return req;
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
          list: async () => ({ items: [{ url: APPROVED_PREVIEW_VPM_JOBS[1].url }] })
        }
      };
      index = {
        query: async () => ({
          schemaVersion: 1,
          items: cycle >= 2 ? [{ canonicalId: "com.vrchat.demo-template", displayName: "Demo Template" }] : []
        }),
        syncDeltas: async () => ({
          schemaVersion: 1,
          entries: cycle >= 2 ? [{ canonicalId: "com.vrchat.demo-template", version: "1.0.0" }] : []
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
