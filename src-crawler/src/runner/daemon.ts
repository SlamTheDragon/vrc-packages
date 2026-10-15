import { existsSync, unlinkSync } from "node:fs";
import { CoordinatorClient } from "../client/node_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "../client/public_metadata_fetch.ts";
import type { NodeRuntimeConfig } from "../config/runtime_config.ts";
import type { LocalNodeStore } from "../storage/local_sqlite.ts";
import { PROTOCOL_VERSION, MAX_BATCH_RESULTS, type HeartbeatRequest } from "vrc-packages-network/node";
import { logger } from "../utils/logging/logger.ts";

export interface CrawlerNodeDaemonOptions {
  runOnce?: boolean;
  fetchFn?: typeof fetchPublicMetadata;
  stopFilePath?: string;
  sleepFn?: (ms: number) => Promise<void>;
  heartbeatIntervalMs?: number;
  maxPendingOutboxQuota?: number;
  outboxTtlMs?: number;
  outboxPruneIntervalMs?: number;
  minIdleDelayMs?: number;
  maxIdleDelayMs?: number;
  idleBackoffMultiplier?: number;
  jitterRatio?: number;
  randomFn?: () => number;
}

/**
 * OOP encapsulation of crawler node lifecycle and job consumption loop.
 * Coordinates heartbeat maintenance, job claims, leased execution,
 * local execution recording in LocalNodeStore, and graceful shutdown.
 */
export class CrawlerNodeDaemon {
  private stopping: boolean = false;
  private readonly stopController = new AbortController();
  private lastHeartbeatAt: number = 0;
  private lastPruneAt: number = 0;
  private lastRetryAfterMs: number = 5_000;
  private lastCalculatedDelayMs: number = 5_000;
  private consecutiveEmptyClaims: number = 0;
  private runId: string;
  private isFlushingOutbox: boolean = false;

  constructor(
    private readonly config: NodeRuntimeConfig,
    private readonly nodeStore: LocalNodeStore,
    private readonly client: CoordinatorClient,
    private readonly options: CrawlerNodeDaemonOptions = {}
  ) {
    this.runId = this.nodeStore.startRun(this.config.nodeId);
    this.lastPruneAt = Date.now();
  }

  public get currentRunId(): string {
    return this.runId;
  }

  public get isStopping(): boolean {
    return this.stopping;
  }

  public get lastHeartbeatTimestamp(): number {
    return this.lastHeartbeatAt;
  }

  public get emptyClaimCount(): number {
    return this.consecutiveEmptyClaims;
  }

  public get currentIdleDelayMs(): number {
    return this.lastCalculatedDelayMs;
  }

  public calculateIdleDelay(baseRetryAfterMs: number): number {
    const minIdle = this.options.minIdleDelayMs ?? 5_000;
    const maxIdle = this.options.maxIdleDelayMs ?? 60_000;
    const multiplier = this.options.idleBackoffMultiplier ?? 1.5;
    const jitterRatio = this.options.jitterRatio ?? 0.2;
    const randomFn = this.options.randomFn ?? Math.random;

    const base = Math.max(baseRetryAfterMs, minIdle);
    // Coordinator waits are floors; the local backoff cap must not shorten them.
    const ceiling = Math.max(base, maxIdle);
    const exponent = Math.max(0, this.consecutiveEmptyClaims - 1);
    const unjittered = Math.min(ceiling, Math.round(base * Math.pow(multiplier, exponent)));

    if (jitterRatio <= 0) {
      return unjittered;
    }

    const rand = Math.max(0, Math.min(1, randomFn()));
    const jitterFactor = (1 - jitterRatio) + rand * (2 * jitterRatio);
    const jittered = Math.round(unjittered * jitterFactor);
    return Math.max(base, Math.min(ceiling, jittered));
  }

  public stop(status: "completed" | "failed" = "completed"): void {
    if (this.stopping) return;
    this.stopping = true;
    this.stopController.abort(new Error("Crawler node stopped"));
    logger.activity(`Crawler node daemon stopping with status: ${status}`, { runId: this.runId });
    if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
      try {
        unlinkSync(this.options.stopFilePath);
      } catch {}
    }
    try {
      this.nodeStore.finishRun(this.runId, status);
    } catch (err) {
      logger.error("Failed to finish run in nodeStore", err);
    }
  }

  public async heartbeat(state: HeartbeatRequest["state"] = "idle"): Promise<void> {
    if (this.stopping) return;
    try {
      await this.client.heartbeat(state);
      this.lastHeartbeatAt = Date.now();
    } catch (err) {
      logger.warn(`Heartbeat failure for state '${state}'`, err);
    }
  }

  public isTerminalOutboxError(error: unknown): boolean {
    if (error instanceof Error) {
      const match = error.message.match(/Coordinator (\d{3})/);
      if (match) {
        const status = parseInt(match[1], 10);
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          return true;
        }
      }
      const lower = error.message.toLowerCase();
      if (lower.includes("expired") || lower.includes("forbidden") || lower.includes("unauthorized")) {
        return true;
      }
    }
    return false;
  }

  public async flushOutbox(batchLimit: number = 50): Promise<number> {
    if (this.stopping || this.isFlushingOutbox) return 0;
    this.isFlushingOutbox = true;
    try {
      const entries = this.nodeStore.getPendingOutboxEntries(batchLimit);
      if (entries.length === 0) return 0;

      logger.activity(`Flushing ${entries.length} pending outbox entries...`);
      let flushedCount = 0;

      for (let i = 0; i < entries.length; i += MAX_BATCH_RESULTS) {
        if (this.stopping) break;
        const chunk = entries.slice(i, i + MAX_BATCH_RESULTS);
        try {
          const batchResponse = await this.client.submitBatch(
            chunk.map((entry) => ({
              jobId: entry.jobId,
              leaseId: entry.leaseId,
              idempotencyKey: entry.idempotencyKey,
              outcome: entry.outcome
            }))
          );
          const receiptMap = new Map(batchResponse.receipts.map((r) => [r.jobId, r]));
          for (const entry of chunk) {
            const receipt = receiptMap.get(entry.jobId);
            if (!receipt) {
              const delayMs = Math.min(5_000 * Math.pow(2, entry.retryCount), 60_000);
              this.nodeStore.markOutboxFailed(entry.outboxId, "Missing receipt in coordinator batch response", delayMs);
              continue;
            }
            if (receipt.status === "accepted") {
              this.nodeStore.markOutboxDelivered(entry.outboxId, {
                schemaVersion: PROTOCOL_VERSION,
                status: "accepted",
                jobId: receipt.jobId,
                duplicate: receipt.duplicate,
                sourceVersionCreated: receipt.sourceVersionCreated
              });
              flushedCount++;
              logger.activity(`Outbox entry ${entry.outboxId} successfully delivered for job ${entry.jobId}`);
            } else {
              if (receipt.terminal) {
                logger.activity(`Terminal rejection for outbox entry ${entry.outboxId}: ${receipt.error}`);
                this.nodeStore.markOutboxTerminal(entry.outboxId, receipt.error);
              } else {
                logger.activity(`Failed to deliver outbox entry ${entry.outboxId}, scheduling retry: ${receipt.error}`);
                const delayMs = Math.min(5_000 * Math.pow(2, entry.retryCount), 60_000);
                this.nodeStore.markOutboxFailed(entry.outboxId, receipt.error, delayMs);
              }
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          for (const entry of chunk) {
            if (this.isTerminalOutboxError(error)) {
              logger.activity(`Terminal rejection for outbox entry ${entry.outboxId}: ${errorMsg}`);
              this.nodeStore.markOutboxTerminal(entry.outboxId, errorMsg);
            } else {
              logger.activity(`Failed to deliver outbox entry ${entry.outboxId}, scheduling retry: ${errorMsg}`);
              const delayMs = Math.min(5_000 * Math.pow(2, entry.retryCount), 60_000);
              this.nodeStore.markOutboxFailed(entry.outboxId, errorMsg, delayMs);
            }
          }
        }
      }

      return flushedCount;
    } finally {
      this.isFlushingOutbox = false;
    }
  }

  public async step(): Promise<"claimed" | "empty" | "stopped"> {
    if (this.stopping) {
      return "stopped";
    }
    if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
      this.stop();
      return "stopped";
    }

    const heartbeatInterval = this.options.heartbeatIntervalMs ?? 30_000;
    if (Date.now() - this.lastHeartbeatAt >= heartbeatInterval) {
      await this.heartbeat();
    }

    if (this.stopping) return "stopped";

    // Periodic background outbox maintenance
    const pruneInterval = this.options.outboxPruneIntervalMs ?? 3_600_000;
    if (Date.now() - this.lastPruneAt >= pruneInterval) {
      this.nodeStore.pruneOutbox(this.options.outboxTtlMs ?? 86_400_000);
      this.lastPruneAt = Date.now();
    }

    // Flush pending outbox entries before claiming new leases
    await this.flushOutbox();
    if (this.stopping) return "stopped";

    // Flow control: pause claims when outbox quota is exhausted
    const maxQuota = this.options.maxPendingOutboxQuota ?? 1000;
    const pendingCount = this.nodeStore.getPendingOutboxCount();
    if (pendingCount >= maxQuota) {
      logger.warn(`Outbox pending quota reached (${pendingCount}/${maxQuota}). Pausing job claims until outbox drains.`);
      this.consecutiveEmptyClaims++;
      this.lastCalculatedDelayMs = this.calculateIdleDelay(5_000);
      return "empty";
    }

    const claim = await this.client.claim();
    if (this.stopping) return "stopped";
    if (claim.status === "empty") {
      this.consecutiveEmptyClaims++;
      this.lastRetryAfterMs = claim.retryAfterMs;
      this.lastCalculatedDelayMs = this.calculateIdleDelay(claim.retryAfterMs);
      logger.debug("No jobs available to claim", {
        retryAfterMs: this.lastRetryAfterMs,
        calculatedDelayMs: this.lastCalculatedDelayMs,
        consecutiveEmptyClaims: this.consecutiveEmptyClaims
      });
      return "empty";
    }

    const { job } = claim;

    // Fail closed: enforce lease unexpired preflight check
    const nowMs = Date.now();
    if (new Date(job.leaseExpiresAt).getTime() <= nowMs) {
      const errorMsg = `Lease ${job.leaseId} for job ${job.jobId} expired before execution (expired at ${job.leaseExpiresAt})`;
      logger.warn(errorMsg);
      const taskId = this.nodeStore.recordClaimedJob(this.runId, job);
      this.nodeStore.recordTaskFailure(taskId, errorMsg, { durationMs: 0 });
      this.consecutiveEmptyClaims++;
      this.lastCalculatedDelayMs = this.calculateIdleDelay(5_000);
      return "empty";
    }

    this.consecutiveEmptyClaims = 0;

    logger.activity(`Claimed ${job.platform} job ${job.jobId} for ${job.url}`, { jobId: job.jobId, platform: job.platform, url: job.url, leaseId: job.leaseId });
    const taskId = this.nodeStore.recordClaimedJob(this.runId, job);
    this.nodeStore.recordTaskProgress(taskId, "fetching");
    const startTime = performance.now();
    const fetchFn = this.options.fetchFn ?? fetchPublicMetadata;

    let stagedOutboxId: string | null = null;
    const idempotencyKey = crypto.randomUUID();

    try {
      const { outcome, result } = await runLeasedJob(
        job,
        this.client,
        fetchFn,
        this.options.heartbeatIntervalMs ?? 5_000,
        this.stopController.signal,
        {
          idempotencyKey,
          onOutcome: (outcome, idKey) => {
            stagedOutboxId = this.nodeStore.stageOutboxOutcome(
              taskId,
              outcome,
              idKey,
              this.options.maxPendingOutboxQuota ?? 1000
            );
          }
        }
      );
      const durationMs = Math.round(performance.now() - startTime);
      if (stagedOutboxId) {
        this.nodeStore.markOutboxDelivered(stagedOutboxId, result, { durationMs });
      } else {
        this.nodeStore.recordTaskSuccess(taskId, outcome.kind, result, { durationMs });
      }
      if (outcome.kind === "changed") {
        logger.finding(`Observed package '${outcome.observation.title}' by '${outcome.observation.author}'`, {
          jobId: job.jobId,
          platform: job.platform,
          sourceItemKey: outcome.observation.sourceItemKey,
          title: outcome.observation.title,
          author: outcome.observation.author,
          version: outcome.observation.release?.version,
          price: outcome.observation.price,
          currency: outcome.observation.currency,
          outboundLinksCount: outcome.observation.outboundLinks?.length ?? 0
        });
        if (outcome.observation.outboundLinks && outcome.observation.outboundLinks.length > 0) {
          logger.finding(`Extracted ${outcome.observation.outboundLinks.length} outbound leads from ${job.url}`, {
            jobId: job.jobId,
            outboundLinks: outcome.observation.outboundLinks
          });
        }
      } else if (outcome.kind === "batch" || outcome.kind === "partial_batch") {
        logger.finding(`Discovered batch of ${outcome.observations.length} packages from ${job.url}`, {
          jobId: job.jobId,
          platform: job.platform,
          count: outcome.observations.length,
          items: outcome.observations.map((obs) => ({
            key: obs.sourceItemKey,
            title: obs.title,
            version: obs.release?.version
          }))
        });
        if (outcome.kind === "partial_batch" && outcome.issues && outcome.issues.length > 0) {
          logger.finding(`Encountered ${outcome.issues.length} package listing issues from ${job.url}`, {
            jobId: job.jobId,
            issues: outcome.issues
          });
        }
      } else if (outcome.kind === "discovery") {
        logger.finding(`Discovered ${outcome.leads.length} discovery leads from ${job.url}`, {
          jobId: job.jobId,
          platform: job.platform,
          count: outcome.leads.length,
          leads: outcome.leads.map((l) => ({ kind: l.kind, url: l.url }))
        });
      } else if (outcome.kind === "unchanged") {
        logger.finding(`Listing unchanged at ${job.url}`, { jobId: job.jobId, platform: job.platform });
      } else if (outcome.kind === "gone") {
        logger.finding(`Listing delisted or unavailable at ${job.url}`, { jobId: job.jobId, platform: job.platform });
      } else if (outcome.kind === "rate_limited") {
        logger.activity(`Upstream rate limit received for ${job.url}, retry after ${outcome.retryAfterSeconds}s`, {
          jobId: job.jobId,
          platform: job.platform,
          retryAfterSeconds: outcome.retryAfterSeconds
        });
      } else if (outcome.kind === "temporary_failure") {
        logger.activity(`Temporary fetch failure for ${job.url}: ${outcome.reason}`, {
          jobId: job.jobId,
          platform: job.platform,
          reason: outcome.reason
        });
      } else if (outcome.kind === "blocked") {
        logger.activity(`Blocked by robots or policy for ${job.url}: ${outcome.reason}`, {
          jobId: job.jobId,
          platform: job.platform,
          reason: outcome.reason
        });
      }

      logger.activity("Task completed successfully", {
        jobId: job.jobId,
        outcome: outcome.kind,
        accepted: result.status,
        sourceVersionCreated: result.sourceVersionCreated,
        durationMs
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.nodeStore.recordTaskFailure(taskId, errorMsg, { durationMs });
      if (stagedOutboxId) {
        if (this.isTerminalOutboxError(error)) {
          this.nodeStore.markOutboxTerminal(stagedOutboxId, errorMsg);
        } else {
          this.nodeStore.markOutboxFailed(stagedOutboxId, errorMsg);
        }
      }
      logger.error(`Task execution failed for job ${job.jobId} (${durationMs}ms)`, error);
      throw error;
    }

    await this.heartbeat();
    return "claimed";
  }

  public async start(): Promise<void> {
    const runOnce = this.options.runOnce ?? false;
    const sleepFn = this.options.sleepFn ?? Bun.sleep;
    logger.activity("Crawler node daemon started", { runId: this.runId, runOnce });
    const stopFilePath = this.options.stopFilePath;
    const stopFilePoll = stopFilePath ? setInterval(() => {
      if (existsSync(stopFilePath)) this.stop();
    }, 100) : undefined;

    try {
      this.nodeStore.recoverInterruptedOutboxEntries();
      this.nodeStore.pruneOutbox(this.options.outboxTtlMs ?? 86_400_000);
      this.lastPruneAt = Date.now();
      await this.heartbeat();
      await this.flushOutbox();
      while (!this.stopping) {
        try {
          const outcome = await this.step();
          if (outcome === "stopped") {
            break;
          }
          if (runOnce) {
            break;
          }
          if (outcome === "empty") {
            const delayMs = this.lastCalculatedDelayMs || (this.lastRetryAfterMs || 5_000);
            const sleepTarget = Date.now() + delayMs;
            while (!this.stopping && Date.now() < sleepTarget) {
              await sleepFn(Math.min(100, Math.max(0, sleepTarget - Date.now())));
            }
          }
        } catch (stepErr) {
          if (this.stopping) break;
          if (runOnce) throw stepErr;
          logger.warn("Coordinator communication failure, backing off 5s before reconnecting...", stepErr);
          await sleepFn(5_000);
        }
      }
    } catch (err) {
      logger.error("Unexpected error in daemon loop", err);
      this.stop("failed");
      throw err;
    } finally {
      if (stopFilePoll !== undefined) clearInterval(stopFilePoll);
      this.stop();
    }
  }
}
