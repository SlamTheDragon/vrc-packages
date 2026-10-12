import { z } from "zod";
import { CursorTokenSchema, CursorTimestampSchema, encodeCursor, decodeCursor } from "../encoding/cursor.ts";
import {
  CatalogPackageSchema,
  CatalogCursorSchema,
  encodeCatalogCursor,
  decodeCatalogCursor,
  type CatalogPackage,
  type CatalogCursor
} from "../types/package.ts";

export const CATALOG_PROTOCOL_VERSION = 1 as const;

const PublicCatalogCursorTokenSchema = CursorTokenSchema
  .refine((value) => decodeCatalogCursor(value) !== null, "Invalid catalog cursor");

export const PublicCatalogListQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: PublicCatalogCursorTokenSchema.optional()
});
export type PublicCatalogListQuery = z.input<typeof PublicCatalogListQuerySchema>;

export const PublicCatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PROTOCOL_VERSION),
  packages: z.array(CatalogPackageSchema),
  nextCursor: PublicCatalogCursorTokenSchema.nullable()
});
export type PublicCatalogListResponse = z.infer<typeof PublicCatalogListResponseSchema>;

export const CatalogDeltaActionSchema = z.enum(["upsert", "delist"]);
export type CatalogDeltaAction = z.infer<typeof CatalogDeltaActionSchema>;

export const CatalogDeltaSchema = z.strictObject({
  action: CatalogDeltaActionSchema,
  canonicalId: z.string().min(1).max(500),
  updatedAt: CursorTimestampSchema,
  package: CatalogPackageSchema.optional()
});
export type CatalogDelta = z.infer<typeof CatalogDeltaSchema>;

export const CatalogDeltaCursorSchema = z.strictObject({
  updatedAt: CursorTimestampSchema,
  canonicalId: z.string().min(1).max(500)
});
export type CatalogDeltaCursor = z.infer<typeof CatalogDeltaCursorSchema>;

export function encodeCatalogDeltaCursor(cursor: CatalogDeltaCursor): string {
  return encodeCursor(CatalogDeltaCursorSchema.parse(cursor));
}

export function decodeCatalogDeltaCursor(value: string): CatalogDeltaCursor | null {
  return decodeCursor(value, CatalogDeltaCursorSchema);
}

export const CatalogDeltaResponseSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PROTOCOL_VERSION),
  epoch: z.string().min(1).max(100),
  deltas: z.array(CatalogDeltaSchema),
  nextCursor: CursorTokenSchema.refine(value => decodeCatalogDeltaCursor(value) !== null, "Invalid delta cursor").nullable()
});
export type CatalogDeltaResponse = z.infer<typeof CatalogDeltaResponseSchema>;

export const CatalogDeltaQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: CursorTokenSchema
    .refine(value => decodeCatalogDeltaCursor(value) !== null, "Invalid delta cursor").optional()
});
export type CatalogDeltaQuery = z.input<typeof CatalogDeltaQuerySchema>;

export {
  CatalogPackageSchema,
  CatalogCursorSchema,
  encodeCatalogCursor,
  decodeCatalogCursor,
  type CatalogPackage,
  type CatalogCursor
};
