import {
  CreateSteeringProfileSchema,
  OPERATOR_PROTOCOL_VERSION,
  type CreateSteeringProfile
} from "vrc-packages-api";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface StarterProfileBlueprint {
  platform: CreateSteeringProfile["platform"];
  hostMatchMode: CreateSteeringProfile["hostMatchMode"];
  hostPattern: string;
  pathScope: string;
  queryMode: CreateSteeringProfile["queryMode"];
  queryScope?: string | null;
  purpose: CreateSteeringProfile["purpose"];
  autoPromote: boolean;
  recrawlIntervalMs: number;
  minDelayMs: number;
  maxPaginationDepth: number;
  reviewReference: string;
  reason: string;
  retainClasses: CreateSteeringProfile["retainClasses"];
  publishClasses: CreateSteeringProfile["publishClasses"];
}

/**
 * Explicit starter steering blueprints used strictly when an operator purges development/preview D1
 * with `seedPreviewStarter: true`. Never invoked automatically during `initializeDatabase`.
 */
const STARTER_BLUEPRINTS: readonly StarterProfileBlueprint[] = [
  {
    platform: "vpm",
    hostMatchMode: "any_vpm_https",
    hostPattern: "*",
    pathScope: "/",
    queryMode: "none",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 21_600_000,
    minDelayMs: 1000,
    maxPaginationDepth: 0,
    reviewReference: "V0-PREVIEW-VPM-OPEN",
    reason: "Preview starter steering rule allowing auto-promotion of validated public HTTPS VPM feeds",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts", "creator_prose"]
  },
  {
    platform: "github",
    hostMatchMode: "exact",
    hostPattern: "api.github.com",
    pathScope: "/repos/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 60_000,
    maxPaginationDepth: 0,
    reviewReference: "GITHUB-PUBLIC-REST-API",
    reason: "Preview starter steering rule for public GitHub repository REST metadata lookups",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts", "creator_prose"]
  },
  {
    platform: "booth",
    hostMatchMode: "exact",
    hostPattern: "booth.pm",
    pathScope: "/ja/browse/",
    queryMode: "pagination",
    queryScope: "page,sort",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 14_400_000,
    minDelayMs: 1500,
    maxPaginationDepth: 5,
    reviewReference: "BOOTH-BROWSE-DISCOVERY",
    reason: "Preview starter steering rule for BOOTH category browse discovery pages",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "booth",
    hostMatchMode: "exact",
    hostPattern: "booth.pm",
    pathScope: "/ja/items/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 1500,
    maxPaginationDepth: 0,
    reviewReference: "BOOTH-ITEM-METADATA",
    reason: "Preview starter steering rule for canonical BOOTH item metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "booth",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.booth.pm",
    pathScope: "/items/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 1500,
    maxPaginationDepth: 0,
    reviewReference: "BOOTH-SUBDOMAIN-METADATA",
    reason: "Preview starter steering rule for creator BOOTH shop subdomain item metadata",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "gumroad",
    hostMatchMode: "exact",
    hostPattern: "gumroad.com",
    pathScope: "/discover",
    queryMode: "pagination",
    queryScope: "page,query,tags,sort",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 14_400_000,
    minDelayMs: 3000,
    maxPaginationDepth: 5,
    reviewReference: "GUMROAD-DISCOVER-BROWSE",
    reason: "Preview starter steering rule for Gumroad public discover browse listings",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "gumroad",
    hostMatchMode: "exact",
    hostPattern: "gumroad.com",
    pathScope: "/l/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 3000,
    maxPaginationDepth: 0,
    reviewReference: "GUMROAD-APEX-METADATA",
    reason: "Preview starter steering rule for Gumroad apex product metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "gumroad",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.gumroad.com",
    pathScope: "/l/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 3000,
    maxPaginationDepth: 0,
    reviewReference: "GUMROAD-SUBDOMAIN-METADATA",
    reason: "Preview starter steering rule for Gumroad creator subdomain product metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "jinxxy",
    hostMatchMode: "exact",
    hostPattern: "jinxxy.com",
    pathScope: "/",
    queryMode: "pagination",
    queryScope: "page,sort,category",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 14_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 5,
    reviewReference: "JINXXY-CATALOG-DISCOVERY",
    reason: "Preview starter steering rule for Jinxxy paginated public catalog discovery",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "jinxxy",
    hostMatchMode: "exact",
    hostPattern: "jinxxy.com",
    pathScope: "/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 0,
    reviewReference: "JINXXY-ITEM-METADATA",
    reason: "Preview starter steering rule for Jinxxy public product metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "itch",
    hostMatchMode: "exact",
    hostPattern: "itch.io",
    pathScope: "/tools/",
    queryMode: "pagination",
    queryScope: "page",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 14_400_000,
    minDelayMs: 1500,
    maxPaginationDepth: 5,
    reviewReference: "ITCH-TOOLS-DISCOVERY",
    reason: "Preview starter steering rule for public itch.io tools directory discovery",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "itch",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.itch.io",
    pathScope: "/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 1500,
    maxPaginationDepth: 0,
    reviewReference: "ITCH-CREATOR-METADATA",
    reason: "Preview starter steering rule for creator itch.io subdomain project metadata",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "shopify",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.myshopify.com",
    pathScope: "/",
    queryMode: "pagination",
    queryScope: "from,to",
    purpose: "discovery",
    autoPromote: true,
    recrawlIntervalMs: 14_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 5,
    reviewReference: "SHOPIFY-SITEMAP-DISCOVERY",
    reason: "Preview starter steering rule for public Shopify sitemap and listing discovery",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "shopify",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.myshopify.com",
    pathScope: "/products/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 0,
    reviewReference: "SHOPIFY-PRODUCT-METADATA",
    reason: "Preview starter steering rule for public Shopify product metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "sellfy",
    hostMatchMode: "exact",
    hostPattern: "sellfy.com",
    pathScope: "/p/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 0,
    reviewReference: "SELLFY-APEX-METADATA",
    reason: "Preview starter steering rule for Sellfy apex product metadata pages",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  },
  {
    platform: "sellfy",
    hostMatchMode: "wildcard_subdomain",
    hostPattern: "*.sellfy.store",
    pathScope: "/p/",
    queryMode: "none",
    purpose: "metadata",
    autoPromote: false,
    recrawlIntervalMs: 86_400_000,
    minDelayMs: 2000,
    maxPaginationDepth: 0,
    reviewReference: "SELLFY-STORE-METADATA",
    reason: "Preview starter steering rule for Sellfy custom store subdomain product metadata",
    retainClasses: ["normalized_facts", "creator_prose"],
    publishClasses: ["normalized_facts"]
  }
];

export const PREVIEW_STARTER_PROFILE_COUNT = STARTER_BLUEPRINTS.length;

/**
 * Builds and validates V0 preview starter steering profiles with bounded expiration timestamps.
 */
export function buildPreviewStarterSteeringProfiles(nowMs = Date.now()): CreateSteeringProfile[] {
  const expiresAt = new Date(nowMs + ONE_YEAR_MS).toISOString();
  return STARTER_BLUEPRINTS.map((entry) =>
    CreateSteeringProfileSchema.parse({
      schemaVersion: OPERATOR_PROTOCOL_VERSION,
      platform: entry.platform,
      hostMatchMode: entry.hostMatchMode,
      hostPattern: entry.hostPattern,
      pathScope: entry.pathScope,
      queryMode: entry.queryMode,
      ...(entry.queryScope !== undefined ? { queryScope: entry.queryScope } : {}),
      method: "GET",
      purpose: entry.purpose,
      autoPromote: entry.autoPromote,
      recrawlIntervalMs: entry.recrawlIntervalMs,
      minDelayMs: entry.minDelayMs,
      maxPaginationDepth: entry.maxPaginationDepth,
      expiresAt,
      reviewReference: entry.reviewReference,
      reason: entry.reason,
      retainClasses: [...entry.retainClasses],
      publishClasses: [...entry.publishClasses]
    })
  );
}
