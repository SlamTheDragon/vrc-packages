import { z } from "zod";
import { APP_TOKEN_REGEX } from "../auth/tokens.ts";
import { CursorTokenSchema, CursorTimestampSchema } from "../encoding/cursor.ts";
import {
  decodeCatalogCursor,
  CatalogPackageSchema,
  CatalogRelationTypeSchema
} from "../types/package.ts";
import { PlatformSchema } from "../types/platform.ts";
import { HttpsUrlSchema } from "../types/url.ts";
import { ContentRatingSchema, UmbrellaSchema } from "../taxonomy/taxonomy.ts";

export const DOWNSTREAM_PROTOCOL_VERSION = 1 as const;

export const RegisterAppRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  appName: z.string().trim().min(2).max(100),
  contactEmail: z.string().email().max(200).optional(),
  description: z.string().trim().max(500).optional()
});
export type RegisterAppRequest = z.infer<typeof RegisterAppRequestSchema>;

export const RegisterAppResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  appId: z.string().uuid(),
  appName: z.string(),
  appToken: z.string().regex(APP_TOKEN_REGEX),
  permissions: z.array(z.string().min(1).max(50))
});
export type RegisterAppResponse = z.infer<typeof RegisterAppResponseSchema>;

export const DemandSignalKindSchema = z.enum(["search_miss", "refresh_demand", "popularity_signal"]);
export type DemandSignalKind = z.infer<typeof DemandSignalKindSchema>;

export const QueryOriginSchema = z.enum(["user_authored", "app_automated"]);
export type QueryOrigin = z.infer<typeof QueryOriginSchema>;

export const CatalogSearchRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  query: z.string().trim().max(200).optional(),
  queryOrigin: QueryOriginSchema.default("user_authored"),
  umbrella: UmbrellaSchema.optional(),
  category: z.string().trim().max(100).optional(),
  platform: PlatformSchema.optional(),
  rating: ContentRatingSchema.optional(),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
  limit: z.number().int().min(1).max(50).default(50).optional(),
  cursor: CursorTokenSchema.refine(value => decodeCatalogCursor(value) !== null, "Invalid search cursor").nullable().optional()
});
export type CatalogSearchRequest = z.infer<typeof CatalogSearchRequestSchema>;

export const CatalogSearchResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  items: z.array(CatalogPackageSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeCatalogCursor(value) !== null, "Invalid search cursor").nullable().optional(),
  totalEstimated: z.number().int().min(0).optional(),
  count: z.number().int().min(0).optional(),
  queryOrigin: QueryOriginSchema.optional()
});
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;

/** Consolidated reporting contract for POST /v1/app/report. */
export const ConsolidatedReportTypeSchema = z.enum([
  "demand_signal",
  "relationship_feedback",
  "issue_report",
  "removal_request"
]);
export type ConsolidatedReportType = z.infer<typeof ConsolidatedReportTypeSchema>;

export const IssueReportKindSchema = z.enum([
  "broken_link",
  "wrong_metadata",
  "misclassified",
  "inappropriate",
  "explicit_false_positive",
  "explicit_false_negative"
]);
export type IssueReportKind = z.infer<typeof IssueReportKindSchema>;

export const DemandSignalReportRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  reportType: z.literal("demand_signal"),
  signalKind: DemandSignalKindSchema.optional(),
  targetUrl: HttpsUrlSchema.optional(),
  canonicalId: z.string().trim().min(1).max(500).optional(),
  query: z.string().trim().max(200).optional(),
  zeroHits: z.boolean().optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
});
export type DemandSignalReportRequest = z.infer<typeof DemandSignalReportRequestSchema>;

export const RelationshipFeedbackReportRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  reportType: z.literal("relationship_feedback"),
  canonicalId: z.string().trim().min(1).max(500),
  relatedCanonicalId: z.string().trim().min(1).max(500).optional(),
  targetAvatarBase: z.string().trim().min(1).max(200).optional(),
  relationType: CatalogRelationTypeSchema,
  vote: z.enum(["up", "down"]),
  reason: z.string().trim().min(1).max(1000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
});
export type RelationshipFeedbackReportRequest = z.infer<typeof RelationshipFeedbackReportRequestSchema>;

export const IssueReportRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  reportType: z.literal("issue_report"),
  reportKind: IssueReportKindSchema,
  targetUrl: HttpsUrlSchema.optional(),
  canonicalId: z.string().trim().min(1).max(500).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
});
export type IssueReportRequest = z.infer<typeof IssueReportRequestSchema>;

export const RemovalReportRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  reportType: z.literal("removal_request"),
  targetUrl: HttpsUrlSchema.optional(),
  canonicalId: z.string().trim().min(1).max(500).optional(),
  reason: z.string().trim().min(1).max(1000),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
});
export type RemovalReportRequest = z.infer<typeof RemovalReportRequestSchema>;

/** Discriminated report submission payload for POST /v1/app/report. */
export const ReportSubmissionRequestSchema = z.discriminatedUnion("reportType", [
  DemandSignalReportRequestSchema,
  RelationshipFeedbackReportRequestSchema,
  IssueReportRequestSchema,
  RemovalReportRequestSchema
]).superRefine((data, ctx) => {
  if (data.reportType === "removal_request" && !data.targetUrl && !data.canonicalId) {
    ctx.addIssue({
      code: "custom",
      message: "Removal requests require a target and reason"
    });
  }
  if (data.reportType === "relationship_feedback" && !data.relatedCanonicalId && !data.targetAvatarBase) {
    ctx.addIssue({
      code: "custom",
      message: "Relationship feedback requires relatedCanonicalId or targetAvatarBase"
    });
  }
});
export type ReportSubmissionRequest = z.infer<typeof ReportSubmissionRequestSchema>;

export const ReportSubmissionResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  reportId: z.string().uuid(),
  recordedAt: CursorTimestampSchema
});
export type ReportSubmissionResponse = z.infer<typeof ReportSubmissionResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Delegated Creator Attestation Intake                                       */
/* -------------------------------------------------------------------------- */

export const CreatorDelegationAttestationSchema = z.strictObject({
  appId: z.string().uuid(),
  action: z.literal("creator_ownership_claim"),
  frontUrl: HttpsUrlSchema,
  creatorId: z.string().trim().min(1).max(200),
  challengeToken: z.string().trim().min(16).max(128),
  expiresAt: z.number().int().positive(),
  nonce: z.string().trim().min(16).max(128)
});
export type CreatorDelegationAttestation = z.infer<typeof CreatorDelegationAttestationSchema>;

export const CreatorClaimIntakeRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  attestation: CreatorDelegationAttestationSchema,
  signature: z.string().trim().min(1).max(512),
  reason: z.string().trim().min(1).max(1000).optional(),
  contactEmail: z.string().email().max(200).optional()
});
export type CreatorClaimIntakeRequest = z.infer<typeof CreatorClaimIntakeRequestSchema>;

export const CreatorClaimIntakeResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  claimId: z.string().uuid(),
  reviewStatus: z.literal("pending"),
  recordedAt: CursorTimestampSchema
});
export type CreatorClaimIntakeResponse = z.infer<typeof CreatorClaimIntakeResponseSchema>;
