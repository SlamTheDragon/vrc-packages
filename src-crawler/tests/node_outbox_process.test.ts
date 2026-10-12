import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import { ClaimRequestSchema, ClaimResponseSchema, CrawlJobSchema, HeartbeatRequestSchema,
  HeartbeatResponseSchema, ResultRequestSchema, BatchResultRequestSchema, BatchResultResponseSchema,
  type ResultRequest } from "vrc-packages-network/node";

const nodeId = "outbox-process-fixture";
const token = "fixture-only-not-a-live-credential";
const fixtureScript = resolve(import.meta.dir, "fixtures/outbox_process.ts");

async function deadline<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), 10_000);
    })]);
  } finally { clearTimeout(timer); }
}

function launch(directory: string, baseUrl: string, phase: "initial" | "replay") {
  // Do not forward developer/CI credentials to the child, or load the repository .env.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|localappdata|home|userprofile)$/i.test(key) && value) env[key] = value;
  }
  Object.assign(env, { NODE_ID: nodeId, NODE_TOKEN: token, COORDINATOR_URL: baseUrl,
    NODE_DB_PATH: join(directory, "node.db"), NODE_CAPABILITIES: "vpm",
    CRAWLER_LOGS_DIR: join(directory, "logs"), VRCP_OUTBOX_PHASE: phase });
  const child = Bun.spawn([process.execPath, fixtureScript], { cwd: directory, env,
    stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  return { child, stdout: new Response(child.stdout).text(), stderr: new Response(child.stderr).text() };
}

describe("outbox recovery after abrupt process termination over loopback HTTP", () => {
  test.each(["unacknowledged", "accepted-before-crash", "lease-expired"] as const)("%s", async scenario => {
    const root = resolve(import.meta.dir, "../dist/tests/outbox-process");
    mkdirSync(root, { recursive: true });
    const directory = mkdtempSync(join(realpathSync(root), "vrcp-outbox-"));
    const job = CrawlJobSchema.parse({ jobId: "process-job", leaseId: crypto.randomUUID(), platform: "vpm",
      purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"], etag: null, lastModified: null });
    const observed = Promise.withResolvers<ResultRequest>();
    const heldResponse = Promise.withResolvers<Response>();
    const acceptedKeys = new Set<string>();
    const errors: unknown[] = [];
    let phase: "initial" | "replay" = "initial";
    let claims = 0, directResults = 0, batches = 0;
    let original: ResultRequest | undefined;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      try {
        expect(request.method).toBe("POST");
        expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
        const payload: unknown = await request.json();
        switch (new URL(request.url).pathname) {
          case "/v1/node/jobs/claim":
            expect(ClaimRequestSchema.parse(payload).nodeId).toBe(nodeId);
            claims++;
            return Response.json(ClaimResponseSchema.parse(phase === "initial"
              ? { schemaVersion: 1, status: "leased", job }
              : { schemaVersion: 1, status: "empty", retryAfterMs: 1000 }));
          case "/v1/node/heartbeat":
            expect(HeartbeatRequestSchema.parse(payload).nodeId).toBe(nodeId);
            return Response.json(HeartbeatResponseSchema.parse({ schemaVersion: 1, status: "alive",
              serverTime: new Date().toISOString() }));
          case "/v1/node/jobs/result": {
            expect(phase).toBe("initial");
            original = ResultRequestSchema.parse(payload);
            expect(original.nodeId).toBe(nodeId);
            expect(original.outcome).toEqual({ kind: "unchanged" });
            directResults++;
            if (scenario === "accepted-before-crash") acceptedKeys.add(original.idempotencyKey);
            observed.resolve(original);
            return heldResponse.promise;
          }
          case "/v1/node/jobs/results": {
            expect(phase).toBe("replay");
            const replay = BatchResultRequestSchema.parse(payload);
            expect(replay.nodeId).toBe(nodeId);
            expect(replay.results).toEqual([{ jobId: original!.jobId, leaseId: original!.leaseId,
              idempotencyKey: original!.idempotencyKey, outcome: original!.outcome }]);
            batches++;
            const duplicate = acceptedKeys.has(original!.idempotencyKey);
            if (scenario !== "lease-expired") acceptedKeys.add(original!.idempotencyKey);
            return Response.json(BatchResultResponseSchema.parse({ schemaVersion: 1, receipts: [
              scenario === "lease-expired"
                ? { status: "rejected", jobId: job.jobId, terminal: true, error: "Lease expired", code: "lease_expired" }
                : { status: "accepted", jobId: job.jobId, duplicate, sourceVersionCreated: false }
            ] }));
          }
          default: throw new Error("Unexpected protocol route");
        }
      } catch (error) {
        errors.push(error);
        observed.reject(error);
        return Response.json({ error: "Fixture protocol failure" }, { status: 500 });
      }
    } });
    const children: ReturnType<typeof launch>[] = [];
    let store: LocalNodeStore | undefined;
    try {
      const first = launch(directory, server.url.origin, "initial");
      children.push(first);
      const submission = await deadline(Promise.race([observed.promise, first.child.exited.then(async code => {
        throw new Error(`Initial process exited early (${code}): ${await first.stderr}`);
      })]), "Initial result never reached the loopback coordinator");
      // Kill while HTTP response is pending, without daemon.stop/store.close.
      first.child.kill("SIGKILL");
      expect(await deadline(first.child.exited, "Initial process did not terminate")).not.toBe(0);
      expect((await first.stdout).match(/VRCP_OUTBOX_SOURCE_FETCH/g)).toHaveLength(1);
      heldResponse.resolve(Response.json({ error: "Lost acknowledgement" }, { status: 503 }));

      store = new LocalNodeStore(join(directory, "node.db"));
      const pending = store.getPendingOutboxEntries();
      expect(pending).toHaveLength(1);
      const entry = pending[0]!;
      expect(entry).toMatchObject({ jobId: job.jobId, leaseId: job.leaseId,
        idempotencyKey: submission.idempotencyKey, outcome: submission.outcome, status: "pending", retryCount: 0 });
      expect(store.getTask(entry.taskId)?.status).toBe("submitting");
      expect(store.getRun(entry.runId)).toMatchObject({ status: "running", tasksCompleted: 0, tasksFailed: 0 });
      store.close();
      store = undefined;

      phase = "replay";
      const second = launch(directory, server.url.origin, "replay");
      children.push(second);
      const code = await deadline(second.child.exited, "Replay process did not finish");
      expect({ code, stderr: await second.stderr }).toEqual({ code: 0, stderr: "" });
      const output = await second.stdout;
      expect(output).not.toContain("VRCP_OUTBOX_SOURCE_FETCH");
      const finished = output.split(/\r?\n/).find(line => line.startsWith("VRCP_OUTBOX_FINISHED "));
      expect(finished).toBeDefined();
      expect(JSON.parse(finished!.slice("VRCP_OUTBOX_FINISHED ".length))).toMatchObject({ phase: "replay", sourceFetches: 0 });
      expect(errors).toEqual([]);
      expect({ claims, directResults, batches, accepted: acceptedKeys.size }).toEqual({ claims: 2, directResults: 1,
        batches: 1, accepted: scenario === "lease-expired" ? 0 : 1 });

      store = new LocalNodeStore(join(directory, "node.db"));
      expect(store.getPendingOutboxCount()).toBe(0);
      expect(store.getOutboxEntry(entry.outboxId)).toMatchObject({
        status: scenario === "lease-expired" ? "dead" : "sent", idempotencyKey: submission.idempotencyKey, retryCount: 0,
        lastError: scenario === "lease-expired" ? "Lease expired" : null,
        receipt: scenario === "lease-expired" ? null : { jobId: job.jobId, duplicate: scenario === "accepted-before-crash" }
      });
      expect(store.getTask(entry.taskId)?.status).toBe(scenario === "lease-expired" ? "failed" : "completed");
      expect(store.getRun(entry.runId)).toMatchObject({ tasksCompleted: scenario === "lease-expired" ? 0 : 1,
        tasksFailed: scenario === "lease-expired" ? 1 : 0 });
    } finally {
      heldResponse.resolve(new Response(null, { status: 503 }));
      for (const { child } of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await child.exited;
      }
      await server.stop(true);
      store?.close();
      if (!realpathSync(directory).startsWith(realpathSync(root) + sep)) throw new Error("Unexpected fixture path");
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 30_000);
});
