import { describe, expect, it } from "bun:test";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { PROTOCOL_VERSION } from "vrc-packages-network/node";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

describe("Listing Sources, Listing Relations, Feedback & Verified Status (V0)", () => {
  it("upserts canonical packages with unverified verificationStatus default and retrieves fields cleanly", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      const created = await store.upsertCanonicalPackage({
        canonicalId: "vrc-avatar-tool",
        umbrella: "tools",
        category: "Avatar Utility",
        lifecycle: "active",
        displayName: "VRC Avatar Tool",
        ownerKey: "dev_author",
        ownerName: "Dev Author",
        vpmId: "com.example.avatartool",
        tags: ["avatar_tool", "osc"]
      });

      expect(created.canonicalId).toBe("vrc-avatar-tool");
      expect(created.verificationStatus).toBe("unverified");
      expect(created.verifiedByAppId).toBeNull();
      expect(created.ownerKey).toBe("dev_author");
      expect(created.ownerName).toBe("Dev Author");
      expect(created.tags).toEqual(["avatar_tool", "osc"]);

      const fetched = await store.getCanonicalPackage("vrc-avatar-tool");
      expect(fetched).not.toBeNull();
      expect(fetched?.verificationStatus).toBe("unverified");
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
      expect(await store.getCanonicalPackage("does-not-exist")).toBeNull();
    } finally {
      store.close();
    }
  });

  it("enforces foreign keys and confidence bounds [0.0, 1.0] on listing_sources", async () => {
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
        store.upsertListingSource({
          canonicalId: "canon-1",
          sourceKey: "missing-source-item",
          platform: "vpm",
          storefrontUrl: "https://vpm.example.com/index.json",
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
        store.upsertListingSource({
          canonicalId: "canon-1",
          sourceKey: "vpm:com.example.inspector",
          platform: "vpm",
          storefrontUrl: "https://vpm.example.com/index.json",
          evidenceKind: "vpm_id",
          confidence: 1.5
        })
      ).rejects.toThrow();

      const source = await store.upsertListingSource({
        canonicalId: "canon-1",
        sourceKey: "vpm:com.example.inspector",
        platform: "vpm",
        storefrontUrl: "https://vpm.example.com/index.json",
        evidenceKind: "vpm_id",
        confidence: 1.0
      });
      expect(source.sourceLinkId).toBeDefined();
      expect(source.reviewState).toBe("provisional");
      expect(source.confidence).toBe(1.0);
    } finally {
      store.close();
    }
  });

  it("auto-links manifest storefront leads as accepted listing_sources while keeping heuristic outbound links provisional", async () => {
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
      await store.upsertListingSource({
        canonicalId: "com.example.manifest-pkg",
        sourceKey: "vpm:https://vpm.example.com/index.json:com.example.manifest-pkg",
        platform: "vpm",
        storefrontUrl: "https://vpm.example.com/index.json",
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

      store.sqlite
        .prepare(
          `INSERT INTO source_leads (
             lead_key, discovered_from_url, discovered_from_job_id, discovered_from_item_key,
             kind, target_url, target_host, claimed_package_id, status, first_seen_at, last_seen_at
           ) VALUES (?, 'https://vpm.example.com/index.json', ?, 'com.example.manifest-pkg',
             'storefront_product', ?, 'booth.pm', 'com.example.manifest-pkg', 'approved', datetime('now'), datetime('now'))`
        )
        .run("lead-booth-99901", vpmJob.job_id, boothUrl);

      const nodeId = "booth-worker-node";
      const { token } = await store.createNodeCredential(nodeId, ["booth"]);
      const principal = (await store.authenticate(nodeId, token))!;

      const claim = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") return;

      await store.submit(
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

      const sources = await store.getListingSourcesForCanonical("com.example.manifest-pkg");
      const boothSource = sources.find((s) => s.evidenceKind === "cross_storefront_link");
      expect(boothSource).toBeDefined();
      expect(boothSource?.reviewState).toBe("accepted");
      expect(boothSource?.confidence).toBe(0.95);
      expect(boothSource?.price).toBe(1500);
      expect(boothSource?.currency).toBe("JPY");

      // Heuristic outbound match remains provisional
      const heuristicUrl = "https://booth.pm/ja/items/99902";
      await seedApprovedFixtureJob(store, heuristicUrl, "booth", 0);
      store.sqlite.prepare("UPDATE origin_state SET next_allowed_at='1970-01-01T00:00:00.000Z' WHERE origin='https://booth.pm'").run();
      const claim2 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      expect(claim2.status).toBe("leased");
      if (claim2.status !== "leased") return;
      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claim2.job.jobId,
          leaseId: claim2.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "booth.pm/ja/items/99902",
              title: "Heuristic BOOTH Listing",
              author: "Other",
              summary: "Outbound reference",
              outboundLinks: ["https://vpm.example.com/index.json"],
              originUpdatedAt: null
            }
          }
        },
        principal
      );

      const heuristicSources = await store.getListingSourcesForCanonical("com.example.manifest-pkg");
      const heuristicBooth = heuristicSources.find((s) => s.storefrontUrl === heuristicUrl);
      expect(heuristicBooth?.evidenceKind).toBe("cross_storefront_link");
      expect(heuristicBooth?.reviewState).toBe("provisional");
      expect(heuristicBooth?.confidence).toBe(0.8);
    } finally {
      store.close();
    }
  });

  it("projects node-offloaded avatarCompatibilities and VPM dependencyRanges into listing_relations and preserves feedback counters", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      const nodeId = "relations-node";
      const { token } = await store.createNodeCredential(nodeId, ["vpm"]);
      const principal = (await store.authenticate(nodeId, token))!;

      const vpmUrl = "https://relations.example/index.json";
      await seedApprovedFixtureJob(store, vpmUrl, "vpm", 0);
      await store.recordRobotsSnapshot("https://relations.example", 200, "User-agent: *\nAllow: /");

      const claim1 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      expect(claim1.status).toBe("leased");
      if (claim1.status !== "leased") return;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claim1.job.jobId,
          leaseId: claim1.job.leaseId,
          idempotencyKey: "rel-obs-1",
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.dress",
              title: "Dress Pack",
              author: "Tailor",
              summary: "Kikyo & Manuka outfit",
              outboundLinks: [],
              originUpdatedAt: null,
              release: {
                version: "1.2.0",
                dependencyRanges: { "com.vrchat.avatars": ">=3.5.0" }
              },
              avatarCompatibilities: [
                {
                  targetAvatarBase: "Kikyo",
                  scope: "named_base",
                  confidence: "creator_declared",
                  evidenceSource: "storefront_title"
                },
                {
                  targetAvatarBase: "Manuka",
                  scope: "named_base",
                  confidence: "keyword_inferred",
                  evidenceSource: "description"
                }
              ]
            }
          }
        },
        principal
      );

      let relations = await store.listRelationsForCanonical("com.example.dress");
      expect(relations).toHaveLength(3);
      const kikyoRel = relations.find((r) => r.relationType === "compatible_with_avatar" && r.targetAvatarBase === "Kikyo");
      expect(kikyoRel?.scope).toBe("named_base");
      expect(kikyoRel?.confidence).toBe(0.95);
      const depRel = relations.find((r) => r.relationType === "depends_on" && r.targetCanonicalId === "com.vrchat.avatars");
      expect(depRel?.scope).toBe("exact");
      expect(depRel?.confidence).toBe(0.9);
      expect(depRel?.evidenceSource).toBe("vpm_manifest");

      // Record downstream relationship_feedback votes
      const app = await store.registerApp({ schemaVersion: 1, appName: "Feedback Client" });
      await store.recordReportSubmission(app.appId, {
        schemaVersion: 1,
        reportType: "relationship_feedback",
        canonicalId: "com.example.dress",
        targetAvatarBase: "Kikyo",
        relationType: "compatible_with_avatar",
        vote: "up",
        reason: "Fits cleanly"
      });
      await store.recordReportSubmission(app.appId, {
        schemaVersion: 1,
        reportType: "relationship_feedback",
        canonicalId: "com.example.dress",
        targetAvatarBase: "Kikyo",
        relationType: "compatible_with_avatar",
        vote: "down",
        reason: "Needs weight fix on sleeves"
      });

      // Re-submit observation updating Kikyo scope/confidence and removing Manuka
      store.sqlite
        .prepare("UPDATE crawl_jobs SET state='pending', next_fetch_at='1970-01-01T00:00:00.000Z' WHERE job_id=?")
        .run(claim1.job.jobId);
      store.sqlite
        .prepare("UPDATE origin_state SET next_allowed_at='1970-01-01T00:00:00.000Z' WHERE origin='https://relations.example'")
        .run();

      const claim2 = await store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      expect(claim2.status).toBe("leased");
      if (claim2.status !== "leased") return;

      await store.submit(
        {
          schemaVersion: PROTOCOL_VERSION,
          nodeId,
          jobId: claim2.job.jobId,
          leaseId: claim2.job.leaseId,
          idempotencyKey: "rel-obs-2",
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.dress",
              title: "Dress Pack",
              author: "Tailor",
              summary: "Updated Kikyo outfit",
              outboundLinks: [],
              originUpdatedAt: null,
              release: {
                version: "1.3.0",
                dependencyRanges: { "com.vrchat.avatars": ">=3.6.0" }
              },
              avatarCompatibilities: [
                {
                  targetAvatarBase: "Kikyo",
                  scope: "universal",
                  confidence: "unverified",
                  evidenceSource: "rechecked"
                }
              ]
            }
          }
        },
        principal
      );

      relations = await store.listRelationsForCanonical("com.example.dress");
      expect(relations).toHaveLength(2);
      const updatedKikyo = relations.find((r) => r.targetAvatarBase === "Kikyo");
      expect(updatedKikyo?.scope).toBe("universal");
      expect(updatedKikyo?.confidence).toBe(0.4);
      // Votes preserved across re-observation UPDATE
      expect(updatedKikyo?.feedbackUpCount).toBe(1);
      expect(updatedKikyo?.feedbackDownCount).toBe(1);

      const pkg = await store.getCanonicalPackage("com.example.dress");
      expect(pkg?.verificationStatus).toBe("unverified");
      expect(pkg?.relations).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("verifyDelegatedClaim promotes canonical_packages.verification_status from unverified to verified with verified_by_app_id", async () => {
    const store = await createInitializedD1Coordinator(":memory:");
    try {
      await store.upsertCanonicalPackage({
        canonicalId: "com.claim.target",
        umbrella: "tools",
        category: "tool",
        lifecycle: "active",
        displayName: "Claim Target"
      });
      await store.upsertSourceItem({
        sourceKey: "booth:claim-item",
        platform: "booth",
        sourceUrl: "https://shop.booth.pm/items/777111",
        latestDigest: "d-claim"
      });
      await store.upsertListingSource({
        canonicalId: "com.claim.target",
        sourceKey: "booth:claim-item",
        platform: "booth",
        storefrontUrl: "https://shop.booth.pm/items/777111",
        evidenceKind: "cross_storefront_link",
        confidence: 1.0,
        reviewState: "accepted"
      });

      const app = await store.registerApp({ schemaVersion: 1, appName: "Trusted Verifier" });
      await store.reviewAppCandidate(app.appId, { candidateStatus: "trusted", grantDelegation: true }, "moderator");

      const claimReceipt = await store.recordCreatorClaimIntake(app.appId, {
        schemaVersion: 1,
        attestation: {
          appId: app.appId,
          action: "creator_ownership_claim",
          frontUrl: "https://shop.booth.pm/items/777111",
          creatorId: "creator-xyz",
          challengeToken: "challenge-token-1234",
          expiresAt: Math.floor(store.now() / 1000) + 3600,
          nonce: "nonce-verify-0001"
        },
        signature: "ed25519-signature-xyz",
        reason: "Verified storefront ownership"
      });

      let pkg = await store.getCanonicalPackage("com.claim.target");
      expect(pkg?.verificationStatus).toBe("unverified");

      const verified = await store.verifyDelegatedClaim(claimReceipt.claimId, "accepted", "operator-admin", "Verified");
      expect(verified.status).toBe("accepted");

      pkg = await store.getCanonicalPackage("com.claim.target");
      expect(pkg?.verificationStatus).toBe("verified");
      expect(pkg?.verifiedByAppId).toBe(app.appId);
    } finally {
      store.close();
    }
  });
});
