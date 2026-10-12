import { z } from "zod";
import { PlatformSchema, JobPurposeSchema, type Platform, type JobPurpose } from "vrc-packages-network/node";
import { isPrivateOrReservedIp } from "vrc-packages-network/ip-policy";
import { CreateSourceAccessProfileSchema as ConsumerSourceAccessProfileSchema,
  isCanonicalSourceAccessPath, ProfileCursorSchema, encodeProfileCursor, decodeProfileCursor,
  SourceAccessProfileListResponseSchema as ConsumerProfileListSchema,
  type ProfileCursor } from "vrc-packages-api";

export { ProfileCursorSchema, encodeProfileCursor, decodeProfileCursor, type ProfileCursor } from "vrc-packages-api";

export const SOURCE_ACCESS_SCHEMA_VERSION = 1 as const;
export const SourcePurposeSchema = JobPurposeSchema;
export type SourcePurpose = JobPurpose;

const OriginSchema = z.url().refine(value => {
  const url = new URL(value);
  const addressLiteral = /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith("[");
  return url.protocol === "https:" && url.origin === value && !url.username && !url.password &&
    !url.hostname.endsWith(".") && url.hostname !== "localhost" && !url.port &&
    (!addressLiteral || !isPrivateOrReservedIp(url.hostname));
}, "Canonical public HTTPS origin required");
export const CreateSourceAccessProfileSchema = ConsumerSourceAccessProfileSchema.safeExtend({
  platform: PlatformSchema, origin: OriginSchema, purpose: SourcePurposeSchema
});
export type CreateSourceAccessProfile = z.infer<typeof CreateSourceAccessProfileSchema>;

export const SourceAccessProfileSchema = CreateSourceAccessProfileSchema.safeExtend({
  profileId: ProfileCursorSchema.shape.profileId, createdAt: ProfileCursorSchema.shape.createdAt,
  disabledAt: ProfileCursorSchema.shape.createdAt.nullable()
});
export type SourceAccessProfile = z.infer<typeof SourceAccessProfileSchema>;
export const DisableSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION), reason: z.string().trim().min(3).max(300)
});
export const SourceAccessProfileResponseSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION), profile: SourceAccessProfileSchema
});
export const SourceAccessProfileListResponseSchema = ConsumerProfileListSchema.safeExtend({
  profiles: z.array(SourceAccessProfileSchema)
});

/** Exact canonical path or slash-terminated directory scope; a query needs an explicit exact grant. */
export function sourceAccessProfileMatches(profile: SourceAccessProfile, platform: Platform, target: string,
  purpose: SourcePurpose, nowMs: number): boolean {
  if (profile.platform !== platform || profile.purpose !== purpose || profile.method !== "GET" ||
      profile.disabledAt !== null || Date.parse(profile.expiresAt) <= nowMs) return false;
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.origin !== profile.origin || url.href !== target ||
        url.hash || url.username || url.password || url.port || !isCanonicalSourceAccessPath(url.pathname) ||
        url.search !== (profile.exactQuery ? `?${profile.exactQuery}` : "")) return false;
    if (url.pathname.includes("%") && url.pathname !== profile.pathScope) return false;
    if (profile.exactQuery) return url.pathname === profile.pathScope;
    return profile.pathScope.endsWith("/") ? url.pathname.startsWith(profile.pathScope) :
      url.pathname === profile.pathScope;
  } catch { return false; }
}

/** Conservative overlap test used to avoid implicit fallback from a disabled narrow grant. */
export function sourcePathScopesOverlap(a: string, b: string,
  aQuery?: string, bQuery?: string): boolean {
  if (aQuery !== bQuery) return false;
  if (a === b) return true;
  // Encoded paths never inherit a directory grant; two different encoded
  // exact paths therefore cannot overlap either.
  if (a.includes("%") || b.includes("%")) return false;
  if (a.endsWith("/") && b.startsWith(a)) return true;
  if (b.endsWith("/") && a.startsWith(b)) return true;
  return false;
}

export const SOURCE_ACCESS_API_JSON_SCHEMAS = {
  createSourceAccessProfile: z.toJSONSchema(CreateSourceAccessProfileSchema),
  disableSourceAccessProfile: z.toJSONSchema(DisableSourceAccessProfileSchema),
  sourceAccessProfile: z.toJSONSchema(SourceAccessProfileSchema),
  sourceAccessProfileResponse: z.toJSONSchema(SourceAccessProfileResponseSchema),
  sourceAccessProfileListResponse: z.toJSONSchema(SourceAccessProfileListResponseSchema)
};
