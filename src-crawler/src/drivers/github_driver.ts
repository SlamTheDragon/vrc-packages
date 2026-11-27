import type { CrawlJob, Observation } from "vrc-packages-network/node";
import { githubApiRepositoryIdentity } from "vrc-packages-network/source-targets";
import type { DriverContext, DriverFetchOptions, DriverOutcome, SourceDriver } from "./source_driver.ts";

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
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

/**
 * Strategy driver for public GitHub REST repository metadata endpoints (`api.github.com/repos/:owner/:repo`).
 */
export class GitHubDriver implements SourceDriver {
  public readonly platform = "github" as const;

  public validateTarget(job: CrawlJob): string | null {
    if (job.platform !== "github" || !githubApiRepositoryIdentity(job.url)) {
      return "GitHub jobs require a public REST repository metadata endpoint";
    }
    return null;
  }

  public buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    options?: DriverFetchOptions
  ): Record<string, string> {
    let isGitHubApiOrigin = false;
    try {
      isGitHubApiOrigin = new URL(job.url).origin === "https://api.github.com";
    } catch {
      isGitHubApiOrigin = false;
    }

    const token = isGitHubApiOrigin
      ? options?.githubToken !== undefined
        ? options.githubToken.trim() || undefined
        : (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)?.trim()
      : undefined;

    return {
      "user-agent": userAgent,
      "accept": "application/vnd.github+json",
      "x-github-api-version": "2026-03-10",
      ...(token ? { "authorization": `Bearer ${token}` } : {}),
      ...(job.etag ? { "if-none-match": job.etag } : {}),
      ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
    };
  }

  public parseResponse(
    job: CrawlJob,
    body: string,
    _contentType: string,
    context: DriverContext
  ): DriverOutcome {
    const observation = this.parseRepository(job, body, context);
    return observation
      ? { kind: "changed", observation }
      : { kind: "temporary_failure", reason: "No item observation in response" };
  }

  /**
   * Parses GitHub REST repository JSON into an Observation without emitting storefront-only fields.
   */
  public parseRepository(
    job: CrawlJob,
    body: string,
    context: DriverContext
  ): Observation | null {
    if (job.platform !== "github") return null;
    const requestedName = githubApiRepositoryIdentity(job.url);
    if (!requestedName) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      return null;
    }

    const repo = asObject(raw);
    const fullName = asNonEmptyString(repo?.full_name);
    const owner = asNonEmptyString(asObject(repo?.owner)?.login);
    const name = asNonEmptyString(repo?.name);
    const id = repo?.id;
    const htmlUrl = httpsLink(repo?.html_url);

    if (
      !repo ||
      repo.private !== false ||
      !fullName ||
      !owner ||
      !name ||
      !htmlUrl ||
      !Number.isSafeInteger(id) ||
      (id as number) <= 0 ||
      fullName.toLowerCase() !== requestedName.toLowerCase() ||
      `${owner}/${name}`.toLowerCase() !== requestedName.toLowerCase() ||
      htmlUrl.toLowerCase() !== `https://github.com/${requestedName}`.toLowerCase()
    ) {
      return null;
    }

    const cleanSummary = context.sanitizer.sanitizeText(asNonEmptyString(repo.description) || "").slice(0, 1024);
    const outboundLinks = context.sanitizer.collectHttpsLinks([htmlUrl, repo.homepage], job.url, {
      stripBinaries: true
    });
    const rawTopics = Array.isArray(repo.topics)
      ? repo.topics.filter((t): t is string => typeof t === "string")
      : [];

    const semantic = context.semantic.analyze({
      platform: "github",
      url: job.url,
      rawTitle: name,
      cleanSummary,
      rawTags: rawTopics,
      outboundLinks
    });
    const cleanAuthor = context.sanitizer.sanitizeAuthor(owner).slice(0, 300);

    return {
      sourceItemKey: `github:${id}`,
      title: semantic.normalizedTitle,
      author: cleanAuthor,
      summary: cleanSummary,
      outboundLinks,
      originUpdatedAt: normalizedIsoDate(repo.updated_at),
      ...(semantic.platformTags !== undefined ? { platformTags: semantic.platformTags } : {}),
      ownerKey: `github:${owner.toLowerCase()}`,
      ownerName: cleanAuthor,
      ...(semantic.avatarCompatibilities.length > 0
        ? { avatarCompatibilities: semantic.avatarCompatibilities }
        : {}),
      ...(semantic.desktopToolEvidence !== null
        ? { desktopToolEvidence: semantic.desktopToolEvidence }
        : {}),
      vrchatRelevance: semantic.vrchatRelevance
    };
  }
}
