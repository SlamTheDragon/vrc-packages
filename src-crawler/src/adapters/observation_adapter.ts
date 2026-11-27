import type { CrawlJob, DiscoveryLead, Observation, ResultRequest } from "vrc-packages-network/node";
import { UnsafeMetadataTarget } from "../client/public_metadata_fetch.ts";
import {
  boothDriver,
  defaultDriverRegistry,
  githubDriver,
  shopifyDriver,
  vpmDriver
} from "../drivers/driver_registry.ts";
import type { DriverContext } from "../drivers/source_driver.ts";
import { StorefrontHtmlDriver } from "../drivers/storefront_base_driver.ts";
import { htmlSanitizer } from "../pipeline/html_sanitizer.ts";
import { paginationController } from "../pipeline/pagination_controller.ts";
import { semanticEngine } from "../pipeline/semantic_engine.ts";
import { vpmQualityAnalyzer } from "../pipeline/vpm_quality_analyzer.ts";
import { classifyAccessFailure, retryAfterSeconds } from "../shared/protocol/access_outcome.ts";
import { CRAWLER_USER_AGENT } from "../shared/robots/crawler_identity.ts";

type Outcome = ResultRequest["outcome"];

export const defaultDriverContext: DriverContext = {
  sanitizer: htmlSanitizer,
  semantic: semanticEngine,
  vpmAnalyzer: vpmQualityAnalyzer,
  pagination: paginationController
};

async function boundedText(response: Response, maxBytes = 2_000_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error("Response over 2 MB");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Only the public REST repository metadata endpoint is supported; no HTML or README archival. */
export function parseGitHubRepository(job: CrawlJob, body: string): Observation | null {
  return githubDriver.parseRepository(job, body, defaultDriverContext);
}

/** A template source is a build recipe. Its URLs are leads, not package or version evidence. */
export function parseVpmListingRecipe(job: CrawlJob, body: string): DiscoveryLead[] | null {
  return vpmDriver.parseListingRecipe(job, body);
}

/** Parses VPM text, HTML, Markdown, and `vcc://` feeds into bounded discovery leads. */
export function parseVpmDiscoveryLeads(
  job: CrawlJob,
  body: string,
  contentType = ""
): DiscoveryLead[] | null {
  return vpmDriver.parseDiscoveryLeads(job, body, contentType, defaultDriverContext);
}

/** Strict convenience parser; partial evidence is available only through the typed outcome. */
export function parseVpmRepository(job: CrawlJob, body: string): Observation[] | null {
  const parsed = vpmDriver.parseRepositoryEvidence(job, body, defaultDriverContext);
  return parsed && parsed.issues.length === 0 ? parsed.observations : null;
}

/** Parses one direct VPM manifest, GitHub repository response, or storefront HTML item. */
export function parseObservation(
  job: CrawlJob,
  body: string,
  contentType: string
): Observation | null {
  if (job.platform === "github") return githubDriver.parseRepository(job, body, defaultDriverContext);
  if (job.platform === "vpm") return vpmDriver.parseSinglePackage(job, body, defaultDriverContext);
  if (contentType.includes("json")) return null;

  const driver = defaultDriverRegistry.get(job.platform);
  if (driver instanceof StorefrontHtmlDriver) {
    return driver.parseProductHtml(job, body, contentType, defaultDriverContext);
  }
  return null;
}

/** A BOOTH browse page supplies candidate links, never product facts or fetch authority. */
export function parseBoothBrowseLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
  const parsed = boothDriver.parseBrowsePage(job, body);
  if (!parsed) return null;
  return paginationController.buildDiscoveryOutcome(job, parsed.leads, null, () => false).leads;
}

/** A Shopify product sitemap is discovery evidence only; merchant/product facts need separate review. */
export function parseShopifyProductSitemapLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
  return shopifyDriver.parseSitemapLeads(job, body);
}

export interface FetchOutcomeMetrics {
  httpStatus?: number;
  bytesFetched?: number;
}

/**
 * Executes a leased fetch deterministically via the platform's registered SourceDriver strategy
 * while recording HTTP status and fetched byte telemetry.
 */
export async function fetchJobOutcomeWithMetrics(
  job: CrawlJob,
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
  authoritySignal?: AbortSignal,
  options?: { githubToken?: string }
): Promise<{ outcome: Outcome; metrics: FetchOutcomeMetrics }> {
  const targetUrl = new URL(job.url);
  if (targetUrl.hostname === "api.github.com" && job.platform !== "github") {
    return {
      outcome: { kind: "blocked", reason: "GitHub jobs require a public REST repository metadata endpoint" },
      metrics: {}
    };
  }

  const driver = defaultDriverRegistry.get(job.platform);
  if (!driver) {
    return {
      outcome: { kind: "blocked", reason: `Unsupported crawler platform: ${job.platform}` },
      metrics: {}
    };
  }

  const targetError = driver.validateTarget(job);
  if (targetError) {
    return { outcome: { kind: "blocked", reason: targetError }, metrics: {} };
  }

  const headers = driver.buildRequestHeaders(job, CRAWLER_USER_AGENT, options);
  const signal = authoritySignal
    ? AbortSignal.any([authoritySignal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);

  let httpStatus: number | undefined;
  let bytesFetched: number | undefined;

  try {
    const response = await fetcher(job.url, { headers, signal, redirect: "error" });
    httpStatus = response.status;
    const headerFailure = classifyAccessFailure(response);
    if (headerFailure === "challenge") return { outcome: { kind: "blocked", reason: "Challenge response" }, metrics: { httpStatus } };
    if (headerFailure === "rate_limited") {
      return {
        outcome: { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response.headers) },
        metrics: { httpStatus }
      };
    }
    if (job.platform === "github" && response.status === 403 && headerFailure === "forbidden") {
      const errorBody = await boundedText(response, 10_000);
      bytesFetched = Buffer.byteLength(errorBody, "utf8");
      if (/secondary rate limit|abuse detection/i.test(errorBody)) {
        return {
          outcome: {
            kind: "rate_limited",
            retryAfterSeconds: Math.max(60, retryAfterSeconds(response.headers, 60))
          },
          metrics: { httpStatus, bytesFetched }
        };
      }
      return { outcome: { kind: "blocked", reason: "HTTP 403" }, metrics: { httpStatus, bytesFetched } };
    }
    if (headerFailure === "forbidden" || response.status === 401) {
      return { outcome: { kind: "blocked", reason: `HTTP ${response.status}` }, metrics: { httpStatus } };
    }
    if (response.status === 304) return { outcome: { kind: "unchanged" }, metrics: { httpStatus, bytesFetched: 0 } };
    if (response.status >= 300 && response.status < 400) {
      return { outcome: { kind: "blocked", reason: "Redirect requires source review" }, metrics: { httpStatus } };
    }
    if (response.status === 404 || response.status === 410) return { outcome: { kind: "gone" }, metrics: { httpStatus } };
    if (!response.ok) return { outcome: { kind: "temporary_failure", reason: `HTTP ${response.status}` }, metrics: { httpStatus } };

    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_000_000) return { outcome: { kind: "temporary_failure", reason: "Response over 2 MB" }, metrics: { httpStatus } };

    const body = await boundedText(response);
    bytesFetched = Buffer.byteLength(body, "utf8");
    if (classifyAccessFailure(response, body.slice(0, 5000)) === "challenge") {
      return { outcome: { kind: "blocked", reason: "Challenge response" }, metrics: { httpStatus, bytesFetched } };
    }

    const contentType = response.headers.get("content-type") || "";
    return {
      outcome: driver.parseResponse(job, body, contentType, defaultDriverContext),
      metrics: { httpStatus, bytesFetched }
    };
  } catch (error) {
    if (authoritySignal?.aborted) {
      throw new Error("Fetch cancelled because coordinator authority was lost");
    }
    if (error instanceof UnsafeMetadataTarget) {
      return { outcome: { kind: "blocked", reason: error.message.slice(0, 300) }, metrics: {} };
    }
    return { outcome: { kind: "temporary_failure", reason: String(error).slice(0, 300) }, metrics: {} };
  }
}

/**
 * Executes a leased fetch deterministically via the platform's registered SourceDriver strategy.
 */
export async function fetchJobOutcome(
  job: CrawlJob,
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
  authoritySignal?: AbortSignal,
  options?: { githubToken?: string }
): Promise<Outcome> {
  const { outcome } = await fetchJobOutcomeWithMetrics(job, fetcher, authoritySignal, options);
  return outcome;
}
