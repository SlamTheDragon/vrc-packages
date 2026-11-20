import { unescapeHtml } from "vrc-packages-network/catalog-hygiene";

/**
 * Cleans single author name:
 * Strips HTML tags, parentheticals, social handles (@...), and whitespace.
 */
export function cleanAuthorName(rawName: string): string {
  if (!rawName) return "Unknown";
  let a = unescapeHtml(rawName).normalize("NFKC");
  a = a.replace(/<[^>]+>/g, "").replace(/\([^)]+\)/g, "");
  if (/^\s*[@#]/.test(a)) {
    a = a.replace(/^\s*[@#]+/, "");
  } else {
    a = a.replace(/\s+[@#].*$/, "");
  }
  a = a.replace(/\s+/g, " ").trim();
  return a.length > 0 ? a : "Unknown";
}

/**
 * Cleans and normalizes product description at front stage:
 * 1. Unescapes HTML entities
 * 2. Strips markdown image embeds (![...](...))
 * 3. Strips raw discord invites
 * 4. Normalizes whitespace while preserving paragraph line breaks
 */
export function cleanDescription(rawDesc: string): string {
  if (!rawDesc) return "";
  let desc = unescapeHtml(rawDesc);
  desc = desc.replace(/!\[.*?\]\(.*?\)/g, "").replace(/(?:https?:\/\/(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+)/gi, "").trim();
  // Normalize horizontal spaces within lines, and collapse excessive vertical blank lines
  desc = desc.replace(/[^\S\r\n]+/g, " ");
  desc = desc.replace(/\r\n/g, "\n");
  desc = desc.replace(/\n\s*\n\s*\n+/g, "\n\n");
  return desc.trim();
}
