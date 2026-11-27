import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import type { CrawlJob, DiscoveryLead } from "vrc-packages-network/node";
import {
  boothItemIdentity,
  isBoothBrowseTarget,
  isCustomDomainProductTarget,
  isGumroadBrowseTarget,
  isGumroadProductTarget,
  isItchProductTarget,
  isItchTagTarget,
  isJinxxyBrowseTarget,
  isJinxxyProductTarget,
  isSellfyProductTarget,
  isShopifyProductSitemapTarget,
  shopifyProductLead
} from "vrc-packages-network/source-targets";
import type { DriverContext, DriverFetchOptions, DriverOutcome } from "./source_driver.ts";
import { StorefrontHtmlDriver, type StorefrontOwnerIdentity } from "./storefront_base_driver.ts";

function canonicalCleanHref(rawHref: string, baseUrl: string): string | null {
  try {
    const target = new URL(rawHref, baseUrl);
    if (target.protocol !== "https:" || target.username || target.password || target.port) return null;
    target.search = "";
    target.hash = "";
    return target.href;
  } catch {
    return null;
  }
}

function findNextPageHref($: CheerioAPI, baseUrl: string, selectors: string): string | null {
  const href = $(selectors).first().attr("href");
  if (!href) return null;
  try {
    const resolved = new URL(href, baseUrl);
    if (resolved.protocol !== "https:" || resolved.username || resolved.password || resolved.port) return null;
    resolved.hash = "";
    return cleanTrackingParams(resolved.href);
  } catch {
    return null;
  }
}

/**
 * BOOTH discovery (`/ja/browse/...`) and item metadata (`booth.pm` & `*.booth.pm`).
 */
export class BoothDriver extends StorefrontHtmlDriver {
  public readonly platform = "booth" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "discovery") {
      return isBoothBrowseTarget(job.url) ? null : "BOOTH discovery requires a browse URL";
    }
    return boothItemIdentity(job.url) ? null : "BOOTH metadata requires an item URL";
  }

  public override buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    _options?: DriverFetchOptions
  ): Record<string, string> {
    return {
      "user-agent": userAgent,
      "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      ...(job.etag ? { "if-none-match": job.etag } : {}),
      ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
    };
  }

  public override parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    if (job.purpose === "discovery") {
      if (!contentType.toLowerCase().includes("text/html")) {
        return { kind: "temporary_failure", reason: "BOOTH browse response was not HTML" };
      }
      const parsed = this.parseBrowsePage(job, body);
      if (!parsed) {
        return { kind: "temporary_failure", reason: "BOOTH browse failed target validation" };
      }
      return context.pagination.buildDiscoveryOutcome(
        job,
        parsed.leads,
        parsed.nextPageCandidate,
        isBoothBrowseTarget
      );
    }
    return super.parseResponse(job, body, contentType, context);
  }

  public parseBrowsePage(
    job: CrawlJob,
    body: string
  ): { leads: DiscoveryLead[]; nextPageCandidate: string | null } | null {
    if (job.platform !== "booth" || job.purpose !== "discovery" || !isBoothBrowseTarget(job.url)) {
      return null;
    }
    const $ = cheerio.load(body);
    const ids = new Set<string>();
    for (const el of $("a[href]").toArray()) {
      const href = $(el).attr("href");
      if (!href) continue;
      const cleaned = canonicalCleanHref(href, job.url);
      if (!cleaned) continue;
      const id = boothItemIdentity(cleaned);
      if (!id) continue;
      ids.add(id);
    }
    const nextPageCandidate = findNextPageHref(
      $,
      job.url,
      "a.nav-item.next-page[href], a[rel='next'][href]"
    );
    return {
      leads: [...ids].map((id) => ({ kind: "storefront_product", url: `https://booth.pm/ja/items/${id}` })),
      nextPageCandidate
    };
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    const host = requested.hostname.toLowerCase();
    const subdomain = host.endsWith(".booth.pm") && host !== "booth.pm" ? host.slice(0, -".booth.pm".length) : null;
    const ownerKey = subdomain
      ? `booth:${subdomain}`
      : cleanAuthor !== "Unknown"
        ? `booth:${cleanAuthor.toLowerCase()}`
        : "booth:booth.pm";
    return {
      ownerKey,
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : subdomain
    };
  }

  protected override defaultCurrency(): string | null {
    return "JPY";
  }
}

/**
 * Gumroad discovery (`/discover`, `/vrchat`) and item metadata (`gumroad.com/l/:slug`, `*.gumroad.com/l/:slug`).
 */
export class GumroadDriver extends StorefrontHtmlDriver {
  public readonly platform = "gumroad" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "discovery") {
      return isGumroadBrowseTarget(job.url) ? null : "Gumroad discovery requires a discover or vrchat browse URL";
    }
    return isGumroadProductTarget(job.url) ? null : "Gumroad metadata requires a valid product URL";
  }

  public override parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    if (job.purpose === "discovery") {
      if (!contentType.toLowerCase().includes("text/html")) {
        return { kind: "temporary_failure", reason: "Gumroad browse response was not HTML" };
      }
      const $ = cheerio.load(body);
      const urls = new Set<string>();
      for (const el of $("a[href]").toArray()) {
        const href = $(el).attr("href");
        if (!href) continue;
        const cleaned = canonicalCleanHref(href, job.url);
        if (cleaned && isGumroadProductTarget(cleaned)) {
          urls.add(cleaned);
        }
      }
      const nextPageCandidate = findNextPageHref($, job.url, "a[rel='next'][href]");
      return context.pagination.buildDiscoveryOutcome(
        job,
        [...urls].map((url) => ({ kind: "storefront_product", url })),
        nextPageCandidate,
        isGumroadBrowseTarget
      );
    }
    return super.parseResponse(job, body, contentType, context);
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    const host = requested.hostname.toLowerCase();
    const sub = host.endsWith(".gumroad.com") ? host.slice(0, -".gumroad.com".length) : null;
    const ownerKey = sub
      ? `gumroad:${sub}`
      : cleanAuthor !== "Unknown"
        ? `gumroad:${cleanAuthor.toLowerCase()}`
        : "gumroad:gumroad.com";
    return { ownerKey, ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : sub };
  }
}

/**
 * Jinxxy XML sitemap / market catalog discovery and product metadata (`jinxxy.com/:creator/:slug`).
 */
export class JinxxyDriver extends StorefrontHtmlDriver {
  public readonly platform = "jinxxy" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "discovery") {
      return isJinxxyBrowseTarget(job.url) ? null : "Jinxxy discovery requires a sitemap or market browse URL";
    }
    return isJinxxyProductTarget(job.url) ? null : "Jinxxy metadata requires a valid product URL";
  }

  public override buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    _options?: DriverFetchOptions
  ): Record<string, string> {
    const isXmlTarget = job.purpose === "discovery" && job.url.toLowerCase().includes(".xml");
    return {
      "user-agent": userAgent,
      "accept": isXmlTarget
        ? "application/xml,text/xml;q=0.9,*/*;q=0.5"
        : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      ...(job.etag ? { "if-none-match": job.etag } : {}),
      ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
    };
  }

  public override parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    if (job.purpose === "discovery") {
      const isXml =
        job.url.toLowerCase().includes(".xml") ||
        /^(?:application|text)\/xml\b/i.test(contentType) ||
        body.trimStart().startsWith("<urlset") ||
        body.trimStart().startsWith("<?xml");

      if (isXml) {
        if (/<!DOCTYPE|<!ENTITY/i.test(body) || !/<\/urlset>\s*$/.test(body)) {
          return { kind: "temporary_failure", reason: "Jinxxy sitemap was malformed" };
        }
        const $ = cheerio.load(body, { xmlMode: true });
        if ($("urlset").length !== 1 || $("urlset").parent().length !== 0 || $("sitemapindex").length > 0) {
          return { kind: "temporary_failure", reason: "Jinxxy sitemap must be a single urlset" };
        }
        const urls = new Set<string>();
        for (const entry of $("urlset > url").toArray()) {
          const loc = $(entry).children("loc").first().text().trim();
          const cleaned = canonicalCleanHref(loc, job.url);
          if (cleaned && isJinxxyProductTarget(cleaned)) {
            urls.add(cleaned);
          }
        }
        return context.pagination.buildDiscoveryOutcome(
          job,
          [...urls].map((url) => ({ kind: "storefront_product", url })),
          null,
          isJinxxyBrowseTarget
        );
      }

      const $ = cheerio.load(body);
      const urls = new Set<string>();
      for (const el of $("a[href]").toArray()) {
        const href = $(el).attr("href");
        if (!href) continue;
        const cleaned = canonicalCleanHref(href, job.url);
        if (cleaned && isJinxxyProductTarget(cleaned)) {
          urls.add(cleaned);
        }
      }
      const nextPageCandidate = findNextPageHref($, job.url, "a[rel='next'][href]");
      return context.pagination.buildDiscoveryOutcome(
        job,
        [...urls].map((url) => ({ kind: "storefront_product", url })),
        nextPageCandidate,
        isJinxxyBrowseTarget
      );
    }
    return super.parseResponse(job, body, contentType, context);
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    const creator = requested.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? null;
    return {
      ownerKey: creator ? `jinxxy:${creator}` : "jinxxy:jinxxy.com",
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : creator
    };
  }
}

/**
 * itch.io tag discovery (hard-blocking `/search`) and creator subdomain metadata (`*.itch.io`).
 */
export class ItchDriver extends StorefrontHtmlDriver {
  public readonly platform = "itch" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "discovery") {
      return isItchTagTarget(job.url) ? null : "itch.io discovery requires a tag browse URL and prohibits /search";
    }
    return isItchProductTarget(job.url) ? null : "itch.io metadata requires a valid creator subdomain project URL";
  }

  public override parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    if (job.purpose === "discovery") {
      if (!contentType.toLowerCase().includes("text/html")) {
        return { kind: "temporary_failure", reason: "itch.io browse response was not HTML" };
      }
      const $ = cheerio.load(body);
      const urls = new Set<string>();
      for (const el of $("a[href]").toArray()) {
        const href = $(el).attr("href");
        if (!href) continue;
        const cleaned = canonicalCleanHref(href, job.url);
        if (cleaned && isItchProductTarget(cleaned)) {
          urls.add(cleaned);
        }
      }
      const nextPageCandidate = findNextPageHref($, job.url, "a.next_page[href], a[rel='next'][href]");
      return context.pagination.buildDiscoveryOutcome(
        job,
        [...urls].map((url) => ({ kind: "storefront_product", url })),
        nextPageCandidate,
        isItchTagTarget
      );
    }
    return super.parseResponse(job, body, contentType, context);
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    const host = requested.hostname.toLowerCase();
    const creator = host.endsWith(".itch.io") ? host.slice(0, -".itch.io".length) : host;
    return {
      ownerKey: `itch:${creator}`,
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : creator
    };
  }
}

/**
 * Shopify product sitemap discovery (`application/xml`) and merchant product HTML metadata (`text/html`).
 */
export class ShopifyDriver extends StorefrontHtmlDriver {
  public readonly platform = "shopify" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "discovery") {
      return isShopifyProductSitemapTarget(job.url) ? null : "Shopify discovery requires a product sitemap URL";
    }
    return shopifyProductLead(job.url, job.origin)
      ? null
      : "Shopify metadata requires a valid merchant product URL";
  }

  public override buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    _options?: DriverFetchOptions
  ): Record<string, string> {
    return {
      "user-agent": userAgent,
      "accept":
        job.purpose === "discovery"
          ? "application/xml,text/xml;q=0.9,*/*;q=0.5"
          : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
      ...(job.etag ? { "if-none-match": job.etag } : {}),
      ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
    };
  }

  public override parseResponse(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): DriverOutcome {
    if (job.purpose === "discovery") {
      if (!/^(?:application|text)\/xml\b/i.test(contentType || "")) {
        return { kind: "temporary_failure", reason: "Shopify sitemap response was not XML" };
      }
      const leads = this.parseSitemapLeads(job, body);
      if (!leads) {
        return {
          kind: "temporary_failure",
          reason: "Shopify product sitemap was malformed or exceeded allowed XML structure"
        };
      }
      return context.pagination.buildDiscoveryOutcome(job, leads, null, () => false);
    }
    return super.parseResponse(job, body, contentType, context);
  }

  public parseSitemapLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
    if (
      job.platform !== "shopify" ||
      job.purpose !== "discovery" ||
      !isShopifyProductSitemapTarget(job.url) ||
      /<!DOCTYPE|<!ENTITY/i.test(body) ||
      !/<\/urlset>\s*$/.test(body)
    ) {
      return null;
    }

    const $ = cheerio.load(body, { xmlMode: true });
    if ($("urlset").length !== 1 || $("urlset").parent().length !== 0 || $("sitemapindex").length > 0) {
      return null;
    }

    const urls = new Set<string>();
    for (const entry of $("urlset > url").toArray()) {
      const loc = $(entry).children("loc").first().text().trim();
      const product = shopifyProductLead(loc, job.origin);
      if (!product) continue;
      urls.add(product);
      if (urls.size >= 100) break;
    }
    return [...urls].map((url) => ({ kind: "storefront_product", url }));
  }
}

/**
 * Sellfy metadata driver (`sellfy.com` and custom Sellfy storefronts).
 */
export class SellfyDriver extends StorefrontHtmlDriver {
  public readonly platform = "sellfy" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "metadata" && !isSellfyProductTarget(job.url)) {
      return "Sellfy metadata requires a valid product URL";
    }
    return job.purpose === "metadata" ? null : "Sellfy supports metadata jobs only";
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    const match = /^\/([A-Za-z0-9_.-]+)\/p\//.exec(requested.pathname);
    const storeKey = match?.[1]?.toLowerCase() ?? requested.hostname.toLowerCase();
    return {
      ownerKey: `sellfy:${storeKey}`,
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : match?.[1] ?? null
    };
  }
}

/**
 * Custom creator domain metadata driver (`payhip.com`, custom VRChat shops, etc.).
 */
export class CustomDomainDriver extends StorefrontHtmlDriver {
  public readonly platform = "custom_domain" as const;

  public override validateTarget(job: CrawlJob): string | null {
    if (job.purpose === "metadata" && !isCustomDomainProductTarget(job.url)) {
      return "Custom domain metadata requires a valid path";
    }
    return job.purpose === "metadata" ? null : "Custom domain supports metadata jobs only";
  }

  protected override deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    return {
      ownerKey: `domain:${requested.hostname.toLowerCase()}`,
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : requested.hostname.toLowerCase()
    };
  }
}
