import { z } from "zod";
import { CursorTokenSchema, CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import { PlatformSchema, type Platform } from "../types/platform.ts";
import { CatalogPackageSchema, decodeCatalogCursor, type CatalogPackage } from "../types/package.ts";

export const OPERATOR_PROTOCOL_VERSION = 1 as const;

export const InitializeCoordinatorRequestSchema = z.object({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  autoSeed: z.boolean().optional()
}).strict();
export type InitializeCoordinatorRequest = z.infer<typeof InitializeCoordinatorRequestSchema>;

export const InitializeCoordinatorResponseSchema = z.object({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  status: z.literal("ok"),
  message: z.literal("Schema initialized"),
  autoSeed: z.boolean()
}).strict();
export type InitializeCoordinatorResponse = z.infer<typeof InitializeCoordinatorResponseSchema>;

export const EnqueueJobRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  url: z.url().max(4096).refine(value => new URL(value).protocol === "https:", "HTTPS required"),
  platform: PlatformSchema,
  purpose: z.enum(["metadata", "discovery"]),
  minDelayMs: z.number().int().min(0).max(86400000),
  reason: z.string().trim().min(1).max(300)
});
export type EnqueueJobRequest = z.infer<typeof EnqueueJobRequestSchema>;
export const EnqueueJobResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), jobId: z.uuid()
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
  kind: z.string(),
  target_url: z.string(),
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

/* -------------------------------------------------------------------------- */
/* Source Access Profiles                                                     */
/* -------------------------------------------------------------------------- */

export const EvidenceClassSchema = z.enum(["normalized_facts", "creator_prose", "raw_payload", "media_metadata"]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const SourcePurposeSchema = z.enum(["discovery", "metadata"]);
export type SourcePurpose = z.infer<typeof SourcePurposeSchema>;

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

const SourceProfileOriginSchema = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.origin === value && !url.username && !url.password &&
    !url.hostname.endsWith(".") && url.hostname !== "localhost" && !url.port;
}, "Canonical HTTPS origin required");

export const CreateSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  platform: PlatformSchema,
  origin: SourceProfileOriginSchema,
  pathScope: z.string().min(1).max(300).refine(isCanonicalSourceAccessPath,
    "Canonical exact or directory path required"),
  exactQuery: z.string().min(3).max(200)
    .regex(/^[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+(?:&[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+)*$/).optional(),
  method: z.literal("GET"),
  purpose: SourcePurposeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: CursorTimestampSchema,
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300),
  retainClasses: z.array(EvidenceClassSchema).max(4),
  publishClasses: z.array(EvidenceClassSchema).max(4)
}).superRefine((profile, ctx) => {
  if (profile.exactQuery && profile.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "A query grant requires an exact path" });
  }
  if (profile.pathScope.includes("%") && profile.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "Encoded paths cannot grant directories" });
  }
  if (new Set(profile.retainClasses).size !== profile.retainClasses.length ||
      new Set(profile.publishClasses).size !== profile.publishClasses.length) {
    ctx.addIssue({ code: "custom", message: "Evidence classes must be unique" });
  }
  if (profile.publishClasses.some(value => !profile.retainClasses.includes(value))) {
    ctx.addIssue({ code: "custom", message: "Publish classes must be retained classes" });
  }
  if (!profile.retainClasses.includes("normalized_facts")) {
    ctx.addIssue({ code: "custom", message: "A fetch profile must retain normalized facts" });
  }
});
export type CreateSourceAccessProfile = z.infer<typeof CreateSourceAccessProfileSchema>;

export const SourceAccessProfileSchema = CreateSourceAccessProfileSchema.safeExtend({
  profileId: z.string().uuid(),
  createdAt: CursorTimestampSchema,
  disabledAt: CursorTimestampSchema.nullable()
});
export type SourceAccessProfile = z.infer<typeof SourceAccessProfileSchema>;

export const DisableSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type DisableSourceAccessProfile = z.infer<typeof DisableSourceAccessProfileSchema>;

export const ProfileCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  profileId: z.string().uuid()
});
export type ProfileCursor = z.infer<typeof ProfileCursorSchema>;

export function encodeProfileCursor(cursor: ProfileCursor): string {
  return encodeCursor(ProfileCursorSchema.parse(cursor));
}

export function decodeProfileCursor(value: string): ProfileCursor | null {
  return decodeCursor(value, ProfileCursorSchema);
}

export const SourceAccessProfileResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profile: SourceAccessProfileSchema
});
export type SourceAccessProfileResponse = z.infer<typeof SourceAccessProfileResponseSchema>;

export const SourceAccessProfileListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profiles: z.array(SourceAccessProfileSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeProfileCursor(value) !== null, "Invalid SourceAccessProfile cursor").nullable()
});
export type SourceAccessProfileListResponse = z.infer<typeof SourceAccessProfileListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Auto-Queue Rules                                                           */
/* -------------------------------------------------------------------------- */

const RuleOriginSchema = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
}, "Canonical HTTPS origin required");
const RulePathScopeSchema = z.string().min(1).max(200).regex(/^\/[A-Za-z0-9._~/-]*$/)
  .refine(isCanonicalSourceAccessPath, "Canonical path scope required");

export const AutoQueueRuleSchema = z.strictObject({
  ruleId: z.string().uuid(),
  leadKind: z.literal("vpm_listing"),
  origin: RuleOriginSchema,
  pathScope: RulePathScopeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: CursorTimestampSchema,
  reviewReference: z.string(),
  reason: z.string(),
  createdAt: CursorTimestampSchema,
  disabledAt: CursorTimestampSchema.nullable()
});
export type AutoQueueRule = z.infer<typeof AutoQueueRuleSchema>;

export const CreateAutoQueueRuleSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leadKind: z.literal("vpm_listing"),
  origin: RuleOriginSchema,
  pathScope: RulePathScopeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: CursorTimestampSchema,
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300)
});
export type CreateAutoQueueRule = z.infer<typeof CreateAutoQueueRuleSchema>;

export const DisableAutoQueueRuleSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type DisableAutoQueueRule = z.infer<typeof DisableAutoQueueRuleSchema>;

export const RuleCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  ruleId: z.string().uuid()
});
export type RuleCursor = z.infer<typeof RuleCursorSchema>;

export function encodeRuleCursor(cursor: RuleCursor): string {
  return encodeCursor(RuleCursorSchema.parse(cursor));
}

export function decodeRuleCursor(value: string): RuleCursor | null {
  return decodeCursor(value, RuleCursorSchema);
}

export const AutoQueueRuleListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  rules: z.array(AutoQueueRuleSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeRuleCursor(value) !== null, "Invalid AutoQueueRule cursor").nullable()
});
export type AutoQueueRuleListResponse = z.infer<typeof AutoQueueRuleListResponseSchema>;

export const AutoQueueRuleResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  rule: AutoQueueRuleSchema
});
export type AutoQueueRuleResponse = z.infer<typeof AutoQueueRuleResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Node Issuance                                                     */
/* -------------------------------------------------------------------------- */

export const IssueNodeCredentialSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: z.string().min(1).max(100).regex(/^(?!\.{1,2}$)[A-Za-z0-9._-]+$/),
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length).optional(),
  reason: z.string().trim().min(3).max(300)
});
export type IssueNodeCredential = z.infer<typeof IssueNodeCredentialSchema>;

export const NodeCredentialResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: IssueNodeCredentialSchema.shape.nodeId,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length),
  token: z.string().regex(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/)
});
export type NodeCredentialResponse = z.infer<typeof NodeCredentialResponseSchema>;

export const RevokeNodeRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), reason: z.string().trim().min(1).max(300)
});
export type RevokeNodeRequest = z.infer<typeof RevokeNodeRequestSchema>;
export const RevokeNodeResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: IssueNodeCredentialSchema.shape.nodeId, status: z.literal("revoked")
});
export type RevokeNodeResponse = z.infer<typeof RevokeNodeResponseSchema>;

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
/* Takedowns & Creator Opt-Outs Audit                                         */
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

const OperatorPageQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: CursorTokenSchema.optional()
});
export const OperatorLeadListQuerySchema = OperatorPageQuerySchema.extend({
  status: LeadStatusSchema.default("pending_review")
}).refine(query => query.cursor === undefined || decodeLeadCursor(query.cursor, query.status) !== null, "Invalid lead cursor");
export const OperatorProfileListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeProfileCursor(query.cursor) !== null, "Invalid profile cursor");
export const OperatorRuleListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeRuleCursor(query.cursor) !== null, "Invalid rule cursor");
export const OperatorCatalogListQuerySchema = OperatorPageQuerySchema.refine(
  query => query.cursor === undefined || decodeCatalogCursor(query.cursor) !== null, "Invalid catalog cursor");
export const OperatorTakedownListQuerySchema = OperatorPageQuerySchema.extend({
  requesterType: TakedownRecordSchema.shape.requesterType.optional()
}).refine(query => query.cursor === undefined || decodeTakedownCursor(query.cursor) !== null, "Invalid takedown cursor");

/* -------------------------------------------------------------------------- */
/* Delegated Creator Claims Audit (R54-C38C)                                  */
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
/* Registered Applications & Delegation Management (R54-C38A)                 */
/* -------------------------------------------------------------------------- */

export const CandidateStatusSchema = z.enum(["none", "review_pending", "reviewed", "trusted"]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const OperatorAppRecordSchema = z.strictObject({
  appId: z.string().uuid(),
  appName: z.string().min(1).max(100),
  contactEmail: z.string().nullable().optional(),
  permissions: z.array(z.string()),
  delegationAllowed: z.boolean(),
  requestCount: z.number().int().min(0).default(0),
  lastActiveAt: CursorTimestampSchema.nullable().optional(),
  candidateStatus: CandidateStatusSchema.default("none"),
  candidateFlags: z.array(z.string()).default([]),
  createdAt: CursorTimestampSchema,
  revokedAt: CursorTimestampSchema.nullable()
});
export type OperatorAppRecord = z.infer<typeof OperatorAppRecordSchema>;

export const OperatorAppCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  appId: z.string().uuid()
});
export type OperatorAppCursor = z.infer<typeof OperatorAppCursorSchema>;

export function encodeOperatorAppCursor(cursor: OperatorAppCursor): string {
  return encodeCursor(OperatorAppCursorSchema.parse(cursor));
}

export function decodeOperatorAppCursor(value: string): OperatorAppCursor | null {
  return decodeCursor(value, OperatorAppCursorSchema);
}

export const OperatorAppListQuerySchema = OperatorPageQuerySchema.extend({
  candidateStatus: CandidateStatusSchema.optional()
}).refine(
  query => query.cursor === undefined || decodeOperatorAppCursor(query.cursor) !== null,
  "Invalid app cursor"
);
export type OperatorAppListQuery = z.infer<typeof OperatorAppListQuerySchema>;

export const OperatorAppListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  apps: z.array(OperatorAppRecordSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeOperatorAppCursor(value) !== null, "Invalid OperatorApp cursor").nullable()
});
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

export const ReviewAppCandidateRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  candidateStatus: z.enum(["none", "reviewed", "trusted"]),
  grantDelegation: z.boolean().optional(),
  notes: z.string().trim().min(1).max(500).optional()
});
export type ReviewAppCandidateRequest = z.infer<typeof ReviewAppCandidateRequestSchema>;

export const ReviewAppCandidateResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  appId: z.string().uuid(),
  candidateStatus: CandidateStatusSchema,
  candidateFlags: z.array(z.string()),
  delegationAllowed: z.boolean(),
  permissions: z.array(z.string()),
  reviewedAt: CursorTimestampSchema
});
export type ReviewAppCandidateResponse = z.infer<typeof ReviewAppCandidateResponseSchema>;


