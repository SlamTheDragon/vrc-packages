import {
  CatalogQualityFlagSchema,
  type CatalogQualityFlag,
  type Umbrella
} from "vrc-packages-api";
import type {
  NodeAvatarCompatibility,
  NodeDesktopToolEvidence,
  NodeDesktopToolSubtype
} from "vrc-packages-network/node";

export type { CatalogQualityFlag, NodeAvatarCompatibility, NodeDesktopToolEvidence, NodeDesktopToolSubtype, Umbrella };

export interface NormalizedAvatarRelation {
  targetAvatarBase: string;
  scope: "named_base" | "universal" | "uncertain";
  confidence: number;
  evidenceSource: string;
}

const VALID_QUALITY_FLAGS = new Set<string>(CatalogQualityFlagSchema.options);

/**
 * Normalizes pre-extracted node platform tags into deduplicated canonical tokens (max 50).
 */
export function normalizeTags(tags?: readonly string[]): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of tags) {
    const clean = (raw || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 100);
    if (!clean) continue;
    const dedupKey = clean.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(clean);
    if (out.length >= 50) break;
  }

  return out;
}

/**
 * Validates and deduplicates node-reported VPM or metadata quality flags (max 10).
 */
export function normalizeQualityFlags(flags?: readonly string[]): CatalogQualityFlag[] {
  if (!flags || flags.length === 0) return [];
  const seen = new Set<CatalogQualityFlag>();
  const out: CatalogQualityFlag[] = [];

  for (const flag of flags) {
    if (!VALID_QUALITY_FLAGS.has(flag)) continue;
    const typed = flag as CatalogQualityFlag;
    if (seen.has(typed)) continue;
    seen.add(typed);
    out.push(typed);
    if (out.length >= 10) break;
  }

  return out;
}

/**
 * Normalizes a creator/owner grouping key for cross-listing grouping.
 */
export function normalizeOwnerKey(rawKey?: string | null): string | null {
  if (!rawKey) return null;
  const normalized = rawKey
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._:/-]/g, "")
    .slice(0, 200);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Normalizes a creator display name.
 */
export function normalizeOwnerName(rawName?: string | null): string | null {
  if (!rawName) return null;
  const normalized = rawName.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 300);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Maps node-supplied avatar compatibility classification labels to numeric relation confidence.
 */
export function normalizeAvatarCompatibilities(
  entries?: readonly NodeAvatarCompatibility[]
): NormalizedAvatarRelation[] {
  if (!entries || entries.length === 0) return [];
  const seen = new Set<string>();
  const out: NormalizedAvatarRelation[] = [];

  for (const item of entries) {
    const targetAvatarBase = item.targetAvatarBase.normalize("NFKC").trim().slice(0, 200);
    if (!targetAvatarBase) continue;

    const dedupKey = `${targetAvatarBase.toLowerCase()}::${item.scope}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const confidence =
      item.confidence === "creator_declared"
        ? 0.95
        : item.confidence === "keyword_inferred"
          ? 0.7
          : 0.4;

    out.push({
      targetAvatarBase,
      scope: item.scope,
      confidence,
      evidenceSource: item.evidenceSource.trim().slice(0, 200) || "node_observation"
    });
    if (out.length >= 50) break;
  }

  return out;
}

/**
 * Validates and bounds pre-classified desktop tool evidence produced by a Crawler Node.
 */
export function normalizeDesktopToolEvidence(
  evidence?: NodeDesktopToolEvidence | null
): NodeDesktopToolEvidence | null {
  if (!evidence) return null;
  const supportedOS = Array.from(new Set(evidence.supportedOS));
  if (supportedOS.length === 0) return null;
  return {
    toolSubtype: evidence.toolSubtype,
    supportedOS,
    particularVRChatTarget: Boolean(evidence.particularVRChatTarget),
    ...(evidence.evidenceUrl ? { evidenceUrl: evidence.evidenceUrl } : {}),
    publisherClaim: evidence.publisherClaim.normalize("NFKC").trim().slice(0, 300)
  };
}

/**
 * Derives a canonical category string from normalized platform tags.
 * Unrecognized tags safely preserve `defaultCategory`.
 */
export function deriveCategoryFromTags(
  platformTags: readonly string[] | undefined,
  defaultCategory: string
): string {
  if (!platformTags || platformTags.length === 0) return defaultCategory;

  const normalized = platformTags.map((tag) => (tag || "").normalize("NFKC").toLowerCase().trim());

  for (const tag of normalized) {
    if (tag.includes("avatar") || tag === "avatar_tool" || tag === "avatar-tool") {
      return "avatar_tool";
    }
    if (tag.includes("shader")) {
      return "shader";
    }
    if (tag.includes("world") || tag === "world_creation") {
      return "world_tool";
    }
    if (tag.includes("animation")) {
      return "animation_tool";
    }
    if (tag.includes("physics") || tag.includes("physbone")) {
      return "physics_tool";
    }
    if (tag.includes("clothing") || tag.includes("outfit") || tag.includes("cosmetic")) {
      return defaultCategory;
    }
  }

  return defaultCategory;
}

/**
 * Derives a canonical top-level umbrella ('tools', 'assets', 'avatars') from platform tags.
 */
export function deriveUmbrellaFromTags(
  platformTags: readonly string[] | undefined,
  defaultUmbrella: Umbrella = "tools"
): Umbrella {
  if (!platformTags || platformTags.length === 0) return defaultUmbrella;
  const normalized = platformTags.map((tag) => (tag || "").normalize("NFKC").toLowerCase().trim());

  for (const tag of normalized) {
    if (
      tag === "avatar_tool" ||
      tag === "avatar-tool" ||
      tag.includes("tool") ||
      tag.includes("script") ||
      tag.includes("system") ||
      tag.includes("gimmick") ||
      tag.includes("osc") ||
      tag.includes("tracking")
    ) {
      return "tools";
    }
    if (
      tag.includes("shader") ||
      tag.includes("texture") ||
      tag.includes("material") ||
      tag.includes("prop") ||
      tag.includes("asset")
    ) {
      return "assets";
    }
    if (
      tag.includes("avatar") ||
      tag.includes("clothing") ||
      tag.includes("hair") ||
      tag.includes("outfit") ||
      tag.includes("cosmetic")
    ) {
      return "avatars";
    }
  }

  return defaultUmbrella;
}
