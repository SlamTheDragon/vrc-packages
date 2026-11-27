import { z } from "zod";
import { PlatformSchema, type Platform } from "vrc-packages-network/node";
import { isItchSearchUrl } from "vrc-packages-network/source-paths";
import { isArchiveOrBinaryUrl, isValidPublicHttpsOrigin } from "vrc-packages-network/source-targets";
import {
  CreateSteeringProfileSchema,
  CreateSuppressedTargetSchema,
  DeleteSuppressedTargetSchema,
  EvidenceClassSchema,
  HostMatchModeSchema,
  OPERATOR_PROTOCOL_VERSION,
  QueryModeSchema,
  SourcePurposeSchema,
  SteeringProfileActionSchema,
  SteeringProfileCursorSchema,
  SteeringProfileDeleteResponseSchema,
  SteeringProfileListResponseSchema,
  SteeringProfileResponseSchema,
  SteeringProfileSchema,
  SuppressLeadDomainRequestSchema,
  SuppressLeadDomainResponseSchema,
  SuppressedTargetCursorSchema,
  SuppressedTargetDeleteResponseSchema,
  SuppressedTargetListResponseSchema,
  SuppressedTargetResponseSchema,
  SuppressedTargetSchema,
  SuppressedTargetScopeSchema,
  UpdateSteeringProfileSchema,
  decodeSteeringProfileCursor,
  decodeSuppressedTargetCursor,
  encodeSteeringProfileCursor,
  encodeSuppressedTargetCursor,
  isCanonicalSourceAccessPath,
  type CreateSteeringProfile,
  type CreateSuppressedTarget,
  type DeleteSuppressedTarget,
  type EvidenceClass,
  type HostMatchMode,
  type QueryMode,
  type SourcePurpose,
  type SteeringProfile,
  type SteeringProfileAction,
  type SteeringProfileCursor,
  type SteeringProfileDeleteResponse,
  type SteeringProfileListResponse,
  type SteeringProfileResponse,
  type SuppressLeadDomainRequest,
  type SuppressLeadDomainResponse,
  type SuppressedTarget,
  type SuppressedTargetCursor,
  type SuppressedTargetDeleteResponse,
  type SuppressedTargetListResponse,
  type SuppressedTargetResponse,
  type SuppressedTargetScope,
  type UpdateSteeringProfile
} from "vrc-packages-api";

export {
  CreateSteeringProfileSchema,
  CreateSuppressedTargetSchema,
  DeleteSuppressedTargetSchema,
  EvidenceClassSchema,
  HostMatchModeSchema,
  QueryModeSchema,
  SourcePurposeSchema,
  SteeringProfileActionSchema,
  SteeringProfileCursorSchema,
  SteeringProfileDeleteResponseSchema,
  SteeringProfileListResponseSchema,
  SteeringProfileResponseSchema,
  SteeringProfileSchema,
  SuppressLeadDomainRequestSchema,
  SuppressLeadDomainResponseSchema,
  SuppressedTargetCursorSchema,
  SuppressedTargetDeleteResponseSchema,
  SuppressedTargetListResponseSchema,
  SuppressedTargetResponseSchema,
  SuppressedTargetSchema,
  SuppressedTargetScopeSchema,
  UpdateSteeringProfileSchema,
  decodeSteeringProfileCursor,
  decodeSuppressedTargetCursor,
  encodeSteeringProfileCursor,
  encodeSuppressedTargetCursor,
  isCanonicalSourceAccessPath,
  type CreateSteeringProfile,
  type CreateSuppressedTarget,
  type DeleteSuppressedTarget,
  type EvidenceClass,
  type HostMatchMode,
  type QueryMode,
  type SourcePurpose,
  type SteeringProfile,
  type SteeringProfileAction,
  type SteeringProfileCursor,
  type SteeringProfileDeleteResponse,
  type SteeringProfileListResponse,
  type SteeringProfileResponse,
  type SuppressLeadDomainRequest,
  type SuppressLeadDomainResponse,
  type SuppressedTarget,
  type SuppressedTargetCursor,
  type SuppressedTargetDeleteResponse,
  type SuppressedTargetListResponse,
  type SuppressedTargetResponse,
  type SuppressedTargetScope,
  type UpdateSteeringProfile
};

export const STEERING_SCHEMA_VERSION = OPERATOR_PROTOCOL_VERSION;

const INTEGER_PAGINATION_KEYS = new Set(["page", "from", "to"]);
const SAFE_QUERY_VALUE_REGEX = /^[A-Za-z0-9._~-]+$/;
const POSITIVE_PAGE_NUMBER_REGEX = /^[1-9]\d{0,6}$/;

/** Normalizes a full HTTPS target URL into its lowercase canonical public hostname. */
export function normalizeTargetHost(targetUrl: string): string | null {
  try {
    const parsed = new URL(targetUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !isValidPublicHttpsOrigin(parsed.origin)
    ) {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Evaluates host matching across exact, strict wildcard subdomain, and any_vpm_https grants. */
export function steeringHostMatches(
  hostMatchMode: HostMatchMode,
  hostPattern: string,
  platform: Platform,
  hostname: string
): boolean {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPattern = hostPattern.toLowerCase();

  if (hostMatchMode === "any_vpm_https") {
    return (
      platform === "vpm" &&
      normalizedPattern === "*" &&
      isValidPublicHttpsOrigin(`https://${normalizedHost}`)
    );
  }
  if (hostMatchMode === "wildcard_subdomain") {
    if (!normalizedPattern.startsWith("*.")) return false;
    const baseDomain = normalizedPattern.slice(2);
    // Strict subdomain matching avoids collision with the apex host.
    return normalizedHost.endsWith(`.${baseDomain}`) && normalizedHost !== baseDomain;
  }
  return normalizedHost === normalizedPattern;
}

const CANONICAL_MATCH_PATH_REGEX = /^\/(?:[A-Za-z0-9._~/-]|%[0-9A-F]{2})*$/;

/**
 * Validates URL pathnames for steering profile matching, allowing canonical UTF-8 (>= 0x80)
 * and space (%20) percent escapes while rejecting double slashes, dot segments, malformed UTF-8,
 * uncanonical escapes, and encoded traversal/delimiter escapes (%2e, %2f, %5c, %00).
 */
function isCanonicalMatchedPathname(pathname: string): boolean {
  if (!CANONICAL_MATCH_PATH_REGEX.test(pathname) || pathname.includes("//")) {
    return false;
  }
  const segments = pathname.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return false;
  }
  try {
    return segments.every((segment) => {
      if (!segment.includes("%")) {
        return true;
      }
      const escapes = segment.match(/%[0-9A-F]{2}/g) ?? [];
      if (escapes.length === 0) {
        return false;
      }
      const allAllowedBytes = escapes.every((escape) => {
        const byte = Number.parseInt(escape.slice(1), 16);
        return byte === 0x20 || byte >= 0x80;
      });
      if (!allAllowedBytes) {
        return false;
      }
      return encodeURIComponent(decodeURIComponent(segment)) === segment;
    });
  } catch {
    return false;
  }
}

/** Evaluates exact path or slash-terminated directory scope against URL pathname. */
export function steeringPathMatches(pathScope: string, pathname: string): boolean {
  if (!isCanonicalMatchedPathname(pathname)) return false;
  return pathScope.endsWith("/") ? pathname.startsWith(pathScope) : pathname === pathScope;
}

function parsePaginationSpec(queryScope: string): {
  fixedPairs: Map<string, string>;
  variableKeys: Set<string>;
} | null {
  const tokens = queryScope.split(/[&,]/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const fixedPairs = new Map<string, string>();
  const variableKeys = new Set<string>();

  for (const token of tokens) {
    const eqIndex = token.indexOf("=");
    if (eqIndex === -1) {
      if (fixedPairs.has(token)) return null;
      variableKeys.add(token);
      continue;
    }
    const key = token.slice(0, eqIndex);
    const val = token.slice(eqIndex + 1);
    if (!key || !val || variableKeys.has(key) || fixedPairs.has(key)) return null;
    fixedPairs.set(key, val);
  }

  return { fixedPairs, variableKeys };
}

/** Evaluates query mode ('none', 'exact', 'pagination') against URL query string. */
export function steeringQueryMatches(
  queryMode: QueryMode,
  queryScope: string | null | undefined,
  pathScope: string,
  url: URL,
  rawTarget: string
): boolean {
  if (rawTarget.endsWith("?")) return false;

  if (queryMode === "none") {
    return url.search === "";
  }

  if (queryMode === "exact") {
    if (pathScope.endsWith("/") || url.pathname !== pathScope || !queryScope) {
      return false;
    }
    return url.search === `?${queryScope}`;
  }

  if (!queryScope) return false;
  const spec = parsePaginationSpec(queryScope);
  if (!spec) return false;

  if (!url.search) {
    // Allow base URL without query params when no fixed key=value filter is required.
    return spec.fixedPairs.size === 0;
  }

  const seenKeys = new Set<string>();
  let paramCount = 0;

  for (const [key, value] of url.searchParams.entries()) {
    paramCount += 1;
    if (paramCount > 10 || seenKeys.has(key)) return false;
    seenKeys.add(key);

    const fixedExpected = spec.fixedPairs.get(key);
    if (fixedExpected !== undefined) {
      if (value !== fixedExpected) return false;
      continue;
    }

    if (!spec.variableKeys.has(key)) {
      return false;
    }

    if (!value || value.length > 150 || !SAFE_QUERY_VALUE_REGEX.test(value)) {
      return false;
    }

    if (INTEGER_PAGINATION_KEYS.has(key.toLowerCase()) && !POSITIVE_PAGE_NUMBER_REGEX.test(value)) {
      return false;
    }
  }

  for (const requiredKey of spec.fixedPairs.keys()) {
    if (!seenKeys.has(requiredKey)) return false;
  }

  return paramCount > 0;
}

/** Returns true if an active, unexpired steering profile authorizes fetching target for platform/purpose. */
export function steeringProfileMatches(
  profile: SteeringProfile,
  platform: Platform,
  target: string,
  purpose: SourcePurpose,
  nowMs: number
): boolean {
  if (
    profile.platform !== platform ||
    profile.purpose !== purpose ||
    profile.method !== "GET" ||
    profile.disabledAt !== null ||
    Date.parse(profile.expiresAt) <= nowMs
  ) {
    return false;
  }

  if (isArchiveOrBinaryUrl(target)) {
    return false;
  }
  if (platform === "itch" && isItchSearchUrl(target)) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }

  if (
    url.protocol !== "https:" ||
    url.href !== target ||
    url.hash ||
    url.username ||
    url.password ||
    url.port ||
    !isValidPublicHttpsOrigin(url.origin)
  ) {
    return false;
  }

  if (!steeringHostMatches(profile.hostMatchMode, profile.hostPattern, platform, url.hostname)) {
    return false;
  }

  if (!steeringPathMatches(profile.pathScope, url.pathname)) {
    return false;
  }

  return steeringQueryMatches(profile.queryMode, profile.queryScope, profile.pathScope, url, target);
}

/** Reports whether two path scopes can overlap on at least one URL path. */
export function steeringPathScopesOverlap(aPath: string, bPath: string): boolean {
  if (aPath === bPath) return true;
  if (aPath.endsWith("/") && bPath.startsWith(aPath)) return true;
  if (bPath.endsWith("/") && aPath.startsWith(bPath)) return true;
  return false;
}

function exactMatchesPaginationSpec(exactScope: string | null | undefined, pagScope: string | null | undefined): boolean {
  if (!exactScope || !pagScope) return false;
  const candidate = `https://overlap.invalid/?${exactScope}`;
  try {
    const url = new URL(candidate);
    return steeringQueryMatches("pagination", pagScope, "/", url, candidate);
  } catch {
    return false;
  }
}

/** Reports whether two steering query specifications can match any common query string. */
export function steeringQueryModesOverlap(
  aMode: QueryMode,
  aScope: string | null | undefined,
  bMode: QueryMode,
  bScope: string | null | undefined
): boolean {
  if (aMode === "exact" && bMode === "exact") {
    return (aScope ?? null) === (bScope ?? null);
  }
  if (aMode === "none" && bMode === "none") {
    return true;
  }
  if ((aMode === "exact" && bMode === "none") || (aMode === "none" && bMode === "exact")) {
    return false;
  }
  if (aMode === "none" && bMode === "pagination") {
    return (bScope ? parsePaginationSpec(bScope)?.fixedPairs.size : 1) === 0;
  }
  if (aMode === "pagination" && bMode === "none") {
    return (aScope ? parsePaginationSpec(aScope)?.fixedPairs.size : 1) === 0;
  }
  if (aMode === "exact" && bMode === "pagination") {
    return exactMatchesPaginationSpec(aScope, bScope);
  }
  if (aMode === "pagination" && bMode === "exact") {
    return exactMatchesPaginationSpec(bScope, aScope);
  }
  const specA = aScope ? parsePaginationSpec(aScope) : null;
  const specB = bScope ? parsePaginationSpec(bScope) : null;
  if (!specA || !specB) return true;
  for (const [key, valA] of specA.fixedPairs.entries()) {
    const valB = specB.fixedPairs.get(key);
    if (valB !== undefined && valB !== valA) {
      return false;
    }
  }
  return true;
}

/** Checks whether a target URL or origin is suppressed by any suppressed_targets rule. */
export function findMatchingSuppressedTarget(
  targetUrl: string,
  suppressedTargets: readonly SuppressedTarget[]
): SuppressedTarget | null {
  if (suppressedTargets.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return null;
  }

  const normalizedHref = parsed.href;
  const normalizedOrigin = parsed.origin;
  const hostname = parsed.hostname.toLowerCase();

  for (const entry of suppressedTargets) {
    const rule = entry.target.trim();
    if (entry.scope === "url") {
      if (normalizedHref === rule) return entry;
    } else if (entry.scope === "origin") {
      if (normalizedOrigin === rule.toLowerCase()) return entry;
    } else {
      const domain = rule.toLowerCase();
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return entry;
      }
    }
  }

  return null;
}

/** Checks whether a target hostname is blocked by any origin or domain suppression rule. */
export function findMatchingHostSuppression(
  hostname: string,
  suppressedTargets: readonly SuppressedTarget[]
): SuppressedTarget | null {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized || suppressedTargets.length === 0) return null;

  for (const entry of suppressedTargets) {
    const rule = entry.target.trim().toLowerCase();
    if (entry.scope === "domain") {
      if (normalized === rule || normalized.endsWith(`.${rule}`)) return entry;
    } else if (entry.scope === "origin") {
      try {
        const originHost = new URL(rule).hostname.toLowerCase();
        if (normalized === originHost) return entry;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function canRetainEvidenceClass(profile: SteeringProfile, evidenceClass: EvidenceClass): boolean {
  return profile.retainClasses.includes(evidenceClass);
}

export function canPublishEvidenceClass(profile: SteeringProfile, evidenceClass: EvidenceClass): boolean {
  return profile.publishClasses.includes(evidenceClass);
}

export const STEERING_API_JSON_SCHEMAS = {
  platformEnum: z.toJSONSchema(PlatformSchema),
  createSteeringProfile: z.toJSONSchema(CreateSteeringProfileSchema),
  updateSteeringProfile: z.toJSONSchema(UpdateSteeringProfileSchema),
  steeringProfileAction: z.toJSONSchema(SteeringProfileActionSchema),
  steeringProfile: z.toJSONSchema(SteeringProfileSchema),
  steeringProfileResponse: z.toJSONSchema(SteeringProfileResponseSchema),
  steeringProfileListResponse: z.toJSONSchema(SteeringProfileListResponseSchema),
  steeringProfileDeleteResponse: z.toJSONSchema(SteeringProfileDeleteResponseSchema),
  createSuppressedTarget: z.toJSONSchema(CreateSuppressedTargetSchema),
  deleteSuppressedTarget: z.toJSONSchema(DeleteSuppressedTargetSchema),
  suppressedTarget: z.toJSONSchema(SuppressedTargetSchema),
  suppressedTargetResponse: z.toJSONSchema(SuppressedTargetResponseSchema),
  suppressedTargetListResponse: z.toJSONSchema(SuppressedTargetListResponseSchema),
  suppressedTargetDeleteResponse: z.toJSONSchema(SuppressedTargetDeleteResponseSchema),
  suppressLeadDomainRequest: z.toJSONSchema(SuppressLeadDomainRequestSchema),
  suppressLeadDomainResponse: z.toJSONSchema(SuppressLeadDomainResponseSchema)
} as const;
