import type { Platform, JobPurpose } from "vrc-packages-network/node";

export interface DefaultSeedJob {
  url: string;
  platform: Platform;
  minDelayMs: number;
  purpose: JobPurpose;
}

// Candidate jobs only. These entries grant neither fetching nor publication.
// Placeholder seed selection remains under owner review (FLEET-S2).
export const DEFAULT_SEED_JOBS: DefaultSeedJob[] = [
  {
    url: "https://vrchat-community.github.io/template-package/index.json",
    platform: "vpm",
    minDelayMs: 1000,
    purpose: "discovery"
  },
  {
    url: "https://raw.githubusercontent.com/vrchat-community/template-package-listing/main/source.json",
    platform: "vpm",
    minDelayMs: 1000,
    purpose: "discovery"
  },
  {
    url: "https://booth.pm/ja/items/456789",
    platform: "booth",
    minDelayMs: 1500,
    purpose: "metadata"
  },
  {
    url: "https://gumroad.com/l/sample-vrc-asset",
    platform: "gumroad",
    minDelayMs: 3000,
    purpose: "metadata"
  },
  {
    url: "https://jinxxy.com/p/sample-vrc-tool",
    platform: "jinxxy",
    minDelayMs: 2000,
    purpose: "metadata"
  },
  {
    url: "https://sellfy.com/p/sample-vrc-prefab/",
    platform: "sellfy",
    minDelayMs: 2000,
    purpose: "metadata"
  },
  {
    url: "https://payhip.com/b/sample-vrc-item",
    platform: "custom_domain",
    minDelayMs: 2000,
    purpose: "metadata"
  },
  {
    url: "https://ko-fi.com/s/sample-vrc-item",
    platform: "custom_domain",
    minDelayMs: 2000,
    purpose: "metadata"
  }
];

export interface DefaultApprovedProfile {
  platform: Platform;
  origin: string;
  pathScope: string;
  method: "GET";
  purpose: JobPurpose;
  minDelayMs: number;
  expiresInDays: number;
  reviewReference: string;
  reason: string;
  retainClasses: ("normalized_facts" | "creator_prose" | "raw_payload" | "media_metadata")[];
  publishClasses: ("normalized_facts" | "creator_prose" | "raw_payload" | "media_metadata")[];
}

/**
 * Approved open VPM community listing profiles with robots preflight required (FLEET-S2).
 * These explicit profiles cover approved open community repositories.
 * Storefront listings remain ungranted candidate discovery leads that require manual operator review.
 */
export const DEFAULT_APPROVED_SOURCE_PROFILES: DefaultApprovedProfile[] = [
  {
    platform: "vpm",
    origin: "https://vrchat-community.github.io",
    pathScope: "/template-package/",
    method: "GET",
    purpose: "discovery",
    minDelayMs: 1000,
    expiresInDays: 365,
    reviewReference: "COMMUNITY-VPM-TEMPLATE",
    reason: "Approved open VPM community template package listing",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "vpm",
    origin: "https://raw.githubusercontent.com",
    pathScope: "/vrchat-community/template-package-listing/",
    method: "GET",
    purpose: "discovery",
    minDelayMs: 1000,
    expiresInDays: 365,
    reviewReference: "COMMUNITY-VPM-LISTING",
    reason: "Approved open VPM community template package listing source",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  }
];
