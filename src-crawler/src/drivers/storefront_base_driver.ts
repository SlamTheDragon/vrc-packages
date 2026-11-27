import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import type { CrawlJob, Observation, Platform } from "vrc-packages-network/node";
import { isStorefrontProductTarget } from "vrc-packages-network/source-targets";
import type { DriverContext, DriverFetchOptions, DriverOutcome, SourceDriver } from "./source_driver.ts";

export interface StorefrontOwnerIdentity {
  ownerKey: string | null;
  ownerName: string | null;
}

export interface ParsedPriceInfo {
  price: number | null;
  currency: string | null;
  availability: "available" | "delisted" | "unknown";
}

function normalizedIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isProductType(typeValue: unknown): boolean {
  if (typeof typeValue === "string") return /Product|SoftwareApplication/i.test(typeValue);
  if (Array.isArray(typeValue)) return typeValue.some((item) => typeof item === "string" && /Product|SoftwareApplication/i.test(item));
  return false;
}

/**
 * Shared Template Method base class for all public HTML storefront product drivers.
 */
export abstract class StorefrontHtmlDriver implements SourceDriver {
  public abstract readonly platform: Platform;

  public validateTarget(job: CrawlJob): string | null {
    if (job.purpose !== "metadata") {
      return `${this.platform} requires metadata purpose`;
    }
    return isStorefrontProductTarget(this.platform, job.url)
      ? null
      : `${this.platform} metadata requires a valid product URL`;
  }

  public buildRequestHeaders(
    job: CrawlJob,
    userAgent: string,
    _options?: DriverFetchOptions
  ): Record<string, string> {
    return {
      "user-agent": userAgent,
      "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
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
    const observation = this.parseProductHtml(job, body, contentType, context);
    return observation
      ? { kind: "changed", observation }
      : { kind: "temporary_failure", reason: "No item observation in response" };
  }

  /**
   * Parses HTML product metadata into a schema-validated Observation while preserving identity
   * bounds (`sourceItemKey = host + pathname`) and running SemanticPatternEngine before trimming.
   */
  public parseProductHtml(
    job: CrawlJob,
    body: string,
    contentType: string,
    context: DriverContext
  ): Observation | null {
    if (contentType && contentType.includes("json")) return null;
    if (!isStorefrontProductTarget(this.platform, job.url)) return null;

    let requested: URL;
    try {
      requested = new URL(job.url);
    } catch {
      return null;
    }

    const sourceItemKey = `${requested.host}${requested.pathname}`;
    if (sourceItemKey.length > 200) return null;

    const $ = cheerio.load(body);
    const meta = (key: string) =>
      $(`meta[property="${key}"],meta[name="${key}"]`).first().attr("content")?.trim() || "";

    const jsonLd = this.extractMatchingJsonLd($, job.url, requested);
    const jsonLdAuthor = asObject(jsonLd?.brand)?.name ?? asObject(jsonLd?.author)?.name;

    const rawTitle = String(
      jsonLd?.name ||
        meta("og:title") ||
        $(".item-name, .product-title, [data-product-title]").first().text() ||
        $("h1").first().text() ||
        ""
    ).trim();
    if (!rawTitle) return null;

    const rawAuthor = String(
      jsonLdAuthor ||
        $(".shop-name, .user-name, .creator-name, .author-name").first().text() ||
        meta("author") ||
        "Unknown"
    ).trim();
    const author = context.sanitizer.sanitizeAuthor(rawAuthor).slice(0, 300);

    const rawSummary = String(
      jsonLd?.description ||
        meta("og:description") ||
        $(".item-description, .js-item-description, .description-text, .product-description").first().text() ||
        meta("description") ||
        ""
    ).trim();
    const cleanSummary = context.sanitizer.sanitizeText(rawSummary).slice(0, 1024);

    const descLinks = $(".item-description a[href], .js-item-description a[href], .description-text a[href], .product-description a[href]")
      .toArray()
      .map((el) => $(el).attr("href"));
    const outboundLinks = context.sanitizer.collectHttpsLinks(
      [jsonLd?.url, job.url, ...descLinks],
      job.url,
      { stripBinaries: true }
    );

    const rawTags = this.extractRawTags($, jsonLd, meta);
    const semantic = context.semantic.analyze({
      platform: this.platform,
      url: job.url,
      rawTitle,
      cleanSummary,
      rawTags,
      outboundLinks
    });
    if (!semantic.normalizedTitle) return null;

    const priceInfo = this.extractPriceInfo($, jsonLd, meta);
    const owner = this.deriveOwner(requested, $, jsonLd, author);
    const originUpdatedAt =
      normalizedIsoDate(jsonLd?.dateModified) || normalizedIsoDate(meta("article:modified_time"));

    return {
      sourceItemKey,
      title: semantic.normalizedTitle,
      author,
      summary: cleanSummary,
      outboundLinks,
      originUpdatedAt,
      price: priceInfo.price,
      currency: priceInfo.currency,
      availability: priceInfo.availability,
      storefrontUrl: cleanTrackingParams(job.url),
      ...(semantic.platformTags !== undefined ? { platformTags: semantic.platformTags } : {}),
      ...(owner.ownerKey ? { ownerKey: owner.ownerKey } : {}),
      ...(owner.ownerName ? { ownerName: owner.ownerName } : {}),
      ...(semantic.avatarCompatibilities.length > 0
        ? { avatarCompatibilities: semantic.avatarCompatibilities }
        : {}),
      ...(semantic.desktopToolEvidence !== null
        ? { desktopToolEvidence: semantic.desktopToolEvidence }
        : {}),
      vrchatRelevance: semantic.vrchatRelevance
    };
  }

  protected deriveOwner(
    requested: URL,
    _$: CheerioAPI,
    _jsonLd: Record<string, unknown> | null,
    cleanAuthor: string
  ): StorefrontOwnerIdentity {
    return {
      ownerKey: `${this.platform}:${requested.hostname.toLowerCase()}`,
      ownerName: cleanAuthor !== "Unknown" ? cleanAuthor : null
    };
  }

  protected extractPriceInfo(
    $: CheerioAPI,
    jsonLd: Record<string, unknown> | null,
    meta: (key: string) => string
  ): ParsedPriceInfo {
    const rawOffers = jsonLd?.offers;
    const offer = Array.isArray(rawOffers) ? asObject(rawOffers[0]) : asObject(rawOffers);

    let price = this.parsePriceNumber(offer?.price ?? offer?.lowPrice ?? meta("product:price:amount") ?? meta("og:price:amount"));
    let currency = this.parseCurrencyCode(offer?.priceCurrency ?? meta("product:price:currency") ?? meta("og:price:currency"));

    if (price === null) {
      const domPriceText = this.selectDomPriceText($);
      if (domPriceText) {
        price = this.parsePriceNumber(domPriceText);
        if (!currency) {
          currency = this.inferCurrencySymbol(domPriceText);
        }
      }
    }

    const availRaw = String(offer?.availability ?? meta("product:availability") ?? "").toLowerCase();
    let availability: ParsedPriceInfo["availability"] = "unknown";
    if (availRaw.includes("instock") || availRaw.includes("onlineonly") || availRaw.includes("preorder")) {
      availability = "available";
    } else if (availRaw.includes("outofstock") || availRaw.includes("discontinued") || availRaw.includes("soldout")) {
      availability = "delisted";
    } else if (this.hasDelistedMarker($)) {
      availability = "delisted";
    } else if (price !== null || offer !== null) {
      availability = "available";
    }

    return { price, currency, availability };
  }

  protected selectDomPriceText($: CheerioAPI): string {
    return $(".variation-price, .item-price, .product-price, [data-price]").first().text().trim();
  }

  protected hasDelistedMarker($: CheerioAPI): boolean {
    const badgeText = $(".sold-out, .out-of-stock, .item-unavailable").first().text().toLowerCase();
    return /\b(?:sold\s*out|out\s*of\s*stock|unavailable|delisted)\b/.test(badgeText);
  }

  protected defaultCurrency(): string | null {
    return null;
  }

  private extractMatchingJsonLd(
    $: CheerioAPI,
    jobUrl: string,
    requested: URL
  ): Record<string, unknown> | null {
    const blocks: Record<string, unknown>[] = [];
    for (const node of $("script[type='application/ld+json']").toArray()) {
      try {
        const parsed: unknown = JSON.parse($(node).html() || "null");
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          const obj = asObject(item);
          if (!obj) continue;
          if (Array.isArray(obj["@graph"])) {
            for (const graphNode of obj["@graph"]) {
              const graphObj = asObject(graphNode);
              if (graphObj) blocks.push(graphObj);
            }
          }
          blocks.push(obj);
        }
      } catch {
        // Ignore malformed JSON-LD blocks on public storefronts
      }
    }

    return (
      blocks.find((value) => {
        if (!isProductType(value["@type"])) return false;
        if (!value.url) return true;
        try {
          const claimed = new URL(String(value.url), jobUrl);
          return claimed.origin === requested.origin && claimed.pathname === requested.pathname;
        } catch {
          return false;
        }
      }) ?? null
    );
  }

  private extractRawTags(
    $: CheerioAPI,
    jsonLd: Record<string, unknown> | null,
    meta: (key: string) => string
  ): string[] {
    const extracted: string[] = [];
    const rawKeywords = jsonLd?.keywords ?? meta("keywords");
    if (Array.isArray(rawKeywords)) {
      for (const item of rawKeywords) {
        if (typeof item === "string" && item.trim()) extracted.push(item.trim());
      }
    } else if (typeof rawKeywords === "string" && rawKeywords.trim()) {
      extracted.push(...rawKeywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean));
    }

    for (const el of $(".item-tags a, .tag-list a, .tags a, .tag a").toArray()) {
      const tag = $(el).text().trim();
      if (tag) extracted.push(tag);
    }
    return extracted;
  }

  private parsePriceNumber(value: unknown): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) && value >= 0 ? value : null;
    }
    if (typeof value === "string") {
      const cleaned = value.replace(/[,\s]/g, "").match(/\d+(?:\.\d+)?/);
      if (!cleaned) return null;
      const num = Number.parseFloat(cleaned[0]);
      return Number.isFinite(num) && num >= 0 ? num : null;
    }
    return null;
  }

  private parseCurrencyCode(value: unknown): string | null {
    if (typeof value !== "string") return this.defaultCurrency();
    const code = value.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : this.defaultCurrency();
  }

  private inferCurrencySymbol(text: string): string | null {
    if (/[¥￥]|\bJPY\b|円/.test(text)) return "JPY";
    if (/\bEUR\b|€/.test(text)) return "EUR";
    if (/\bGBP\b|£/.test(text)) return "GBP";
    if (/\bUSD\b/.test(text)) return "USD";
    return this.defaultCurrency();
  }
}
