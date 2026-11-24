import type { DiscoveryLead, JobPurpose, Platform } from "../protocol/node_protocol.ts";
import { isIp, isPrivateOrReservedIp } from "./ip_policy.ts";
import { isItchSearchUrl } from "./source_path_policy.ts";

const GITHUB_OWNER_REGEX = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_RESERVED_TOP_LEVEL_ROUTES = new Set([
  "about", "apps", "collections", "enterprise", "events", "explore", "features",
  "issues", "join", "login", "marketplace", "notifications", "orgs", "pricing",
  "pulls", "search", "security", "settings", "signup", "site", "sponsors",
  "topics", "trending", "users"
]);

const GUMROAD_SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.gumroad\.com$/;
const BOOTH_SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.booth\.pm$/;
const MAX_BROWSE_URL_LENGTH = 2048;

const DISALLOWED_BROWSE_QUERY_KEYS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "aff", "affiliate", "fbclid", "gclid", "token", "source",
  "msclkid", "twclid", "igshid", "mc_eid", "_ga", "_gl", "spm", "si",
  "session_id", "feature"
]);

/** Prohibited archive, compiled binary, and raw 3D asset extensions excluded by policy (LEGAL.md Section 3.1). */
export const ARCHIVE_BINARY_EXTENSIONS = [
  ".zip",
  ".unitypackage",
  ".vpmz",
  ".tar",
  ".tar.gz",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".iso",
  ".exe",
  ".msi",
  ".bin",
  ".dll",
  ".dylib",
  ".so",
  ".fbx",
  ".obj",
  ".blend",
  ".prefab",
  ".asset"
] as const;

/** Reports whether a URL pathname ends with a prohibited archive or binary extension. */
export function hasArchiveBinaryExtension(pathname: string): boolean {
  const lower = pathname.trim().toLowerCase();
  return ARCHIVE_BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Reports whether a URL targets a prohibited archive, executable, or binary asset path. */
export function isArchiveOrBinaryUrl(value: string): boolean {
  try {
    return hasArchiveBinaryExtension(new URL(value).pathname);
  } catch {
    return false;
  }
}

function parseHttpsUrl(value: string, options: {
  allowSearch?: boolean;
  requireExactHref?: boolean;
} = {}): URL | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (options.requireExactHref && url.href !== value) return null;
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    if (!options.allowSearch && url.search) return null;
    return url;
  } catch {
    return null;
  }
}

function isDisallowedLeadHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".")) {
    return true;
  }
  if (!host.includes(".")) return true;
  return isIp(host) && isPrivateOrReservedIp(host);
}

function hasDotSegment(pathname: string): boolean {
  return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

function isBoothHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "booth.pm" || BOOTH_SUBDOMAIN_REGEX.test(host);
}

function isGumroadHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "gumroad.com" || GUMROAD_SUBDOMAIN_REGEX.test(host);
}

function hasBoundedBrowseQuery(url: URL, rawValue: string): boolean {
  if (rawValue.endsWith("?")) return false;
  if (!url.search) return true;
  if (url.search.length > 512) return false;
  let count = 0;
  for (const [key, val] of url.searchParams.entries()) {
    count += 1;
    if (count > 10) return false;
    const lowerKey = key.toLowerCase();
    if (
      !key ||
      key.length > 40 ||
      !/^[A-Za-z0-9_[\]-]+$/.test(key) ||
      val.length > 150 ||
      DISALLOWED_BROWSE_QUERY_KEYS.has(lowerKey) ||
      lowerKey.startsWith("utm_") ||
      lowerKey.startsWith("aff_") ||
      lowerKey.startsWith("ref_")
    ) {
      return false;
    }
    if (lowerKey === "page" && !/^[1-9]\d{0,2}$/.test(val)) {
      return false;
    }
  }
  return count > 0;
}

/** Validates a canonical public HTTPS origin without credentials, ports, paths, or private/reserved hosts. */
export function isValidPublicHttpsOrigin(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.port &&
      !isDisallowedLeadHost(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Validates an owner/repo pair for GitHub repository identity rules. */
export function parseGitHubOwnerRepo(owner: string, repo: string, options: {
  stripGitSuffix?: boolean;
  rejectReservedRoutes?: boolean;
} = {}): string | null {
  if (!GITHUB_OWNER_REGEX.test(owner)) return null;
  if (options.rejectReservedRoutes && GITHUB_RESERVED_TOP_LEVEL_ROUTES.has(owner.toLowerCase())) return null;
  const cleanRepo = options.stripGitSuffix && repo.length > 4 && repo.toLowerCase().endsWith(".git")
    ? repo.slice(0, -4)
    : repo;
  if (!GITHUB_REPO_REGEX.test(cleanRepo) || cleanRepo === "." || cleanRepo === "..") return null;
  return `${owner}/${cleanRepo}`;
}

/** Supported public GitHub REST target, excluding search, HTML, content and archives. */
export function githubApiRepositoryIdentity(value: string): string | null {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== "api.github.com") return null;
  const match = /^\/repos\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  return match ? parseGitHubOwnerRepo(match[1], match[2]) : null;
}

/** Extracts canonical owner/repo identity from a public github.com repository URL. */
export function githubRepositoryIdentity(value: string): string | null {
  const url = parseHttpsUrl(value, { allowSearch: true });
  if (!url || url.hostname !== "github.com" || hasArchiveBinaryExtension(url.pathname)) return null;
  const match = /^\/([^/]+)\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
  return match ? parseGitHubOwnerRepo(match[1], match[2], { stripGitSuffix: true, rejectReservedRoutes: true }) : null;
}

/** Normalizes a GitHub web or REST repository URL to its canonical HTML repository URL. */
export function normalizeGitHubRepositoryUrl(value: string): string | null {
  const identity = githubApiRepositoryIdentity(value) ?? githubRepositoryIdentity(value);
  return identity ? `https://github.com/${identity}` : null;
}

/** Normalizes a GitHub web or REST repository URL to its public REST API metadata endpoint. */
export function normalizeGitHubApiUrl(value: string): string | null {
  const identity = githubApiRepositoryIdentity(value) ?? githubRepositoryIdentity(value);
  return identity ? `https://api.github.com/repos/${identity}` : null;
}

/** Current leased BOOTH discovery endpoint class: a single category page with optional bounded query. */
export function isBoothBrowseTarget(value: string): boolean {
  const url = parseHttpsUrl(value, { allowSearch: true, requireExactHref: true });
  if (!url || url.origin !== "https://booth.pm" || value.length > MAX_BROWSE_URL_LENGTH || value.endsWith("?")) {
    return false;
  }
  const pathMatch = /^\/(?:ja|en)\/browse\/([A-Za-z0-9._~%-]+)$/.exec(url.pathname);
  if (!pathMatch || pathMatch[1] === "." || pathMatch[1] === ".." || hasArchiveBinaryExtension(url.pathname)) {
    return false;
  }
  if (!url.search) return true;
  let seenPage = false;
  let seenSort = false;
  let tagCount = 0;
  for (const [key, val] of url.searchParams.entries()) {
    if (key === "page") {
      if (seenPage || !/^[1-9]\d{0,2}$/.test(val)) return false;
      seenPage = true;
    } else if (key === "sort") {
      if (seenSort || !/^[A-Za-z0-9_-]{1,40}$/.test(val)) return false;
      seenSort = true;
    } else if (key === "tags[]") {
      if (!val || val.length > 100 || tagCount >= 10) return false;
      tagCount += 1;
    } else {
      return false;
    }
  }
  return seenPage || seenSort || tagCount > 0;
}

/** A canonical BOOTH item URL on apex booth.pm or a single-label creator subdomain. */
export function boothItemIdentity(value: string): string | null {
  const url = parseHttpsUrl(value, { requireExactHref: true });
  if (!url || !isBoothHost(url.hostname) || hasArchiveBinaryExtension(url.pathname)) return null;
  return /^\/(?:ja\/|en\/)?items\/([1-9]\d{0,17})\/?$/.exec(url.pathname)?.[1] ?? null;
}

/** Validates a canonical BOOTH product page URL on apex booth.pm or a creator subdomain. */
export function isBoothProductTarget(value: string): boolean {
  return boothItemIdentity(value) !== null;
}

/** Validates a canonical Gumroad discovery or VRChat browse target URL. */
export function isGumroadBrowseTarget(value: string): boolean {
  const url = parseHttpsUrl(value, { allowSearch: true, requireExactHref: true });
  if (!url || url.origin !== "https://gumroad.com" || value.length > MAX_BROWSE_URL_LENGTH ||
      hasArchiveBinaryExtension(url.pathname) || hasDotSegment(url.pathname)) {
    return false;
  }
  if (!/^\/(?:discover(?:\/[A-Za-z0-9._~%-]+)*|vrchat)\/?$/.test(url.pathname)) {
    return false;
  }
  return hasBoundedBrowseQuery(url, value);
}

/** Validates a canonical Gumroad product page URL on apex gumroad.com or a creator subdomain. */
export function isGumroadProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url || !isGumroadHost(url.hostname) || hasArchiveBinaryExtension(url.pathname)) return false;
  const match = /^\/l\/([^/]+)\/?$/.exec(url.pathname);
  return Boolean(match && match[1] !== "." && match[1] !== "..");
}

/** Validates a Jinxxy sitemap or market browse target URL. */
export function isJinxxyBrowseTarget(value: string): boolean {
  const url = parseHttpsUrl(value, { allowSearch: true, requireExactHref: true });
  if (!url || url.origin !== "https://jinxxy.com" || value.length > MAX_BROWSE_URL_LENGTH ||
      value.endsWith("?") || hasArchiveBinaryExtension(url.pathname) || hasDotSegment(url.pathname)) {
    return false;
  }
  const isSitemap = url.pathname === "/sitemap.xml" ||
    /^\/sitemap_[A-Za-z0-9._-]+\.xml$/.test(url.pathname) ||
    /^\/sitemaps\/[A-Za-z0-9._-]+\.xml$/.test(url.pathname);
  if (isSitemap) {
    return !url.search;
  }
  if (!/^\/market(?:\/[A-Za-z0-9._~%-]+)*\/?$/.test(url.pathname)) {
    return false;
  }
  return hasBoundedBrowseQuery(url, value);
}

/** Validates a canonical Jinxxy product page URL. */
export function isJinxxyProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname !== "jinxxy.com" || hasArchiveBinaryExtension(url.pathname)) return false;
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
  return Boolean(
    match &&
    match[1] !== "." &&
    match[1] !== ".." &&
    match[1] !== "market" &&
    match[1] !== "sitemaps" &&
    match[2] !== "." &&
    match[2] !== ".."
  );
}

/** Validates an itch.io tag browse target while permanently rejecting /search. */
export function isItchTagTarget(value: string): boolean {
  if (isItchSearchUrl(value)) return false;
  const url = parseHttpsUrl(value, { allowSearch: true, requireExactHref: true });
  if (!url || url.origin !== "https://itch.io" || value.length > MAX_BROWSE_URL_LENGTH ||
      value.endsWith("?") || hasArchiveBinaryExtension(url.pathname)) {
    return false;
  }
  if (!/^\/(?:tools|assets|games|game-assets)\/tag-[a-z0-9-]+(?:\/tag-[a-z0-9-]+)*\/?$/.test(url.pathname)) {
    return false;
  }
  return !url.search || /^\?page=[1-9]\d{0,2}$/.test(url.search);
}

/** Validates a creator subdomain itch.io product page URL while excluding itch.io/search. */
export function isItchProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url || !url.hostname.endsWith(".itch.io") || url.hostname === "itch.io") return false;
  if (isItchSearchUrl(value) || hasArchiveBinaryExtension(url.pathname)) return false;
  return url.pathname !== "/" && url.pathname.length > 1;
}

/** An explicitly seeded Shopify product sitemap, never an arbitrary shop page or sitemap index. */
export function isShopifyProductSitemapTarget(value: string): boolean {
  const url = parseHttpsUrl(value, { allowSearch: true, requireExactHref: true });
  return Boolean(url && /^\/sitemap_products_[1-9]\d*\.xml$/.test(url.pathname) &&
    (!url.search || /^\?from=[1-9]\d*&to=[1-9]\d*$/.test(url.search)));
}

/** Keep a sitemap lead on the reviewed merchant origin; never infer cross-domain equivalence. */
export function shopifyProductLead(value: string, origin: string): string | null {
  const url = parseHttpsUrl(value, { requireExactHref: true });
  if (!url || value.length > 1000 || url.origin !== origin ||
      !/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/[a-z0-9][a-z0-9-]*$/.test(url.pathname)) {
    return null;
  }
  return url.href;
}

/** Validates a canonical Shopify merchant product URL. */
export function isShopifyProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value, { requireExactHref: true });
  return Boolean(url && shopifyProductLead(value, url.origin) !== null);
}

/** A canonical Sellfy product URL, on sellfy.com or a merchant-branded custom domain. */
export function isSellfyProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value);
  return Boolean(url && /^(?:\/[A-Za-z0-9_.-]+)?\/p\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname));
}

/** A canonical Sellfy product identity key. */
export function sellfyProductIdentity(value: string): string | null {
  const url = parseHttpsUrl(value);
  if (!url || !isSellfyProductTarget(value)) return null;
  const match = /^(?:\/([A-Za-z0-9_.-]+))?\/p\/([A-Za-z0-9_.-]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  return match[1] ? `${url.hostname}:${match[1]}:${match[2]}` : `${url.hostname}:${match[2]}`;
}

/** Validates a custom creator domain product or package target URL. */
export function isCustomDomainProductTarget(value: string): boolean {
  const url = parseHttpsUrl(value);
  if (!url || isDisallowedLeadHost(url.hostname) || hasArchiveBinaryExtension(url.pathname)) return false;
  return url.pathname !== "/" && url.pathname.length > 1;
}

/** Validates a storefront metadata target URL against its assigned platform contract. */
export function isStorefrontProductTarget(platform: Platform, value: string): boolean {
  switch (platform) {
    case "booth":
      return isBoothProductTarget(value);
    case "gumroad":
      return isGumroadProductTarget(value);
    case "jinxxy":
      return isJinxxyProductTarget(value);
    case "itch":
      return isItchProductTarget(value);
    case "shopify":
      return isShopifyProductTarget(value);
    case "sellfy":
      return isSellfyProductTarget(value);
    case "custom_domain":
      return isCustomDomainProductTarget(value);
    default:
      return false;
  }
}

function isItchSubdomainHost(hostname: string): boolean {
  return hostname.endsWith(".itch.io") && hostname.length > ".itch.io".length;
}

function storefrontJobMapping(hostname: string, baseMinDelayMs: number): { platform: Platform; minDelayMs: number } {
  if (isBoothHost(hostname)) return { platform: "booth", minDelayMs: Math.max(baseMinDelayMs, 1500) };
  if (isGumroadHost(hostname)) return { platform: "gumroad", minDelayMs: Math.max(baseMinDelayMs, 1500) };
  if (hostname === "jinxxy.com") return { platform: "jinxxy", minDelayMs: Math.max(baseMinDelayMs, 1500) };
  if (isItchSubdomainHost(hostname)) return { platform: "itch", minDelayMs: Math.max(baseMinDelayMs, 1500) };
  if (hostname === "sellfy.com") return { platform: "sellfy", minDelayMs: Math.max(baseMinDelayMs, 1500) };
  if (hostname === "payhip.com" || hostname === "ko-fi.com") {
    return { platform: "custom_domain", minDelayMs: Math.max(baseMinDelayMs, 2000) };
  }
  return { platform: "custom_domain", minDelayMs: Math.max(baseMinDelayMs, 1500) };
}

/** Classifies an outbound HTTPS link from an observation into a bounded discovery lead kind. */
export function classifyOutboundLeadKind(targetUrl: string): DiscoveryLead["kind"] | null {
  const url = parseHttpsUrl(targetUrl, { allowSearch: true });
  if (!url || isDisallowedLeadHost(url.hostname) || isItchSearchUrl(url.href) || hasArchiveBinaryExtension(url.pathname)) {
    return null;
  }
  if (url.hostname === "github.com") {
    return githubRepositoryIdentity(url.href) ? "github_repository" : null;
  }
  if (url.hostname === "itch.io") {
    return null;
  }
  if (isBoothHost(url.hostname) || isGumroadHost(url.hostname) || url.hostname === "jinxxy.com" ||
      isItchSubdomainHost(url.hostname) || url.hostname === "sellfy.com" ||
      url.hostname === "payhip.com" || url.hostname === "ko-fi.com") {
    return "storefront_product";
  }
  return "publisher_site";
}

export interface ResolvedDiscoveryLeadTarget {
  platform: Platform;
  purpose: JobPurpose;
  url: string;
  minDelayMs: number;
}

/** Maps an approved discovery lead kind and URL to its canonical crawl job target and pacing floor. */
export function resolveDiscoveryLeadTarget(
  kind: DiscoveryLead["kind"],
  targetUrl: string,
  minDelayMs = 1000
): ResolvedDiscoveryLeadTarget | null {
  const url = parseHttpsUrl(targetUrl, { allowSearch: true });
  if (!url || isDisallowedLeadHost(url.hostname) || isItchSearchUrl(url.href) || hasArchiveBinaryExtension(url.pathname)) {
    return null;
  }
  if (kind === "vpm_listing") {
    return { platform: "vpm", purpose: "discovery", url: url.href, minDelayMs };
  }
  if (kind === "github_repository") {
    const apiUrl = normalizeGitHubApiUrl(url.href);
    return apiUrl ? { platform: "github", purpose: "metadata", url: apiUrl, minDelayMs: Math.max(minDelayMs, 60_000) } : null;
  }
  if (kind === "storefront_product") {
    if (url.hostname === "itch.io") return null;
    const mapping = storefrontJobMapping(url.hostname, minDelayMs);
    return { platform: mapping.platform, purpose: "metadata", url: url.href, minDelayMs: mapping.minDelayMs };
  }
  if (kind === "publisher_site") {
    return { platform: "custom_domain", purpose: "metadata", url: url.href, minDelayMs: Math.max(minDelayMs, 2000) };
  }
  return null;
}
