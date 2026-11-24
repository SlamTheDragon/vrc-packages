import { z } from "zod";
import { CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import { PlatformSchema } from "./platform.ts";
import { HttpsUrlSchema } from "./url.ts";
import { ContentRatingSchema, UmbrellaSchema } from "../taxonomy/taxonomy.ts";

export const VerificationStatusSchema = z.enum(["unverified", "verified"]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const CatalogQualityFlagSchema = z.enum([
  "skeleton",
  "fork_suspected",
  "missing_release",
  "incomplete_metadata",
  "missing_zip_sha256"
]);
export type CatalogQualityFlag = z.infer<typeof CatalogQualityFlagSchema>;

/** One merged storefront or registry listing source linked to a canonical package. */
export const CatalogListingSourceSchema = z.strictObject({
  sourceLinkId: z.uuid(),
  sourceKey: z.string().min(1).max(500),
  platform: PlatformSchema,
  storefrontUrl: HttpsUrlSchema,
  evidenceKind: z.enum([
    "vpm_id",
    "repository_match",
    "cross_storefront_link",
    "curator_verified",
    "simhash_match"
  ]),
  confidence: z.number().min(0).max(1),
  reviewState: z.enum(["provisional", "accepted", "rejected"]).default("accepted"),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum(["available", "delisted", "unknown"]).default("available"),
  observedAt: CursorTimestampSchema,
  reviewedAt: CursorTimestampSchema.nullable().optional()
});
export type CatalogListingSource = z.infer<typeof CatalogListingSourceSchema>;

export const CatalogRelationTypeSchema = z.enum([
  "compatible_with_avatar",
  "depends_on",
  "fork_of",
  "related_product",
  "same_owner"
]);
export type CatalogRelationType = z.infer<typeof CatalogRelationTypeSchema>;

export const CatalogRelationScopeSchema = z.enum(["named_base", "universal", "uncertain", "exact"]);
export type CatalogRelationScope = z.infer<typeof CatalogRelationScopeSchema>;

/** One relationship edge connecting a canonical package to another package or avatar base. */
export const CatalogRelationSchema = z.strictObject({
  relationId: z.uuid(),
  sourceCanonicalId: z.string().min(1).max(500),
  targetCanonicalId: z.string().min(1).max(500).nullable().optional(),
  targetAvatarBase: z.string().min(1).max(200).nullable().optional(),
  relationType: CatalogRelationTypeSchema,
  scope: CatalogRelationScopeSchema,
  confidence: z.number().min(0).max(1),
  evidenceSource: z.string().min(1).max(200),
  feedbackUpCount: z.number().int().min(0).default(0),
  feedbackDownCount: z.number().int().min(0).default(0)
});
export type CatalogRelation = z.infer<typeof CatalogRelationSchema>;

export const PackageFrontSchema = z.strictObject({
  frontId: z.uuid(),
  canonicalId: z.string(),
  sourceKey: z.string(),
  platform: PlatformSchema,
  storefrontUrl: z.string().url(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum(["available", "delisted", "unknown"]).default("available"),
  observedAt: CursorTimestampSchema
});
export type PackageFront = z.infer<typeof PackageFrontSchema>;

export const TimestampConfidenceSchema = z.enum(["confirmed", "inferred", "observed"]);
export type TimestampConfidence = z.infer<typeof TimestampConfidenceSchema>;

/** One canonical package item. */
export const CatalogPackageSchema = z.strictObject({
  canonicalId: z.string().min(1).max(500),
  umbrella: UmbrellaSchema,
  category: z.string().min(1).max(200),
  lifecycle: z.enum(["active", "deprecated", "quarantined", "delisted", "deleted"]),
  displayName: z.string().min(1).max(500),
  ownerKey: z.string().min(1).max(200).nullable().default(null),
  ownerName: z.string().min(1).max(300).nullable().default(null),
  verificationStatus: VerificationStatusSchema.default("unverified"),
  verifiedByAppId: z.uuid().nullable().optional(),
  vpmId: z.string().min(1).max(200).nullable(),
  vpmLatestVersion: z.string().min(1).max(100).nullable().optional(),
  vpmRepoUrl: HttpsUrlSchema.nullable().optional(),
  summary: z.string().max(1024).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).default([]),
  qualityFlags: z.array(CatalogQualityFlagSchema).max(10).default([]),
  createdAt: CursorTimestampSchema,
  updatedAt: CursorTimestampSchema,
  publishedAt: CursorTimestampSchema.nullable().optional(),
  timestampConfidence: TimestampConfidenceSchema.nullable().optional(),
  contentRating: ContentRatingSchema.default("general"),
  sources: z.array(CatalogListingSourceSchema).default([]),
  relations: z.array(CatalogRelationSchema).default([])
});
export type CatalogPackage = z.infer<typeof CatalogPackageSchema>;

export const CatalogCursorSchema = z.strictObject({
  createdAt: CursorTimestampSchema,
  canonicalId: z.string().min(1).max(500)
});
export type CatalogCursor = z.infer<typeof CatalogCursorSchema>;

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return encodeCursor(CatalogCursorSchema.parse(cursor));
}

export function decodeCatalogCursor(value: string): CatalogCursor | null {
  return decodeCursor(value, CatalogCursorSchema);
}
