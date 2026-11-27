import { cleanTrackingParams, unescapeHtml } from "vrc-packages-network/catalog-hygiene";
import { hasArchiveBinaryExtension, isArchiveOrBinaryUrl } from "vrc-packages-network/source-targets";

export interface SanitizeUrlOptions {
  stripBinaries?: boolean;
}

export interface CollectLinksOptions extends SanitizeUrlOptions {
  max?: number;
}

const MAX_OUTBOUND_LINKS = 100;

/**
 * Ordered five-stage HTML, text, author, and URL sanitizer shared across all crawler drivers.
 */
export class HtmlSanitizerPipeline {
  /**
   * Strips active/block markup, decodes HTML entities in a single pass, normalizes Unicode
   * compatibility forms (NFKC), removes Discord invite/image markdown noise, and compacts spacing.
   */
  public sanitizeText(raw: string): string {
    if (!raw || typeof raw !== "string") return "";

    let text = raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ");

    text = unescapeHtml(text);

    // Strip any HTML tags revealed after single-pass entity decoding.
    text = text
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "");

    text = text.normalize("NFKC");
    text = text
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/(?:https?:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+)/gi, "");

    text = text.replace(/[^\S\r\n]+/g, " ");
    text = text.replace(/\r\n/g, "\n");
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
    text = text.replace(/\n\s*\n\s*\n+/g, "\n\n");
    return text.trim();
  }

  /**
   * Normalizes creator/author display names, stripping HTML tags, parentheticals, and social handles.
   */
  public sanitizeAuthor(rawName: string): string {
    if (!rawName || typeof rawName !== "string") return "Unknown";
    let author = unescapeHtml(rawName).normalize("NFKC");
    author = author.replace(/<[^>]+>/g, "").replace(/\([^)]+\)/g, "");
    if (/^\s*[@#]/.test(author)) {
      author = author.replace(/^\s*[@#]+/, "");
    } else {
      author = author.replace(/\s+[@#].*$/, "");
    }
    author = author.replace(/\s+/g, " ").trim();
    return author.length > 0 ? author : "Unknown";
  }

  /**
   * Resolves a raw relative or absolute URL to a clean public HTTPS URL, stripping tracking params
   * and rejecting prohibited binary/archive targets by default.
   */
  public resolveSafeHttpsUrl(
    rawUrl: unknown,
    baseUrl?: string,
    options: SanitizeUrlOptions = {}
  ): string | null {
    if (typeof rawUrl !== "string") return null;
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    let parsed: URL;
    try {
      parsed = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    } catch {
      return null;
    }

    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    if (parsed.port && parsed.port !== "443") {
      return null;
    }

    const cleaned = cleanTrackingParams(parsed.href);
    try {
      const cleanedUrl = new URL(cleaned);
      if (cleanedUrl.protocol !== "https:") return null;
      if (options.stripBinaries !== false) {
        if (hasArchiveBinaryExtension(cleanedUrl.pathname) || isArchiveOrBinaryUrl(cleaned)) {
          return null;
        }
      }
      if (!trimmed.endsWith("/") && cleaned.endsWith("/") && cleanedUrl.pathname === "/" && !cleanedUrl.search) {
        return cleaned.slice(0, -1);
      }
      return cleanedUrl.href;
    } catch {
      return null;
    }
  }

  /**
   * Collects deduplicated, binary-free HTTPS outbound links bounded to the protocol limit.
   */
  public collectHttpsLinks(
    values: readonly unknown[],
    baseUrl?: string,
    options: CollectLinksOptions = {}
  ): string[] {
    const limit = Math.max(0, Math.min(options.max ?? MAX_OUTBOUND_LINKS, MAX_OUTBOUND_LINKS));
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values) {
      const resolved = this.resolveSafeHttpsUrl(value, baseUrl, options);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      out.push(resolved);
      if (out.length >= limit) break;
    }

    return out;
  }
}

export const htmlSanitizer = new HtmlSanitizerPipeline();
