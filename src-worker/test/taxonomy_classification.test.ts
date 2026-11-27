import { describe, expect, test } from "bun:test";
import {
  deriveCategoryFromTags,
  deriveUmbrellaFromTags,
  normalizeAvatarCompatibilities,
  normalizeDesktopToolEvidence,
  normalizeOwnerKey,
  normalizeOwnerName,
  normalizeQualityFlags,
  normalizeTags
} from "../src/domain/classification/taxonomy.ts";
import type { NodeAvatarCompatibility, NodeDesktopToolEvidence } from "vrc-packages-network/node";

describe("Worker Lean Taxonomy & Node Evidence Normalization", () => {
  test("normalizeTags deduplicates case-insensitively with NFKC trimming and bounds length/count", () => {
    const raw = [
      "  Ｋｉｋｙｏ  ",
      "kikyo",
      "VRChat  Avatar",
      "",
      "   ",
      ...Array.from({ length: 60 }, (_, idx) => `tag-${idx}`)
    ];
    const normalized = normalizeTags(raw);
    expect(normalized[0]).toBe("Kikyo");
    expect(normalized[1]).toBe("VRChat Avatar");
    expect(normalized).toHaveLength(50);
    expect(normalized).not.toContain("kikyo");
  });

  test("normalizeQualityFlags filters unknown flags, deduplicates, and caps at 10", () => {
    const res = normalizeQualityFlags([
      "missing_release",
      "unknown_flag",
      "missing_release",
      "incomplete_metadata",
      "skeleton",
      "fork_suspected",
      "missing_zip_sha256"
    ]);
    expect(res).toEqual([
      "missing_release",
      "incomplete_metadata",
      "skeleton",
      "fork_suspected",
      "missing_zip_sha256"
    ]);
  });

  test("normalizeOwnerKey and normalizeOwnerName normalize creator grouping keys", () => {
    expect(normalizeOwnerKey("  Booth Creator  / Shop! ")).toBe("booth_creator_/_shop");
    expect(normalizeOwnerKey("creator-a")).toBe("creator-a");
    expect(normalizeOwnerKey("   ")).toBeNull();
    expect(normalizeOwnerKey(null)).toBeNull();
    expect(normalizeOwnerName("  Ｋｅｉ　Ｓｔｕｄｉｏ ")).toBe("Kei Studio");
    expect(normalizeOwnerName("")).toBeNull();
  });

  test("normalizeAvatarCompatibilities maps node confidence levels and deduplicates base+scope", () => {
    const input: NodeAvatarCompatibility[] = [
      {
        targetAvatarBase: "Kikyo",
        scope: "named_base",
        confidence: "creator_declared",
        evidenceSource: "booth_title"
      },
      {
        targetAvatarBase: "kikyo",
        scope: "named_base",
        confidence: "keyword_inferred",
        evidenceSource: "duplicate"
      },
      {
        targetAvatarBase: "Manuka",
        scope: "named_base",
        confidence: "keyword_inferred",
        evidenceSource: "description"
      },
      {
        targetAvatarBase: "universal",
        scope: "universal",
        confidence: "unverified",
        evidenceSource: "fallback"
      }
    ];
    const res = normalizeAvatarCompatibilities(input);
    expect(res).toEqual([
      { targetAvatarBase: "Kikyo", scope: "named_base", confidence: 0.95, evidenceSource: "booth_title" },
      { targetAvatarBase: "Manuka", scope: "named_base", confidence: 0.7, evidenceSource: "description" },
      { targetAvatarBase: "universal", scope: "universal", confidence: 0.4, evidenceSource: "fallback" }
    ]);
  });

  test("normalizeDesktopToolEvidence validates supportedOS and deduplicates entries", () => {
    const valid: NodeDesktopToolEvidence = {
      toolSubtype: "osc_control",
      supportedOS: ["windows", "windows", "linux"],
      particularVRChatTarget: true,
      evidenceUrl: "https://github.com/VolcanicArts/VRCOSC",
      publisherClaim: "  VRCOSC  OSC  utility  "
    };
    expect(normalizeDesktopToolEvidence(valid)).toEqual({
      toolSubtype: "osc_control",
      supportedOS: ["windows", "linux"],
      particularVRChatTarget: true,
      evidenceUrl: "https://github.com/VolcanicArts/VRCOSC",
      publisherClaim: "VRCOSC  OSC  utility"
    });
    expect(
      normalizeDesktopToolEvidence({
        toolSubtype: "utility",
        supportedOS: [],
        particularVRChatTarget: false,
        publisherClaim: "No OS"
      })
    ).toBeNull();
    expect(normalizeDesktopToolEvidence(null)).toBeNull();
  });

  test("deriveCategoryFromTags and deriveUmbrellaFromTags classify tags cleanly and preserve defaults", () => {
    expect(deriveCategoryFromTags(["avatar-tool", "unity"], "package")).toBe("avatar_tool");
    expect(deriveCategoryFromTags(["liltoon-shader"], "package")).toBe("shader");
    expect(deriveCategoryFromTags(["world_creation"], "package")).toBe("world_tool");
    expect(deriveCategoryFromTags(["physbone"], "package")).toBe("physics_tool");
    expect(deriveCategoryFromTags(["unrecognized"], "default_cat")).toBe("default_cat");

    expect(deriveUmbrellaFromTags(["osc", "companion"], "assets")).toBe("tools");
    expect(deriveUmbrellaFromTags(["shader", "texture"], "tools")).toBe("assets");
    expect(deriveUmbrellaFromTags(["clothing", "outfit"], "tools")).toBe("avatars");
    expect(deriveUmbrellaFromTags(["misc"], "assets")).toBe("assets");
  });
});
