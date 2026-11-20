import { z } from "zod";

// 500 UTF-16 ID units need at most 3,000 JSON bytes, plus timestamp and keys.
// 8 KiB of base64url leaves room without accepting unbounded input.
export const CURSOR_TOKEN_MAX_LENGTH = 8192;
export const CursorTimestampSchema = z.string().datetime().max(128);
export const CursorTokenSchema = z.string().min(1).max(CURSOR_TOKEN_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

export function encodeCursor(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > Math.floor((CURSOR_TOKEN_MAX_LENGTH - 3) * 3 / 4)) {
    throw new RangeError("Cursor exceeds its wire budget");
  }
  // ASCII JSON already has an unambiguous byte representation. Mark UTF-8
  // otherwise: silently decoding old Latin-1 bytes as UTF-8 can change IDs.
  const prefix = /[^\x00-\x7f]/.test(json) ? "u1_" : "";
  const token = prefix + btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return CursorTokenSchema.parse(token);
}

export function decodeCursor<T>(value: string, schema: { parse(value: unknown): T }): T | null {
  if (!CursorTokenSchema.safeParse(value).success) return null;
  try {
    const utf8 = value.startsWith("u1_");
    const binary = atob((utf8 ? value.slice(3) : value).replaceAll("-", "+").replaceAll("_", "/"));
    if (!utf8 && /[^\x00-\x7f]/.test(binary)) return null;
    const text = utf8 ? new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, character => character.charCodeAt(0))) : binary;
    const cursor = schema.parse(JSON.parse(text));
    return encodeCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}
