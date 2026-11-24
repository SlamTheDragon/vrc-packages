import { z } from "zod";
import { NODE_TOKEN_REGEX } from "../auth/tokens.ts";
import { CursorTokenSchema, CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import { PlatformSchema } from "../types/platform.ts";
import { CatalogPackageSchema, decodeCatalogCursor } from "../types/package.ts";
import { createHttpsUrlSchema, HttpsUrlSchema } from "../types/url.ts";
import {
  CandidateStatusSchema,
  AppCandidateRecordSchema,
  AppCandidateCursorSchema,
  encodeAppCandidateCursor,
  decodeAppCandidateCursor,
  AppCandidateListQuerySchema,
  createAppCandidateListResponseSchema,
  createReviewAppCandidateRequestSchema,
  createReviewAppCandidateResponseSchema,
  type CandidateStatus,
  type AppCandidateRecord,
  type AppCandidateCursor,
  type AppCandidateListQuery
} from "./app_candidate.ts";

export const OPERATOR_PROTOCOL_VERSION = 1 as const;

const OperatorPageQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: CursorTokenSchema.optional()
});

export const PriorityLaneSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type PriorityLane = z.infer<typeof PriorityLaneSchema>;

export const OperatorJobIdSchema = z.string().min(1).max(120).refine(
  (value) => value.trim().length > 0 && value.trim() !== "." && value.trim() !== "..",
  "Job ID cannot be blank, '.', or '..'"
);
export type OperatorJobId = z.infer<typeof OperatorJobIdSchema>;

/* -------------------------------------------------------------------------- */
/* Hostname, IP, Path, and Query Validators                                   */
/* -------------------------------------------------------------------------- */

const IPV4_TEXT_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_GROUP_REGEX = /^[0-9a-f]{1,4}$/;
const CANONICAL_HOSTNAME_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const WILDCARD_SUBDOMAIN_REGEX = /^\*\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const EXACT_QUERY_REGEX = /^[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+(?:&[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+)*$/;
const PAGINATION_QUERY_REGEX = /^[A-Za-z0-9._~-]+(?:=[A-Za-z0-9._~-]+)?(?:[,&][A-Za-z0-9._~-]+(?:=[A-Za-z0-9._~-]+)?)*$/;

function parseIpv4Octets(value: string): number[] | null {
  const match = IPV4_TEXT_REGEX.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null;
}

function parseIpv6Groups(value: string): number[] | null {
  let norm = value.toLowerCase();
  const lastColon = norm.lastIndexOf(":");
  if (lastColon === -1) return null;

  const tail = norm.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = parseIpv4Octets(tail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    norm = `${norm.slice(0, lastColon)}:${high}:${low}`;
  }

  const parts = norm.split("::");
  if (parts.length > 2) return null;

  if (parts.length === 1) {
    const raw = norm.split(":");
    if (raw.length !== 8) return null;
    const groups = raw.map((part) => (IPV6_GROUP_REGEX.test(part) ? Number.parseInt(part, 16) : null));
    return groups.every((group): group is number => group !== null) ? groups : null;
  }

  const leftRaw = parts[0] ? parts[0].split(":") : [];
  const rightRaw = parts[1] ? parts[1].split(":") : [];
  const missing = 8 - leftRaw.length - rightRaw.length;
  if (missing < 1) return null;

  const left = leftRaw.map((part) => (IPV6_GROUP_REGEX.test(part) ? Number.parseInt(part, 16) : null));
  const right = rightRaw.map((part) => (IPV6_GROUP_REGEX.test(part) ? Number.parseInt(part, 16) : null));
  if (left.some((group) => group === null) || right.some((group) => group === null)) return null;
  return [...(left as number[]), ...new Array<number>(missing).fill(0), ...(right as number[])];
}

function isIpLiteral(hostname: string): boolean {
  const trimmed = hostname.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseIpv6Groups(trimmed.slice(1, -1)) !== null;
  }
  if (trimmed.includes("[") || trimmed.includes("]")) return false;
  return parseIpv4Octets(trimmed) !== null || parseIpv6Groups(trimmed) !== null;
}

function isCanonicalPublicHostname(value: string): boolean {
  if (!value || value.length > 255) return false;
  if (value === "localhost" || value.endsWith(".localhost")) return false;
  if (!CANONICAL_HOSTNAME_REGEX.test(value)) return false;
  const labels = value.split(".");
  if (labels.some((label) => label.length > 63)) return false;
  if (/^\d+$/.test(labels[labels.length - 1] ?? "")) return false;
  if (isIpLiteral(value)) return false;
  try {
    return new URL(`https://${value}`).hostname === value;
  } catch {
    return false;
  }
}

function isWildcardSubdomainPattern(value: string): boolean {
  if (!value || value.length > 255 || !WILDCARD_SUBDOMAIN_REGEX.test(value)) return false;
  return isCanonicalPublicHostname(value.slice(2));
}

function isCanonicalHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.port &&
      isCanonicalPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Coordinator Initialization, Status, and Development System Purge           */
/* -------------------------------------------------------------------------- */

export const InitializeCoordinatorRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  autoSeed: z.literal(false).optional()
});
export type InitializeCoordinatorRequest = z.infer<typeof InitializeCoordinatorRequestSchema>;

export const InitializeCoordinatorResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  status: z.literal("ok"),
  message: z.literal("Schema initialized"),
  autoSeed: z.literal(false)
});
export type InitializeCoordinatorResponse = z.infer<typeof InitializeCoordinatorResponseSchema>;

export const OperatorEnvironmentSchema = z.enum(["development", "preview", "production"]);
export type OperatorEnvironment = z.infer<typeof OperatorEnvironmentSchema>;

export const OperatorD1SchemaStateSchema = z.enum(["v0-17", "legacy", "uninitialized"]);
export type OperatorD1SchemaState = z.infer<typeof OperatorD1SchemaStateSchema>;

export const OperatorQueueReadinessSchema = z.strictObject({
  claimableJobs: z.number().int().min(0),
  blockedJobs: z.number().int().min(0),
  pendingLeads: z.number().int().min(0),
  unresolvedDemandSignals: z.number().int().min(0),
  activeNodes: z.number().int().min(0),
  activeSteeringProfiles: z.number().int().min(0)
});
export type OperatorQueueReadiness = z.infer<typeof OperatorQueueReadinessSchema>;

export const OperatorStatusResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  environment: OperatorEnvironmentSchema,
  purgeEnabled: z.boolean(),
  d1SchemaState: OperatorD1SchemaStateSchema,
  queueReadiness: OperatorQueueReadinessSchema
});
export type OperatorStatusResponse = z.infer<typeof OperatorStatusResponseSchema>;

export const SystemPurgeRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  confirm: z.literal("PURGE_DEVELOPMENT_D1"),
  preserveNodes: z.boolean().default(true),
  seedPreviewStarter: z.boolean().default(false)
});
export type SystemPurgeRequest = z.input<typeof SystemPurgeRequestSchema>;

export const SystemPurgeResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  status: z.literal("purged"),
  d1SchemaState: z.literal("v0-17"),
  preservedNodes: z.number().int().min(0),
  seededProfiles: z.number().int().min(0)
});
export type SystemPurgeResponse = z.infer<typeof SystemPurgeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Enqueue, Update, Requeue, and Delete Crawl Jobs                            */
/* -------------------------------------------------------------------------- */

export const EnqueueJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  url: createHttpsUrlSchema(4096, "HTTPS required"),
  platform: PlatformSchema,
  purpose: z.enum(["metadata", "discovery"]),
  minDelayMs: z.number().int().min(0).max(86_400_000),
  priorityLane: PriorityLaneSchema.optional(),
  recrawlIntervalMs: z.number().int().min(60_000).max(2_592_000_000).optional(),
  reason: z.string().trim().min(1).max(300)
});
export type EnqueueJobRequest = z.infer<typeof EnqueueJobRequestSchema>;

export const EnqueueJobResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  jobId: z.uuid()
});
export type EnqueueJobResponse = z.infer<typeof EnqueueJobResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

export const LeadStatusSchema = z.enum(["pending_review", "approved", "rejected"]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LeadKindSchema = z.enum([
  "vpm_listing",
  "github_repository",
  "release_zip",
  "creator_profile",
  "publisher_site",
  "storefront_product"
]);
export type LeadKind = z.infer<typeof LeadKindSchema>;

export const LeadRowSchema = z.strictObject({
  lead_key: z.string(),
  kind: LeadKindSchema,
  target_url: z.string(),
  target_host: z.string().min(1).max(255),
  claimed_package_id: z.string().nullable(),
  discovered_from_url: z.string(),
  discovered_from_item_key: z.string().nullable(),
  status: LeadStatusSchema,
  first_seen_at: z.string(),
  last_seen_at: z.string()
});
export type LeadRow = z.infer<typeof LeadRowSchema>;

export const LeadCursorSchema = z.strictObject({
  status: LeadStatusSchema,
  firstSeenAt: CursorTimestampSchema,
  leadKey: z.string().regex(/^[a-f0-9]{64}$/)
});
export type LeadCursor = z.infer<typeof LeadCursorSchema>;

export function encodeLeadCursor(cursor: LeadCursor): string {
  return encodeCursor(LeadCursorSchema.parse(cursor));
}

export function decodeLeadCursor(value: string, status?: LeadStatus): LeadCursor | null {
  const cursor = decodeCursor(value, LeadCursorSchema);
  return cursor && (status === undefined || cursor.status === status) ? cursor : null;
}

export const ApproveLeadSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  minDelayMs: z.number().int().min(0).max(86_400_000).optional(),
  reason: z.string().trim().min(3).max(300)
});
export type ApproveLead = z.infer<typeof ApproveLeadSchema>;

export const RejectLeadSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type RejectLead = z.infer<typeof RejectLeadSchema>;

export const LeadListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leads: z.array(LeadRowSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeLeadCursor(value) !== null, "Invalid Lead cursor").nullable()
});
export type LeadListResponse = z.infer<typeof LeadListResponseSchema>;

export const LeadActionResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
    leadKey: z.string(),
    status: z.literal("approved"),
    jobId: z.string()
  }),
  z.strictObject({
    schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
    leadKey: z.string(),
    status: z.literal("rejected")
  })
]);
export type LeadActionResponse = z.infer<typeof LeadActionResponseSchema>;

export const BulkApproveLeadsRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leadKeys: z.array(LeadCursorSchema.shape.leadKey).min(1).max(100),
  minDelayMs: z.number().int().min(0).max(86_400_000).optional(),
  priorityLane: PriorityLaneSchema.optional(),
  reason: z.string().trim().min(3).max(300)
});
export type BulkApproveLeadsRequest = z.infer<typeof BulkApproveLeadsRequestSchema>;

export const BulkApproveLeadsResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  approved: z.array(z.strictObject({
    leadKey: LeadCursorSchema.shape.leadKey,
    jobId: z.string()
  })),
  skipped: z.array(z.strictObject({
    leadKey: LeadCursorSchema.shape.leadKey,
    reason: z.string()
  }))
});
export type BulkApproveLeadsResponse = z.infer<typeof BulkApproveLeadsResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Unified Steering Profiles                                                  */
/* -------------------------------------------------------------------------- */

export const EvidenceClassSchema = z.enum(["normalized_facts", "creator_prose", "raw_payload", "media_metadata"]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const SourcePurposeSchema = z.enum(["discovery", "metadata"]);
export type SourcePurpose = z.infer<typeof SourcePurposeSchema>;

export const HostMatchModeSchema = z.enum(["exact", "wildcard_subdomain", "any_vpm_https"]);
export type HostMatchMode = z.infer<typeof HostMatchModeSchema>;

export const QueryModeSchema = z.enum(["none", "exact", "pagination"]);
export type QueryMode = z.infer<typeof QueryModeSchema>;

export function isCanonicalSourceAccessPath(value: string): boolean {
  if (!/^\/(?:[A-Za-z0-9._~/-]|%[0-9A-F]{2})*$/.test(value) || value.includes("//") ||
      value.split("/").some(segment => segment === "." || segment === "..")) return false;
  try {
    // Encoded ASCII can change path boundaries after a later decode.
    return value.split("/").every(segment => {
      if (!segment.includes("%")) return true;
      const escapes = segment.match(/%[0-9A-F]{2}/g) ?? [];
      return escapes.every(escape => Number.parseInt(escape.slice(1), 16) >= 0x80) &&
        encodeURIComponent(decodeURIComponent(segment)) === segment;
    });
  } catch { return false; }
}

const CanonicalPathScopeSchema = z.string().min(1).max(300).refine(
  isCanonicalSourceAccessPath,
  "Canonical exact or directory path required"
);

const SteeringProfileBaseShape = {
  platform: PlatformSchema,
  hostMatchMode: HostMatchModeSchema,
  hostPattern: z.string().min(1).max(255),
  pathScope: CanonicalPathScopeSchema,
  queryMode: QueryModeSchema,
  queryScope: z.string().min(1).max(200).nullable().optional(),
  method: z.literal("GET"),
  purpose: SourcePurposeSchema,
  autoPromote: z.boolean().default(false),
  recrawlIntervalMs: z.number().int().min(60_000).max(2_592_000_000).default(21_600_000),
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  maxPaginationDepth: z.number().int().min(0).max(50).default(5),
  expiresAt: CursorTimestampSchema,
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300),
  retainClasses: z.array(EvidenceClassSchema).max(4),
  publishClasses: z.array(EvidenceClassSchema).max(4)
};

function validateSteeringProfileFields(
  profile: {
    platform: z.infer<typeof PlatformSchema>;
    hostMatchMode: HostMatchMode;
    hostPattern: string;
    pathScope: string;
    queryMode: QueryMode;
    queryScope?: string | null;
    retainClasses: EvidenceClass[];
    publishClasses: EvidenceClass[];
  },
  ctx: z.RefinementCtx
): void {
  if (profile.hostMatchMode === "any_vpm_https") {
    if (profile.platform !== "vpm") {
      ctx.addIssue({ code: "custom", message: "any_vpm_https hostMatchMode requires platform 'vpm'" });
    }
    if (profile.hostPattern !== "*") {
      ctx.addIssue({ code: "custom", message: "any_vpm_https hostMatchMode requires hostPattern '*'" });
    }
  } else if (profile.hostMatchMode === "wildcard_subdomain") {
    if (!isWildcardSubdomainPattern(profile.hostPattern)) {
      ctx.addIssue({ code: "custom", message: "wildcard_subdomain requires canonical *.domain.tld pattern" });
    }
  } else if (!isCanonicalPublicHostname(profile.hostPattern)) {
    ctx.addIssue({ code: "custom", message: "exact hostMatchMode requires a canonical public hostname" });
  }

  if (profile.pathScope.includes("%") && profile.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "Encoded paths cannot grant directories" });
  }

  if (profile.queryMode === "none") {
    if (profile.queryScope !== undefined && profile.queryScope !== null) {
      ctx.addIssue({ code: "custom", message: "queryScope must be omitted or null when queryMode is 'none'" });
    }
  } else if (profile.queryMode === "exact") {
    if (profile.pathScope.endsWith("/")) {
      ctx.addIssue({ code: "custom", message: "An exact query grant requires an exact path" });
    }
    if (!profile.queryScope || !EXACT_QUERY_REGEX.test(profile.queryScope)) {
      ctx.addIssue({ code: "custom", message: "Exact queryMode requires safe key=value pairs in queryScope" });
    }
  } else if (!profile.queryScope || !PAGINATION_QUERY_REGEX.test(profile.queryScope)) {
    ctx.addIssue({ code: "custom", message: "Pagination queryMode requires bounded safe query keys or pairs in queryScope" });
  }

  if (new Set(profile.retainClasses).size !== profile.retainClasses.length ||
      new Set(profile.publishClasses).size !== profile.publishClasses.length) {
    ctx.addIssue({ code: "custom", message: "Evidence classes must be unique" });
  }
  if (profile.publishClasses.some(value => !profile.retainClasses.includes(value))) {
    ctx.addIssue({ code: "custom", message: "Publish classes must be retained classes" });
  }
  if (!profile.retainClasses.includes("normalized_facts")) {
    ctx.addIssue({ code: "custom", message: "A steering profile must retain normalized facts" });
  }
}

export const CreateSteeringProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  ...SteeringProfileBaseShape
}).superRefine(validateSteeringProfileFields);
export type CreateSteeringProfile = z.input<typeof CreateSteeringProfileSchema>;

export const SteeringProfileSchema = z.strictObject({
  profileId: z.uuid(),
  ...SteeringProfileBaseShape,
  createdAt: CursorTimestampSchema,
  disabledAt: CursorTimestampSchema.nullable()
}).superRefine(validateSteeringProfileFields);
export type SteeringProfile = z.infer<typeof SteeringProfileSchema>;

export const UpdateSteeringProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  platform: PlatformSchema.optional(),
  hostMatchMode: HostMatchModeSchema.optional(),
  hostPattern: z.string().min(1).max(255).optional(),
  pathScope: CanonicalPathScopeSchema.optional(),
  queryMode: QueryModeSchema.optional(),
  queryScope: z.string().min(1).max(200).nullable().optional(),
  purpose: SourcePurposeSchema.optional(),
  autoPromote: z.boolean().optional(),
  recrawlIntervalMs: z.number().int().min(60_000).max(2_592_000_000).optional(),
  minDelayMs: z.number().int().min(1000).max(86_400_000).optional(),
  maxPaginationDepth: z.number().int().min(0).max(50).optional(),
  expiresAt: CursorTimestampSchema.optional(),
  reviewReference: z.string().trim().min(8).max(500).optional(),
  retainClasses: z.array(EvidenceClassSchema).max(4).optional(),
  publishClasses: z.array(EvidenceClassSchema).max(4).optional(),
  reason: z.string().trim().min(3).max(300)
}).superRefine((patch, ctx) => {
  const hasMutableField =
    patch.platform !== undefined ||
    patch.hostMatchMode !== undefined ||
    patch.hostPattern !== undefined ||
    patch.pathScope !== undefined ||
    patch.queryMode !== undefined ||
    patch.queryScope !== undefined ||
    patch.purpose !== undefined ||
    patch.autoPromote !== undefined ||
    patch.recrawlIntervalMs !== undefined ||
    patch.minDelayMs !== undefined ||
    patch.maxPaginationDepth !== undefined ||
    patch.expiresAt !== undefined ||
    patch.reviewReference !== undefined ||
    patch.retainClasses !== undefined ||
    patch.publishClasses !== undefined;
  if (!hasMutableField) {
    ctx.addIssue({ code: "custom", message: "At least one updatable steering profile field is required" });
  }
  if (patch.pathScope !== undefined && patch.pathScope.includes("%") && patch.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "Encoded paths cannot grant directories" });
  }
  if (patch.hostMatchMode !== undefined) {
    if (patch.hostMatchMode === "any_vpm_https") {
      if (patch.platform !== undefined && patch.platform !== "vpm") {
        ctx.addIssue({ code: "custom", message: "any_vpm_https hostMatchMode requires platform 'vpm'" });
      }
      if (patch.hostPattern !== undefined && patch.hostPattern !== "*") {
        ctx.addIssue({ code: "custom", message: "any_vpm_https hostMatchMode requires hostPattern '*'" });
      }
      if (patch.hostPattern === undefined) {
        ctx.addIssue({ code: "custom", message: "hostPattern is required when updating hostMatchMode" });
      }
    } else if (patch.hostPattern === undefined) {
      ctx.addIssue({ code: "custom", message: "hostPattern is required when updating hostMatchMode" });
    } else if (patch.hostMatchMode === "wildcard_subdomain" && !isWildcardSubdomainPattern(patch.hostPattern)) {
      ctx.addIssue({ code: "custom", message: "wildcard_subdomain requires canonical *.domain.tld pattern" });
    } else if (patch.hostMatchMode === "exact" && !isCanonicalPublicHostname(patch.hostPattern)) {
      ctx.addIssue({ code: "custom", message: "exact hostMatchMode requires a canonical public hostname" });
    }
  } else if (patch.hostPattern !== undefined) {
    const validPattern =
      patch.hostPattern === "*" ||
      isWildcardSubdomainPattern(patch.hostPattern) ||
      isCanonicalPublicHostname(patch.hostPattern);
    if (!validPattern) {
      ctx.addIssue({ code: "custom", message: "Invalid hostPattern" });
    }
  }
  if (patch.queryMode !== undefined) {
    if (patch.queryMode === "none") {
      if (patch.queryScope !== undefined && patch.queryScope !== null) {
        ctx.addIssue({ code: "custom", message: "queryScope must be omitted or null when queryMode is 'none'" });
      }
    } else if (patch.queryMode === "exact") {
      if (patch.pathScope !== undefined && patch.pathScope.endsWith("/")) {
        ctx.addIssue({ code: "custom", message: "An exact query grant requires an exact path" });
      }
      if (!patch.queryScope || !EXACT_QUERY_REGEX.test(patch.queryScope)) {
        ctx.addIssue({ code: "custom", message: "Exact queryMode requires safe key=value pairs in queryScope" });
      }
    } else if (!patch.queryScope || !PAGINATION_QUERY_REGEX.test(patch.queryScope)) {
      ctx.addIssue({ code: "custom", message: "Pagination queryMode requires bounded safe query keys or pairs in queryScope" });
    }
  } else if (patch.queryScope !== undefined && patch.queryScope !== null && !PAGINATION_QUERY_REGEX.test(patch.queryScope)) {
    ctx.addIssue({ code: "custom", message: "queryScope must contain bounded safe query keys or pairs" });
  }
  if (patch.retainClasses !== undefined) {
    if (new Set(patch.retainClasses).size !== patch.retainClasses.length) {
      ctx.addIssue({ code: "custom", message: "Evidence classes must be unique" });
    }
    if (!patch.retainClasses.includes("normalized_facts")) {
      ctx.addIssue({ code: "custom", message: "A steering profile must retain normalized facts" });
    }
  }
  if (patch.publishClasses !== undefined) {
    if (new Set(patch.publishClasses).size !== patch.publishClasses.length) {
      ctx.addIssue({ code: "custom", message: "Evidence classes must be unique" });
    }
    if (patch.retainClasses !== undefined && patch.publishClasses.some(value => !patch.retainClasses!.includes(value))) {
      ctx.addIssue({ code: "custom", message: "Publish classes must be retained classes" });
    }
  }
});
export type UpdateSteeringProfile = z.infer<typeof UpdateSteeringProfileSchema>;

export const SteeringProfileActionSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type SteeringProfileAction = z.infer<typeof SteeringProfileActionSchema>;

export const SteeringProfileDeleteResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profileId: z.uuid(),
  status: z.literal("deleted")
});
export type SteeringProfileDeleteResponse = z.infer<typeof SteeringProfileDeleteResponseSchema>;

export const SteeringProfileCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  profileId: z.uuid()
});
export type SteeringProfileCursor = z.infer<typeof SteeringProfileCursorSchema>;

export function encodeSteeringProfileCursor(cursor: SteeringProfileCursor): string {
  return encodeCursor(SteeringProfileCursorSchema.parse(cursor));
}

export function decodeSteeringProfileCursor(value: string): SteeringProfileCursor | null {
  return decodeCursor(value, SteeringProfileCursorSchema);
}

export const OperatorSteeringProfileListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeSteeringProfileCursor(query.cursor) !== null,
  "Invalid steering profile cursor"
);
export type OperatorSteeringProfileListQuery = z.infer<typeof OperatorSteeringProfileListQuerySchema>;

export const SteeringProfileResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profile: SteeringProfileSchema
});
export type SteeringProfileResponse = z.infer<typeof SteeringProfileResponseSchema>;

export const SteeringProfileListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profiles: z.array(SteeringProfileSchema),
  nextCursor: CursorTokenSchema.refine(
    value => decodeSteeringProfileCursor(value) !== null,
    "Invalid SteeringProfile cursor"
  ).nullable()
});
export type SteeringProfileListResponse = z.infer<typeof SteeringProfileListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Suppressed Targets and Lead Domain Suppression                             */
/* -------------------------------------------------------------------------- */

export const SuppressedTargetScopeSchema = z.enum(["url", "origin", "domain"]);
export type SuppressedTargetScope = z.infer<typeof SuppressedTargetScopeSchema>;

export const SuppressedTargetSchema = z.strictObject({
  target: z.string().min(1).max(2048),
  scope: SuppressedTargetScopeSchema,
  reason: z.string(),
  suppressedAt: CursorTimestampSchema
});
export type SuppressedTarget = z.infer<typeof SuppressedTargetSchema>;

export const CreateSuppressedTargetSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  target: z.string().trim().min(1).max(2048),
  scope: SuppressedTargetScopeSchema,
  reason: z.string().trim().min(3).max(300)
}).superRefine((input, ctx) => {
  if (input.scope === "url") {
    const parsed = HttpsUrlSchema.safeParse(input.target);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Suppressed target with scope 'url' must be a valid HTTPS URL" });
      return;
    }
    const url = new URL(input.target);
    if (url.username || url.password || url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
      ctx.addIssue({ code: "custom", message: "Suppressed target URL cannot use credentials or localhost" });
    }
  } else if (input.scope === "origin") {
    if (!isCanonicalHttpsOrigin(input.target)) {
      ctx.addIssue({ code: "custom", message: "Suppressed target with scope 'origin' must be a canonical HTTPS origin" });
    }
  } else if (!isCanonicalPublicHostname(input.target)) {
    ctx.addIssue({ code: "custom", message: "Suppressed target with scope 'domain' must be a valid hostname without scheme, slash, or localhost" });
  }
});
export type CreateSuppressedTarget = z.infer<typeof CreateSuppressedTargetSchema>;

export const DeleteSuppressedTargetSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  target: z.string().trim().min(1).max(2048),
  reason: z.string().trim().min(3).max(300)
});
export type DeleteSuppressedTarget = z.infer<typeof DeleteSuppressedTargetSchema>;

export const SuppressedTargetCursorSchema = z.strictObject({
  suppressedAt: CursorTimestampSchema,
  target: z.string().min(1).max(2048)
});
export type SuppressedTargetCursor = z.infer<typeof SuppressedTargetCursorSchema>;

export function encodeSuppressedTargetCursor(cursor: SuppressedTargetCursor): string {
  return encodeCursor(SuppressedTargetCursorSchema.parse(cursor));
}

export function decodeSuppressedTargetCursor(value: string): SuppressedTargetCursor | null {
  return decodeCursor(value, SuppressedTargetCursorSchema);
}

export const OperatorSuppressedTargetListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeSuppressedTargetCursor(query.cursor) !== null,
  "Invalid suppressed target cursor"
);
export type OperatorSuppressedTargetListQuery = z.infer<typeof OperatorSuppressedTargetListQuerySchema>;

export const SuppressedTargetResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  suppressedTarget: SuppressedTargetSchema
});
export type SuppressedTargetResponse = z.infer<typeof SuppressedTargetResponseSchema>;

export const SuppressedTargetListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  targets: z.array(SuppressedTargetSchema),
  nextCursor: CursorTokenSchema.refine(
    value => decodeSuppressedTargetCursor(value) !== null,
    "Invalid SuppressedTarget cursor"
  ).nullable()
});
export type SuppressedTargetListResponse = z.infer<typeof SuppressedTargetListResponseSchema>;

export const SuppressedTargetDeleteResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  target: z.string(),
  status: z.literal("deleted")
});
export type SuppressedTargetDeleteResponse = z.infer<typeof SuppressedTargetDeleteResponseSchema>;

export const SuppressLeadDomainRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  targetHost: z.string().trim().min(1).max(255).refine(
    isCanonicalPublicHostname,
    "Valid canonical hostname required without scheme, slash, or localhost"
  ),
  rejectPendingLeads: z.boolean().default(true),
  reason: z.string().trim().min(3).max(300)
});
export type SuppressLeadDomainRequest = z.input<typeof SuppressLeadDomainRequestSchema>;

export const SuppressLeadDomainResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  targetHost: z.string(),
  scope: SuppressedTargetScopeSchema,
  rejectedLeadCount: z.number().int().min(0)
});
export type SuppressLeadDomainResponse = z.infer<typeof SuppressLeadDomainResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Node Issuance                                                     */
/* -------------------------------------------------------------------------- */

export const IssueNodeCredentialSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: z.string().min(1).max(100).regex(/^(?!\.{1,2}$)[A-Za-z0-9._-]+$/),
  reason: z.string().trim().min(3).max(300)
});
export type IssueNodeCredential = z.infer<typeof IssueNodeCredentialSchema>;

export const NodeCredentialResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: IssueNodeCredentialSchema.shape.nodeId,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length),
  token: z.string().regex(NODE_TOKEN_REGEX)
});
export type NodeCredentialResponse = z.infer<typeof NodeCredentialResponseSchema>;

export const RevokeNodeRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(1).max(300)
});
export type RevokeNodeRequest = z.infer<typeof RevokeNodeRequestSchema>;

export const RevokeNodeResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: IssueNodeCredentialSchema.shape.nodeId,
  status: z.literal("revoked")
});
export type RevokeNodeResponse = z.infer<typeof RevokeNodeResponseSchema>;

export const PruneNodeResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: IssueNodeCredentialSchema.shape.nodeId,
  status: z.literal("pruned")
});
export type PruneNodeResponse = z.infer<typeof PruneNodeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Node Listing                                                      */
/* -------------------------------------------------------------------------- */

export const OperatorNodeStatusSchema = z.enum(["active", "revoked"]);
export type OperatorNodeStatus = z.infer<typeof OperatorNodeStatusSchema>;

export const OperatorNodeHeartbeatStateSchema = z.enum(["idle", "fetching"]);
export type OperatorNodeHeartbeatState = z.infer<typeof OperatorNodeHeartbeatStateSchema>;

export const OperatorNodeRecordSchema = z.strictObject({
  nodeId: IssueNodeCredentialSchema.shape.nodeId,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length),
  status: OperatorNodeStatusSchema,
  revokedAt: CursorTimestampSchema.nullable(),
  lastSeenAt: CursorTimestampSchema.nullable(),
  heartbeatState: OperatorNodeHeartbeatStateSchema.nullable(),
  activeJobId: OperatorJobIdSchema.nullable()
});
export type OperatorNodeRecord = z.infer<typeof OperatorNodeRecordSchema>;

export const OperatorNodeCursorSchema = z.strictObject({
  nodeId: IssueNodeCredentialSchema.shape.nodeId
});
export type OperatorNodeCursor = z.infer<typeof OperatorNodeCursorSchema>;

export function encodeOperatorNodeCursor(cursor: OperatorNodeCursor): string {
  return encodeCursor(OperatorNodeCursorSchema.parse(cursor));
}

export function decodeOperatorNodeCursor(value: string): OperatorNodeCursor | null {
  return decodeCursor(value, OperatorNodeCursorSchema);
}

export const OperatorNodeListQuerySchema = OperatorPageQuerySchema.extend({
  status: OperatorNodeStatusSchema.optional()
}).refine(
  (query) => query.cursor === undefined || decodeOperatorNodeCursor(query.cursor) !== null,
  "Invalid node cursor"
);
export type OperatorNodeListQuery = z.infer<typeof OperatorNodeListQuerySchema>;

export const OperatorNodeListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodes: z.array(OperatorNodeRecordSchema),
  nextCursor: CursorTokenSchema.refine(
    (value) => decodeOperatorNodeCursor(value) !== null,
    "Invalid node cursor"
  ).nullable()
});
export type OperatorNodeListResponse = z.infer<typeof OperatorNodeListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Crawl Job Listing and Lifecycle CRUD                              */
/* -------------------------------------------------------------------------- */

export const OperatorJobStateSchema = z.enum(["pending", "leased", "done", "backoff", "blocked"]);
export type OperatorJobState = z.infer<typeof OperatorJobStateSchema>;

export const OperatorJobRecordSchema = z.strictObject({
  jobId: OperatorJobIdSchema,
  platform: PlatformSchema,
  url: z.string(),
  origin: z.string(),
  state: OperatorJobStateSchema,
  purpose: SourcePurposeSchema,
  priorityLane: PriorityLaneSchema,
  recrawlIntervalMs: z.number().int().min(60_000).max(2_592_000_000),
  paginationDepth: z.number().int().min(0),
  nextFetchAt: CursorTimestampSchema,
  claimedBy: IssueNodeCredentialSchema.shape.nodeId.nullable(),
  leaseExpiresAt: CursorTimestampSchema.nullable(),
  createdAt: CursorTimestampSchema,
  robotsDeferredUntil: CursorTimestampSchema.nullable(),
  steeringProfileId: z.uuid().nullable(),
  claimabilityBlockers: z.array(z.string().min(1).max(120)).default([])
});
export type OperatorJobRecord = z.infer<typeof OperatorJobRecordSchema>;

export const OperatorJobCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  jobId: OperatorJobIdSchema
});
export type OperatorJobCursor = z.infer<typeof OperatorJobCursorSchema>;

export function encodeOperatorJobCursor(cursor: OperatorJobCursor): string {
  return encodeCursor(OperatorJobCursorSchema.parse(cursor));
}

export function decodeOperatorJobCursor(value: string): OperatorJobCursor | null {
  return decodeCursor(value, OperatorJobCursorSchema);
}

export const OperatorJobListQuerySchema = OperatorPageQuerySchema.extend({
  state: OperatorJobStateSchema.optional(),
  platform: PlatformSchema.optional(),
  priorityLane: PriorityLaneSchema.optional()
}).refine(
  (query) => query.cursor === undefined || decodeOperatorJobCursor(query.cursor) !== null,
  "Invalid job cursor"
);
export type OperatorJobListQuery = z.infer<typeof OperatorJobListQuerySchema>;

export const OperatorJobListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  jobs: z.array(OperatorJobRecordSchema),
  nextCursor: CursorTokenSchema.refine(
    (value) => decodeOperatorJobCursor(value) !== null,
    "Invalid job cursor"
  ).nullable()
});
export type OperatorJobListResponse = z.infer<typeof OperatorJobListResponseSchema>;

export const UpdateJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  priorityLane: PriorityLaneSchema.optional(),
  recrawlIntervalMs: z.number().int().min(60_000).max(2_592_000_000).optional(),
  nextFetchAt: CursorTimestampSchema.optional(),
  reason: z.string().trim().min(3).max(300)
}).refine(
  (data) => data.priorityLane !== undefined || data.recrawlIntervalMs !== undefined || data.nextFetchAt !== undefined,
  "At least one job field (priorityLane, recrawlIntervalMs, or nextFetchAt) must be updated"
);
export type UpdateJobRequest = z.infer<typeof UpdateJobRequestSchema>;

export const UpdateJobResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  job: OperatorJobRecordSchema
});
export type UpdateJobResponse = z.infer<typeof UpdateJobResponseSchema>;

export const RequeueJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  priorityLane: PriorityLaneSchema.optional(),
  reason: z.string().trim().min(3).max(300)
});
export type RequeueJobRequest = z.infer<typeof RequeueJobRequestSchema>;

export const RequeueJobResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  job: OperatorJobRecordSchema
});
export type RequeueJobResponse = z.infer<typeof RequeueJobResponseSchema>;

export const DeleteJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type DeleteJobRequest = z.infer<typeof DeleteJobRequestSchema>;

export const DeleteJobResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  jobId: OperatorJobIdSchema,
  status: z.literal("deleted")
});
export type DeleteJobResponse = z.infer<typeof DeleteJobResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Catalog Page                                                      */
/* -------------------------------------------------------------------------- */

export const CatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  packages: z.array(CatalogPackageSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeCatalogCursor(value) !== null, "Invalid Catalog cursor").nullable()
});
export type CatalogListResponse = z.infer<typeof CatalogListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Takedowns and Creator Opt-Outs Audit                                       */
/* -------------------------------------------------------------------------- */

export const TakedownRecordSchema = z.strictObject({
  takedownId: z.string().uuid(),
  targetUrl: z.string().nullable(),
  canonicalId: z.string().nullable(),
  requesterType: z.enum(["unauthenticated_creator", "user", "admin_operator"]),
  requesterId: z.string().nullable(),
  reason: z.string(),
  proofKind: z.enum(["storefront_bio_token", "dns_txt", "manual_notice"]).nullable(),
  proofValue: z.string().nullable(),
  contactEmail: z.string().nullable(),
  reviewStatus: z.enum(["pending", "accepted", "rejected"]),
  reviewNotes: z.string().nullable().optional(),
  recordedAt: CursorTimestampSchema
});
export type TakedownRecord = z.infer<typeof TakedownRecordSchema>;

export const TakedownCursorSchema = z.strictObject({
  recordedAt: CursorTimestampSchema,
  takedownId: z.string().uuid()
});
export type TakedownCursor = z.infer<typeof TakedownCursorSchema>;

export function encodeTakedownCursor(cursor: TakedownCursor): string {
  return encodeCursor(TakedownCursorSchema.parse(cursor));
}

export function decodeTakedownCursor(value: string): TakedownCursor | null {
  return decodeCursor(value, TakedownCursorSchema);
}

export const TakedownListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  records: z.array(TakedownRecordSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeTakedownCursor(value) !== null, "Invalid Takedown cursor").nullable()
});
export type TakedownListResponse = z.infer<typeof TakedownListResponseSchema>;

export const VerifyTakedownRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  verdict: z.enum(["accepted", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});
export type VerifyTakedownRequest = z.infer<typeof VerifyTakedownRequestSchema>;

export const VerifyTakedownResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  takedownId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  updatedAt: CursorTimestampSchema
});
export type VerifyTakedownResponse = z.infer<typeof VerifyTakedownResponseSchema>;

export const OperatorLeadListQuerySchema = OperatorPageQuerySchema.extend({
  status: LeadStatusSchema.default("pending_review")
}).refine(query => query.cursor === undefined || decodeLeadCursor(query.cursor, query.status) !== null, "Invalid lead cursor");
export const OperatorCatalogListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeCatalogCursor(query.cursor) !== null, "Invalid catalog cursor");
export const OperatorTakedownListQuerySchema = OperatorPageQuerySchema.extend({
  requesterType: TakedownRecordSchema.shape.requesterType.optional()
}).refine(query => query.cursor === undefined || decodeTakedownCursor(query.cursor) !== null, "Invalid takedown cursor");

/* -------------------------------------------------------------------------- */
/* Delegated Creator Claims Audit                                             */
/* -------------------------------------------------------------------------- */

export const DelegatedClaimRecordSchema = z.strictObject({
  claimId: z.string().uuid(),
  appId: z.string().uuid(),
  action: z.literal("creator_ownership_claim"),
  frontUrl: z.string(),
  creatorId: z.string(),
  challengeToken: z.string(),
  expiresAt: z.number().int(),
  nonce: z.string(),
  signature: z.string(),
  reason: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  reviewStatus: z.enum(["pending", "accepted", "rejected"]),
  reviewNotes: z.string().nullable().optional(),
  recordedAt: CursorTimestampSchema
});
export type DelegatedClaimRecord = z.infer<typeof DelegatedClaimRecordSchema>;

export const DelegatedClaimCursorSchema = z.strictObject({
  recordedAt: CursorTimestampSchema,
  claimId: z.string().uuid()
});
export type DelegatedClaimCursor = z.infer<typeof DelegatedClaimCursorSchema>;

export function encodeDelegatedClaimCursor(cursor: DelegatedClaimCursor): string {
  return encodeCursor(DelegatedClaimCursorSchema.parse(cursor));
}

export function decodeDelegatedClaimCursor(value: string): DelegatedClaimCursor | null {
  return decodeCursor(value, DelegatedClaimCursorSchema);
}

export const DelegatedClaimListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  records: z.array(DelegatedClaimRecordSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeDelegatedClaimCursor(value) !== null, "Invalid DelegatedClaim cursor").nullable()
});
export type DelegatedClaimListResponse = z.infer<typeof DelegatedClaimListResponseSchema>;

export const VerifyDelegatedClaimRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  verdict: z.enum(["accepted", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});
export type VerifyDelegatedClaimRequest = z.infer<typeof VerifyDelegatedClaimRequestSchema>;

export const VerifyDelegatedClaimResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  claimId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  updatedAt: CursorTimestampSchema
});
export type VerifyDelegatedClaimResponse = z.infer<typeof VerifyDelegatedClaimResponseSchema>;

export const OperatorClaimListQuerySchema = OperatorPageQuerySchema.extend({
  reviewStatus: DelegatedClaimRecordSchema.shape.reviewStatus.optional()
}).refine(query => query.cursor === undefined || decodeDelegatedClaimCursor(query.cursor) !== null, "Invalid claim cursor");

/* -------------------------------------------------------------------------- */
/* Registered Applications and Delegation Management                          */
/* -------------------------------------------------------------------------- */

export { CandidateStatusSchema, type CandidateStatus };

export const OperatorAppRecordSchema = AppCandidateRecordSchema;
export type OperatorAppRecord = AppCandidateRecord;

export const OperatorAppCursorSchema = AppCandidateCursorSchema;
export type OperatorAppCursor = AppCandidateCursor;
export const encodeOperatorAppCursor = encodeAppCandidateCursor;
export const decodeOperatorAppCursor = decodeAppCandidateCursor;

export const OperatorAppListQuerySchema = AppCandidateListQuerySchema;
export type OperatorAppListQuery = AppCandidateListQuery;

export const OperatorAppListResponseSchema = createAppCandidateListResponseSchema(OPERATOR_PROTOCOL_VERSION);
export type OperatorAppListResponse = z.infer<typeof OperatorAppListResponseSchema>;

export const SetAppDelegationRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  delegationAllowed: z.boolean(),
  reason: z.string().trim().min(1).max(300).optional()
});
export type SetAppDelegationRequest = z.infer<typeof SetAppDelegationRequestSchema>;

export const SetAppDelegationResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  appId: z.string().uuid(),
  delegationAllowed: z.boolean(),
  permissions: z.array(z.string()),
  updatedAt: CursorTimestampSchema
});
export type SetAppDelegationResponse = z.infer<typeof SetAppDelegationResponseSchema>;

export const ReviewAppCandidateRequestSchema = createReviewAppCandidateRequestSchema(OPERATOR_PROTOCOL_VERSION);
export type ReviewAppCandidateRequest = z.infer<typeof ReviewAppCandidateRequestSchema>;

export const ReviewAppCandidateResponseSchema = createReviewAppCandidateResponseSchema(OPERATOR_PROTOCOL_VERSION);
export type ReviewAppCandidateResponse = z.infer<typeof ReviewAppCandidateResponseSchema>;
