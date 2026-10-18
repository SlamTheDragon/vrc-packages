import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { CrawlerNodeDaemon } from "../src/runner/daemon.ts";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import type { NodeRuntimeConfig } from "../src/config/runtime_config.ts";
import {
  ClaimRequestSchema,
  ClaimResponseSchema,
  CrawlJobSchema,
  HeartbeatRequestSchema,
  HeartbeatResponseSchema,
  ResultRequestSchema,
  ResultResponseSchema,
  BatchResultRequestSchema,
  BatchResultResponseSchema,
  type ClaimResponse,
  type ResultRequest,
  type BatchResultRequest,
  type CrawlJob,
  PROTOCOL_VERSION
} from "vrc-packages-network/node";

/**
 * Multi-Platform Mock Source Data
 */
const VPM_COMMUNITY_REPO_URL = "https://vpm.community.example.org/index.json";
const GITHUB_REPO_API_URL = "https://api.github.com/repos/community-team/tool";
const BOOTH_BROWSE_URL = "https://booth.pm/ja/browse/3D%E3%83%A2%E3%83%87%E3%83%AB?page=1";
const BOOTH_ITEM_URL = "https://booth.pm/ja/items/111111";
const KOFI_ITEM_URL = "https://ko-fi.com/s/sample-vrc-item";

const MOCK_VPM_REPO_BODY = JSON.stringify({
  name: "Community VPM Listing",
  author: "Community Team",
  url: VPM_COMMUNITY_REPO_URL,
  packages: {
    "com.community.tool": {
      versions: {
        "1.0.0": {
          name: "com.community.tool",
          version: "1.0.0",
          displayName: "Community Avatar Tool",
          description: "Essential community tool for VRChat creators",
          author: { name: "Community Team", url: "https://github.com/community-team" },
          url: "https://github.com/community-team/tool/releases/download/v1.0.0/package.zip",
          repo: "https://github.com/community-team/tool",
          zipSHA256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          vpmDependencies: {
            "com.vrchat.avatars": ">=3.0.0"
          }
        }
      }
    }
  }
});

const MOCK_GITHUB_REPO_BODY = JSON.stringify({
  id: 98765432,
  name: "tool",
  full_name: "community-team/tool",
  private: false,
  owner: { login: "community-team" },
  html_url: "https://github.com/community-team/tool",
  description: "Official community avatar tool repository",
  homepage: "https://vpm.community.example.org",
  updated_at: "2026-10-18T00:00:00Z",
  topics: ["vrchat", "avatar", "vpm"]
});

const MOCK_BOOTH_BROWSE_BODY = `<!DOCTYPE html>
<html>
<body>
  <div class="item-card"><a href="https://booth.pm/ja/items/111111">Modular Avatar Dress</a></div>
  <div class="item-card"><a href="https://booth.pm/ja/items/222222">Shading Utility</a></div>
</body>
</html>`;

const MOCK_BOOTH_ITEM_BODY = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="【VRChat想定】Modular Avatar対応 ドレス" />
  <meta property="og:description" content="Modular Avatar対応のドレス衣装です。" />
  <meta name="author" content="BoothCreator" />
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "【VRChat想定】Modular Avatar対応 ドレス",
    "description": "Modular Avatar対応のドレス衣装です。",
    "brand": { "name": "BoothCreator" },
    "url": "${BOOTH_ITEM_URL}"
  }
  </script>
</head>
<body>
  <h1 class="item-name">【VRChat想定】Modular Avatar対応 ドレス</h1>
  <div class="shop-name">BoothCreator</div>
  <div class="item-description">
    <p>Modular Avatarで簡単に着せ替え可能なドレスです。</p>
    <a href="https://github.com/bdunderscore/modular-avatar">Modular Avatar GitHub</a>
  </div>
</body>
</html>`;

const MOCK_KOFI_ITEM_BODY = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="VRChat Particle Shader Asset (Ko-fi Shop)" />
  <meta property="og:description" content="Custom anime particle shader for VRChat avatars on Ko-fi." />
  <meta name="author" content="KofiCreator" />
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "VRChat Particle Shader Asset",
    "description": "Custom anime particle shader for VRChat avatars on Ko-fi.",
    "author": { "name": "KofiCreator" },
    "url": "${KOFI_ITEM_URL}"
  }
  </script>
</head>
<body>
  <h1>VRChat Particle Shader Asset</h1>
  <div class="user-name">KofiCreator</div>
  <div class="description-text">
    <p>High performance particle shader.</p>
    <a href="https://vpm.community.example.org/index.json">VPM Listing</a>
  </div>
</body>
</html>`;

/**
 * Mock Multi-Platform Metadata Fetcher
 */
function mockMultiPlatformFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
  if (url === VPM_COMMUNITY_REPO_URL) {
    return Promise.resolve(new Response(MOCK_VPM_REPO_BODY, {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
  }
  if (url === GITHUB_REPO_API_URL) {
    return Promise.resolve(new Response(MOCK_GITHUB_REPO_BODY, {
      status: 200,
      headers: { "content-type": "application/vnd.github+json" }
    }));
  }
  if (url === BOOTH_BROWSE_URL) {
    return Promise.resolve(new Response(MOCK_BOOTH_BROWSE_BODY, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    }));
  }
  if (url === BOOTH_ITEM_URL) {
    return Promise.resolve(new Response(MOCK_BOOTH_ITEM_BODY, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    }));
  }
  if (url === KOFI_ITEM_URL) {
    return Promise.resolve(new Response(MOCK_KOFI_ITEM_BODY, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    }));
  }
  if (url.endsWith("/robots.txt")) {
    return Promise.resolve(new Response("User-agent: *\nDisallow: /admin\nAllow: /\n", {
      status: 200,
      headers: { "content-type": "text/plain" }
    }));
  }
  return Promise.resolve(new Response("Not Found", { status: 404 }));
}

/**
 * In-Memory Coordinator Fleet Hub
 * Implements coordinator loopback HTTP transport contracts for multi-node simulation.
 */
class MockCoordinatorFleetHub {
  private queue: CrawlJob[] = [];
  public activeLeases = new Map<string, { job: CrawlJob; nodeId: string; expiresAtMs: number; leaseId: string }>();
  public submittedResults: Array<{ nodeId: string; jobId: string; idempotencyKey: string; outcome: ResultRequest["outcome"] }> = [];
  public robotsClaims: Array<{ origin: string; leaseId: string; leasedTo?: string }> = [];
  public submittedRobots: Array<{ nodeId: string; origin: string; statusCode: number; body: string }> = [];
  public transientFailuresRemaining: number = 0;

  constructor() {}

  public addJob(job: CrawlJob): void {
    this.queue.push(job);
  }

  public addRobotsTask(origin: string): void {
    this.robotsClaims.push({ origin, leaseId: crypto.randomUUID() });
  }

  public handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const authHeader = request.headers.get("authorization") || "";

    // Check for transient failure simulation
    if (this.transientFailuresRemaining > 0 && url.pathname.includes("/jobs/result")) {
      this.transientFailuresRemaining--;
      return new Response(JSON.stringify({ error: "Cloudflare 522 Origin Connection Timeout" }), {
        status: 522,
        headers: { "content-type": "application/json" }
      });
    }

    const payload = await request.json() as any;

    switch (url.pathname) {
      case "/v1/node/jobs/claim": {
        const parsed = ClaimRequestSchema.parse(payload);
        const maxJobs = parsed.maxJobs ?? 1;
        const nowMs = Date.now();

        // Prune expired leases
        for (const [jobId, lease] of this.activeLeases.entries()) {
          if (lease.expiresAtMs <= nowMs) {
            this.activeLeases.delete(jobId);
            this.queue.unshift(lease.job);
          }
        }

        const claimedJobs: CrawlJob[] = [];
        while (claimedJobs.length < maxJobs && this.queue.length > 0) {
          const candidate = this.queue.shift()!;
          const leaseId = crypto.randomUUID();
          const expiresAtMs = nowMs + 30_000;
          const leasedJob: CrawlJob = {
            ...candidate,
            leaseId,
            leaseExpiresAt: new Date(expiresAtMs).toISOString()
          };
          this.activeLeases.set(candidate.jobId, {
            job: candidate,
            nodeId: parsed.nodeId,
            expiresAtMs,
            leaseId
          });
          claimedJobs.push(leasedJob);
        }

        if (claimedJobs.length === 0) {
          return Response.json(ClaimResponseSchema.parse({
            schemaVersion: PROTOCOL_VERSION,
            status: "empty",
            retryAfterMs: 5000
          }));
        }

        return Response.json(ClaimResponseSchema.parse({
          schemaVersion: PROTOCOL_VERSION,
          status: "leased",
          job: claimedJobs[0],
          jobs: claimedJobs
        }));
      }

      case "/v1/node/heartbeat": {
        const parsed = HeartbeatRequestSchema.parse(payload);
        if (parsed.state === "fetching" && parsed.activeJobId && parsed.activeLeaseId) {
          const lease = this.activeLeases.get(parsed.activeJobId);
          if (!lease || lease.leaseId !== parsed.activeLeaseId || lease.nodeId !== parsed.nodeId) {
            return new Response(JSON.stringify({ error: "Lease not found or expired" }), { status: 403 });
          }
          lease.expiresAtMs = Date.now() + 30_000;
        }
        return Response.json(HeartbeatResponseSchema.parse({
          schemaVersion: PROTOCOL_VERSION,
          status: "alive",
          serverTime: new Date().toISOString()
        }));
      }

      case "/v1/node/jobs/result": {
        const parsed = ResultRequestSchema.parse(payload);
        const lease = this.activeLeases.get(parsed.jobId);
        if (!lease) {
          return new Response(JSON.stringify({ error: "Job lease expired or not found" }), { status: 404 });
        }
        if (lease.nodeId !== parsed.nodeId || lease.leaseId !== parsed.leaseId) {
          return new Response(JSON.stringify({ error: "Lease mismatch: wrong node or lease ID" }), { status: 403 });
        }

        this.activeLeases.delete(parsed.jobId);
        this.submittedResults.push({
          nodeId: parsed.nodeId,
          jobId: parsed.jobId,
          idempotencyKey: parsed.idempotencyKey,
          outcome: parsed.outcome
        });

        return Response.json(ResultResponseSchema.parse({
          schemaVersion: PROTOCOL_VERSION,
          status: "accepted",
          jobId: parsed.jobId,
          duplicate: false,
          sourceVersionCreated: true
        }));
      }

      case "/v1/node/jobs/results": {
        const parsed = BatchResultRequestSchema.parse(payload);
        const receipts = [];
        for (const item of parsed.results) {
          const lease = this.activeLeases.get(item.jobId);
          if (!lease || lease.nodeId !== parsed.nodeId || lease.leaseId !== item.leaseId) {
            receipts.push({
              status: "rejected" as const,
              jobId: item.jobId,
              terminal: true,
              error: "Lease mismatch or expired",
              code: "forbidden" as const
            });
            continue;
          }
          this.activeLeases.delete(item.jobId);
          this.submittedResults.push({
            nodeId: parsed.nodeId,
            jobId: item.jobId,
            idempotencyKey: item.idempotencyKey,
            outcome: item.outcome
          });
          receipts.push({
            status: "accepted" as const,
            jobId: item.jobId,
            duplicate: false,
            sourceVersionCreated: true
          });
        }

        return Response.json(BatchResultResponseSchema.parse({
          schemaVersion: PROTOCOL_VERSION,
          receipts
        }));
      }

      case "/v1/node/robots/claim": {
        const task = this.robotsClaims.find(r => !r.leasedTo);
        if (!task) {
          return Response.json({ schemaVersion: PROTOCOL_VERSION, status: "empty", retryAfterMs: 5000 });
        }
        task.leasedTo = payload.nodeId;
        return Response.json({
          schemaVersion: PROTOCOL_VERSION,
          status: "leased",
          origin: task.origin,
          leaseId: task.leaseId
        });
      }

      case "/v1/node/robots/result": {
        this.submittedRobots.push({
          nodeId: payload.nodeId,
          origin: payload.origin,
          statusCode: payload.statusCode,
          body: payload.body
        });
        return Response.json({ schemaVersion: PROTOCOL_VERSION, status: "accepted", origin: payload.origin });
      }

      default:
        return new Response("Not Found", { status: 404 });
    }
  };
}

function fixtureDirectory(name: string): string {
  const output = resolve(import.meta.dir, "../dist/tests/fleet_simulation");
  mkdirSync(output, { recursive: true });
  return mkdtempSync(join(realpathSync(output), `vrcp-${name}-`));
}

function removeFixture(directory: string): void {
  const root = realpathSync(resolve(import.meta.dir, "../dist/tests/fleet_simulation"));
  if (!realpathSync(directory).startsWith(root + sep)) throw new Error("Unexpected fixture path");
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe("FLEET-S4: Multi-platform End-to-End Fleet Crawl Simulation", () => {
  test("concurrent multi-node leasing and cross-node lease isolation", async () => {
    const hub = new MockCoordinatorFleetHub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = input instanceof Request ? input : new Request(input.toString(), init);
      return hub.handleRequest(req);
    }) as typeof fetch;

    const dirA = fixtureDirectory("node-alpha");
    const dirB = fixtureDirectory("node-beta");

    const storeA = new LocalNodeStore(join(dirA, "node.sqlite"));
    const storeB = new LocalNodeStore(join(dirB, "node.sqlite"));

    const configA: NodeRuntimeConfig = {
      nodeId: "crawler-node-alpha",
      token: "vrcp_token_alpha",
      capabilities: ["vpm", "github", "booth", "custom_domain"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: join(dirA, "node.sqlite")
    };

    const configB: NodeRuntimeConfig = {
      nodeId: "crawler-node-beta",
      token: "vrcp_token_beta",
      capabilities: ["vpm", "github", "booth", "custom_domain"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: join(dirB, "node.sqlite")
    };

    const clientA = new CoordinatorClient(configA.baseUrl, configA.token, configA.nodeId, configA.capabilities, { maxRetries: 0 });
    const clientB = new CoordinatorClient(configB.baseUrl, configB.token, configB.nodeId, configB.capabilities, { maxRetries: 0 });

    const daemonA = new CrawlerNodeDaemon(configA, storeA, clientA, { fetchFn: mockMultiPlatformFetch as any });
    const daemonB = new CrawlerNodeDaemon(configB, storeB, clientB, { fetchFn: mockMultiPlatformFetch as any });

    try {
      // Add two jobs to coordinator queue with valid UUIDs
      hub.addJob(CrawlJobSchema.parse({
        jobId: "job-vpm-community",
        leaseId: crypto.randomUUID(),
        platform: "vpm",
        purpose: "metadata",
        url: VPM_COMMUNITY_REPO_URL,
        origin: "https://vpm.community.example.org",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts", "creator_prose"],
        etag: null,
        lastModified: null
      }));

      hub.addJob(CrawlJobSchema.parse({
        jobId: "job-github-tool",
        leaseId: crypto.randomUUID(),
        platform: "github",
        purpose: "metadata",
        url: GITHUB_REPO_API_URL,
        origin: "https://api.github.com",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // Node Alpha claims Job 1
      const claimA = await clientA.claim();
      expect(claimA.status).toBe("leased");
      if (claimA.status !== "leased" || !claimA.job) throw new Error("Expected leased claimA");
      expect(claimA.job.jobId).toBe("job-vpm-community");

      // Node Beta claims concurrently and receives Job 2 (Job 1 is isolated and unavailable to Beta)
      const claimB = await clientB.claim();
      expect(claimB.status).toBe("leased");
      if (claimB.status !== "leased" || !claimB.job) throw new Error("Expected leased claimB");
      expect(claimB.job.jobId).toBe("job-github-tool");

      // Cross-Node Lease Isolation: Node Beta attempts to submit result with Node Alpha's lease
      const rogueSubmit = clientB.submit({
        jobId: claimA.job!.jobId,
        leaseId: claimA.job!.leaseId,
        idempotencyKey: "rogue-submission-idempotency-key",
        outcome: { kind: "unchanged" }
      });
      await expect(rogueSubmit).rejects.toThrow();

      // Node Alpha submits valid VPM outcome
      const resA = await clientA.submit({
        jobId: claimA.job!.jobId,
        leaseId: claimA.job!.leaseId,
        idempotencyKey: "valid-alpha-idempotency-key-001",
        outcome: {
          kind: "batch",
          observations: [{
            sourceItemKey: "com.community.tool",
            title: "Community Avatar Tool",
            author: "Community Team",
            summary: "Essential community tool for VRChat creators",
            outboundLinks: ["https://vpm.community.example.org/index.json"],
            originUpdatedAt: "2026-10-18T00:00:00.000Z"
          }]
        }
      });
      expect(resA.status).toBe("accepted");
      expect(resA.jobId).toBe("job-vpm-community");

      // Node Beta submits valid GitHub outcome
      const resB = await clientB.submit({
        jobId: claimB.job!.jobId,
        leaseId: claimB.job!.leaseId,
        idempotencyKey: "valid-beta-idempotency-key-002",
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "github:98765432",
            title: "tool",
            author: "community-team",
            summary: "Official community avatar tool repository",
            outboundLinks: ["https://github.com/community-team/tool"],
            originUpdatedAt: "2026-10-18T00:00:00.000Z"
          }
        }
      });
      expect(resB.status).toBe("accepted");
      expect(resB.jobId).toBe("job-github-tool");

      expect(hub.submittedResults.length).toBe(2);
      expect(hub.submittedResults[0].nodeId).toBe("crawler-node-alpha");
      expect(hub.submittedResults[1].nodeId).toBe("crawler-node-beta");
    } finally {
      globalThis.fetch = originalFetch;
      daemonA.stop();
      daemonB.stop();
      storeA.close();
      storeB.close();
      removeFixture(dirA);
      removeFixture(dirB);
    }
  });

  test("multi-platform driver fetching across VPM, GitHub, Booth, and Ko-fi storefront", async () => {
    const hub = new MockCoordinatorFleetHub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = input instanceof Request ? input : new Request(input.toString(), init);
      return hub.handleRequest(req);
    }) as typeof fetch;

    const dir = fixtureDirectory("multi-driver");
    const store = new LocalNodeStore(join(dir, "node.sqlite"));
    const config: NodeRuntimeConfig = {
      nodeId: "crawler-driver-node",
      token: "vrcp_driver_token",
      capabilities: ["vpm", "github", "booth", "custom_domain"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: join(dir, "node.sqlite")
    };
    const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities, { maxRetries: 0 });
    const daemon = new CrawlerNodeDaemon(config, store, client, { fetchFn: mockMultiPlatformFetch as any });

    try {
      // 1. Add VPM repository job
      hub.addJob(CrawlJobSchema.parse({
        jobId: "driver-vpm-job",
        leaseId: crypto.randomUUID(),
        platform: "vpm",
        purpose: "metadata",
        url: VPM_COMMUNITY_REPO_URL,
        origin: "https://vpm.community.example.org",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // 2. Add GitHub repository job
      hub.addJob(CrawlJobSchema.parse({
        jobId: "driver-github-job",
        leaseId: crypto.randomUUID(),
        platform: "github",
        purpose: "metadata",
        url: GITHUB_REPO_API_URL,
        origin: "https://api.github.com",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // 3. Add Booth browse discovery job
      hub.addJob(CrawlJobSchema.parse({
        jobId: "driver-booth-discovery-job",
        leaseId: crypto.randomUUID(),
        platform: "booth",
        purpose: "discovery",
        url: BOOTH_BROWSE_URL,
        origin: "https://booth.pm",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // 4. Add Ko-fi custom domain storefront job
      hub.addJob(CrawlJobSchema.parse({
        jobId: "driver-kofi-metadata-job",
        leaseId: crypto.randomUUID(),
        platform: "custom_domain",
        purpose: "metadata",
        url: KOFI_ITEM_URL,
        origin: "https://ko-fi.com",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // Step 1: Ingest VPM repository
      const step1 = await daemon.step();
      expect(step1).toBe("claimed");

      // Step 2: Ingest GitHub repository
      const step2 = await daemon.step();
      expect(step2).toBe("claimed");

      // Step 3: Ingest Booth discovery
      const step3 = await daemon.step();
      expect(step3).toBe("claimed");

      // Step 4: Ingest Ko-fi storefront
      const step4 = await daemon.step();
      expect(step4).toBe("claimed");

      // Verify all 4 drivers yielded valid coordinator receipts
      expect(hub.submittedResults.length).toBe(4);

      // Verify VPM outcome
      const vpmSubmission = hub.submittedResults.find(r => r.jobId === "driver-vpm-job");
      expect(vpmSubmission?.outcome.kind).toBe("batch");
      if (vpmSubmission?.outcome.kind === "batch") {
        expect(vpmSubmission.outcome.observations.length).toBe(1);
        expect(vpmSubmission.outcome.observations[0].sourceItemKey).toBe("com.community.tool");
        expect(vpmSubmission.outcome.observations[0].title).toBe("Community Avatar Tool");
      }

      // Verify GitHub outcome
      const githubSubmission = hub.submittedResults.find(r => r.jobId === "driver-github-job");
      expect(githubSubmission?.outcome.kind).toBe("changed");
      if (githubSubmission?.outcome.kind === "changed") {
        expect(githubSubmission.outcome.observation.sourceItemKey).toBe("github:98765432");
        expect(githubSubmission.outcome.observation.author).toBe("community-team");
      }

      // Verify Booth discovery outcome
      const boothSubmission = hub.submittedResults.find(r => r.jobId === "driver-booth-discovery-job");
      expect(boothSubmission?.outcome.kind).toBe("discovery");
      if (boothSubmission?.outcome.kind === "discovery") {
        expect(boothSubmission.outcome.leads.length).toBe(2);
        expect(boothSubmission.outcome.leads.some(l => l.url === "https://booth.pm/ja/items/111111")).toBe(true);
      }

      // Verify Ko-fi custom domain storefront outcome
      const kofiSubmission = hub.submittedResults.find(r => r.jobId === "driver-kofi-metadata-job");
      expect(kofiSubmission?.outcome.kind).toBe("changed");
      if (kofiSubmission?.outcome.kind === "changed") {
        expect(kofiSubmission.outcome.observation.sourceItemKey).toBe("ko-fi.com/s/sample-vrc-item");
        expect(kofiSubmission.outcome.observation.title).toBe("VRChat Particle Shader Asset");
        expect(kofiSubmission.outcome.observation.author).toBe("KofiCreator");
      }
    } finally {
      globalThis.fetch = originalFetch;
      daemon.stop();
      store.close();
      removeFixture(dir);
    }
  });

  test("outbox staging & resilient batch replay under transient edge failures (522)", async () => {
    const hub = new MockCoordinatorFleetHub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = input instanceof Request ? input : new Request(input.toString(), init);
      return hub.handleRequest(req);
    }) as typeof fetch;

    const dir = fixtureDirectory("outbox-resilience");
    const store = new LocalNodeStore(join(dir, "node.sqlite"));
    const config: NodeRuntimeConfig = {
      nodeId: "crawler-resilience-node",
      token: "vrcp_resilience_token",
      capabilities: ["vpm"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: join(dir, "node.sqlite")
    };
    const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities, { maxRetries: 0 });
    const daemon = new CrawlerNodeDaemon(config, store, client, { fetchFn: mockMultiPlatformFetch as any });

    try {
      hub.addJob(CrawlJobSchema.parse({
        jobId: "job-transient-test",
        leaseId: crypto.randomUUID(),
        platform: "vpm",
        purpose: "metadata",
        url: VPM_COMMUNITY_REPO_URL,
        origin: "https://vpm.community.example.org",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null
      }));

      // Simulate 1 transient edge failure on result submission
      hub.transientFailuresRemaining = 1;

      // Execute step: the fetch succeeds, but the coordinator submit returns 522
      await expect(daemon.step()).rejects.toThrow("Coordinator 522");

      // Verify that the outbox entry was safely staged in SQLite
      const pendingCount = store.getPendingOutboxCount();
      expect(pendingCount).toBe(1);

      // Advance retry timestamp so outbox query and flush pick it up immediately
      (store as any).db.prepare("UPDATE node_outbox SET next_retry_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE job_id = ?")
        .run("job-transient-test");

      const pendingEntries = store.getPendingOutboxEntries(10);
      expect(pendingEntries.length).toBe(1);
      expect(pendingEntries[0].jobId).toBe("job-transient-test");

      // Flush outbox: coordinator transient failures are resolved, so batch replay succeeds
      const flushed = await daemon.flushOutbox();
      expect(flushed).toBe(1);

      // Verify that outbox is now settled
      expect(store.getPendingOutboxCount()).toBe(0);
      expect(hub.submittedResults.length).toBe(1);
      expect(hub.submittedResults[0].jobId).toBe("job-transient-test");
    } finally {
      globalThis.fetch = originalFetch;
      daemon.stop();
      store.close();
      removeFixture(dir);
    }
  });

  test("crash-restart recovery: restarts daemon on existing SQLite database and drains pending outbox", async () => {
    const hub = new MockCoordinatorFleetHub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = input instanceof Request ? input : new Request(input.toString(), init);
      return hub.handleRequest(req);
    }) as typeof fetch;

    const dir = fixtureDirectory("crash-restart");
    const dbPath = join(dir, "node.sqlite");
    const config: NodeRuntimeConfig = {
      nodeId: "crawler-restart-node",
      token: "vrcp_restart_token",
      capabilities: ["vpm"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: dbPath
    };

    const originalIdempotencyKey = "persisted-crash-idempotency-key-001";
    const crashLeaseId = crypto.randomUUID();

    const crashJob = CrawlJobSchema.parse({
      jobId: "crash-job-001",
      leaseId: crashLeaseId,
      platform: "vpm",
      purpose: "metadata",
      url: VPM_COMMUNITY_REPO_URL,
      origin: "https://vpm.community.example.org",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
      retainClasses: ["normalized_facts"],
      etag: null,
      lastModified: null
    });

    // 1. Process 1: Stage a result directly in the outbox as if node crashed before delivery
    const store1 = new LocalNodeStore(dbPath);
    const runId1 = store1.startRun(config.nodeId);
    const taskId1 = store1.recordClaimedJob(runId1, crashJob);
    store1.stageOutboxOutcome(
      taskId1,
      {
        kind: "batch",
        observations: [{
          sourceItemKey: "com.community.tool",
          title: "Pre-Crash Item",
          author: "CrashAuthor",
          summary: "Item persisted across process death",
          outboundLinks: [],
          originUpdatedAt: "2026-10-18T00:00:00.000Z"
        }]
      },
      originalIdempotencyKey
    );
    // Active lease must exist in coordinator
    hub.activeLeases.set("crash-job-001", {
      job: crashJob,
      nodeId: config.nodeId,
      expiresAtMs: Date.now() + 60_000,
      leaseId: crashLeaseId
    });
    store1.close(); // Process 1 crashes / terminates

    // 2. Process 2: Restart node on the exact same database file
    const store2 = new LocalNodeStore(dbPath);
    const client2 = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities, { maxRetries: 0 });
    const daemon2 = new CrawlerNodeDaemon(config, store2, client2, { fetchFn: mockMultiPlatformFetch as any });

    try {
      expect(store2.getPendingOutboxCount()).toBe(1);

      // Flushes outbox without needing to re-fetch the source
      const flushed = await daemon2.flushOutbox();
      expect(flushed).toBe(1);

      // Outbox row is settled
      expect(store2.getPendingOutboxCount()).toBe(0);

      // Coordinator received the submission with the original idempotency key
      expect(hub.submittedResults.length).toBe(1);
      expect(hub.submittedResults[0].jobId).toBe("crash-job-001");
      expect(hub.submittedResults[0].idempotencyKey).toBe(originalIdempotencyKey);
    } finally {
      globalThis.fetch = originalFetch;
      daemon2.stop();
      store2.close();
      removeFixture(dir);
    }
  });

  test("delegated RFC 9309 robots preflight ingestion when crawl jobs are empty", async () => {
    const hub = new MockCoordinatorFleetHub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const req = input instanceof Request ? input : new Request(input.toString(), init);
      return hub.handleRequest(req);
    }) as typeof fetch;

    const dir = fixtureDirectory("robots-delegation");
    const store = new LocalNodeStore(join(dir, "node.sqlite"));
    const config: NodeRuntimeConfig = {
      nodeId: "crawler-robots-node",
      token: "vrcp_robots_token",
      capabilities: ["vpm"],
      baseUrl: "http://127.0.0.1:8787",
      databasePath: join(dir, "node.sqlite")
    };
    const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities, { maxRetries: 0 });
    const daemon = new CrawlerNodeDaemon(config, store, client, { fetchFn: mockMultiPlatformFetch as any });

    try {
      // Coordinator job queue is empty, but a robots preflight refresh is queued
      hub.addRobotsTask("https://vpm.community.example.org");

      // Daemon steps: detects claim empty, automatically claims delegated robots refresh, fetches robots.txt, and submits snapshot
      const stepRes = await daemon.step();
      expect(stepRes).toBe("claimed");

      // Verify robots snapshot was submitted
      expect(hub.submittedRobots.length).toBe(1);
      expect(hub.submittedRobots[0].origin).toBe("https://vpm.community.example.org");
      expect(hub.submittedRobots[0].statusCode).toBe(200);
      expect(hub.submittedRobots[0].body).toContain("Disallow: /admin");
    } finally {
      globalThis.fetch = originalFetch;
      daemon.stop();
      store.close();
      removeFixture(dir);
    }
  });
});
