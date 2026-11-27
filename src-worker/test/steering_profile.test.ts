import { describe, expect, test } from "bun:test";
import {
  CreateSteeringProfileSchema,
  SteeringProfileDeleteResponseSchema,
  SteeringProfileListResponseSchema,
  SteeringProfileResponseSchema,
  SteeringProfileSchema,
  SuppressedTargetDeleteResponseSchema,
  SuppressedTargetListResponseSchema,
  SuppressedTargetResponseSchema,
  findMatchingHostSuppression,
  findMatchingSuppressedTarget,
  steeringPathMatches,
  steeringPathScopesOverlap,
  steeringProfileMatches,
  steeringQueryModesOverlap
} from "../src/domain/access/steering_profile.ts";
import {
  PREVIEW_STARTER_PROFILE_COUNT,
  buildPreviewStarterSteeringProfiles
} from "../src/storage/default_seeds.ts";
import { createInitializedD1Coordinator } from "./support/d1_test_fixtures.ts";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { CreateSteeringProfileSchema as ConsumerCreateSteeringProfileSchema } from "vrc-packages-api";

const baseInput = {
  schemaVersion: 1 as const,
  platform: "vpm" as const,
  hostMatchMode: "exact" as const,
  hostPattern: "packages.example.org",
  pathScope: "/vpm/",
  queryMode: "none" as const,
  method: "GET" as const,
  purpose: "discovery" as const,
  autoPromote: false,
  recrawlIntervalMs: 86_400_000,
  minDelayMs: 1000,
  maxPaginationDepth: 0,
  expiresAt: "2030-01-01T00:00:00.000Z",
  reviewReference: "review-2026-11-05",
  reason: "Published package listing steering profile",
  retainClasses: ["normalized_facts"] as Array<"normalized_facts" | "creator_prose" | "media_metadata" | "raw_payload">,
  publishClasses: [] as Array<"normalized_facts" | "creator_prose" | "media_metadata" | "raw_payload">
};

describe("Steering Profiles & Suppressed Targets (V0)", () => {
  test("CreateSteeringProfileSchema enforces strict parity with consumer SDK and blocks unsafe origins/classes", () => {
    const variants = [
      baseInput,
      { ...baseInput, hostMatchMode: "wildcard_subdomain" as const, hostPattern: "*.example.org" },
      { ...baseInput, hostMatchMode: "any_vpm_https" as const, hostPattern: "*" },
      { ...baseInput, pathScope: "/vpm/index.json", queryMode: "exact" as const, queryScope: "page=1" },
      { ...baseInput, pathScope: "/vpm/browse", queryMode: "pagination" as const, queryScope: "page", maxPaginationDepth: 3 },
      { ...baseInput, publishClasses: ["creator_prose"] },
      { ...baseInput, pathScope: "/vpm/%E3%81%82" }
    ];
    for (const variant of variants) {
      expect(CreateSteeringProfileSchema.safeParse(variant).success).toBe(
        ConsumerCreateSteeringProfileSchema.safeParse(variant).success
      );
    }

    expect(CreateSteeringProfileSchema.safeParse({ ...baseInput, publishClasses: ["creator_prose"] }).success).toBe(
      false
    );
    for (const badHost of ["127.0.0.1", "localhost", "::1", "https://packages.example.org"]) {
      expect(CreateSteeringProfileSchema.safeParse({ ...baseInput, hostPattern: badHost }).success).toBe(false);
    }
    for (const badPath of ["/vpm//", "/vpm/../", "/vpm/%2f", "/vpm?next=1"]) {
      expect(CreateSteeringProfileSchema.safeParse({ ...baseInput, pathScope: badPath }).success).toBe(false);
    }
  });

  test("steeringProfileMatches supports exact, wildcard_subdomain, any_vpm_https, and bounded pagination queries", () => {
    const now = Date.parse("2026-11-05T00:00:00.000Z");
    const { schemaVersion: _schemaVersion, ...storedBase } = baseInput;

    const wildcard = SteeringProfileSchema.parse({
      ...storedBase,
      platform: "booth",
      hostMatchMode: "wildcard_subdomain",
      hostPattern: "*.booth.pm",
      pathScope: "/items/",
      purpose: "metadata",
      profileId: crypto.randomUUID(),
      createdAt: "2026-11-01T00:00:00.000Z",
      disabledAt: null
    });
    expect(steeringProfileMatches(wildcard, "booth", "https://creator.booth.pm/items/123", "metadata", now)).toBe(true);
    // Wildcard does NOT match apex domain
    expect(steeringProfileMatches(wildcard, "booth", "https://booth.pm/items/123", "metadata", now)).toBe(false);
    expect(steeringProfileMatches(wildcard, "booth", "https://creator.booth.pm/items/123", "discovery", now)).toBe(
      false
    );

    const anyVpm = SteeringProfileSchema.parse({
      ...storedBase,
      platform: "vpm",
      hostMatchMode: "any_vpm_https",
      hostPattern: "*",
      pathScope: "/",
      purpose: "metadata",
      profileId: crypto.randomUUID(),
      createdAt: "2026-11-01T00:00:00.000Z",
      disabledAt: null
    });
    expect(steeringProfileMatches(anyVpm, "vpm", "https://custom-creator.example/vpm.json", "metadata", now)).toBe(
      true
    );
    expect(steeringProfileMatches(anyVpm, "vpm", "https://127.0.0.1/vpm.json", "metadata", now)).toBe(false);
    expect(steeringProfileMatches(anyVpm, "vpm", "https://custom-creator.example/mod.zip", "metadata", now)).toBe(false);

    const paginated = SteeringProfileSchema.parse({
      ...storedBase,
      platform: "booth",
      hostMatchMode: "exact",
      hostPattern: "booth.pm",
      pathScope: "/ja/browse",
      queryMode: "pagination",
      queryScope: "sort=new&page",
      maxPaginationDepth: 5,
      profileId: crypto.randomUUID(),
      createdAt: "2026-11-01T00:00:00.000Z",
      disabledAt: null
    });
    expect(
      steeringProfileMatches(paginated, "booth", "https://booth.pm/ja/browse?sort=new&page=2", "discovery", now)
    ).toBe(true);
    expect(
      steeringProfileMatches(paginated, "booth", "https://booth.pm/ja/browse?sort=new&page=0", "discovery", now)
    ).toBe(false);
    expect(
      steeringProfileMatches(paginated, "booth", "https://booth.pm/ja/browse?sort=old&page=2", "discovery", now)
    ).toBe(false);
    expect(
      steeringProfileMatches(paginated, "booth", "https://booth.pm/ja/browse?sort=new&page=2&extra=1", "discovery", now)
    ).toBe(false);
  });

  test("steeringPathMatches matches canonical UTF-8 and %20 directory paths while rejecting traversal and uncanonical escapes", async () => {
    expect(steeringPathMatches("/ja/browse/", "/ja/browse/3D%20Models")).toBe(true);
    expect(steeringPathMatches("/ja/browse/", "/ja/browse/%E3%82%A2%E3%83%90%E3%82%BF%E3%83%BC")).toBe(true);
    expect(steeringPathMatches("/ja/items/123", "/ja/items/123")).toBe(true);
    expect(steeringPathMatches("/ja/items/123", "/ja/items/123/extra")).toBe(false);

    for (const badPath of [
      "/ja/browse//foo",
      "/ja/browse/.",
      "/ja/browse/..",
      "/ja/browse/../items",
      "/ja/browse/%2e%2e/x",
      "/ja/browse/%2E%2E/x",
      "/ja/browse/%2e",
      "/ja/browse/%2E",
      "/ja/browse/%2f",
      "/ja/browse/%2F",
      "/ja/browse/%5c",
      "/ja/browse/%5C",
      "/ja/browse/%00",
      "/ja/browse/%FF",
      "/ja/browse/%C0%AF",
      "/ja/browse/%E3%82",
      "/ja/browse/%e3%82%a2",
      "/ja/browse/%41"
    ]) {
      expect(steeringPathMatches("/ja/browse/", badPath)).toBe(false);
    }

    const now = Date.parse("2026-11-25T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const purged = await store.purgeDevelopmentDatabase(
        { schemaVersion: 1, confirm: "PURGE_DEVELOPMENT_D1", preserveNodes: true, seedPreviewStarter: true },
        "operator"
      );
      expect(purged.seededProfiles).toBe(PREVIEW_STARTER_PROFILE_COUNT);
      expect(purged.seededProfiles).toBe(16);

      const starterInputs = buildPreviewStarterSteeringProfiles(now);
      for (const starter of starterInputs) {
        const serialized = JSON.stringify(starter);
        expect(serialized).not.toContain("template-");
        expect(serialized).not.toContain("/sample-");
      }

      const listed = await store.listSteeringProfilesPage(100, null);
      expect(listed.profiles).toHaveLength(16);
      const boothBrowseProfile = listed.profiles.find(
        (profile) => profile.platform === "booth" && profile.pathScope === "/ja/browse/"
      );
      expect(boothBrowseProfile).toBeDefined();
      expect(
        steeringProfileMatches(
          boothBrowseProfile!,
          "booth",
          "https://booth.pm/ja/browse/3D%20Models?page=1&sort=new",
          "discovery",
          now
        )
      ).toBe(true);
      expect(
        steeringProfileMatches(
          boothBrowseProfile!,
          "booth",
          "https://booth.pm/ja/browse/%E3%82%A2%E3%83%90%E3%82%BF%E3%83%BC?page=2&sort=popular",
          "discovery",
          now
        )
      ).toBe(true);
    } finally {
      store.close();
    }
  });

  test("suppressed_targets enforces url, origin, and domain matching cleanly across helpers", () => {
    const targets = [
      {
        target: "https://blocked-item.example/item/1",
        scope: "url" as const,
        reason: "Specific item takedown",
        suppressedAt: "2026-11-01T00:00:00.000Z"
      },
      {
        target: "https://blocked-origin.example",
        scope: "origin" as const,
        reason: "Origin block",
        suppressedAt: "2026-11-01T00:00:00.000Z"
      },
      {
        target: "blocked-domain.example",
        scope: "domain" as const,
        reason: "Wildcard domain block",
        suppressedAt: "2026-11-01T00:00:00.000Z"
      }
    ];

    expect(findMatchingSuppressedTarget("https://blocked-item.example/item/1", targets)?.scope).toBe("url");
    expect(findMatchingSuppressedTarget("https://blocked-item.example/item/2", targets)).toBeNull();
    expect(findMatchingSuppressedTarget("https://blocked-origin.example/any/path", targets)?.scope).toBe("origin");
    expect(findMatchingSuppressedTarget("https://sub.blocked-origin.example/any/path", targets)).toBeNull();
    expect(findMatchingSuppressedTarget("https://blocked-domain.example/path", targets)?.scope).toBe("domain");
    expect(findMatchingSuppressedTarget("https://sub.blocked-domain.example/path", targets)?.scope).toBe("domain");
    expect(findMatchingSuppressedTarget("https://notblocked-domain.example/path", targets)).toBeNull();
    expect(findMatchingHostSuppression("sub.blocked-domain.example", targets)?.scope).toBe("domain");
    expect(findMatchingHostSuppression("blocked-origin.example", targets)?.scope).toBe("origin");
  });

  test("disableSteeringProfile statement-order fix commits disabled_at and releases leased jobs before clearing refresh_lease_id", async () => {
    let now = Date.parse("2026-11-05T00:00:00.000Z");
    const store = await createInitializedD1Coordinator(":memory:", () => now);
    try {
      const origin = "https://packages.example.org";
      const target = `${origin}/vpm/index.json`;
      const profile = await store.createSteeringProfile(baseInput, "operator");
      await store.seedJob(target, "vpm", { minDelayMs: 1000, purpose: "discovery" });

      const robotsLease = await store.reserveRobotsRefresh(origin);
      expect(robotsLease).toBeTruthy();

      expect(await store.completeRobotsRefresh(origin, robotsLease!, 200, "User-agent: *\nAllow: /")).toBe(true);
      now += 1500;
      const { token } = await store.createNodeCredential("steering-worker", ["vpm"]);
      const principal = (await store.authenticate("steering-worker", token))!;

      const claim = await store.claim({ schemaVersion: 1, nodeId: "steering-worker", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");

      // Re-inject a refresh lease on origin_state to simulate concurrent robots refresh in progress
      store.sqlite
        .prepare("UPDATE origin_state SET refresh_lease_id=?, refresh_lease_expires_at=? WHERE origin=?")
        .run("pending-refresh-lease", "2026-11-05T01:00:00.000Z", origin);

      const disabled = await store.disableSteeringProfile(profile.profileId, "operator", "Profile paused");
      expect(disabled.disabledAt).not.toBeNull();

      const jobRow = store.sqlite
        .prepare("SELECT state, claimed_by, lease_id, steering_profile_id FROM crawl_jobs WHERE url=?")
        .get(target) as {
        state: string;
        claimed_by: string | null;
        lease_id: string | null;
        steering_profile_id: string | null;
      };
      expect(jobRow.state).toBe("pending");
      expect(jobRow.claimed_by).toBeNull();
      expect(jobRow.lease_id).toBeNull();
      expect(jobRow.steering_profile_id).toBeNull();

      // Since NO active steering profile remains for origin, refresh_lease_id MUST be cleared AFTER disabled_at was committed
      const originRow = store.sqlite
        .prepare("SELECT active_job_id, refresh_lease_id, refresh_lease_expires_at FROM origin_state WHERE origin=?")
        .get(origin) as {
        active_job_id: string | null;
        refresh_lease_id: string | null;
        refresh_lease_expires_at: string | null;
      };
      expect(originRow.active_job_id).toBeNull();
      expect(originRow.refresh_lease_id).toBeNull();
      expect(originRow.refresh_lease_expires_at).toBeNull();

      // Now verify when a SECOND active profile covers the same origin, disabling one preserves refresh_lease_id
      const pA = await store.createSteeringProfile(
        { ...baseInput, pathScope: "/alpha/" },
        "operator"
      );
      await store.createSteeringProfile({ ...baseInput, pathScope: "/beta/" }, "operator");
      await store.seedJob(`${origin}/beta/index.json`, "vpm", { minDelayMs: 1000, purpose: "discovery" });
      store.sqlite
        .prepare("UPDATE origin_state SET refresh_lease_id=?, refresh_lease_expires_at=? WHERE origin=?")
        .run("shared-refresh-lease", "2026-11-05T01:00:00.000Z", origin);

      await store.disableSteeringProfile(pA.profileId, "operator", "Disable alpha while beta remains");
      const preservedRow = store.sqlite
        .prepare("SELECT refresh_lease_id FROM origin_state WHERE origin=?")
        .get(origin) as { refresh_lease_id: string | null };
      expect(preservedRow.refresh_lease_id).toBe("shared-refresh-lease");
    } finally {
      store.close();
    }
  });

  test("operator /v1/operator/steering-profiles and /v1/operator/suppressed-targets CRUD routes enforce auth and audit trail", async () => {
    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-11-05T00:00:00.000Z"));
    const token = "a".repeat(64);
    const call = (path: string, method = "GET", body?: unknown, bearer = token) =>
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
      // Retired legacy endpoint returns 404
      expect((await call("/v1/operator/source-profiles")).status).toBe(404);
      expect((await call("/v1/operator/steering-profiles", "POST", baseInput, "b".repeat(64))).status).toBe(401);

      const createRes = await call("/v1/operator/steering-profiles", "POST", baseInput);
      expect(createRes.status).toBe(201);
      const created = SteeringProfileResponseSchema.parse(await createRes.json());
      expect(created.profile.disabledAt).toBeNull();

      // Overlap rejected with 409
      expect((await call("/v1/operator/steering-profiles", "POST", { ...baseInput, pathScope: "/vpm/second/" })).status).toBe(
        409
      );

      // PATCH updates steering profile
      const patchRes = await call(`/v1/operator/steering-profiles/${created.profile.profileId}`, "PATCH", {
        schemaVersion: 1,
        autoPromote: true,
        recrawlIntervalMs: 14_400_000,
        reason: "Enable auto-promotion and 4h tier"
      });
      expect(patchRes.status).toBe(200);
      const patched = SteeringProfileResponseSchema.parse(await patchRes.json());
      expect(patched.profile.autoPromote).toBe(true);
      expect(patched.profile.recrawlIntervalMs).toBe(14_400_000);

      // List pagination
      await call("/v1/operator/steering-profiles", "POST", { ...baseInput, pathScope: "/other/" });
      const page1 = SteeringProfileListResponseSchema.parse(await (await call("/v1/operator/steering-profiles?limit=1")).json());
      expect(page1.profiles).toHaveLength(1);
      expect(page1.nextCursor).toBeTruthy();

      // Disable -> enable -> delete lifecycle
      const disabled = SteeringProfileResponseSchema.parse(
        await (
          await call(`/v1/operator/steering-profiles/${created.profile.profileId}/disable`, "POST", {
            schemaVersion: 1,
            reason: "Temporary pause"
          })
        ).json()
      );
      expect(disabled.profile.disabledAt).not.toBeNull();

      const enabled = SteeringProfileResponseSchema.parse(
        await (
          await call(`/v1/operator/steering-profiles/${created.profile.profileId}/enable`, "POST", {
            schemaVersion: 1,
            reason: "Resume profile"
          })
        ).json()
      );
      expect(enabled.profile.disabledAt).toBeNull();

      const delRes = await call(`/v1/operator/steering-profiles/${created.profile.profileId}`, "DELETE", {
        schemaVersion: 1,
        reason: "Remove profile after test"
      });
      expect(delRes.status).toBe(200);
      expect(SteeringProfileDeleteResponseSchema.parse(await delRes.json()).status).toBe("deleted");

      // Suppressed targets CRUD
      const supRes = await call("/v1/operator/suppressed-targets", "POST", {
        schemaVersion: 1,
        target: "spam.example",
        scope: "domain",
        reason: "Domain suppression test"
      });
      expect(supRes.status).toBe(201);
      const supCreated = SuppressedTargetResponseSchema.parse(await supRes.json());
      expect(supCreated.suppressedTarget.target).toBe("spam.example");
      expect(supCreated.suppressedTarget.scope).toBe("domain");

      const supList = SuppressedTargetListResponseSchema.parse(await (await call("/v1/operator/suppressed-targets")).json());
      expect(supList.targets.some((t) => t.target === "spam.example")).toBe(true);

      const supDel = await call("/v1/operator/suppressed-targets", "DELETE", {
        schemaVersion: 1,
        target: "spam.example",
        reason: "Lift suppression"
      });
      expect(supDel.status).toBe(200);
      expect(SuppressedTargetDeleteResponseSchema.parse(await supDel.json()).status).toBe("deleted");
    } finally {
      store.close();
    }
  });

  test("steering overlap helpers and create/update/enable enforce UTF-8 path and query-mode conflicts accurately", async () => {
    expect(steeringPathScopesOverlap("/ja/browse/", "/ja/browse/%E3%82%A2")).toBe(true);
    expect(steeringPathScopesOverlap("/ja/browse/%E3%82%A2", "/ja/browse/")).toBe(true);
    expect(steeringPathScopesOverlap("/ja/browse/%E3%82%A2", "/ja/browse/%E3%82%A2/extra")).toBe(false);

    expect(steeringQueryModesOverlap("none", null, "pagination", "page,sort")).toBe(true);
    expect(steeringQueryModesOverlap("none", null, "pagination", "sort=new&page")).toBe(false);
    expect(steeringQueryModesOverlap("exact", "sort=new&page=2", "pagination", "sort=new&page")).toBe(true);
    expect(steeringQueryModesOverlap("exact", "sort=old&page=2", "pagination", "sort=new&page")).toBe(false);
    expect(steeringQueryModesOverlap("pagination", "sort=new&page", "pagination", "sort=old&page")).toBe(false);
    expect(steeringQueryModesOverlap("pagination", "page", "pagination", "sort")).toBe(true);

    const store = await createInitializedD1Coordinator(":memory:", () => Date.parse("2026-11-05T00:00:00.000Z"));
    const token = "a".repeat(64);
    const call = (path: string, method = "GET", body?: unknown) =>
      handleOperatorRequest(
        new Request(`http://localhost${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        }),
        store,
        token
      );
    try {
      const dirBrowse = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "booth",
        hostPattern: "booth.pm",
        pathScope: "/ja/browse/",
        queryMode: "pagination",
        queryScope: "page"
      });
      expect(dirBrowse.status).toBe(201);
      const dirProfile = SteeringProfileResponseSchema.parse(await dirBrowse.json()).profile;

      // Encoded path inside active /ja/browse/ directory and open-pagination base query must conflict (409)
      const encodedOverlap = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "booth",
        hostPattern: "booth.pm",
        pathScope: "/ja/browse/%E3%82%A2",
        queryMode: "none"
      });
      expect(encodedOverlap.status).toBe(409);

      // Fixed-filter pagination does NOT match queryless base URLs and can coexist with none at disjoint path
      const fixedPag = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "gumroad",
        hostPattern: "gumroad.com",
        pathScope: "/discover",
        queryMode: "pagination",
        queryScope: "sort=newest&page"
      });
      expect(fixedPag.status).toBe(201);
      const noneCoexist = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "gumroad",
        hostPattern: "gumroad.com",
        pathScope: "/discover",
        queryMode: "none"
      });
      expect(noneCoexist.status).toBe(201);
      const noneProfile = SteeringProfileResponseSchema.parse(await noneCoexist.json()).profile;

      // Moving noneProfile away from /discover succeeds (200), then PATCHing back into overlapping /discover returns 409
      const patchMove = await call(`/v1/operator/steering-profiles/${noneProfile.profileId}`, "PATCH", {
        schemaVersion: 1,
        pathScope: "/discover/other",
        reason: "Move away from /discover first"
      });
      expect(patchMove.status).toBe(200);
      const createdDisjointNone = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "gumroad",
        hostPattern: "gumroad.com",
        pathScope: "/discover",
        queryMode: "none"
      });
      expect(createdDisjointNone.status).toBe(201);
      const patchOverlap = await call(`/v1/operator/steering-profiles/${noneProfile.profileId}`, "PATCH", {
        schemaVersion: 1,
        pathScope: "/discover",
        reason: "PATCH into active /discover none grant must reject"
      });
      expect(patchOverlap.status).toBe(409);

      // Re-enabling a disabled profile when a replacement now covers its scope returns 409
      await call(`/v1/operator/steering-profiles/${dirProfile.profileId}/disable`, "POST", {
        schemaVersion: 1,
        reason: "Pause directory rule"
      });
      const replacement = await call("/v1/operator/steering-profiles", "POST", {
        ...baseInput,
        platform: "booth",
        hostPattern: "booth.pm",
        pathScope: "/ja/browse/%E3%82%A2",
        queryMode: "none"
      });
      expect(replacement.status).toBe(201);
      const reenableBlocked = await call(`/v1/operator/steering-profiles/${dirProfile.profileId}/enable`, "POST", {
        schemaVersion: 1,
        reason: "Re-enable despite overlapping active profile"
      });
      expect(reenableBlocked.status).toBe(409);
    } finally {
      store.close();
    }
  });
});
