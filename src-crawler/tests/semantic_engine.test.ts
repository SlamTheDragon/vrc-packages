import { describe, expect, test } from "bun:test";
import { semanticEngine } from "../src/pipeline/semantic_engine.ts";

describe("SemanticPatternEngine layered signal extraction", () => {
  test("extracts avatar compatibilities from brackets BEFORE cleanTitle strips them", () => {
    const result = semanticEngine.analyze({
      platform: "booth",
      url: "https://booth.pm/ja/items/1234567",
      rawTitle: "【VRChat想定】【Shinano・Manuka対応】Cyber Jacket v1.2.0",
      cleanSummary: "Modular Avatar対応のアバター用ジャケットです。"
    });

    expect(result.bracketTokens).toContain("Shinano・Manuka対応");
    expect(result.normalizedTitle).toBe("Cyber Jacket");
    expect(result.avatarCompatibilities.map((a) => a.targetAvatarBase)).toEqual(["Shinano", "Manuka"]);
    expect(result.avatarCompatibilities.every((a) => a.confidence === "creator_declared")).toBe(true);
    expect(result.vrchatRelevance.isRelevant).toBe(true);
  });

  test("rejects figurative word traps (Maya, Grus/グラス, Milk, Lime) without compatibility cues", () => {
    const traps = semanticEngine.analyze({
      platform: "custom_domain",
      url: "https://example.org/goods/sunglasses",
      rawTitle: "Lime Green Milk Tea & Sunglasses Rigged in Autodesk Maya 2025",
      cleanSummary: "Fashion sunglasses and beverage props exported from Autodesk Maya."
    });

    expect(traps.avatarCompatibilities).toEqual([]);
    expect(traps.vrchatRelevance.isRelevant).toBe(false);
    expect(traps.vrchatRelevance.rejectionReason).toContain("Non-VRChat signals");
  });

  test("classifies standalone VRChat desktop companion tools separately from Unity assets", () => {
    const tool = semanticEngine.analyze({
      platform: "github",
      url: "https://api.github.com/repos/example/vrc-osc-router",
      rawTitle: "VRC OSC Bridge",
      cleanSummary: "Standalone Windows and Linux desktop application routing VRChat OSC telemetry.",
      rawTags: ["vrchat", "osc"]
    });
    expect(tool.desktopToolEvidence).toMatchObject({
      toolSubtype: "osc_control",
      supportedOS: ["windows", "linux"],
      particularVRChatTarget: true
    });

    const outfit = semanticEngine.analyze({
      platform: "booth",
      url: "https://booth.pm/ja/items/7654321",
      rawTitle: "【Shinano対応】Streetwear Outfit",
      cleanSummary: "Includes Modular Avatar prefab and unitypackage with OSC radial toggle for Windows SDK3."
    });
    expect(outfit.desktopToolEvidence).toBeNull();
  });

  test("recognizes avatar tooling and Unity avatar rigs while keeping off-topic chat apps excluded", () => {
    const shader = semanticEngine.analyze({
      platform: "github",
      url: "https://api.github.com/repos/lilxyzw/lilToon",
      rawTitle: "lilToon",
      cleanSummary: "Feature-rich shaders for avatars"
    });
    expect(shader.vrchatRelevance.isRelevant).toBe(true);

    const optimizer = semanticEngine.analyze({
      platform: "github",
      url: "https://api.github.com/repos/anatawa12/AvatarOptimizer",
      rawTitle: "AvatarOptimizer",
      cleanSummary: "AAO: Avatar Optimizer: Non Destructive Avatar Optimization Utilities"
    });
    expect(optimizer.vrchatRelevance.isRelevant).toBe(true);

    const unityTool = semanticEngine.analyze({
      platform: "itch",
      url: "https://arzolath.itch.io/fetus-pose-fix",
      rawTitle: "Fetus Pose Fix",
      cleanSummary: "1 Click Solution to Unity's Fetus Pose Syndrome"
    });
    expect(unityTool.vrchatRelevance.isRelevant).toBe(true);

    const unrelated = semanticEngine.analyze({
      platform: "itch",
      url: "https://stefanhypexlab.itch.io/chatme-2",
      rawTitle: "Chatme 2",
      cleanSummary: "Chatme 2 is an app used for chatting, social media and a lot of features to enjoy"
    });
    expect(unrelated.vrchatRelevance.isRelevant).toBe(false);
  });
});
