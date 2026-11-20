import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { PROTOCOL_VERSION } from "vrc-packages-network/node";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

describe("Identity Links and Canonical Packages", () => {
  it("upserts and retrieves canonical packages correctly", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      const created = await store.upsertCanonicalPackage({
        canonicalId: "vrc-avatar-tool",
        umbrella: "tools",
        category: "Avatar Utility",
        lifecycle: "active",
        displayName: "VRC Avatar Tool",
        vpmId: "com.example.avatartool"
      });

      expect(created.canonicalId).toBe("vrc-avatar-tool");
      expect(created.umbrella).toBe("tools");
      expect(created.category).toBe("Avatar Utility");
      expect(created.lifecycle).toBe("active");
      expect(created.displayName).toBe("VRC Avatar Tool");
      expect(created.vpmId).toBe("com.example.avatartool");
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();

      const fetched = await store.getCanonicalPackage("vrc-avatar-tool");
      expect(fetched).not.toBeNull();
      expect(fetched?.displayName).toBe("VRC Avatar Tool");

      const updated = await store.upsertCanonicalPackage({
        canonicalId: "vrc-avatar-tool",
        umbrella: "tools",
        category: "Avatar Utility",
        lifecycle: "deprecated",
        displayName: "VRC Avatar Tool (Deprecated)",
        vpmId: "com.example.avatartool"
      });

      expect(updated.lifecycle).toBe("deprecated");
      expect(updated.displayName).toBe("VRC Avatar Tool (Deprecated)");

      const nonExistent = await store.getCanonicalPackage("does-not-exist");
      expect(nonExistent).toBeNull();
    } finally {
      store.close();
    }
  });

  it("enforces foreign keys on identity links", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "canon-1",
        umbrella: "tools",
        category: "Inspector",
        lifecycle: "active",
        displayName: "Package Inspector"
      });

      await expect(
        store.createIdentityLink({
          sourceKey: "missing-source-item",
          canonicalId: "canon-1",
          evidenceKind: "vpm_id",
          confidence: 1.0
        })
      ).rejects.toThrow();

      await store.upsertSourceItem({
        sourceKey: "vpm:com.example.inspector",
        platform: "vpm",
        sourceUrl: "https://vpm.example.com/index.json",
        latestDigest: "sha256:abc123"
      });

      await expect(
        store.createIdentityLink({
          sourceKey: "vpm:com.example.inspector",
          canonicalId: "missing-canonical",
          evidenceKind: "vpm_id",
          confidence: 1.0
        })
      ).rejects.toThrow();

      const link = await store.createIdentityLink({
        sourceKey: "vpm:com.example.inspector",
        canonicalId: "canon-1",
        evidenceKind: "vpm_id",
        confidence: 1.0
      });

      expect(link.linkId).toBeDefined();
      expect(link.sourceKey).toBe("vpm:com.example.inspector");
      expect(link.canonicalId).toBe("canon-1");
      expect(link.reviewState).toBe("provisional");
      expect(link.confidence).toBe(1.0);
    } finally {
      store.close();
    }
  });

  it("validates confidence bounds [0.0, 1.0]", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "canon-1",
        umbrella: "assets",
        category: "Prop",
        lifecycle: "active",
        displayName: "Cool Prop"
      });
      await store.upsertSourceItem({
        sourceKey: "booth:12345",
        platform: "booth",
        sourceUrl: "https://booth.pm/en/items/12345",
        latestDigest: "sha256:def456"
      });

      await expect(
        store.createIdentityLink({
          sourceKey: "booth:12345",
          canonicalId: "canon-1",
          evidenceKind: "cross_storefront_link",
          confidence: 1.5
        })
      ).rejects.toThrow();

      await expect(
        store.createIdentityLink({
          sourceKey: "booth:12345",
          canonicalId: "canon-1",
          evidenceKind: "cross_storefront_link",
          confidence: -0.1
        })
      ).rejects.toThrow();
    } finally {
      store.close();
    }
  });

  it("supports review lifecycle transitions and multi-link queries", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "canon-pkg",
        umbrella: "avatars",
        category: "Base Avatar",
        lifecycle: "active",
        displayName: "Original Avatar"
      });

      await store.upsertSourceItem({
        sourceKey: "booth:100",
        platform: "booth",
        sourceUrl: "https://booth.pm/en/items/100",
        latestDigest: "sha256:100"
      });
      await store.upsertSourceItem({
        sourceKey: "gumroad:200",
        platform: "gumroad",
        sourceUrl: "https://gumroad.com/l/200",
        latestDigest: "sha256:200"
      });

      const link1 = await store.createIdentityLink({
        sourceKey: "booth:100",
        canonicalId: "canon-pkg",
        evidenceKind: "curator_verified",
        confidence: 0.95,
        reviewState: "provisional"
      });

      const link2 = await store.createIdentityLink({
        sourceKey: "gumroad:200",
        canonicalId: "canon-pkg",
        evidenceKind: "cross_storefront_link",
        confidence: 0.85,
        reviewState: "provisional"
      });

      const canonicalLinks = await store.getIdentityLinksForCanonical("canon-pkg");
      expect(canonicalLinks).toHaveLength(2);
      expect(canonicalLinks.map((l) => l.sourceKey).sort()).toEqual(["booth:100", "gumroad:200"]);

      const sourceLinks1 = await store.getIdentityLinksForSourceItem("booth:100");
      expect(sourceLinks1).toHaveLength(1);
      expect(sourceLinks1[0].canonicalId).toBe("canon-pkg");

      const updated = await store.updateIdentityLinkReview(link1.linkId, "accepted");
      expect(updated).toBe(true);

      const rejected = await store.updateIdentityLinkReview(link2.linkId, "rejected");
      expect(rejected).toBe(true);

      const refreshedLinks = await store.getIdentityLinksForCanonical("canon-pkg");
      const updatedLink1 = refreshedLinks.find((l) => l.linkId === link1.linkId);
      const updatedLink2 = refreshedLinks.find((l) => l.linkId === link2.linkId);

      expect(updatedLink1?.reviewState).toBe("accepted");
      expect(updatedLink1?.reviewedAt).toBeDefined();
      expect(updatedLink2?.reviewState).toBe("rejected");
      expect(updatedLink2?.reviewedAt).toBeDefined();

      const deleted = await store.deleteIdentityLink(link2.linkId);
      expect(deleted).toBe(true);

      const remainingLinks = await store.getIdentityLinksForCanonical("canon-pkg");
      expect(remainingLinks).toHaveLength(1);
      expect(remainingLinks[0].linkId).toBe(link1.linkId);
    } finally {
      store.close();
    }
  });

  it("auto-links high-confidence storefront leads discovered from package manifests without operator review (R13-C9-IDENTITY)", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "com.example.manifest-pkg",
        umbrella: "tools",
        category: "Utility",
        lifecycle: "active",
        displayName: "Manifest Package"
      });
      await store.upsertSourceItem({
        sourceKey: "vpm:https://vpm.example.com/index.json:com.example.manifest-pkg",
        platform: "vpm",
        sourceUrl: "https://vpm.example.com/index.json",
        latestDigest: "sha256:vpm1"
      });
      await store.createIdentityLink({
        sourceKey: "vpm:https://vpm.example.com/index.json:com.example.manifest-pkg",
        canonicalId: "com.example.manifest-pkg",
        evidenceKind: "vpm_id",
        confidence: 1.0,
        reviewState: "accepted"
      });

      await seedApprovedFixtureJob(store, "https://vpm.example.com/index.json", "vpm");
      const vpmJob = store.sqlite
        .prepare("SELECT job_id FROM crawl_jobs WHERE url='https://vpm.example.com/index.json'")
        .get() as { job_id: string };

      const boothUrl = "https://booth.pm/ja/items/99901";
      await seedApprovedFixtureJob(store, boothUrl, "booth", 60_000);
      await store.recordRobotsSnapshot("https://booth.pm", 404);

      const leadId = "lead-booth-99901";
      store.sqlite
        .prepare(
          `INSERT INTO source_leads (lead_key, discovered_from_url, discovered_from_job_id, discovered_from_item_key, kind, target_url, claimed_package_id, status, first_seen_at, last_seen_at)
        VALUES (?, 'https://vpm.example.com/index.json', ?, 'com.example.manifest-pkg', 'storefront_product', ?, 'com.example.manifest-pkg', 'approved', datetime('now'), datetime('now'))`
        )
        .run(leadId, vpmJob.job_id, boothUrl);

      const nodeId = "booth-worker-node";
      const token = await store.createNodeCredential(nodeId, ["booth"]);
      const principal = (await store.authenticate(nodeId, token))!;

      const claim = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") return;

      const submitRes = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/99901",
              title: "Manifest Item on BOOTH",
              author: "Author",
              summary: "Direct storefront lead from package manifest",
              outboundLinks: [],
              originUpdatedAt: null,
              price: 1500,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        principal
      );
      expect(submitRes.status).toBe("accepted");

      const links = await store.getIdentityLinksForCanonical("com.example.manifest-pkg");
      const boothLink = links.find((l) => l.evidenceKind === "cross_storefront_link");
      expect(boothLink).toBeDefined();
      expect(boothLink?.reviewState).toBe("accepted");
      expect(boothLink?.confidence).toBe(0.95);
      expect(boothLink?.reviewedAt).toBeDefined();

      const fronts = await store.getPackageFrontsForCanonical("com.example.manifest-pkg");
      expect(fronts).toHaveLength(1);
      expect(fronts[0].platform).toBe("booth");
      expect(fronts[0].price).toBe(1500);
    } finally {
      store.close();
    }
  });

  it("keeps unverified heuristic outbound storefront links provisional until reviewed (R13-C9-IDENTITY)", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "com.example.heuristic-pkg",
        umbrella: "tools",
        category: "Utility",
        lifecycle: "active",
        displayName: "Heuristic Package"
      });
      await store.upsertSourceItem({
        sourceKey: "vpm:https://vpm.example.com/other.json:com.example.heuristic-pkg",
        platform: "vpm",
        sourceUrl: "https://vpm.example.com/other.json",
        latestDigest: "sha256:vpm2"
      });
      await store.createIdentityLink({
        sourceKey: "vpm:https://vpm.example.com/other.json:com.example.heuristic-pkg",
        canonicalId: "com.example.heuristic-pkg",
        evidenceKind: "vpm_id",
        confidence: 1.0,
        reviewState: "accepted"
      });

      const boothUrl = "https://booth.pm/ja/items/99902";
      await seedApprovedFixtureJob(store, boothUrl, "booth", 60_000);
      await store.recordRobotsSnapshot("https://booth.pm", 404);

      const nodeId = "booth-heuristic-node";
      const token = await store.createNodeCredential(nodeId, ["booth"]);
      const principal = (await store.authenticate(nodeId, token))!;

      const claim = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") return;

      const submitRes = await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/99902",
              title: "Heuristic Item on BOOTH",
              author: "Author",
              summary: "Heuristic match via outbound links",
              outboundLinks: ["https://vpm.example.com/other.json"],
              originUpdatedAt: null,
              price: 2000,
              currency: "JPY",
              availability: "available"
            }
          }
        },
        principal
      );
      expect(submitRes.status).toBe("accepted");

      const links = await store.getIdentityLinksForCanonical("com.example.heuristic-pkg");
      const boothLink = links.find((l) => l.evidenceKind === "cross_storefront_link");
      expect(boothLink).toBeDefined();
      expect(boothLink?.reviewState).toBe("provisional");
      expect(boothLink?.confidence).toBe(0.8);
      expect(boothLink?.reviewedAt == null).toBe(true);
    } finally {
      store.close();
    }
  });
});
