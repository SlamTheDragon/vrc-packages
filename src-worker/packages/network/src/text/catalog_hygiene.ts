const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  yen: "\u00a5",
  euro: "\u20ac",
  pound: "\u00a3",
  times: "\u00d7",
  middot: "\u00b7",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d"
};

const HTML_ENTITY_REGEX = /&#(\d+);|&#[xX]([0-9a-fA-F]+);|&([a-zA-Z]+);/g;

function decodeCodePoint(raw: string, radix: 10 | 16, fallback: string): string {
  const cp = Number.parseInt(raw, radix);
  if (Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)) {
    return String.fromCodePoint(cp);
  }
  return fallback;
}

/**
 * Unescapes decimal numeric, hex numeric, and supported named HTML entities in a single pass.
 * Single-pass replacement guarantees entities such as `&amp;lt;` decode once to `&lt;`.
 */
export function unescapeHtml(text: string): string {
  if (!text) return "";
  return text.replace(HTML_ENTITY_REGEX, (fullMatch, dec?: string, hex?: string, named?: string) => {
    if (dec !== undefined) {
      return decodeCodePoint(dec, 10, fullMatch);
    }
    if (hex !== undefined) {
      return decodeCodePoint(hex, 16, fullMatch);
    }
    if (named !== undefined && Object.hasOwn(NAMED_HTML_ENTITIES, named)) {
      return NAMED_HTML_ENTITIES[named];
    }
    return fullMatch;
  });
}

/**
 * Extracts non-empty trimmed inner tokens from `【...】`, `[...]`, and `（...）`/`(...)`
 * after HTML unescaping and NFKC normalization, preserving first-seen order without duplicates.
 */
export function extractBracketTokens(rawTitle: string): string[] {
  if (!rawTitle) return [];
  const normalized = unescapeHtml(rawTitle).normalize("NFKC");
  const tokens: string[] = [];
  const seen = new Set<string>();
  const bracketRegex = /【([^】]*)】|\[([^\]]*)\]|[（(]([^）)]*)[）)]/g;
  for (const match of normalized.matchAll(bracketRegex)) {
    const inner = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (inner && !seen.has(inner)) {
      seen.add(inner);
      tokens.push(inner);
    }
  }
  return tokens;
}

/**
 * Common promotional / marketing brackets and prefixes found in Japanese and Western listings
 */
const CATEGORY_PROMO_TOKENS = "VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け";
const STATUS_PROMO_TOKENS = "無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式";
const INLINE_PROMO_TOKENS = "VRC(?:hat)?|Unity|3Dモデル|3D衣装|無料|FREE|Free|Sale|セール|VerUP|早急用";

function balancedPromoRegex(tokens: string, anchor: "start" | "end" | "any"): RegExp {
  const pair = `(?:【(?:${tokens})】|\\[(?:${tokens})\\]|\\((?:${tokens})\\)|（(?:${tokens})）)`;
  if (anchor === "start") return new RegExp(`^${pair}\\s*`, "gi");
  if (anchor === "end") return new RegExp(`\\s*${pair}$`, "gi");
  return new RegExp(`\\s*${pair}`, "gi");
}

export const MARKETING_BRACKETS = [
  balancedPromoRegex(CATEGORY_PROMO_TOKENS, "start"),
  balancedPromoRegex(CATEGORY_PROMO_TOKENS, "end"),
  new RegExp(`^(?:${STATUS_PROMO_TOKENS})\\s+`, "gi"),
  balancedPromoRegex(STATUS_PROMO_TOKENS, "start"),
  balancedPromoRegex(STATUS_PROMO_TOKENS, "end"),
  balancedPromoRegex(INLINE_PROMO_TOKENS, "any")
];

/**
 * Normalizes storefront listing title:
 * 1. Unescape HTML entities and apply NFKC normalization
 * 2. When `options.preserveBrackets` is true, return whitespace-collapsed text preserving brackets
 * 3. Otherwise strip decorative / marketing bracket boilerplate and trailing version numbers
 * 4. Collapse whitespace
 */
export function cleanTitle(rawTitle: string, options?: { preserveBrackets?: boolean }): string {
  if (!rawTitle) return "";
  const normalized = unescapeHtml(rawTitle).normalize("NFKC");
  if (options?.preserveBrackets === true) {
    return normalized.replace(/\s+/g, " ").trim();
  }
  let title = normalized;
  for (let i = 0; i < 3; i++) {
    for (const pat of MARKETING_BRACKETS) {
      title = title.replace(pat, " ");
    }
  }
  // Remove decorative CJK brackets content if boilerplate
  title = title
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[（(][^）)]*[）)]/g, " ");
  title = title.replace(/\s+v?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s*beta|\s*alpha)?$/i, "");
  title = title.replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : unescapeHtml(rawTitle).trim();
}

/**
 * Outbound Link Hygiene (LEGAL.md Section 4.3):
 * Strips tracking parameters, session identifiers, and third-party affiliate tokens from outbound links.
 */
export function cleanTrackingParams(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  try {
    const url = new URL(urlStr);
    const trackingExact = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "aff", "affiliate", "fbclid", "gclid", "token", "source",
      "msclkid", "twclid", "igshid", "mc_eid", "_ga", "_gl", "spm", "si",
      "session_id", "feature"
    ]);
    const keysToDelete: string[] = [];
    for (const key of url.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (trackingExact.has(lower) || lower.startsWith("utm_") || lower.startsWith("aff_") || lower.startsWith("ref_")) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      url.searchParams.delete(key);
    }
    let res = url.href;
    if (!urlStr.endsWith("/") && res.endsWith("/") && url.pathname === "/") {
      res = res.slice(0, -1);
    }
    return res;
  } catch {
    return urlStr;
  }
}
