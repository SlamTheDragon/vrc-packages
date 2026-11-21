import { z } from "zod";
import { CursorTokenSchema, CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import { ContentRatingSchema, UmbrellaSchema, type ContentRating, type Umbrella } from "../taxonomy/taxonomy.ts";
import {
  AppCandidateRecordSchema,
  AppCandidateCursorSchema,
  encodeAppCandidateCursor,
  decodeAppCandidateCursor,
  AppCandidateListQuerySchema,
  createAppCandidateListResponseSchema,
  createReviewAppCandidateRequestSchema,
  createReviewAppCandidateResponseSchema,
  type AppCandidateRecord,
  type AppCandidateCursor,
  type AppCandidateListQuery
} from "./app_candidate.ts";

export const MODERATOR_PROTOCOL_VERSION = 1 as const;

export const ModeratorRatingRecordSchema = z.strictObject({
  canonicalId: z.string().min(1).max(500),
  displayName: z.string(),
  currentRating: ContentRatingSchema,
  umbrella: UmbrellaSchema,
  category: z.string(),
  reportCount: z.number().int().min(0),
  updatedAt: CursorTimestampSchema
});
export type ModeratorRatingRecord = z.infer<typeof ModeratorRatingRecordSchema>;

export const ModeratorRatingCursorSchema = z.strictObject({
  updatedAt: CursorTimestampSchema,
  canonicalId: z.string().min(1).max(500)
});
export type ModeratorRatingCursor = z.infer<typeof ModeratorRatingCursorSchema>;

export function encodeModeratorRatingCursor(cursor: ModeratorRatingCursor): string {
  return encodeCursor(ModeratorRatingCursorSchema.parse(cursor));
}

export function decodeModeratorRatingCursor(value: string): ModeratorRatingCursor | null {
  return decodeCursor(value, ModeratorRatingCursorSchema);
}

export const ModeratorRatingListQuerySchema = z.strictObject({
  rating: ContentRatingSchema.optional(),
  limit: z.number().int().min(1).max(100).default(100),
  cursor: CursorTokenSchema.optional()
}).refine(query => query.cursor === undefined || decodeModeratorRatingCursor(query.cursor) !== null, "Invalid moderator cursor");
export type ModeratorRatingListQuery = z.infer<typeof ModeratorRatingListQuerySchema>;

export const ModeratorRatingListResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  ratings: z.array(ModeratorRatingRecordSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeModeratorRatingCursor(value) !== null, "Invalid moderator cursor").nullable()
});
export type ModeratorRatingListResponse = z.infer<typeof ModeratorRatingListResponseSchema>;

export const SetRatingAdjustmentRequestSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  newRating: ContentRatingSchema,
  reason: z.string().trim().min(3).max(300)
});
export type SetRatingAdjustmentRequest = z.infer<typeof SetRatingAdjustmentRequestSchema>;

export const SetRatingAdjustmentResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  canonicalId: z.string().min(1).max(500),
  previousRating: ContentRatingSchema,
  newRating: ContentRatingSchema,
  adjustedBy: z.string(),
  updatedAt: CursorTimestampSchema
});
export type SetRatingAdjustmentResponse = z.infer<typeof SetRatingAdjustmentResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Moderator Application Candidate Review                                     */
/* -------------------------------------------------------------------------- */

export const ModeratorAppRecordSchema = AppCandidateRecordSchema;
export type ModeratorAppRecord = AppCandidateRecord;

export const ModeratorAppCursorSchema = AppCandidateCursorSchema;
export type ModeratorAppCursor = AppCandidateCursor;
export const encodeModeratorAppCursor = encodeAppCandidateCursor;
export const decodeModeratorAppCursor = decodeAppCandidateCursor;

export const ModeratorAppListQuerySchema = AppCandidateListQuerySchema;
export type ModeratorAppListQuery = AppCandidateListQuery;

export const ModeratorAppListResponseSchema = createAppCandidateListResponseSchema(MODERATOR_PROTOCOL_VERSION);
export type ModeratorAppListResponse = z.infer<typeof ModeratorAppListResponseSchema>;

export const ModeratorReviewAppCandidateRequestSchema = createReviewAppCandidateRequestSchema(MODERATOR_PROTOCOL_VERSION);
export type ModeratorReviewAppCandidateRequest = z.infer<typeof ModeratorReviewAppCandidateRequestSchema>;

export const ModeratorReviewAppCandidateResponseSchema = createReviewAppCandidateResponseSchema(MODERATOR_PROTOCOL_VERSION);
export type ModeratorReviewAppCandidateResponse = z.infer<typeof ModeratorReviewAppCandidateResponseSchema>;
