import { describe, expect, test } from "bun:test";
import {
  CreateSourceAccessProfileSchema,
  SourceAccessProfileSchema,
  sourceAccessProfileMatches,
  type CreateSourceAccessProfile
} from "../src/domain/access/source_access_profile.ts";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { CreateSourceAccessProfileSchema as ConsumerProfileSchema } from "vrc-packages-api";

const input = {
  schemaVersion: 1 as const,
  platform: "vpm" as const,
  origin: "https://packages.example.org",
  pathScope: "/vpm/",
  method: "GET" as const,
  purpose: "discovery" as const,
  minDelayMs: 1000,
  expiresAt: "2030-01-01T00:00:00.000Z",
  reviewReference: "review-2026-09-28",
  reason: "Published package listing review",
  retainClasses: ["normalized_facts"],
  publishClasses: []
} satisfies CreateSourceAccessProfile;

describe("source-access profile contract", () => {
  test("inherits the consumer contract without weakening public-origin safety", () => {
    const variants = [
      input,
      { ...input, pathScope: "/vpm/*" },
      { ...input, exactQuery: "page=1" },
      { ...input, retainClasses: [] },
      { ...input, publishClasses: ["creator_prose"] },
      { ...input, pathScope: "/vpm/%E3%81%82" }
    ];
    for (const profile of variants) {
      expect(CreateSourceAccessProfileSchema.safeParse(profile).success).toBe(
        ConsumerProfileSchema.safeParse(profile).success
      );
    }
    for (const origin of ["https://127.0.0.1", "https://[::1]", "https://192.168.1.1"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
  });

  test("matches only a canonical exact target within its reviewed purpose and path", () => {
    const profile = SourceAccessProfileSchema.parse({
      ...input,
      profileId: crypto.randomUUID(),
      createdAt: "2026-09-28T00:00:00.000Z",
      disabledAt: null
    });
    expect(
      sourceAccessProfileMatches(
        profile,
        "vpm",
        "https://packages.example.org/vpm/index.json",
        "discovery",
        Date.parse("2026-09-28T00:00:00Z")
      )
    ).toBe(true);
    for (const [platform, target, purpose] of [
      ["vpm", "https://packages.example.org/vpmm/index.json", "discovery"],
      ["vpm", "https://sub.packages.example.org/vpm/index.json", "discovery"],
      ["vpm", "https://packages.example.org/vpm/index.json?next=1", "discovery"],
      ["vpm", "https://packages.example.org/vpm/%2e%2e/secret", "discovery"],
      ["vpm", "https://packages.example.org/vpm/index.json", "metadata"],
      ["curated", "https://packages.example.org/vpm/index.json", "discovery"]
    ] as const) {
      expect(
        sourceAccessProfileMatches(profile, platform, target, purpose, Date.parse("2026-09-28T00:00:00Z"))
      ).toBe(false);
    }
    expect(
      sourceAccessProfileMatches(
        profile,
        "vpm",
        "https://packages.example.org/vpm/index.json",
        "discovery",
        Date.parse(input.expiresAt)
      )
    ).toBe(false);
    expect(
      sourceAccessProfileMatches(
        { ...profile, disabledAt: "2026-09-28T00:00:01.000Z" },
        "vpm",
        "https://packages.example.org/vpm/index.json",
        "discovery",
        Date.parse("2026-09-28T00:00:02Z")
      )
    ).toBe(false);
  });

  test("rejects broad or ambiguous grants and publication beyond retention", () => {
    for (const origin of [
      "http://packages.example.org",
      "https://localhost",
      "https://127.0.0.1",
      "https://packages.example.org:8443",
      "https://packages.example.org/path"
    ]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
    for (const pathScope of ["/vpm//", "/vpm/../", "/vpm/%2f", "/vpm?next=1"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope }).success).toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, publishClasses: ["creator_prose"] }).success).toBe(
      false
    );
    expect(
      CreateSourceAccessProfileSchema.safeParse({
        ...input,
        retainClasses: ["normalized_facts", "normalized_facts"]
      }).success
    ).toBe(false);
  });

  test("a BOOTH browse query needs its own exact, reviewed URL scope", async () => {
    const pathScope = "/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0";
    const target = `https://booth.pm${pathScope}?page=1`;
    const boothInput = {
      ...input,
      platform: "booth" as const,
      origin: "https://booth.pm",
      pathScope,
      exactQuery: "page=1",
      purpose: "discovery" as const
    };
    for (const invalid of [
      "/ja/browse/%2F",
      "/ja/browse/%2E",
      "/ja/browse/%C0%AF",
      "/ja/browse/3D%e3%83%84%E3%83%BC%E3%83%AB",
      `${pathScope}/`
    ]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...boothInput, pathScope: invalid }).success).toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...boothInput, exactQuery: "page=1&next=%2F" }).success).toBe(
      false
    );
    const now = Date.parse("2026-09-28T00:00:00Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      await store.seedJob(target, "booth", 0, undefined, "discovery");
      expect(await store.claimDueRobotsRefresh()).toBeNull();
      const token = await store.createNodeCredential("booth-fixture", ["booth"]);
      const principal = (await store.authenticate("booth-fixture", token))!;
      const request = { schemaVersion: 1 as const, nodeId: "booth-fixture", capabilities: ["booth" as const] };
      await store.recordRobotsSnapshot("https://booth.pm", 404);
      expect((await store.claim(request, principal)).status).toBe("empty");
      const profile = await store.createSourceAccessProfile(boothInput, "offline-test");
      expect(profile.exactQuery).toBe("page=1");
      await store.createSourceAccessProfile(
        { ...boothInput, pathScope: "/ja/", exactQuery: undefined },
        "offline-test"
      );
      expect(await store.activeSourceAccessProfileForTarget("booth", `https://booth.pm${pathScope}`, "discovery")).toBeNull();
      expect((await store.activeSourceAccessProfileForTarget("booth", target, "discovery"))?.profileId).toBe(
        profile.profileId
      );
      for (const denied of [
        `https://booth.pm${pathScope}?page=2`,
        `https://booth.pm${pathScope}?page=01`,
        `https://booth.pm${pathScope}?page=1&sort=new`,
        `https://booth.pm${pathScope}`,
        `https://booth.pm/ja/browse/other?page=1`
      ]) {
        expect(await store.activeSourceAccessProfileForTarget("booth", denied, "discovery")).toBeNull();
      }
      expect(await store.activeSourceAccessProfileForTarget("booth", target, "metadata")).toBeNull();
      expect((await store.claim(request, principal)).status).toBe("leased");
      await store.disableSourceAccessProfile(profile.profileId, "offline-test", "Browse review withdrawn");
      expect(await store.activeSourceAccessProfileForTarget("booth", target, "discovery")).toBeNull();
    } finally {
      store.close();
    }
  });

  test("authenticated operator API creates, pages and disables audited profiles without defaults", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    const token = "a".repeat(64);
    const request = (path: string, method = "GET", body?: unknown, bearer = token) =>
      handleOperatorRequest(
        new Request(`http://localhost${path}`, {
          method,
          headers: { authorization: `Bearer ${bearer}`, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        }),
        store,
        token
      );
    try {
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM source_access_profiles").get()).toEqual({ n: 0 });
      expect(
        await store.activeSourceAccessProfileForTarget(
          "vpm",
          "https://packages.example.org/vpm/index.json",
          "discovery"
        )
      ).toBeNull();
      expect((await request("/v1/operator/source-profiles", "POST", input, "b".repeat(64))).status).toBe(401);
      expect(
        (await request("/v1/operator/source-profiles", "POST", { ...input, publishClasses: ["creator_prose"] })).status
      ).toBe(400);
      const first = await request("/v1/operator/source-profiles", "POST", input);
      expect(first.status).toBe(201);
      const created = (await first.json()) as { profile: { profileId: string; disabledAt: string | null } };
      expect(created.profile.disabledAt).toBeNull();
      expect(
        (
          await store.activeSourceAccessProfileForTarget(
            "vpm",
            "https://packages.example.org/vpm/index.json",
            "discovery"
          )
        )?.profileId
      ).toBe(created.profile.profileId);
      expect(
        await store.activeSourceAccessProfileForTarget(
          "vpm",
          "https://packages.example.org/vpm/index.json?x=1",
          "discovery"
        )
      ).toBeNull();
      expect(
        (await request("/v1/operator/source-profiles", "POST", { ...input, pathScope: "/vpm/second/" })).status
      ).toBe(409);
      expect((await request("/v1/operator/source-profiles", "POST", { ...input, pathScope: "/other/" })).status).toBe(
        201
      );
      const pageOne = await request("/v1/operator/source-profiles?limit=1");
      expect(pageOne.status).toBe(200);
      const page = (await pageOne.json()) as { profiles: { profileId: string }[]; nextCursor: string | null };
      expect(page.profiles).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      const pageTwo = await request(`/v1/operator/source-profiles?limit=1&cursor=${page.nextCursor}`);
      expect(pageTwo.status).toBe(200);
      const second = (await pageTwo.json()) as { profiles: { profileId: string }[]; nextCursor: string | null };
      expect(second.profiles).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(second.profiles[0]?.profileId).not.toBe(page.profiles[0]?.profileId);
      expect((await request("/v1/operator/source-profiles?cursor=bad!")).status).toBe(400);
      const disabled = await request(
        `/v1/operator/source-profiles/${created.profile.profileId}/disable`,
        "POST",
        { schemaVersion: 1, reason: "Access review withdrawn" }
      );
      expect(disabled.status).toBe(200);
      expect(((await disabled.json()) as { profile: { disabledAt: string | null } }).profile.disabledAt).toBeTruthy();
      expect(
        await store.activeSourceAccessProfileForTarget(
          "vpm",
          "https://packages.example.org/vpm/index.json",
          "discovery"
        )
      ).toBeNull();
      expect((await request("/v1/operator/source-profiles", "POST", input)).status).toBe(201);
      expect(
        store.sqlite.query("SELECT action FROM source_access_profile_actions ORDER BY action_id").all()
      ).toEqual([{ action: "create" }, { action: "create" }, { action: "disable" }, { action: "create" }]);
    } finally {
      store.close();
    }
  });

  test("an unapproved manual seed cannot refresh robots or lease despite a permissive snapshot", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    const target = "https://packages.example.org/vpm/index.json";
    try {
      await store.seedJob(target, "vpm", 0, undefined, "discovery");
      expect(await store.claimDueRobotsRefresh()).toBeNull();
      expect(await store.reserveRobotsRefresh("https://packages.example.org")).toBeNull();
      await store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = await store.createNodeCredential("unapproved", ["vpm"]);
      const principal = (await store.authenticate("unapproved", token))!;
      expect(
        (await store.claim({ schemaVersion: 1, nodeId: "unapproved", capabilities: ["vpm"] }, principal)).status
      ).toBe("empty");
      await store.createSourceAccessProfile(input, "test-fixture");
      expect(
        (await store.claim({ schemaVersion: 1, nodeId: "unapproved", capabilities: ["vpm"] }, principal)).status
      ).toBe("leased");
    } finally {
      store.close();
    }
  });

  test("purpose, expiry and revocation gate claims, fetching heartbeats and new submissions", async () => {
    let now = Date.parse("2026-09-28T00:00:00Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    const target = "https://packages.example.org/vpm/index.json";
    try {
      await store.seedJob(target, "vpm", 0, undefined, "discovery");
      await store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = await store.createNodeCredential("authorized", ["vpm"]);
      const principal = (await store.authenticate("authorized", token))!;
      await store.createSourceAccessProfile({ ...input, purpose: "metadata" }, "test-fixture");
      const claimRequest = { schemaVersion: 1 as const, nodeId: "authorized", capabilities: ["vpm" as const] };
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      const profile = await store.createSourceAccessProfile(input, "test-fixture");
      const claim = await store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      expect(
        (
          store.sqlite
            .query("SELECT lease_profile_id FROM crawl_jobs WHERE job_id=?")
            .get(claim.job.jobId) as { lease_profile_id: string }
        ).lease_profile_id
      ).toBe(profile.profileId);
      const heartbeat = {
        schemaVersion: 1 as const,
        nodeId: "authorized",
        capabilities: ["vpm" as const],
        state: "fetching" as const,
        activeJobId: claim.job.jobId,
        activeLeaseId: claim.job.leaseId
      };
      expect((await store.heartbeat(heartbeat, principal)).status).toBe("alive");
      await store.disableSourceAccessProfile(profile.profileId, "test-fixture", "Review withdrawn");
      await expect(store.heartbeat(heartbeat, principal)).rejects.toThrow("authorized active job");
      await expect(
        store.submit(
          {
            schemaVersion: 1,
            nodeId: "authorized",
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "revoked-policy-result",
            outcome: { kind: "unchanged" }
          },
          principal
        )
      ).rejects.toThrow();
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM job_results").get()).toEqual({ n: 0 });
      const short = await store.createSourceAccessProfile(
        { ...input, expiresAt: "2026-09-28T00:00:01.000Z" },
        "test-fixture"
      );
      now += 1001;
      expect(await store.activeSourceAccessProfileForTarget("vpm", target, "discovery")).toBeNull();
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      expect(short.profileId).toBeTruthy();
    } finally {
      store.close();
    }
  });

  test("retention scope denies creator prose without storing a version", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const target = "https://packages.example.org/vpm/index.json";
      await store.seedJob(target, "vpm", 0, undefined, "discovery");
      await store.createSourceAccessProfile(input, "test-fixture");
      await store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = await store.createNodeCredential("prose-node", ["vpm"]);
      const principal = (await store.authenticate("prose-node", token))!;
      const claim = await store.claim({ schemaVersion: 1, nodeId: "prose-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      await expect(
        store.submit(
          {
            schemaVersion: 1,
            nodeId: "prose-node",
            jobId: claim.job.jobId,
            leaseId: claim.job.leaseId,
            idempotencyKey: "unapproved-prose-result",
            outcome: {
              kind: "changed",
              observation: {
                sourceItemKey: "com.example.tool",
                title: "Tool",
                author: "Creator",
                summary: "Publisher description",
                outboundLinks: [],
                originUpdatedAt: null
              }
            }
          },
          principal
        )
      ).rejects.toThrow("creator prose");
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM source_versions").get()).toEqual({ n: 0 });
    } finally {
      store.close();
    }
  });

  test("accepted observation records the reviewed profile on durable evidence", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const target = "https://packages.example.org/vpm/index.json";
      const profile = await store.createSourceAccessProfile(
        { ...input, retainClasses: ["normalized_facts", "creator_prose"] },
        "test-fixture"
      );
      await store.seedJob(target, "vpm", 0, undefined, "discovery");
      await store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = await store.createNodeCredential("evidence-node", ["vpm"]);
      const principal = (await store.authenticate("evidence-node", token))!;
      const claim = await store.claim({ schemaVersion: 1, nodeId: "evidence-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      expect(claim.job.retainClasses).toEqual(["normalized_facts", "creator_prose"]);
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "evidence-node",
          jobId: claim.job.jobId,
          leaseId: claim.job.leaseId,
          idempotencyKey: "reviewed-evidence-result",
          outcome: {
            kind: "changed",
            observation: {
              sourceItemKey: "com.example.tool",
              title: "Tool",
              author: "Creator",
              summary: "Approved prose",
              outboundLinks: [],
              originUpdatedAt: null
            }
          }
        },
        principal
      );
      expect(store.sqlite.query("SELECT source_profile_id FROM source_versions").get()).toEqual({
        source_profile_id: profile.profileId
      });
      expect(store.sqlite.query("SELECT source_profile_id FROM source_events WHERE kind='changed'").get()).toEqual({
        source_profile_id: profile.profileId
      });
    } finally {
      store.close();
    }
  });

  test("an auto-queue rule may enqueue a lead but cannot grant its destination fetch", async () => {
    let now = Date.parse("2026-09-28T00:00:00Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      await store.createSourceAccessProfile(
        { ...input, pathScope: "/source.json", purpose: "metadata" },
        "test-fixture"
      );
      await store.createAutoQueueRule(
        {
          schemaVersion: 1,
          leadKind: "vpm_listing",
          origin: input.origin,
          pathScope: "/vpm/index.json",
          minDelayMs: 1000,
          expiresAt: "2026-10-01T00:00:00.000Z",
          reviewReference: "offline-fixture-review",
          reason: "Synthetic listing promotion"
        },
        "test-fixture"
      );
      await store.seedJob("https://packages.example.org/source.json", "vpm", 0);
      await store.recordRobotsSnapshot(input.origin, 404);
      const token = await store.createNodeCredential("auto-node", ["vpm"]);
      const principal = (await store.authenticate("auto-node", token))!;
      const claimRequest = { schemaVersion: 1 as const, nodeId: "auto-node", capabilities: ["vpm" as const] };
      const source = await store.claim(claimRequest, principal);
      expect(source.status).toBe("leased");
      if (source.status !== "leased") throw new Error("Expected source lease");
      await store.submit(
        {
          schemaVersion: 1,
          nodeId: "auto-node",
          jobId: source.job.jobId,
          leaseId: source.job.leaseId,
          idempotencyKey: "autoqueue-source-result",
          outcome: {
            kind: "discovery",
            leads: [{ kind: "vpm_listing", url: "https://packages.example.org/vpm/index.json" }]
          }
        },
        principal
      );
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM crawl_jobs").get()).toEqual({ n: 2 });
      now += 1000;
      expect((await store.claim(claimRequest, principal)).status).toBe("empty");
      await store.createSourceAccessProfile(input, "test-fixture");
      const target = await store.claim(claimRequest, principal);
      expect(target.status).toBe("leased");
      if (target.status !== "leased") throw new Error("Expected approved target lease");
      expect(target.job.url).toBe("https://packages.example.org/vpm/index.json");
    } finally {
      store.close();
    }
  });

  test("a previously accepted identical result remains idempotent after profile disable", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const profile = await store.createSourceAccessProfile({ ...input, purpose: "metadata" }, "test-fixture");
      await store.seedJob("https://packages.example.org/vpm/index.json", "vpm", 0);
      await store.recordRobotsSnapshot(input.origin, 404);
      const token = await store.createNodeCredential("repeat-node", ["vpm"]);
      const principal = (await store.authenticate("repeat-node", token))!;
      const claim = await store.claim({ schemaVersion: 1, nodeId: "repeat-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      const request = {
        schemaVersion: 1 as const,
        nodeId: "repeat-node",
        jobId: claim.job.jobId,
        leaseId: claim.job.leaseId,
        idempotencyKey: "identical-before-and-after-revoke" as const,
        outcome: { kind: "unchanged" as const }
      };
      expect((await store.submit(request, principal)).duplicate).toBe(false);
      await store.disableSourceAccessProfile(profile.profileId, "test-fixture", "Review withdrawn");
      expect((await store.submit(request, principal)).duplicate).toBe(true);
      expect(store.sqlite.query("SELECT COUNT(*) AS n FROM job_results").get()).toEqual({ n: 1 });
    } finally {
      store.close();
    }
  });
});
