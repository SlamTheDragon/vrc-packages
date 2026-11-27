import { describe, expect, test } from "bun:test";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { createInitializedD1Coordinator, type InitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { CatalogListResponseSchema, decodeCatalogCursor, OPERATOR_PROTOCOL_VERSION } from "vrc-packages-api";
import { PROTOCOL_VERSION } from "vrc-packages-network/node";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

const OPERATOR_TOKEN = "a".repeat(64);

function operatorGet(path: string, token = OPERATOR_TOKEN): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` }
  });
}

async function setupVpmLease(store: InitializedD1Coordinator): Promise<{
  nodeToken: string;
  jobId: string;
  leaseId: string;
  nodeId: string;
}> {
  const nodeId = "test-node";
  const { token: nodeToken } = await store.createNodeCredential(nodeId, ["vpm"]);
  const principal = (await store.authenticate(nodeId, nodeToken))!;
  await seedApprovedFixtureJob(store, "https://vpm.example.com/index.json", "vpm");
  await store.recordRobotsSnapshot("https://vpm.example.com", 404);
  const claimed = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
  if (claimed.status !== "leased") throw new Error("Expected lease");
  return { nodeToken, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId, nodeId };
}

async function setupGitHubLease(
  store: InitializedD1Coordinator,
  url: string
): Promise<{
  nodeToken: string;
  jobId: string;
  leaseId: string;
  nodeId: string;
}> {
  const nodeId = "test-gh-node";
  const { token: nodeToken } = await store.createNodeCredential(nodeId, ["github"]);
  const principal = (await store.authenticate(nodeId, nodeToken))!;
  await seedApprovedFixtureJob(store, url, "github", 60_000);
  await store.recordRobotsSnapshot("https://api.github.com", 404);
  const claimed = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["github"] }, principal);
  if (claimed.status !== "leased") throw new Error("Expected GitHub lease");
  return { nodeToken, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId, nodeId };
}

async function setupStorefrontLease(
  store: InitializedD1Coordinator,
  url: string,
  platform: "booth" | "gumroad"
): Promise<{
  nodeToken: string;
  jobId: string;
  leaseId: string;
  nodeId: string;
}> {
  const nodeId = `test-${platform}-node`;
  const { token: nodeToken } = await store.createNodeCredential(nodeId, [platform]);
  const principal = (await store.authenticate(nodeId, nodeToken))!;
  await seedApprovedFixtureJob(store, url, platform, 60_000);
  const origin = new URL(url).origin;
  await store.recordRobotsSnapshot(origin, 404);
  const claimed = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: [platform] }, principal);
  if (claimed.status !== "leased") throw new Error(`Expected ${platform} lease`);
  return { nodeToken, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId, nodeId };
}

describe("Canonical projection via VPM observation submission", () => {
  test("VPM batch observation projects canonical_package with unverified default and accepted vpm_id listing_source", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = await setupVpmLease(store);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      const result = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "batch",
            observations: [
              {
                sourceItemKey: "com.example.mypkg",
                title: "My VPM Package",
                author: "Alice",
                ownerKey: "alice_dev",
                ownerName: "Alice Dev",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null,
                release: { version: "2.1.0", dependencyRanges: {} }
              }
            ]
          }
        },
        principal
      );
      expect(result.status).toBe("accepted");
      expect(result.sourceVersionCreated).toBe(true);

      const pkg = await store.getCanonicalPackage("com.example.mypkg");
      expect(pkg).not.toBeNull();
      expect(pkg?.umbrella).toBe("tools");
      expect(pkg?.category).toBe("vpm_package");
      expect(pkg?.lifecycle).toBe("active");
      expect(pkg?.verificationStatus).toBe("unverified");
      expect(pkg?.verifiedByAppId).toBeNull();
      expect(pkg?.displayName).toBe("My VPM Package");
      expect(pkg?.ownerKey).toBe("alice_dev");
      expect(pkg?.ownerName).toBe("Alice Dev");
      expect(pkg?.vpmId).toBe("com.example.mypkg");
      expect(pkg?.vpmLatestVersion).toBe("2.1.0");

      const sources = await store.getListingSourcesForCanonical("com.example.mypkg");
      expect(sources).toHaveLength(1);
      expect(sources[0]?.evidenceKind).toBe("vpm_id");
      expect(sources[0]?.reviewState).toBe("accepted");
      expect(sources[0]?.confidence).toBe(1.0);
    } finally {
      store.close();
    }
  });

  test("re-observation of same VPM package ID is idempotent: no duplicate canonical or listing_source", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = await setupVpmLease(store);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      const obs = {
        sourceItemKey: "com.example.stablekey",
        title: "Stable Package",
        author: "Bob",
        summary: "",
        outboundLinks: [] as string[],
        originUpdatedAt: null
      };
      const idempotencyKey1 = crypto.randomUUID();
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: idempotencyKey1,
          outcome: { kind: "batch", observations: [obs] }
        },
        principal
      );
      const replay = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: idempotencyKey1,
          outcome: { kind: "batch", observations: [obs] }
        },
        principal
      );
      expect(replay.duplicate).toBe(true);

      const pkg = await store.getCanonicalPackage("com.example.stablekey");
      expect(pkg).not.toBeNull();
      expect(await store.getListingSourcesForCanonical("com.example.stablekey")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("VPM re-observation with changed title updates canonical displayName cleanly", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const nodeId = "test-node";
      const { token: nodeToken } = await store.createNodeCredential(nodeId, ["vpm"]);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      await store.recordRobotsSnapshot("https://vpm.example.com", 404);

      await seedApprovedFixtureJob(store, "https://vpm.example.com/listing-a.json", "vpm");
      const claimed1 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      if (claimed1.status !== "leased") throw new Error("Expected lease 1");
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claimed1.job.jobId,
          leaseId: claimed1.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.renamed",
              title: "Original Title",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        principal
      );

      expect((await store.getCanonicalPackage("com.example.renamed"))?.displayName).toBe("Original Title");
      expect(await store.getListingSourcesForCanonical("com.example.renamed")).toHaveLength(1);

      store.sqlite
        .prepare("UPDATE origin_state SET next_allowed_at=? WHERE origin=?")
        .run(new Date(0).toISOString(), "https://vpm.example.com");

      await seedApprovedFixtureJob(store, "https://vpm.example.com/listing-b.json", "vpm");
      const claimed2 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      if (claimed2.status !== "leased") throw new Error("Expected lease 2");
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claimed2.job.jobId,
          leaseId: claimed2.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.renamed",
              title: "Updated Title",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        principal
      );

      expect((await store.getCanonicalPackage("com.example.renamed"))?.displayName).toBe("Updated Title");
      const sources = await store.getListingSourcesForCanonical("com.example.renamed");
      expect(sources.every((s) => s.evidenceKind === "vpm_id")).toBe(true);
      expect(sources.every((s) => s.reviewState === "accepted")).toBe(true);
      expect(sources.length).toBeGreaterThanOrEqual(1);
    } finally {
      store.close();
    }
  });

  test("non-VPM storefront observation automatically creates canonical package and listing_source", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const nodeId = "test-node";
      const { token: nodeToken } = await store.createNodeCredential(nodeId, ["booth"]);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      await seedApprovedFixtureJob(store, "https://booth.pm/ja/items/12345", "booth");
      await store.recordRobotsSnapshot("https://booth.pm", 404);
      const claimed = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      if (claimed.status !== "leased") throw new Error("Expected lease");
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claimed.job.jobId,
          leaseId: claimed.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/12345",
              title: "Cool Shader",
              author: "Carol",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        principal
      );
      const { packages } = await store.listCanonicalPackagesPage(100, null);
      expect(packages).toHaveLength(1);
      expect(packages[0]?.canonicalId).toBe("booth.pm/ja/items/12345");
      expect(packages[0]?.displayName).toBe("Cool Shader");
      expect(packages[0]?.vpmId).toBeNull();
      expect(packages[0]?.verificationStatus).toBe("unverified");
      expect(packages[0]?.sources).toHaveLength(1);
      expect(packages[0]?.sources[0]?.platform).toBe("booth");
      expect(packages[0]?.sources[0]?.storefrontUrl).toBe("https://booth.pm/ja/items/12345");
    } finally {
      store.close();
    }
  });

  test("listCanonicalPackagesPage returns empty when no VPM observations ingested", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { packages, nextCursor } = await store.listCanonicalPackagesPage(10, null);
      expect(packages).toHaveLength(0);
      expect(nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("listCanonicalPackagesPage paginates across multiple VPM packages", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const nodeId = "test-node";
      const { token: nodeToken } = await store.createNodeCredential(nodeId, ["vpm"]);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      await store.recordRobotsSnapshot("https://vpm.example.com", 404);

      const packages = [
        { sourceItemKey: "com.example.alpha", title: "Alpha", url: "https://vpm.example.com/alpha.json" },
        { sourceItemKey: "com.example.beta", title: "Beta", url: "https://vpm.example.com/beta.json" },
        { sourceItemKey: "com.example.gamma", title: "Gamma", url: "https://vpm.example.com/gamma.json" }
      ];
      for (const { sourceItemKey, title, url } of packages) {
        await seedApprovedFixtureJob(store, url, "vpm");
        const claimed = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
        if (claimed.status !== "leased") continue;
        await store.submit(
          {
            schemaVersion: PROTOCOL_VERSION,
            nodeId,
            jobId: claimed.job.jobId,
            leaseId: claimed.job.leaseId,
            idempotencyKey: crypto.randomUUID(),
            outcome: {
              kind: "changed",
              observation: { sourceItemKey, title, author: "X", summary: "", outboundLinks: [], originUpdatedAt: null }
            }
          },
          principal
        );
        store.sqlite
          .prepare("UPDATE origin_state SET next_allowed_at=? WHERE origin=?")
          .run(new Date(0).toISOString(), "https://vpm.example.com");
      }

      const page1 = await store.listCanonicalPackagesPage(2, null);
      expect(page1.packages).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const cursor = decodeCatalogCursor(page1.nextCursor!);
      const page2 = await store.listCanonicalPackagesPage(2, cursor);
      expect(page2.packages).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });
});

describe("vrchatRelevance node-offloaded projection gate", () => {
  test("retains source_items row when vrchatRelevance.isRelevant is false while excluding canonical projection", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const boothUrl = "https://booth.pm/ja/items/99111";
      const { nodeToken, jobId, leaseId, nodeId } = await setupStorefrontLease(store, boothUrl, "booth");
      const principal = (await store.authenticate(nodeId, nodeToken))!;

      const res = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: "non-vrc-001",
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/99111",
              title: "Cooking Recipe PDF",
              author: "Chef",
              summary: "Not related to VRChat",
              outboundLinks: [],
              originUpdatedAt: null,
              vrchatRelevance: {
                isRelevant: false,
                confidence: 0.96,
                matchedSignals: [],
                rejectionReason: "no_vrchat_signals"
              }
            }
          }
        },
        principal
      );
      expect(res.status).toBe("accepted");
      expect(res.sourceVersionCreated).toBe(true);

      const sourceItemCount = (
        store.sqlite.prepare("SELECT COUNT(*) AS n FROM source_items WHERE source_url = ?").get(boothUrl) as { n: number }
      ).n;
      expect(sourceItemCount).toBe(1);
      expect((await store.listCanonicalPackagesPage(10, null)).packages).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});

describe("Repository match listing_source linking on GitHub submission", () => {
  test("creates provisional repository_match source when GitHub repo matches lead discovered from VPM package", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.animtool",
              title: "Animation Tool",
              author: "Alice",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      const leadKey = crypto.randomUUID();
      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,'com.example.animtool','github_repository','https://github.com/vrc-dev/anim-tool','github.com',NULL,'pending_review',datetime('now'),datetime('now'))`
        )
        .run(leadKey, vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/anim-tool";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      const ghResult = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:555666",
              title: "anim-tool",
              author: "vrc-dev",
              summary: "",
              outboundLinks: ["https://github.com/vrc-dev/anim-tool"],
              originUpdatedAt: null
            }
          }
        },
        ghPrincipal
      );
      expect(ghResult.status).toBe("accepted");

      const sources = await store.getListingSourcesForCanonical("com.example.animtool");
      expect(sources).toHaveLength(2);

      const vpmSource = sources.find((s) => s.evidenceKind === "vpm_id");
      expect(vpmSource?.reviewState).toBe("accepted");
      expect(vpmSource?.confidence).toBe(1.0);

      const ghSource = sources.find((s) => s.evidenceKind === "repository_match");
      expect(ghSource).toBeDefined();
      expect(ghSource?.reviewState).toBe("provisional");
      expect(ghSource?.confidence).toBe(0.7);
      expect(ghSource?.sourceKey).toBe(`github:${ghUrl}:github:555666`);

      const catalogPage = await store.listCanonicalPackagesPage(10, null);
      const catalogPkg = catalogPage.packages.find((p) => p.canonicalId === "com.example.animtool");
      expect(catalogPkg?.sources).toHaveLength(1);
      expect(catalogPkg?.sources[0]?.evidenceKind).toBe("vpm_id");

      await store.upsertListingSource({
        canonicalId: "com.example.animtool",
        sourceKey: ghSource!.sourceKey,
        platform: "github",
        storefrontUrl: ghSource!.storefrontUrl,
        evidenceKind: "repository_match",
        confidence: ghSource!.confidence,
        reviewState: "accepted"
      });

      const updatedPage = await store.listCanonicalPackagesPage(10, null);
      const updatedPkg = updatedPage.packages.find((p) => p.canonicalId === "com.example.animtool");
      expect(updatedPkg?.sources).toHaveLength(2);
      expect(updatedPkg?.sources.some((s) => s.evidenceKind === "repository_match")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("provisional repository_match source is idempotent on re-submission", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.idem",
              title: "Idem Tool",
              author: "Bob",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,'com.example.idem','github_repository','https://github.com/vrc-dev/idem-tool','github.com',NULL,'pending_review',datetime('now'),datetime('now'))`
        )
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/idem-tool";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      const ghObs = {
        sourceItemKey: "github:777888",
        title: "idem-tool",
        author: "vrc-dev",
        summary: "",
        outboundLinks: ["https://github.com/vrc-dev/idem-tool"],
        originUpdatedAt: null
      };

      const ghIdempotency = crypto.randomUUID();
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: ghIdempotency,
          outcome: { kind: "changed", observation: ghObs }
        },
        ghPrincipal
      );

      expect(await store.getListingSourcesForCanonical("com.example.idem")).toHaveLength(2);

      const replay = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: ghIdempotency,
          outcome: { kind: "changed", observation: ghObs }
        },
        ghPrincipal
      );
      expect(replay.duplicate).toBe(true);
      expect(await store.getListingSourcesForCanonical("com.example.idem")).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  test("unrelated GitHub repo without matching lead does not link to canonical package", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const ghUrl = "https://api.github.com/repos/independent/unrelated-repo";
      const { nodeToken, jobId, leaseId, nodeId } = await setupGitHubLease(store, ghUrl);
      const principal = (await store.authenticate(nodeId, nodeToken))!;

      const result = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:111222",
              title: "unrelated-repo",
              author: "independent",
              summary: "",
              outboundLinks: ["https://github.com/independent/unrelated-repo"],
              originUpdatedAt: null
            }
          }
        },
        principal
      );
      expect(result.status).toBe("accepted");

      const { packages } = await store.listCanonicalPackagesPage(10, null);
      expect(packages).toHaveLength(0);
      const rows = store.sqlite
        .prepare("SELECT * FROM listing_sources WHERE source_key = ?")
        .all(`github:${ghUrl}:github:111222`);
      expect(rows).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("GitHub repo matching one package does NOT link to other packages from same VPM repo", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "batch",
            observations: [
              {
                sourceItemKey: "com.example.toolA",
                title: "Tool A",
                author: "Dev",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null
              },
              {
                sourceItemKey: "com.example.toolB",
                title: "Tool B",
                author: "Dev",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null
              }
            ]
          }
        },
        vpmPrincipal
      );

      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,'com.example.toolA','github_repository','https://github.com/vrc-dev/tool-a','github.com',NULL,'pending_review',datetime('now'),datetime('now'))`
        )
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/tool-a";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:999000",
              title: "tool-a",
              author: "vrc-dev",
              summary: "",
              outboundLinks: ["https://github.com/vrc-dev/tool-a"],
              originUpdatedAt: null
            }
          }
        },
        ghPrincipal
      );

      expect(await store.getListingSourcesForCanonical("com.example.toolA")).toHaveLength(2);
      const toolBSources = await store.getListingSourcesForCanonical("com.example.toolB");
      expect(toolBSources).toHaveLength(1);
      expect(toolBSources[0]?.evidenceKind).toBe("vpm_id");
    } finally {
      store.close();
    }
  });

  test("handles case variations, trailing slashes, and .git suffix in lead target_url", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.casepkg",
              title: "Case Pkg",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,'com.example.casepkg','github_repository','https://github.com/VRC-Dev/CasePkg.git/','github.com',NULL,'pending_review',datetime('now'),datetime('now'))`
        )
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/casepkg";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:123321",
              title: "casepkg",
              author: "vrc-dev",
              summary: "",
              outboundLinks: ["https://github.com/vrc-dev/casepkg"],
              originUpdatedAt: null
            }
          }
        },
        ghPrincipal
      );

      const sources = await store.getListingSourcesForCanonical("com.example.casepkg");
      expect(sources).toHaveLength(2);
      expect(sources.some((s) => s.evidenceKind === "repository_match")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("links canonical package via claimed_package_id on source lead", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.claimedpkg",
              title: "Claimed Pkg",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,NULL,'github_repository','https://github.com/vrc-dev/claimed-pkg','github.com','com.example.claimedpkg','pending_review',datetime('now'),datetime('now'))`
        )
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/claimed-pkg";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:456654",
              title: "claimed-pkg",
              author: "vrc-dev",
              summary: "",
              outboundLinks: ["https://github.com/vrc-dev/claimed-pkg"],
              originUpdatedAt: null
            }
          }
        },
        ghPrincipal
      );

      const sources = await store.getListingSourcesForCanonical("com.example.claimedpkg");
      expect(sources).toHaveLength(2);
      expect(sources.some((s) => s.evidenceKind === "repository_match")).toBe(true);
    } finally {
      store.close();
    }
  });

  test("untargeted lead with null item key and null claimed package id does not link", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.untargeted",
              title: "Untargeted",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      store.sqlite
        .prepare(
          `INSERT INTO source_leads
           (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,target_host,claimed_package_id,status,first_seen_at,last_seen_at)
           VALUES (?,'https://vpm.example.com/index.json',?,NULL,'github_repository','https://github.com/vrc-dev/untargeted-repo','github.com',NULL,'pending_review',datetime('now'),datetime('now'))`
        )
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/untargeted-repo";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = await setupGitHubLease(
        store,
        ghUrl
      );
      const ghPrincipal = (await store.authenticate(ghNodeId, ghToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: ghNodeId,
          jobId: ghJobId,
          leaseId: ghLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "github:789987",
              title: "untargeted-repo",
              author: "vrc-dev",
              summary: "",
              outboundLinks: ["https://github.com/vrc-dev/untargeted-repo"],
              originUpdatedAt: null
            }
          }
        },
        ghPrincipal
      );

      const sources = await store.getListingSourcesForCanonical("com.example.untargeted");
      expect(sources).toHaveLength(1);
      expect(sources[0]?.evidenceKind).toBe("vpm_id");
    } finally {
      store.close();
    }
  });
});

describe("GET /v1/operator/catalog endpoint", () => {
  test("in-process: node token denied on catalog route", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { token: nodeToken } = await store.createNodeCredential("n1", ["vpm"]);
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog", nodeToken),
        store,
        OPERATOR_TOKEN
      );
      expect(response.status).toBe(401);
    } finally {
      store.close();
    }
  });

  test("in-process: unknown query param returns 400", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog?foo=bar"),
        store,
        OPERATOR_TOKEN
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("invalid_query");
    } finally {
      store.close();
    }
  });

  test("in-process: returns empty catalog when no packages ingested", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog"),
        store,
        OPERATOR_TOKEN
      );
      expect(response.status).toBe(200);
      const body = CatalogListResponseSchema.parse(await response.json());
      expect(body.schemaVersion).toBe(OPERATOR_PROTOCOL_VERSION);
      expect(body.packages).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("in-process: returns canonical package with accepted sources and relations", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = await setupVpmLease(store);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.test.pkga",
              title: "Package A",
              author: "Dev",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        principal
      );

      const response = await handleOperatorRequest(operatorGet("/v1/operator/catalog"), store, OPERATOR_TOKEN);
      expect(response.status).toBe(200);
      const body = CatalogListResponseSchema.parse(await response.json());
      expect(body.packages).toHaveLength(1);
      const pkg = body.packages[0]!;
      expect(pkg.canonicalId).toBe("com.test.pkga");
      expect(pkg.vpmId).toBe("com.test.pkga");
      expect(pkg.umbrella).toBe("tools");
      expect(pkg.category).toBe("vpm_package");
      expect(pkg.lifecycle).toBe("active");
      expect(pkg.verificationStatus).toBe("unverified");
      expect(pkg.displayName).toBe("Package A");
      expect(pkg.sources).toHaveLength(1);
      expect(pkg.sources[0]?.evidenceKind).toBe("vpm_id");
      expect(pkg.sources[0]?.confidence).toBe(1.0);
    } finally {
      store.close();
    }
  });

  test("operator catalog serializes accepted listing sources and rejects node credentials", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = await setupVpmLease(store);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "batch",
            observations: [
              {
                sourceItemKey: "com.catalog.pkg1",
                title: "Catalog One",
                author: "X",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null
              },
              {
                sourceItemKey: "com.catalog.pkg2",
                title: "Catalog Two",
                author: "Y",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null
              }
            ]
          }
        },
        principal
      );

      const response = await handleOperatorRequest(operatorGet("/v1/operator/catalog"), store, OPERATOR_TOKEN);
      expect(response.status).toBe(200);
      const body = CatalogListResponseSchema.parse(await response.json());
      expect(body.packages.map((p) => p.canonicalId).sort()).toEqual(["com.catalog.pkg1", "com.catalog.pkg2"]);
      for (const pkg of body.packages) {
        expect(pkg.sources).toHaveLength(1);
        expect(pkg.sources[0]?.evidenceKind).toBe("vpm_id");
      }

      const denied = await handleOperatorRequest(operatorGet("/v1/operator/catalog", nodeToken), store, OPERATOR_TOKEN);
      expect(denied.status).toBe(401);
    } finally {
      store.close();
    }
  });
});

describe("Listing sources relational projection (V0 unified model)", () => {
  test("storefront observation attached to canonical package projects listing_sources correctly", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.frontpkg",
              title: "Fronted Package",
              author: "Author",
              summary: "A package with storefront",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      const boothUrl = "https://booth.pm/ja/items/88888";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        await setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = (await store.authenticate(boothNodeId, boothToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: boothNodeId,
          jobId: boothJobId,
          leaseId: boothLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/88888",
              title: "Fronted Package on BOOTH",
              author: "Author",
              summary: "Storefront description",
              outboundLinks: [],
              originUpdatedAt: null,
              price: 2500,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        boothPrincipal
      );

      const boothSourceKey = `booth:${boothUrl}:booth.pm/ja/items/88888`;
      await store.upsertListingSource({
        canonicalId: "com.example.frontpkg",
        sourceKey: boothSourceKey,
        platform: "booth",
        storefrontUrl: boothUrl,
        evidenceKind: "cross_storefront_link",
        confidence: 0.95,
        reviewState: "accepted",
        price: 2500,
        currency: "JPY",
        availability: "available"
      });

      const sources = await store.getListingSourcesForCanonical("com.example.frontpkg");
      const boothSource = sources.find((s) => s.platform === "booth");
      expect(boothSource?.price).toBe(2500);
      expect(boothSource?.currency).toBe("JPY");
      expect(boothSource?.availability).toBe("available");

      const page = await store.listCanonicalPackagesPage(10, null);
      const pkg = page.packages.find((p) => p.canonicalId === "com.example.frontpkg");
      expect(pkg?.sources.find((s) => s.platform === "booth")?.price).toBe(2500);
    } finally {
      store.close();
    }
  });

  test("price and currency updates on a listing_source update price without modifying canonical package metadata", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.pricepkg",
              title: "Original Canonical Title",
              author: "Author",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      const beforePkg = (await store.getCanonicalPackage("com.example.pricepkg"))!;

      const boothUrl = "https://booth.pm/ja/items/77777";
      const { nodeToken: boothToken, jobId: boothJobId1, leaseId: boothLeaseId1, nodeId: boothNodeId } =
        await setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = (await store.authenticate(boothNodeId, boothToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: boothNodeId,
          jobId: boothJobId1,
          leaseId: boothLeaseId1,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/77777",
              title: "BOOTH Storefront Title 1",
              author: "Author",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null,
              price: 1000,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        boothPrincipal
      );

      const boothSourceKey = `booth:${boothUrl}:booth.pm/ja/items/77777`;
      await store.upsertListingSource({
        canonicalId: "com.example.pricepkg",
        sourceKey: boothSourceKey,
        platform: "booth",
        storefrontUrl: boothUrl,
        evidenceKind: "cross_storefront_link",
        confidence: 0.9,
        reviewState: "accepted",
        price: 1000,
        currency: "JPY",
        availability: "available"
      });

      let sources = await store.getListingSourcesForCanonical("com.example.pricepkg");
      expect(sources.find((s) => s.platform === "booth")?.price).toBe(1000);

      store.sqlite
        .prepare("UPDATE origin_state SET next_allowed_at=? WHERE origin=?")
        .run(new Date(0).toISOString(), "https://booth.pm");
      store.sqlite
        .prepare("UPDATE crawl_jobs SET state='pending', next_fetch_at=? WHERE job_id=?")
        .run(new Date(0).toISOString(), boothJobId1);

      const claimed2 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, capabilities: ["booth"] }, boothPrincipal);
      if (claimed2.status !== "leased") throw new Error("Expected re-lease");

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: boothNodeId,
          jobId: claimed2.job.jobId,
          leaseId: claimed2.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/77777",
              title: "BOOTH Storefront Title 2",
              author: "Author",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null,
              price: 1500,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        boothPrincipal
      );

      sources = await store.getListingSourcesForCanonical("com.example.pricepkg");
      expect(sources.find((s) => s.platform === "booth")?.price).toBe(1500);

      const afterPkg = (await store.getCanonicalPackage("com.example.pricepkg"))!;
      expect(afterPkg.displayName).toBe(beforePkg.displayName);
      expect(afterPkg.updatedAt).toBe(beforePkg.updatedAt);
    } finally {
      store.close();
    }
  });

  test("storefront observation with outbound match creates provisional listing_source with storefront price", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = await setupVpmLease(store);
      const vpmPrincipal = (await store.authenticate(vpmNodeId, vpmToken))!;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: vpmNodeId,
          jobId: vpmJobId,
          leaseId: vpmLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.outboundmatch",
              title: "Outbound Match Target",
              author: "Author",
              summary: "",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        vpmPrincipal
      );

      const boothUrl = "https://booth.pm/ja/items/44444";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        await setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = (await store.authenticate(boothNodeId, boothToken))!;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId: boothNodeId,
          jobId: boothJobId,
          leaseId: boothLeaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/44444",
              title: "BOOTH Item Matching VPM",
              author: "Author",
              summary: "",
              outboundLinks: ["https://vpm.example.com/index.json"],
              originUpdatedAt: null,
              price: 1200,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        boothPrincipal
      );

      const sources = await store.getListingSourcesForCanonical("com.example.outboundmatch");
      const provisional = sources.find(
        (s) => s.evidenceKind === "cross_storefront_link" && s.reviewState === "provisional"
      );
      expect(provisional).toBeDefined();
      expect(provisional?.platform).toBe("booth");
      expect(provisional?.price).toBe(1200);
      expect(provisional?.currency).toBe("JPY");
    } finally {
      store.close();
    }
  });
});

describe("TAXONOMY-01 category & qualityFlag normalization", () => {
  test("VPM observation derives category and collects missing_release/missing_zip_sha256 qualityFlags", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = await setupVpmLease(store);
      const principal = (await store.authenticate(nodeId, nodeToken))!;
      const result = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "batch",
            observations: [
              {
                sourceItemKey: "com.example.avatarpkg",
                title: "Avatar Tool Package",
                author: "Carol",
                summary: "",
                outboundLinks: [],
                originUpdatedAt: null,
                platformTags: ["avatar_tool", "vpm"]
              }
            ]
          }
        },
        principal
      );
      expect(result.status).toBe("accepted");

      const pkg = await store.getCanonicalPackage("com.example.avatarpkg");
      expect(pkg?.umbrella).toBe("tools");
      expect(pkg?.category).toBe("avatar_tool");
      expect(pkg?.qualityFlags).toContain("missing_release");
    } finally {
      store.close();
    }
  });
});

describe("Node-Offloaded Avatar Compatibility & Desktop Tool Evidence Storage", () => {
  test("node-submitted avatarCompatibilities project into listing_relations with confidence mapping", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const boothUrl = "https://booth.pm/ja/items/10101";
      const { nodeToken, jobId, leaseId, nodeId } = await setupStorefrontLease(store, boothUrl, "booth");
      const principal = (await store.authenticate(nodeId, nodeToken))!;

      const result = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/10101",
              title: "Casual Outfit",
              author: "Outfit Creator",
              summary: "Clothing for Kikyo and universal",
              outboundLinks: [],
              originUpdatedAt: null,
              avatarCompatibilities: [
                {
                  targetAvatarBase: "kikyo",
                  scope: "named_base",
                  confidence: "creator_declared",
                  evidenceSource: "title"
                },
                {
                  targetAvatarBase: "generic",
                  scope: "universal",
                  confidence: "keyword_inferred",
                  evidenceSource: "description"
                }
              ]
            }
          }
        },
        principal
      );
      expect(result.status).toBe("accepted");

      const relations = await store.listRelationsForCanonical("booth.pm/ja/items/10101");
      expect(relations).toHaveLength(2);
      const kikyo = relations.find((r) => r.targetAvatarBase === "kikyo");
      expect(kikyo?.scope).toBe("named_base");
      expect(kikyo?.confidence).toBe(0.95);
      const generic = relations.find((r) => r.targetAvatarBase === "generic");
      expect(generic?.scope).toBe("universal");
      expect(generic?.confidence).toBe(0.7);
    } finally {
      store.close();
    }
  });

  test("node-submitted desktopToolEvidence persists inside canonical_packages.attributes_json", async () => {
    const store = await createInitializedD1Coordinator();
    try {
      const ghUrl = "https://api.github.com/repos/vrcx-team/VRCX";
      const { nodeToken, jobId, leaseId, nodeId } = await setupGitHubLease(store, ghUrl);
      const principal = (await store.authenticate(nodeId, nodeToken))!;

      await store.upsertCanonicalPackage({
        canonicalId: "vrcx-team/VRCX",
        umbrella: "tools",
        category: "companion_client",
        lifecycle: "active",
        displayName: "VRCX"
      });
      await store.upsertSourceItem({
        sourceKey: `github:${ghUrl}:vrcx-team/VRCX`,
        platform: "github",
        sourceUrl: ghUrl,
        latestDigest: "pre"
      });
      await store.upsertListingSource({
        canonicalId: "vrcx-team/VRCX",
        sourceKey: `github:${ghUrl}:vrcx-team/VRCX`,
        platform: "github",
        storefrontUrl: ghUrl,
        evidenceKind: "repository_match",
        confidence: 1.0,
        reviewState: "accepted"
      });

      const result = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId,
          leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "vrcx-team/VRCX",
              title: "VRCX",
              author: "vrcx-team",
              summary: "VRCX is a companion application for VRChat",
              outboundLinks: ["https://github.com/vrcx-team/VRCX"],
              originUpdatedAt: null,
              desktopToolEvidence: {
                toolSubtype: "companion_client",
                supportedOS: ["windows", "linux"],
                particularVRChatTarget: true,
                evidenceUrl: "https://github.com/vrcx-team/VRCX",
                publisherClaim: "VRCX is a companion application for VRChat"
              }
            }
          }
        },
        principal
      );
      expect(result.status).toBe("accepted");

      const row = store.sqlite
        .prepare("SELECT attributes_json FROM canonical_packages WHERE canonical_id = ?")
        .get("vrcx-team/VRCX") as { attributes_json: string };
      const parsedAttrs = JSON.parse(row.attributes_json) as {
        desktopToolEvidence?: {
          toolSubtype: string;
          supportedOS: string[];
          particularVRChatTarget: boolean;
          evidenceUrl?: string;
          publisherClaim: string;
        };
      };
      expect(parsedAttrs.desktopToolEvidence?.toolSubtype).toBe("companion_client");
      expect(parsedAttrs.desktopToolEvidence?.supportedOS).toEqual(["windows", "linux"]);
      expect(parsedAttrs.desktopToolEvidence?.particularVRChatTarget).toBe(true);
    } finally {
      store.close();
    }
  });
});
