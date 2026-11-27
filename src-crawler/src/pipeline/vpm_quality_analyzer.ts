import type { Observation, VpmQualityFlag } from "vrc-packages-network/node";
import { compareVpmVersions } from "vrc-packages-network/vpm-version";

export interface VpmManifestCandidate {
  version: string;
  manifest: Record<string, unknown>;
  release: NonNullable<Observation["release"]>;
}

export interface VpmAnalysisSummary {
  sortedCandidates: VpmManifestCandidate[];
  latestCandidate: VpmManifestCandidate;
  qualityFlags: VpmQualityFlag[];
}

const SKELETON_PATTERNS = [
  /\b(?:placeholder|stub|empty\s+template|todo\s+description|coming\s+soon)\b/i
];

const FORK_PATTERNS = [
  /\bfork(?:ed)?\s+from\b/i,
  /\bunoffical\s+fork\b/i,
  /\bunofficial\s+fork\b/i
];

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Evaluates valid VPM package release candidates strictly from upstream manifest evidence
 * without synthesizing missing releases, versions, or hashes.
 */
export class VpmQualityAnalyzer {
  /**
   * Orders candidates highest-SemVer-first via `compareVpmVersions` and computes quality flags.
   */
  public analyzePackage(
    packageId: string,
    candidates: readonly VpmManifestCandidate[],
    rawDisplayName: string | null,
    cleanSummary: string,
    authorName: string,
    hasKeywords: boolean
  ): VpmAnalysisSummary {
    const sortedCandidates = [...candidates].sort((a, b) => compareVpmVersions(b.version, a.version));
    const latestCandidate = sortedCandidates[0]!;
    const flags = new Set<VpmQualityFlag>();

    const hasAnyDownload = sortedCandidates.some((c) => Boolean(c.release.downloadUrl));
    if (!hasAnyDownload || sortedCandidates.length === 0) {
      flags.add("missing_release");
    }

    if (sortedCandidates.some((c) => c.release.downloadUrl && !c.release.zipSha256)) {
      flags.add("missing_zip_sha256");
    }

    const missingAuthor = !authorName || authorName === "Unknown";
    const missingDisplayName = !nonEmptyString(rawDisplayName);
    const missingDescription = !cleanSummary || cleanSummary.trim().length === 0;
    if (missingDisplayName || missingDescription || missingAuthor) {
      flags.add("incomplete_metadata");
    }

    const totalDeps = Object.keys(latestCandidate.release.dependencyRanges).length;
    const isMinimalSkeleton =
      SKELETON_PATTERNS.some((p) => p.test(cleanSummary) || (rawDisplayName ? p.test(rawDisplayName) : false)) ||
      (missingDescription && missingAuthor && !hasKeywords && totalDeps === 0 && !latestCandidate.release.downloadUrl);
    if (isMinimalSkeleton) {
      flags.add("skeleton");
    }

    const combinedHints = [packageId, rawDisplayName ?? "", cleanSummary].join(" ");
    if (FORK_PATTERNS.some((p) => p.test(combinedHints)) || /\.fork(?:\.|$)/i.test(packageId)) {
      flags.add("fork_suspected");
    }

    return {
      sortedCandidates,
      latestCandidate,
      qualityFlags: [...flags].slice(0, 10)
    };
  }
}

export const vpmQualityAnalyzer = new VpmQualityAnalyzer();
