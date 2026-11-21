import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  BatchResultRequestSchema,
  BatchResultResponseSchema,
  ClaimRequestSchema,
  ClaimResponseSchema,
  CrawlJobSchema,
  HeartbeatRequestSchema,
  HeartbeatResponseSchema,
  NodeRobotsClaimRequestSchema,
  NodeRobotsClaimResponseSchema,
  PROTOCOL_VERSION,
  ResultRequestSchema,
  ResultResponseSchema,
  type BatchResultRequest,
  type CrawlJob,
  type ResultRequest
} from "vrc-packages-network/node";

const mainScript = resolve(import.meta.dir, "../src/main.ts");
const NODE_ALPHA_ID = "node-alpha";
const NODE_BETA_ID = "node-beta";
const NODE_ALPHA_TOKEN = "vrcp_" + "a".repeat(64) + "0001";
const NODE_BETA_TOKEN = "vrcp_" + "b".repeat(64) + "0001";

async function deadline<T>(promise: Promise<T>, message: string, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createFixtureDir(prefix: string): { root: string; directory: string } {
  const root = resolve(import.meta.dir, "../dist/tests/fleet-multiprocess");
  mkdirSync(root, { recursive: true });
  const realRoot = realpathSync(root);
  const directory = mkdtempSync(join(realRoot, prefix));
  return { root: realRoot, directory };
}

function cleanFixtureDir(root: string, directory: string): void {
  if (!realpathSync(directory).startsWith(root + sep)) {
    throw new Error("Unexpected fixture directory path");
  }
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

function spawnNodeOnce(params: {
  cwd: string;
  nodeId: string;
  token: string;
  coordinatorUrl: string;
  dbPath: string;
  logsDir: string;
}) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|localappdata|home|userprofile)$/i.test(key) && value) {
      env[key] = value;
    }
  }
  Object.assign(env, {
    NODE_ID: params.nodeId,
    NODE_TOKEN: params.token,
    COORDINATOR_URL: params.coordinatorUrl,
    NODE_DB_PATH: params.dbPath,
    NODE_CAPABILITIES: "vpm",
    CRAWLER_LOGS_DIR: params.logsDir
  });

  const child = Bun.spawn([process.execPath, mainScript, "--once"], {
    cwd: params.cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    child,
    stdout: new Response(child.stdout).text(),
    stderr: new Response(child.stderr).text()
  };
}

describe("multi-process separate-node fleet transport and crash-restart outbox replay", () => {
  test("Test 1 (R48-C28): concurrent separate-node processes enforce origin-lease mutual exclusion with zero duplicate fetches", async () => {
    const { root, directory } = createFixtureDir("vrcp-fleet-mutex-");
    const alphaDir = join(directory, "alpha");
    const betaDir = join(directory, "beta");
    mkdirSync(alphaDir, { recursive: true });
    mkdirSync(betaDir, { recursive: true });
    const alphaDbPath = join(alphaDir, "node-a.db");
    const betaDbPath = join(betaDir, "node-b.db");

    // trailing dot in HTTPS hostname triggers instant deterministic blocked outcome in fetchPublicMetadata before DNS lookup
    const queuedJob: CrawlJob = CrawlJobSchema.parse({
      jobId: "fleet-vpm-job-001",
      leaseId: crypto.randomUUID(),
      platform: "vpm",
      purpose: "metadata",
      url: "https://vpm.fleet.example.org./index.json",
      origin: "https://vpm.fleet.example.org.",
      leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      retainClasses: ["normalized_facts"],
      etag: null,
      lastModified: null
    });

    const validTokens = new Map<string, string>([
      [NODE_ALPHA_ID, NODE_ALPHA_TOKEN],
      [NODE_BETA_ID, NODE_BETA_TOKEN]
    ]);

    let activeOriginLease: { nodeId: string; leaseId: string; jobId: string } | null = null;
    let jobCompleted = false;
    const claimRequests: string[] = [];
    const robotsClaimRequests: string[] = [];
    const submittedResults: Array<{ nodeId: string; payload: ResultRequest }> = [];
    const protocolErrors: unknown[] = [];

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        try {
          expect(request.method).toBe("POST");
          const authHeader = request.headers.get("authorization") ?? "";
          const payload: unknown = await request.json();
          const pathname = new URL(request.url).pathname;

          switch (pathname) {
            case "/v1/node/heartbeat": {
              const hb = HeartbeatRequestSchema.parse(payload);
              expect(authHeader).toBe(`Bearer ${validTokens.get(hb.nodeId)}`);
              return Response.json(
                HeartbeatResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "alive",
                  serverTime: new Date().toISOString()
                })
              );
            }
            case "/v1/node/jobs/claim": {
              const claim = ClaimRequestSchema.parse(payload);
              expect(authHeader).toBe(`Bearer ${validTokens.get(claim.nodeId)}`);
              claimRequests.push(claim.nodeId);

              if (!activeOriginLease && !jobCompleted) {
                const leaseId = crypto.randomUUID();
                activeOriginLease = { nodeId: claim.nodeId, leaseId, jobId: queuedJob.jobId };
                const leasedJob: CrawlJob = {
                  ...queuedJob,
                  leaseId,
                  leaseExpiresAt: new Date(Date.now() + 120_000).toISOString()
                };
                return Response.json(
                  ClaimResponseSchema.parse({
                    schemaVersion: PROTOCOL_VERSION,
                    status: "leased",
                    job: leasedJob
                  })
                );
              }

              return Response.json(
                ClaimResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "empty",
                  retryAfterMs: 5000
                })
              );
            }
            case "/v1/node/robots/claim": {
              const rClaim = NodeRobotsClaimRequestSchema.parse(payload);
              expect(authHeader).toBe(`Bearer ${validTokens.get(rClaim.nodeId)}`);
              robotsClaimRequests.push(rClaim.nodeId);
              return Response.json(
                NodeRobotsClaimResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "empty",
                  retryAfterMs: 5000
                })
              );
            }
            case "/v1/node/jobs/result": {
              const res = ResultRequestSchema.parse(payload);
              expect(authHeader).toBe(`Bearer ${validTokens.get(res.nodeId)}`);
              if (!activeOriginLease || activeOriginLease.nodeId !== res.nodeId || activeOriginLease.leaseId !== res.leaseId) {
                return Response.json({ error: "Origin lease mismatch" }, { status: 403 });
              }
              submittedResults.push({ nodeId: res.nodeId, payload: res });
              jobCompleted = true;
              return Response.json(
                ResultResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "accepted",
                  jobId: res.jobId,
                  duplicate: false,
                  sourceVersionCreated: false
                })
              );
            }
            case "/v1/node/jobs/results": {
              const batch = BatchResultRequestSchema.parse(payload);
              expect(authHeader).toBe(`Bearer ${validTokens.get(batch.nodeId)}`);
              return Response.json(
                BatchResultResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  receipts: []
                })
              );
            }
            default:
              throw new Error(`Unexpected coordinator route: ${pathname}`);
          }
        } catch (err) {
          protocolErrors.push(err);
          return Response.json({ error: String(err) }, { status: 500 });
        }
      }
    });

    const children: Array<ReturnType<typeof spawnNodeOnce>> = [];

    try {
      const alphaProc = spawnNodeOnce({
        cwd: alphaDir,
        nodeId: NODE_ALPHA_ID,
        token: NODE_ALPHA_TOKEN,
        coordinatorUrl: server.url.origin,
        dbPath: alphaDbPath,
        logsDir: join(alphaDir, "logs")
      });
      const betaProc = spawnNodeOnce({
        cwd: betaDir,
        nodeId: NODE_BETA_ID,
        token: NODE_BETA_TOKEN,
        coordinatorUrl: server.url.origin,
        dbPath: betaDbPath,
        logsDir: join(betaDir, "logs")
      });
      children.push(alphaProc, betaProc);

      const [alphaExit, betaExit] = await deadline(
        Promise.all([alphaProc.child.exited, betaProc.child.exited]),
        "Concurrent node processes did not finish in time"
      );

      expect({ alphaExit, alphaStderr: await alphaProc.stderr }).toEqual({ alphaExit: 0, alphaStderr: "" });
      expect({ betaExit, betaStderr: await betaProc.stderr }).toEqual({ betaExit: 0, betaStderr: "" });
      expect(protocolErrors).toEqual([]);

      // Both nodes polled the coordinator, but exactly 1 claimed the origin lease and submitted the observation receipt
      expect(claimRequests.sort()).toEqual([NODE_ALPHA_ID, NODE_BETA_ID]);
      expect(submittedResults).toHaveLength(1);
      expect(robotsClaimRequests).toHaveLength(1);

      const winnerNodeId = submittedResults[0]!.nodeId;
      const loserNodeId = winnerNodeId === NODE_ALPHA_ID ? NODE_BETA_ID : NODE_ALPHA_ID;
      expect(robotsClaimRequests[0]).toBe(loserNodeId);

      const winnerDbPath = winnerNodeId === NODE_ALPHA_ID ? alphaDbPath : betaDbPath;
      const loserDbPath = winnerNodeId === NODE_ALPHA_ID ? betaDbPath : alphaDbPath;

      const winnerDb = new Database(winnerDbPath);
      const loserDb = new Database(loserDbPath);
      try {
        winnerDb.run("PRAGMA busy_timeout = 10000;");
        loserDb.run("PRAGMA busy_timeout = 10000;");
        const winnerTasks = winnerDb.prepare("SELECT status, accepted, job_id FROM node_tasks").all() as Array<{
          status: string;
          accepted: number;
          job_id: string;
        }>;
        const winnerOutbox = winnerDb.prepare("SELECT status, job_id, retry_count FROM node_outbox").all() as Array<{
          status: string;
          job_id: string;
          retry_count: number;
        }>;
        expect(winnerTasks).toEqual([{ status: "completed", accepted: 1, job_id: queuedJob.jobId }]);
        expect(winnerOutbox).toEqual([{ status: "sent", job_id: queuedJob.jobId, retry_count: 0 }]);

        const loserTasks = loserDb.prepare("SELECT * FROM node_tasks").all();
        const loserOutbox = loserDb.prepare("SELECT * FROM node_outbox").all();
        expect(loserTasks).toHaveLength(0);
        expect(loserOutbox).toHaveLength(0);
      } finally {
        winnerDb.close(true);
        loserDb.close(true);
      }
    } finally {
      for (const proc of children) {
        if (proc.child.exitCode === null && proc.child.signalCode === null) {
          proc.child.kill("SIGKILL");
        }
        await proc.child.exited;
      }
      await server.stop(true);
      cleanFixtureDir(root, directory);
    }
  }, 30_000);

  test("Test 2 (R15-C17): abrupt process crash / coordinator 503 after outbox staging replays cleanly on separate-process restart with zero duplicates on third run", async () => {
    const { root, directory } = createFixtureDir("vrcp-fleet-replay-");
    const alphaDir = join(directory, "alpha");
    mkdirSync(alphaDir, { recursive: true });
    const alphaDbPath = join(alphaDir, "node-a.db");
    const alphaLogsDir = join(alphaDir, "logs");

    const job: CrawlJob = CrawlJobSchema.parse({
      jobId: "fleet-replay-job-002",
      leaseId: crypto.randomUUID(),
      platform: "vpm",
      purpose: "metadata",
      url: "https://vpm.replay.example.org./index.json",
      origin: "https://vpm.replay.example.org.",
      leaseExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      retainClasses: ["normalized_facts"],
      etag: null,
      lastModified: null
    });

    let runPhase: "run1_drop" | "run2_recover" | "run3_verify" = "run1_drop";
    let directResultAttempts = 0;
    const batchRequests: BatchResultRequest[] = [];
    let stagedSubmission: ResultRequest | null = null;
    const protocolErrors: unknown[] = [];

    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        try {
          expect(request.method).toBe("POST");
          expect(request.headers.get("authorization")).toBe(`Bearer ${NODE_ALPHA_TOKEN}`);
          const payload: unknown = await request.json();
          const pathname = new URL(request.url).pathname;

          switch (pathname) {
            case "/v1/node/heartbeat": {
              const hb = HeartbeatRequestSchema.parse(payload);
              expect(hb.nodeId).toBe(NODE_ALPHA_ID);
              return Response.json(
                HeartbeatResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "alive",
                  serverTime: new Date().toISOString()
                })
              );
            }
            case "/v1/node/jobs/claim": {
              const claim = ClaimRequestSchema.parse(payload);
              expect(claim.nodeId).toBe(NODE_ALPHA_ID);
              if (runPhase === "run1_drop") {
                return Response.json(
                  ClaimResponseSchema.parse({
                    schemaVersion: PROTOCOL_VERSION,
                    status: "leased",
                    job
                  })
                );
              }
              return Response.json(
                ClaimResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "empty",
                  retryAfterMs: 5000
                })
              );
            }
            case "/v1/node/robots/claim": {
              const rClaim = NodeRobotsClaimRequestSchema.parse(payload);
              expect(rClaim.nodeId).toBe(NODE_ALPHA_ID);
              return Response.json(
                NodeRobotsClaimResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  status: "empty",
                  retryAfterMs: 5000
                })
              );
            }
            case "/v1/node/jobs/result": {
              const res = ResultRequestSchema.parse(payload);
              expect(res.nodeId).toBe(NODE_ALPHA_ID);
              directResultAttempts++;
              stagedSubmission = res;
              // Simulate coordinator drop / 503 during initial submission after outbox staging
              return Response.json({ error: "Coordinator 503 Service Unavailable" }, { status: 503 });
            }
            case "/v1/node/jobs/results": {
              const batch = BatchResultRequestSchema.parse(payload);
              expect(batch.nodeId).toBe(NODE_ALPHA_ID);
              batchRequests.push(batch);
              return Response.json(
                BatchResultResponseSchema.parse({
                  schemaVersion: PROTOCOL_VERSION,
                  receipts: batch.results.map((item) => ({
                    status: "accepted" as const,
                    jobId: item.jobId,
                    duplicate: false,
                    sourceVersionCreated: false
                  }))
                })
              );
            }
            default:
              throw new Error(`Unexpected coordinator route: ${pathname}`);
          }
        } catch (err) {
          protocolErrors.push(err);
          return Response.json({ error: String(err) }, { status: 500 });
        }
      }
    });

    const children: Array<ReturnType<typeof spawnNodeOnce>> = [];

    try {
      // Run 1: child process claims job, stages outbox row, encounters 503 on /v1/node/jobs/result, and exits non-zero
      const run1 = spawnNodeOnce({
        cwd: alphaDir,
        nodeId: NODE_ALPHA_ID,
        token: NODE_ALPHA_TOKEN,
        coordinatorUrl: server.url.origin,
        dbPath: alphaDbPath,
        logsDir: alphaLogsDir
      });
      children.push(run1);
      const exit1 = await deadline(run1.child.exited, "Run 1 process did not exit");
      expect(exit1).toBe(1);
      expect(directResultAttempts).toBeGreaterThanOrEqual(1);
      expect(stagedSubmission).not.toBeNull();
      expect(batchRequests).toHaveLength(0);

      // Inspect node-a.db after Run 1 exit: verify pending = 1, sent = 0, and adjust next_retry_at <= now for immediate replay
      const dbAfterRun1 = new Database(alphaDbPath);
      try {
        dbAfterRun1.run("PRAGMA busy_timeout = 10000;");
        const counts1 = dbAfterRun1
          .prepare(
            `SELECT
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent
             FROM node_outbox`
          )
          .get() as { pending: number | null; sent: number | null };
        expect({ pending: counts1.pending ?? 0, sent: counts1.sent ?? 0 }).toEqual({ pending: 1, sent: 0 });

        dbAfterRun1
          .prepare("UPDATE node_outbox SET next_retry_at = ? WHERE status = 'pending'")
          .run(new Date(Date.now() - 1_000).toISOString());
      } finally {
        dbAfterRun1.close(true);
      }

      // Run 2: spawn a second fresh child process against the exact same NODE_DB_PATH after coordinator recovers (200 accepted)
      runPhase = "run2_recover";
      const run2 = spawnNodeOnce({
        cwd: alphaDir,
        nodeId: NODE_ALPHA_ID,
        token: NODE_ALPHA_TOKEN,
        coordinatorUrl: server.url.origin,
        dbPath: alphaDbPath,
        logsDir: alphaLogsDir
      });
      children.push(run2);
      const exit2 = await deadline(run2.child.exited, "Run 2 process did not exit");
      expect({ exit2, stderr2: await run2.stderr }).toEqual({ exit2: 0, stderr2: "" });
      expect(batchRequests).toHaveLength(1);
      expect(batchRequests[0]!.results).toEqual([
        {
          jobId: stagedSubmission!.jobId,
          leaseId: stagedSubmission!.leaseId,
          idempotencyKey: stagedSubmission!.idempotencyKey,
          outcome: stagedSubmission!.outcome
        }
      ]);

      // Verify node-a.db settled to sent = 1, pending = 0 and task status = 'completed'
      const dbAfterRun2 = new Database(alphaDbPath);
      try {
        dbAfterRun2.run("PRAGMA busy_timeout = 10000;");
        const counts2 = dbAfterRun2
          .prepare(
            `SELECT
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent
             FROM node_outbox`
          )
          .get() as { pending: number | null; sent: number | null };
        expect({ pending: counts2.pending ?? 0, sent: counts2.sent ?? 0 }).toEqual({ pending: 0, sent: 1 });

        const taskRow = dbAfterRun2
          .prepare("SELECT status, accepted FROM node_tasks WHERE job_id = ?")
          .get(job.jobId) as { status: string; accepted: number };
        expect(taskRow).toEqual({ status: "completed", accepted: 1 });
      } finally {
        dbAfterRun2.close(true);
      }

      // Run 3: spawn a third fresh child process against the exact same NODE_DB_PATH and assert 0 duplicate batch submissions
      runPhase = "run3_verify";
      const run3 = spawnNodeOnce({
        cwd: alphaDir,
        nodeId: NODE_ALPHA_ID,
        token: NODE_ALPHA_TOKEN,
        coordinatorUrl: server.url.origin,
        dbPath: alphaDbPath,
        logsDir: alphaLogsDir
      });
      children.push(run3);
      const exit3 = await deadline(run3.child.exited, "Run 3 process did not exit");
      expect({ exit3, stderr3: await run3.stderr }).toEqual({ exit3: 0, stderr3: "" });
      expect(batchRequests).toHaveLength(1);
      expect(protocolErrors).toEqual([]);
    } finally {
      for (const proc of children) {
        if (proc.child.exitCode === null && proc.child.signalCode === null) {
          proc.child.kill("SIGKILL");
        }
        await proc.child.exited;
      }
      await server.stop(true);
      cleanFixtureDir(root, directory);
    }
  }, 30_000);
});
