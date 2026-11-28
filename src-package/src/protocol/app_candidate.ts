import { z } from "zod";
import { CursorTokenSchema, CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";

/** Shared candidate trust status values for downstream application review. */
export const CandidateStatusSchema = z.enum(["none", "review_pending", "reviewed", "trusted"]);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

/** Shared candidate review record schema used by operator and moderator control planes. */
export const AppCandidateRecordSchema = z.strictObject({
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
export type AppCandidateRecord = z.infer<typeof AppCandidateRecordSchema>;

/** Keyset pagination cursor for candidate application listings. */
export const AppCandidateCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  appId: z.string().uuid()
});
export type AppCandidateCursor = z.infer<typeof AppCandidateCursorSchema>;

/** Encodes an application candidate cursor into an opaque cursor token. */
export function encodeAppCandidateCursor(cursor: AppCandidateCursor): string {
  return encodeCursor(AppCandidateCursorSchema.parse(cursor));
}

/** Decodes and validates an opaque application candidate cursor token. */
export function decodeAppCandidateCursor(value: string): AppCandidateCursor | null {
  return decodeCursor(value, AppCandidateCursorSchema);
}

/** Creates an application candidate list query schema for operator and moderator control planes. */
export function createAppCandidateListQuerySchema() {
  return z.strictObject({
    limit: z.number().int().min(1).max(100).default(100),
    cursor: CursorTokenSchema.optional(),
    candidateStatus: CandidateStatusSchema.optional()
  }).refine(
    (query) => query.cursor === undefined || decodeAppCandidateCursor(query.cursor) !== null,
    "Invalid app cursor"
  );
}

export const AppCandidateListQuerySchema = createAppCandidateListQuerySchema();
export type AppCandidateListQuery = z.infer<typeof AppCandidateListQuerySchema>;

/** Creates an application candidate list response schema bound to the owning protocol version. */
export function createAppCandidateListResponseSchema<V extends number>(schemaVersion: V) {
  return z.strictObject({
    schemaVersion: z.literal(schemaVersion),
    apps: z.array(AppCandidateRecordSchema),
    nextCursor: CursorTokenSchema
      .refine((value) => decodeAppCandidateCursor(value) !== null, "Invalid app cursor")
      .nullable()
  });
}

/** Creates an operator application candidate review request schema bound to the owning protocol version. */
export function createReviewAppCandidateRequestSchema<V extends number>(schemaVersion: V) {
  return z.strictObject({
    schemaVersion: z.literal(schemaVersion),
    candidateStatus: z.enum(["none", "reviewed", "trusted"]),
    grantDelegation: z.boolean().optional(),
    notes: z.string().trim().min(1).max(500).optional()
  });
}

/** Creates a moderator-scoped candidate review request schema without trust/delegation escalation. */
export function createModeratorReviewAppCandidateRequestSchema<V extends number>(schemaVersion: V) {
  return z.strictObject({
    schemaVersion: z.literal(schemaVersion),
    candidateStatus: z.enum(["none", "reviewed"]),
    notes: z.string().trim().min(1).max(500).optional()
  });
}

/** Creates an application candidate review response schema bound to the owning protocol version. */
export function createReviewAppCandidateResponseSchema<V extends number>(schemaVersion: V) {
  return z.strictObject({
    schemaVersion: z.literal(schemaVersion),
    appId: z.string().uuid(),
    candidateStatus: CandidateStatusSchema,
    candidateFlags: z.array(z.string()),
    delegationAllowed: z.boolean(),
    permissions: z.array(z.string()),
    reviewedAt: CursorTimestampSchema
  });
}
