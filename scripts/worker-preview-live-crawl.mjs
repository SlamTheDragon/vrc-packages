import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { previewOrigin, requirePreviewInitialization } from "./worker-preview-init.mjs";

export const APPROVED_PREVIEW_VPM_PROFILES = [
  {
    platform: "vpm",
    hostMatchMode: "exact",
    hostPattern: "vrchat-community.github.io",
    pathScope: "/template-package/",
    queryMode: "none",
    method: "GET",
    purpose: "discovery",
    autoPromote: false,
    recrawlIntervalMs: 21_600_000,
    minDelayMs: 1000,
    maxPaginationDepth: 5,
    expiresInDays: 7,
    reviewReference: "COMMUNITY-VPM-TEMPLATE",
    reason: "Approved open VPM community template package listing",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "vpm",
    hostMatchMode: "exact",
    hostPattern: "raw.githubusercontent.com",
    pathScope: "/vrchat-community/template-package-listing/",
    queryMode: "none",
    method: "GET",
    purpose: "discovery",
    autoPromote: false,
    recrawlIntervalMs: 21_600_000,
    minDelayMs: 1000,
    maxPaginationDepth: 5,
    expiresInDays: 7,
    reviewReference: "COMMUNITY-VPM-LISTING",
    reason: "Approved open VPM community template package listing source",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  }
];

export const APPROVED_PREVIEW_VPM_JOBS = [
  {
    url: "https://vrchat-community.github.io/template-package/index.json",
    platform: "vpm",
    purpose: "discovery",
    minDelayMs: 1000,
    reason: "Live preview crawl verification (FLEET-S2 template-package)"
  },
  {
    url: "https://raw.githubusercontent.com/vrchat-community/template-package-listing/main/source.json",
    platform: "vpm",
    purpose: "discovery",
    minDelayMs: 1000,
    reason: "Live preview crawl verification (FLEET-S2 template-package-listing)"
  }
];

export function defaultCrawlerBinaryPath(platform = process.platform) {
  const filename = platform === "win32" ? "vrcp-crawler-node.exe" : "vrcp-crawler-node-linux";
  return fileURLToPath(new URL(`../src-crawler/dist/dev/${filename}`, import.meta.url));
}

export function previewCrawlFetch(request = fetch, expectedOrigin = previewOrigin) {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== expectedOrigin || url.username || url.password || url.hash) {
      throw new Error("Unexpected preview live-crawl origin");
    }
    return request(url.href, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30_000)
    });
  };
}

function minimalNodeEnvironment(baseEnv, overrides) {
  const safe = {};
  for (const key of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "COMSPEC", "ComSpec", "WINDIR", "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE"]) {
    if (baseEnv[key]) safe[key] = baseEnv[key];
  }
  return { ...safe, ...overrides, NO_COLOR: "1" };
}

export function sanitizeBinaryErrorOutput(raw) {
  if (typeof raw !== "string" || !raw) return "";
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/vrcp_[A-Za-z0-9_]+/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function readBoundedProcessStream(stream) {
  if (typeof stream === "string") return stream;
  if (Buffer.isBuffer(stream)) return stream.toString("utf8");
  return "";
}

function defaultRunBinary(binaryPath, args, { cwd, env }) {
  try {
    return execFileSync(binaryPath, args, {
      cwd,
      env,
      encoding: "utf8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const status = typeof error?.status === "number" ? error.status : "unknown";
    const stderr = sanitizeBinaryErrorOutput(readBoundedProcessStream(error?.stderr));
    const stdout = sanitizeBinaryErrorOutput(readBoundedProcessStream(error?.stdout));
    const excerpt = stderr || stdout || sanitizeBinaryErrorOutput(error instanceof Error ? error.message : String(error));
    throw new Error(`Crawler binary exited with status ${status}${excerpt ? `: ${excerpt}` : ""}`);
  }
}

function sameClassSet(actual, expected) {
  const left = [...new Set(Array.isArray(actual) ? actual : [])].sort();
  const right = [...new Set(Array.isArray(expected) ? expected : [])].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function runPreviewLiveCrawl(Client, options = {}) {
  const {
    env = process.env,
    request = fetch,
    baseUrl = previewOrigin,
    binaryPath = defaultCrawlerBinaryPath(),
    maxCycles = 8,
    cycleDelayMs = 1500,
    requireGuard = requirePreviewInitialization,
    runBinary = defaultRunBinary,
    wait = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms))
  } = options;

  if (!options.allowCustomBaseUrl && baseUrl !== previewOrigin) {
    throw new Error("Preview live crawl must target the approved preview worker origin");
  }
  requireGuard(env);

  const resolvedBinary = resolve(binaryPath);
  if (!existsSync(resolvedBinary) || !statSync(resolvedBinary).isFile()) {
    throw new Error("Compiled crawler node binary is missing; build it before running live preview verification");
  }

  const client = new Client({
    baseUrl,
    operatorToken: env.OPERATOR_TOKEN,
    fetch: previewCrawlFetch(request, new URL(baseUrl).origin)
  });

  const existingList = [];
  let profileCursor;
  for (let page = 0; page < 5; page++) {
    const existingProfiles = await client.operator.steeringProfiles.list({
      limit: 100,
      ...(profileCursor ? { cursor: profileCursor } : {})
    });
    if (Array.isArray(existingProfiles?.profiles)) {
      existingList.push(...existingProfiles.profiles);
    }
    if (!existingProfiles?.nextCursor) break;
    profileCursor = existingProfiles.nextCursor;
  }

  const nowMs = Date.now();
  for (const profile of APPROVED_PREVIEW_VPM_PROFILES) {
    const activeMatches = existingList.filter(
      p => p.disabledAt === null &&
        Date.parse(p.expiresAt) > nowMs &&
        p.platform === profile.platform &&
        p.hostMatchMode === profile.hostMatchMode &&
        p.hostPattern === profile.hostPattern &&
        p.pathScope === profile.pathScope &&
        p.queryMode === profile.queryMode &&
        !p.queryScope &&
        p.purpose === profile.purpose
    );
    const reusable = activeMatches.find(
      match =>
        profile.retainClasses.every(c => (match.retainClasses ?? []).includes(c)) &&
        sameClassSet(match.publishClasses, profile.publishClasses)
    );
    if (!reusable) {
      for (const stale of activeMatches) {
        await client.operator.steeringProfiles.disable(
          stale.profileId,
          "Replacing preview live crawl profile with required retention and publication classes"
        );
      }
      const { expiresInDays, ...profilePayload } = profile;
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
      await client.operator.steeringProfiles.create({ schemaVersion: 1, ...profilePayload, expiresAt });
    }
  }

  const enqueuedJobs = [];
  for (const job of APPROVED_PREVIEW_VPM_JOBS) {
    const enqueued = await client.operator.jobs.enqueue({ schemaVersion: 1, ...job });
    if (typeof client.operator.jobs.requeue === "function") {
      await client.operator.jobs.requeue(enqueued.jobId, {
        priorityLane: 1,
        reason: "Force fresh preview live crawl verification"
      });
    }
    enqueuedJobs.push(enqueued.jobId);
  }

  const nodeId = `ci-preview-probe-${randomBytes(6).toString("hex")}`;
  const issued = await client.operator.nodes.issue({
    schemaVersion: 1,
    nodeId,
    reason: "Ephemeral CI preview live crawl proof"
  });

  const scratchDir = mkdtempSync(join(tmpdir(), "vrcp-live-crawl-"));
  const dbPath = join(scratchDir, "node.db");
  let cyclesRun = 0;
  let indexResult = { packages: [] };
  let deltaResult = { deltas: [] };
  let leadsResult = { leads: [] };
  let nodeRevoked = false;
  let nodePruned = false;

  try {
    const childEnv = minimalNodeEnvironment(env, {
      NODE_ID: nodeId,
      NODE_TOKEN: issued.token,
      COORDINATOR_URL: baseUrl,
      NODE_CAPABILITIES: "vpm",
      NODE_DB_PATH: dbPath,
      HOME: scratchDir
    });

    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      cyclesRun = cycle;
      runBinary(resolvedBinary, ["--once"], { cwd: scratchDir, env: childEnv });
      indexResult = await client.index.query({ limit: 50 });
      deltaResult = await client.index.syncDeltas({ limit: 50 });
      leadsResult = await client.operator.leads.list({ limit: 50 });
      if (cycle >= 2 &&
          (indexResult.packages?.length ?? 0) > 0 &&
          (deltaResult.deltas?.length ?? 0) > 0 &&
          (leadsResult.leads?.length ?? 0) > 0) {
        break;
      }
      if (cycle < maxCycles && cycleDelayMs > 0) {
        await wait(cycleDelayMs);
      }
    }
  } finally {
    try {
      const revoked = await client.operator.nodes.revoke(nodeId, "CI preview live crawl verification completed");
      nodeRevoked = revoked?.status === "revoked" || revoked?.nodeId === nodeId;
      if (nodeRevoked && typeof client.operator.nodes.prune === "function") {
        const pruned = await client.operator.nodes.prune(nodeId, "Prune ephemeral CI preview live crawl probe node");
        nodePruned = pruned?.status === "pruned" || pruned?.nodeId === nodeId;
      }
    } catch {
      nodeRevoked = false;
      nodePruned = false;
    }
    rmSync(scratchDir, { recursive: true, force: true });
  }

  if (!(indexResult.packages?.length > 0) || !(deltaResult.deltas?.length > 0)) {
    throw new Error(`Preview live crawl produced insufficient canonical data (packages=${indexResult.packages?.length ?? 0}, deltas=${deltaResult.deltas?.length ?? 0})`);
  }

  return {
    target: baseUrl,
    executed: true,
    cyclesRun,
    nodeId,
    nodeRevoked,
    nodePruned,
    enqueuedJobs,
    canonicalPackages: indexResult.packages.map(item => ({ canonicalId: item.canonicalId, displayName: item.displayName })),
    deltaCount: deltaResult.deltas.length,
    leadsCount: leadsResult.leads?.length ?? 0
  };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.log(JSON.stringify({
        purpose: "plan-only",
        target: previewOrigin,
        binary: defaultCrawlerBinaryPath(),
        sources: APPROVED_PREVIEW_VPM_JOBS.map(j => j.url),
        next: "Pass --execute in CI preview environment to run live crawler verification"
      }));
    } else if (args.length === 1 && args[0] === "--execute") {
      requirePreviewInitialization(process.env);
      const workerDirectory = fileURLToPath(new URL("../src-worker/", import.meta.url));
      const { VRCPackageClient } = await import(pathToFileURL(Bun.resolveSync("vrc-packages-api", workerDirectory)).href);
      console.log(JSON.stringify(await runPreviewLiveCrawl(VRCPackageClient, { env: process.env })));
    } else {
      throw new Error("Usage: bun scripts/worker-preview-live-crawl.mjs [--execute]");
    }
  } catch (error) {
    console.error("Preview live crawl verification failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  }
}
