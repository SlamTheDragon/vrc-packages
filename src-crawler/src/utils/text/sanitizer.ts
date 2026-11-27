import { htmlSanitizer } from "../../pipeline/html_sanitizer.ts";

/**
 * Cleans single author name:
 * Strips HTML tags, parentheticals, social handles (@...), and whitespace.
 */
export function cleanAuthorName(rawName: string): string {
  return htmlSanitizer.sanitizeAuthor(rawName);
}

/**
 * Cleans and normalizes product description at front stage:
 * Strips markup, unescapes HTML entities, removes markdown image embeds and Discord invites,
 * and compacts whitespace while preserving paragraph line breaks.
 */
export function cleanDescription(rawDesc: string): string {
  return htmlSanitizer.sanitizeText(rawDesc);
}
