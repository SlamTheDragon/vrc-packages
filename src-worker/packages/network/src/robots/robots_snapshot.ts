import { z } from "zod";

export const MAX_ROBOTS_BYTES = 512 * 1024;
export const ROBOTS_REFRESH_TIMEOUT_MS = 15_000;
export const ROBOTS_REFRESH_LEASE_MS = 45_000;

/** Canonical HTTPS origin without credentials, path, query, or hash. */
export const RobotsOriginSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Canonical HTTPS origin required");

/** HTTP status range stored for origin robots preflight snapshots. */
export const RobotsStatusCodeSchema = z.number().int().min(200).max(599);

/** UTF-8 bounded robots.txt response body capped at 512 KiB. */
export const RobotsBodySchema = z.string().max(MAX_ROBOTS_BYTES).refine(
  (body) => new TextEncoder().encode(body).byteLength <= MAX_ROBOTS_BYTES,
  "Robots body exceeds 512 KiB"
);

/** Bounded, origin-specific robots fetch result stored by the coordinator. */
export const OriginRobotsSnapshotSchema = z.strictObject({
  origin: RobotsOriginSchema,
  statusCode: RobotsStatusCodeSchema,
  body: RobotsBodySchema
});

export type OriginRobotsSnapshot = z.infer<typeof OriginRobotsSnapshotSchema>;

export function robotsResultAllowsMissingFile(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
