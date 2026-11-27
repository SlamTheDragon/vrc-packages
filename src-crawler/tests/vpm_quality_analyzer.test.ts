import { describe, expect, test } from "bun:test";
import { vpmQualityAnalyzer } from "../src/pipeline/vpm_quality_analyzer.ts";

describe("VpmQualityAnalyzer deterministic quality diagnostics", () => {
  test("orders SemVer candidates descending and computes missing_zip_sha256, incomplete_metadata, and skeleton flags", () => {
    const result = vpmQualityAnalyzer.analyzePackage(
      "com.example.stubpkg",
      [
        {
          version: "0.1.0",
          manifest: { name: "com.example.stubpkg", version: "0.1.0" },
          release: { version: "0.1.0", dependencyRanges: {} }
        },
        {
          version: "1.2.0",
          manifest: { name: "com.example.stubpkg", version: "1.2.0", url: "https://example.org/pkg.zip" },
          release: { version: "1.2.0", dependencyRanges: {}, downloadUrl: "https://example.org/pkg.zip" }
        },
        {
          version: "1.0.0-beta.1",
          manifest: { name: "com.example.stubpkg", version: "1.0.0-beta.1" },
          release: { version: "1.0.0-beta.1", dependencyRanges: {} }
        }
      ],
      null,
      "Placeholder stub package",
      "Unknown",
      false
    );

    expect(result.sortedCandidates.map((c) => c.version)).toEqual(["1.2.0", "1.0.0-beta.1", "0.1.0"]);
    expect(result.latestCandidate.version).toBe("1.2.0");
    expect(result.qualityFlags).toEqual(
      expect.arrayContaining(["missing_zip_sha256", "incomplete_metadata", "skeleton"])
    );
    expect(result.qualityFlags).not.toContain("missing_release");
    expect(result.qualityFlags).not.toContain("fork_suspected");
  });

  test("flags fork_suspected and missing_release accurately", () => {
    const result = vpmQualityAnalyzer.analyzePackage(
      "com.creator.tool.fork",
      [
        {
          version: "2.0.0",
          manifest: { name: "com.creator.tool.fork", version: "2.0.0" },
          release: { version: "2.0.0", dependencyRanges: { "com.vrchat.avatars": "3.x" } }
        }
      ],
      "Tool Fork",
      "Unofficial fork from upstream repository with VRChat support.",
      "ForkAuthor",
      true
    );

    expect(result.qualityFlags).toEqual(["missing_release", "fork_suspected"]);
  });
});
