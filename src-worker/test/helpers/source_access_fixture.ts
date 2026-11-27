import type { Platform, PriorityLane } from "vrc-packages-network/node";
import type { HostMatchMode, QueryMode, SourcePurpose } from "../../src/domain/access/steering_profile.ts";
import type { Coordinator, SeedJobOptions } from "../../src/storage/d1/coordinator.ts";

export interface ApproveFixtureSourceOptions {
  hostMatchMode?: HostMatchMode;
  hostPattern?: string;
  pathScope?: string;
  queryMode?: QueryMode;
  queryScope?: string | null;
  autoPromote?: boolean;
  recrawlIntervalMs?: number;
  minDelayMs?: number;
  maxPaginationDepth?: number;
}

/** Explicit offline-only approval; production seeding never calls this helper. */
export async function approveFixtureSource(
  store: Coordinator,
  target: string,
  platform: Platform,
  purpose: SourcePurpose = "metadata",
  options: ApproveFixtureSourceOptions = {}
): Promise<void> {
  if (await store.activeSteeringProfileForTarget(platform, target, purpose)) return;
  const url = new URL(target);
  const queryScope = options.queryScope !== undefined ? options.queryScope : url.search ? url.search.slice(1) : null;
  const queryMode: QueryMode = options.queryMode ?? (queryScope ? "exact" : "none");
  const hostMatchMode: HostMatchMode = options.hostMatchMode ?? "exact";
  const hostPattern = options.hostPattern ?? (hostMatchMode === "any_vpm_https" ? "*" : url.hostname.toLowerCase());
  await store.createSteeringProfile(
    {
      schemaVersion: 1,
      platform,
      hostMatchMode,
      hostPattern,
      pathScope: options.pathScope ?? url.pathname,
      queryMode,
      ...(queryScope !== null ? { queryScope } : {}),
      method: "GET",
      purpose,
      autoPromote: options.autoPromote ?? false,
      recrawlIntervalMs: options.recrawlIntervalMs ?? 86_400_000,
      minDelayMs: Math.max(1000, options.minDelayMs ?? 1000),
      maxPaginationDepth: options.maxPaginationDepth ?? 0,
      expiresAt: "2099-01-01T00:00:00.000Z",
      reviewReference: "offline-fixture-only",
      reason: "Synthetic local test target",
      retainClasses: ["normalized_facts", "creator_prose"],
      publishClasses: ["normalized_facts"]
    },
    "test-fixture"
  );
}

export async function seedApprovedFixtureJob(
  store: Coordinator,
  target: string,
  platform: Platform,
  minDelayMs = 1000,
  purpose: SourcePurpose = "metadata",
  seedOptions: Omit<SeedJobOptions, "minDelayMs" | "purpose"> & { priorityLane?: PriorityLane } = {}
): Promise<string> {
  await approveFixtureSource(store, target, platform, purpose, {
    minDelayMs,
    ...(seedOptions.recrawlIntervalMs !== undefined ? { recrawlIntervalMs: seedOptions.recrawlIntervalMs } : {})
  });
  return store.seedJob(target, platform, {
    ...seedOptions,
    minDelayMs,
    purpose
  });
}
