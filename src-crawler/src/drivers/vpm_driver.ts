import { cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import type { CrawlJob, DiscoveryLead, Observation, VpmListingIssue } from "vrc-packages-network/node";
import { normalizeGitHubRepositoryUrl, parseGitHubOwnerRepo } from "vrc-packages-network/source-targets";
import { isVpmVersion, compareVpmVersions } from "vrc-packages-network/vpm-version";
import type { VpmManifestCandidate } from "../pipeline/vpm_quality_analyzer.ts";
import type { DriverContext, DriverFetchOptions, DriverOutcome, SourceDriver } from "./source_driver.ts";

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractAuthorName(value: unknown): string | null {
  return asNonEmptyString(value) || asNonEmptyString(asObject(value)?.name);
}

function httpsLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function normalizedIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function extractReleaseEvidence(
  version: string,
  manifest: Record<string, unknown>
): NonNullable<Observation["release"]> | null {
  if (!isVpmVersion(version)) return null;
  const dependencyObject =
    manifest.vpmDependencies === undefined ? {} : asObject(manifest.vpmDependencies);
  if (!dependencyObject || Object.keys(dependencyObject).length > 100) return null;

  const dependencyRanges: Record<string, string> = Object.create(null);
  for (const [depName, range] of Object.entries(dependencyObject)) {
    const cleanRange = asNonEmptyString(range);
    if (!depName || depName.length > 200 || !cleanRange || cleanRange.length > 200) return null;
    dependencyRanges[depName] = cleanRange;
  }

  const hash = asNonEmptyString(manifest.zipSHA256);
  if (hash && !/^[a-fA-F0-9]{64}$/.test(hash)) return null;

  const downloadUrl = httpsLink(manifest.url);
  return {
    version,
    dependencyRanges,
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(hash ? { zipSha256: hash.toLowerCase() } : {})
  };
}

function extractManifestLinks(manifest: Record<string, unknown>): unknown[] {
  const repoField = manifest.repository;
  return [
    manifest.url,
    manifest.repo,
    typeof repoField === "string" ? repoField : asObject(repoField)?.url,
    manifest.homepage,
    manifest.documentation,
    manifest.documentationLink,
    asObject(manifest.author)?.url
  ];
}

function extractRawKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function decodeVccUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "vcc:") return null;
    const inner = parsed.searchParams.get("url");
    if (!inner) return null;
    const target = new URL(inner);
    if (target.protocol !== "https:" || target.username || target.password) return null;
    return cleanTrackingParams(target.href);
  } catch {
    return null;
  }
}

/**
 * Strategy driver for VPM repository index JSON, single package JSON, build recipes, and
 * decentralized VPM discovery lead feeds (`vcc://vpm/addRepo`, `.txt`, HTML/Markdown lists).
 */
export class VpmDriver implements SourceDriver {
  public readonly platform = "vpm" as const;

  public validateTarget(job: CrawlJob): string | null {
    if (job.platform !== "vpm") return "VPM driver requires vpm platform";
    try {
      const target = new URL(job.url);
      if (target.protocol !== "https:") return "VPM target must use HTTPS";
      return null;
    } catch {
      return "VPM target must be a valid HTTPS URL";
    }
  }

  public buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    _options?: DriverFetchOptions
  ): Record<string, string> {
    return {
      "user-agent": userAgent,
      "accept": "application/json,text/html;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      ...(job.etag ? { "if-none-match": job.etag } : {}),
      ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
    };
  }

  public parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    const repoEvidence = this.parseRepositoryEvidence(job, body, context);
    if (repoEvidence) {
      const outcome: DriverOutcome =
        repoEvidence.issues.length > 0
          ? { kind: "partial_batch", observations: repoEvidence.observations, issues: repoEvidence.issues }
          : { kind: "batch", observations: repoEvidence.observations };
      return JSON.stringify(outcome).length <= 240_000
        ? outcome
        : { kind: "temporary_failure", reason: "Repository exceeds one bounded result batch" };
    }

    const recipeLeads = this.parseListingRecipe(job, body);
    if (recipeLeads) {
      const outcome = context.pagination.buildDiscoveryOutcome(job, recipeLeads, null, () => false);
      return JSON.stringify(outcome).length <= 240_000
        ? outcome
        : { kind: "temporary_failure", reason: "Recipe exceeds one bounded discovery batch" };
    }

    if (job.purpose === "discovery") {
      const feedLeads = this.parseDiscoveryLeads(job, body, contentType, context);
      if (feedLeads) {
        const outcome = context.pagination.buildDiscoveryOutcome(job, feedLeads, null, () => false);
        return JSON.stringify(outcome).length <= 240_000
          ? outcome
          : { kind: "temporary_failure", reason: "VPM discovery exceeds one bounded batch" };
      }
      return { kind: "discovery", leads: [] };
    }

    const single = this.parseSinglePackage(job, body, context);
    return single
      ? { kind: "changed", observation: single }
      : { kind: "temporary_failure", reason: "No item observation in response" };
  }

  /**
   * Parses a multi-package VPM repository `index.json`, ranking valid versions by SemVer and
   * computing deterministic quality flags without emitting storefront-only fields.
   */
  public parseRepositoryEvidence(
    job: CrawlJob,
    body: string,
    context: DriverContext
  ): { observations: Observation[]; issues: VpmListingIssue[] } | null {
    if (job.platform !== "vpm") return null;
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return null;
    }

    const repo = asObject(raw);
    const packages = asObject(repo?.packages);
    if (!repo || !packages) return null;

    const entries = Object.entries(packages);
    if (entries.length === 0 || entries.length > 100) return null;

    const observations: Observation[] = [];
    const issues: VpmListingIssue[] = [];

    for (const [packageId, packageValue] of entries) {
      if (!packageId || packageId.length > 200) return null;
      const versions = asObject(asObject(packageValue)?.versions);
      if (!versions) {
        issues.push({ sourceItemKey: packageId, code: "invalid_package" });
        continue;
      }

      const releaseEntries = Object.entries(versions);
      if (releaseEntries.length === 0 || releaseEntries.length > 100) {
        issues.push({ sourceItemKey: packageId, code: "invalid_package" });
        continue;
      }

      const candidates: VpmManifestCandidate[] = [];
      for (const [version, value] of releaseEntries) {
        const manifest = asObject(value);
        const issueVersion = version && version.length <= 100 ? { version } : {};
        if (!version || version.length > 100 || !manifest) {
          issues.push({ sourceItemKey: packageId, ...issueVersion, code: "invalid_manifest" });
          continue;
        }
        if (typeof manifest.name !== "string" || !manifest.name || typeof manifest.version !== "string" || !manifest.version) {
          issues.push({ sourceItemKey: packageId, version, code: "invalid_manifest" });
          continue;
        }
        if (manifest.name !== packageId || manifest.version !== version) {
          issues.push({ sourceItemKey: packageId, version, code: "identity_mismatch" });
          continue;
        }
        if (!isVpmVersion(version)) {
          issues.push({ sourceItemKey: packageId, version, code: "invalid_version" });
          continue;
        }
        const release = extractReleaseEvidence(version, manifest);
        if (!release) {
          issues.push({ sourceItemKey: packageId, version, code: "invalid_release_evidence" });
          continue;
        }
        candidates.push({ version, manifest, release });
      }

      if (issues.length > 100) return null;
      if (candidates.length === 0) continue;

      const latestOrder = [...candidates].sort((a, b) => compareVpmVersions(b.version, a.version));
      const rawDisplayName = latestOrder.map((c) => asNonEmptyString(c.manifest.displayName)).find(Boolean) ?? null;
      const rawDescription = latestOrder.map((c) => asNonEmptyString(c.manifest.description)).find(Boolean) ?? "";
      const cleanSummary = context.sanitizer.sanitizeText(rawDescription).slice(0, 1024);
      const rawAuthor = latestOrder.map((c) => extractAuthorName(c.manifest.author)).find(Boolean) || extractAuthorName(repo.author) || "Unknown";
      const cleanAuthor = context.sanitizer.sanitizeAuthor(rawAuthor).slice(0, 300);
      const rawKeywords = latestOrder.flatMap((c) => extractRawKeywords(c.manifest.keywords));

      const analysis = context.vpmAnalyzer.analyzePackage(
        packageId,
        candidates,
        rawDisplayName,
        cleanSummary,
        cleanAuthor,
        rawKeywords.length > 0
      );

      const outboundLinks = context.sanitizer.collectHttpsLinks(
        [repo.url, asObject(repo.infoLink)?.url, ...analysis.sortedCandidates.flatMap((c) => extractManifestLinks(c.manifest))],
        job.url,
        { stripBinaries: true }
      );

      const semantic = context.semantic.analyze({
        platform: "vpm",
        url: job.url,
        rawTitle: rawDisplayName || packageId,
        cleanSummary,
        rawTags: rawKeywords,
        outboundLinks
      });

      const originUpdatedAt =
        analysis.sortedCandidates
          .map((c) => normalizedIsoDate(c.manifest.updated_at))
          .filter((d): d is string => d !== null)
          .sort()
          .at(-1) || null;

      observations.push({
        sourceItemKey: packageId,
        title: semantic.normalizedTitle,
        author: cleanAuthor,
        summary: cleanSummary,
        outboundLinks,
        originUpdatedAt,
        releases: analysis.sortedCandidates.map((c) => c.release),
        ...(semantic.platformTags !== undefined ? { platformTags: semantic.platformTags } : {}),
        ...(cleanAuthor !== "Unknown"
          ? { ownerKey: `vpm:${cleanAuthor.toLowerCase()}`, ownerName: cleanAuthor }
          : {}),
        ...(analysis.qualityFlags.length > 0 ? { qualityFlags: analysis.qualityFlags } : {}),
        ...(semantic.avatarCompatibilities.length > 0
          ? { avatarCompatibilities: semantic.avatarCompatibilities }
          : {}),
        ...(semantic.desktopToolEvidence !== null
          ? { desktopToolEvidence: semantic.desktopToolEvidence }
          : {}),
        vrchatRelevance: semantic.vrchatRelevance
      });
    }

    return { observations, issues };
  }

  /**
   * Parses a single standalone VPM `package.json` observation.
   */
  public parseSinglePackage(
    job: CrawlJob,
    body: string,
    context: DriverContext
  ): Observation | null {
    if (job.platform !== "vpm") return null;
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }

    const item = asObject(data);
    if (!item) return null;
    if (typeof item.name !== "string" || typeof item.version !== "string") return null;

    const name = asNonEmptyString(item.name);
    const version = asNonEmptyString(item.version);
    if (!name || name !== item.name || name.length > 200 || !version || version !== item.version || version.length > 100) {
      return null;
    }

    const release = extractReleaseEvidence(version, item);
    if (!release) return null;

    const rawAuthor = extractAuthorName(item.author) ?? "Unknown";
    const cleanAuthor = context.sanitizer.sanitizeAuthor(rawAuthor).slice(0, 300);
    const rawDisplayName = asNonEmptyString(item.displayName);
    const rawDescription = asNonEmptyString(item.description) ?? "";
    const cleanSummary = context.sanitizer.sanitizeText(rawDescription).slice(0, 1024);
    const rawKeywords = extractRawKeywords(item.keywords);

    const analysis = context.vpmAnalyzer.analyzePackage(
      name,
      [{ version, manifest: item, release }],
      rawDisplayName,
      cleanSummary,
      cleanAuthor,
      rawKeywords.length > 0
    );

    const outboundLinks = context.sanitizer.collectHttpsLinks(extractManifestLinks(item), job.url, {
      stripBinaries: true
    });

    const semantic = context.semantic.analyze({
      platform: "vpm",
      url: job.url,
      rawTitle: rawDisplayName || name,
      cleanSummary,
      rawTags: rawKeywords,
      outboundLinks
    });

    return {
      sourceItemKey: name,
      title: semantic.normalizedTitle,
      author: cleanAuthor,
      summary: cleanSummary,
      outboundLinks,
      originUpdatedAt: normalizedIsoDate(item.updated_at),
      release,
      ...(semantic.platformTags !== undefined ? { platformTags: semantic.platformTags } : {}),
      ...(cleanAuthor !== "Unknown"
        ? { ownerKey: `vpm:${cleanAuthor.toLowerCase()}`, ownerName: cleanAuthor }
        : {}),
      ...(analysis.qualityFlags.length > 0 ? { qualityFlags: analysis.qualityFlags } : {}),
      ...(semantic.avatarCompatibilities.length > 0
        ? { avatarCompatibilities: semantic.avatarCompatibilities }
        : {}),
      ...(semantic.desktopToolEvidence !== null
        ? { desktopToolEvidence: semantic.desktopToolEvidence }
        : {}),
      vrchatRelevance: semantic.vrchatRelevance
    };
  }

  /**
   * Parses VPM listing `source.json` recipes into bounded discovery leads.
   */
  public parseListingRecipe(job: CrawlJob, body: string): DiscoveryLead[] | null {
    if (job.platform !== "vpm") return null;
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return null;
    }

    const recipe = asObject(raw);
    const listingUrl = httpsLink(recipe?.url);
    if (!recipe || !asNonEmptyString(recipe.name) || !listingUrl) return null;
    if (recipe.packages !== undefined && !Array.isArray(recipe.packages)) return null;
    if (recipe.githubRepos !== undefined && !Array.isArray(recipe.githubRepos)) return null;
    if (!Array.isArray(recipe.packages) && !Array.isArray(recipe.githubRepos)) return null;

    const packages = (recipe.packages as unknown[]) || [];
    const githubRepos = (recipe.githubRepos as unknown[]) || [];
    if (packages.length > 100 || githubRepos.length > 100) return null;

    const leads: DiscoveryLead[] = [{ kind: "vpm_listing", url: listingUrl }];
    for (const repo of githubRepos) {
      if (typeof repo !== "string") return null;
      const parts = repo.split("/");
      if (parts.length !== 2) return null;
      const identity = parseGitHubOwnerRepo(parts[0]!, parts[1]!, { rejectReservedRoutes: true });
      if (!identity) return null;
      leads.push({ kind: "github_repository", url: `https://github.com/${identity}` });
    }

    for (const entry of packages) {
      const packageInfo = asObject(entry);
      if (!packageInfo || !Array.isArray(packageInfo.releases) || packageInfo.releases.length > 100) return null;
      const claimedPackageId = asNonEmptyString(packageInfo.id) || asNonEmptyString(packageInfo.name);
      if (claimedPackageId && claimedPackageId.length > 200) return null;
      for (const release of packageInfo.releases) {
        const url = httpsLink(release);
        if (!url || !new URL(url).pathname.toLowerCase().endsWith(".zip")) return null;
        leads.push({
          kind: "release_zip",
          url,
          ...(claimedPackageId ? { claimedPackageId } : {})
        });
      }
    }

    if (leads.length > 100) return null;
    return [
      ...new Map(
        leads.map((lead) => [`${lead.kind}:${lead.url}:${lead.claimedPackageId || ""}`, lead])
      ).values()
    ];
  }

  /**
   * Parses VPM text/HTML/Markdown discovery feeds (`repositories.txt`, `vcc://vpm/addRepo?url=...`,
   * VPM catalog pages) into deduplicated HTTPS VPM and GitHub leads capped at 100.
   */
  public parseDiscoveryLeads(
    job: CrawlJob,
    body: string,
    _contentType: string,
    _context?: DriverContext
  ): DiscoveryLead[] | null {
    if (job.platform !== "vpm" || job.purpose !== "discovery") return null;

    const leads: DiscoveryLead[] = [];
    const seen = new Set<string>();
    const pushLead = (lead: DiscoveryLead) => {
      const key = `${lead.kind}:${lead.url}`;
      if (!seen.has(key) && leads.length < 100) {
        seen.add(key);
        leads.push(lead);
      }
    };

    for (const vccMatch of body.matchAll(/vcc:\/\/vpm\/addRepo\?url=[^\s"'<>)]+/gi)) {
      const resolved = decodeVccUrl(vccMatch[0]);
      if (resolved) pushLead({ kind: "vpm_listing", url: resolved });
    }

    for (const rawLine of body.split(/[\r\n]+/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      if (line.startsWith("https://")) {
        try {
          const parsed = new URL(line);
          const ghUrl = parsed.hostname === "github.com" ? normalizeGitHubRepositoryUrl(parsed.href) : null;
          if (ghUrl) {
            pushLead({ kind: "github_repository", url: ghUrl });
          } else if (parsed.pathname.toLowerCase().endsWith(".json")) {
            pushLead({ kind: "vpm_listing", url: cleanTrackingParams(parsed.href) });
          }
        } catch {
          // Ignore malformed line
        }
      }
    }

    if (leads.length < 100) {
      const urlMatches = body.match(/https:\/\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+)+/g) || [];
      for (const match of urlMatches) {
        try {
          const parsed = new URL(match);
          if (parsed.hostname === "github.com") {
            const ghUrl = normalizeGitHubRepositoryUrl(parsed.href);
            if (ghUrl) pushLead({ kind: "github_repository", url: ghUrl });
          } else if (
            parsed.pathname.toLowerCase().endsWith("/index.json") ||
            parsed.pathname.toLowerCase().endsWith("/vpm.json") ||
            parsed.pathname.toLowerCase().endsWith("/packages.json")
          ) {
            pushLead({ kind: "vpm_listing", url: cleanTrackingParams(parsed.href) });
          }
        } catch {
          // Ignore malformed embedded URL
        }
        if (leads.length >= 100) break;
      }
    }

    return leads.length > 0 ? leads : null;
  }
}
