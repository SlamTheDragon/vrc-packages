import type { CrawlJob, Platform, ResultRequest } from "vrc-packages-network/node";
import type { HtmlSanitizerPipeline } from "../pipeline/html_sanitizer.ts";
import type { PaginationController } from "../pipeline/pagination_controller.ts";
import type { SemanticPatternEngine } from "../pipeline/semantic_engine.ts";
import type { VpmQualityAnalyzer } from "../pipeline/vpm_quality_analyzer.ts";

export type DriverOutcome = ResultRequest["outcome"];

export interface DriverContext {
  sanitizer: HtmlSanitizerPipeline;
  semantic: SemanticPatternEngine;
  vpmAnalyzer: VpmQualityAnalyzer;
  pagination: PaginationController;
}

export interface DriverFetchOptions {
  githubToken?: string;
}

/**
 * Strategy interface for each Version 0 crawl platform driver.
 */
export interface SourceDriver {
  readonly platform: Platform;

  /**
   * Validates that a leased job conforms to platform URL and purpose rules before any network I/O.
   * Returns null when valid, or a non-empty rejection reason for `{ kind: "blocked", reason }`.
   */
  validateTarget(job: CrawlJob): string | null;

  /**
   * Builds platform-matched HTTP request headers (never leaking tokens across third-party origins).
   */
  buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    options?: DriverFetchOptions
  ): Record<string, string>;

  /**
   * Parses a successful (HTTP 2xx) response body into a bounded coordinator ResultOutcome.
   */
  parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome;
}
