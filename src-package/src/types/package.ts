import { z } from "zod";
import { CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import { PlatformSchema, type Platform } from "./platform.ts";
import { ContentRatingSchema, type ContentRating } from "../taxonomy/taxonomy.ts";

/** One accepted identity link embedded in a catalog package response row. */
export const CatalogIdentityLinkSchema = z.strictObject({
  linkId: z.string().uuid(),
  sourceKey: z.string().min(1).max(500),
  evidenceKind: z.enum([
    "vpm_id",
    "repository_match",
    "cross_storefront_link",
    "curator_verified",
    "simhash_match"
  ]),
  confidence: z.number().min(0).max(1),
  createdAt: CursorTimestampSchema
});
export type CatalogIdentityLink = z.infer<typeof CatalogIdentityLinkSchema>;

export const PackageFrontSchema = z.object({
  frontId: z.string(),
  canonicalId: z.string(),
  sourceKey: z.string(),
  platform: PlatformSchema,
  storefrontUrl: z.string().url(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum(["available", "delisted", "unknown"]).default("available"),
  observedAt: z.string()
});
export type PackageFront = z.infer<typeof PackageFrontSchema>;

export const TimestampConfidenceSchema = z.enum(["confirmed", "inferred", "observed"]);
export type TimestampConfidence = z.infer<typeof TimestampConfidenceSchema>;

/** One canonical package item. */
export const CatalogPackageSchema = z.strictObject({
  canonicalId: z.string().min(1).max(500),
  umbrella: z.enum(["tools", "assets", "avatars"]),
  category: z.string().min(1).max(200),
  lifecycle: z.enum(["active", "deprecated", "quarantined", "delisted"]),
  displayName: z.string().min(1).max(500),
  vpmId: z.string().min(1).max(200).nullable(),
  createdAt: CursorTimestampSchema,
  updatedAt: CursorTimestampSchema,
  publishedAt: CursorTimestampSchema.nullable().optional(),
  timestampConfidence: TimestampConfidenceSchema.nullable().optional(),
  contentRating: ContentRatingSchema.default("general"),
  acceptedLinks: z.array(CatalogIdentityLinkSchema),
  fronts: z.array(PackageFrontSchema).default([])
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
