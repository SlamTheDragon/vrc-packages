import { PlatformSchema, type Platform } from "./protocol/node_protocol.ts";

/**
 * Compact 9-platform bitmask mapping for node capabilities (`0x01ff`).
 * Preserves 1-to-1 correspondence between bit position and Platform enum.
 */
export const PLATFORM_BIT_MAP: Readonly<Record<Platform, number>> = {
  booth: 1 << 0,         // 0x0001
  github: 1 << 1,        // 0x0002
  vpm: 1 << 2,           // 0x0004
  gumroad: 1 << 3,       // 0x0008
  jinxxy: 1 << 4,        // 0x0010
  itch: 1 << 5,          // 0x0020
  shopify: 1 << 6,       // 0x0040
  sellfy: 1 << 7,        // 0x0080
  custom_domain: 1 << 8  // 0x0100
};

export const ALL_CAPABILITIES_MASK = (1 << 9) - 1; // 0x01ff

/**
 * Version 0 node token format: vrcp_<auth_token><capability>
 *  - vrcp_ prefix (5 chars)
 *  - 64 hex characters cryptographic entropy
 *  - 4 hex characters capability bitmask code
 */
export const CAPABILITY_TOKEN_REGEX = /^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$/;

export interface ParsedCapabilityToken {
  capabilities: Platform[];
  code: string;
  entropy: string;
}

/**
 * Encodes a non-empty array of supported platform capabilities into a 4-hex-digit code.
 * Throws explicitly on empty capability sets or unsupported platform identifiers.
 */
export function encodeCapabilityCode(capabilities: readonly Platform[]): string {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new Error("At least one platform capability is required");
  }
  let mask = 0;
  for (const cap of capabilities) {
    if (typeof cap !== "string" || !Object.hasOwn(PLATFORM_BIT_MAP, cap)) {
      throw new Error(`Unsupported platform capability: ${String(cap)}`);
    }
    mask |= PLATFORM_BIT_MAP[cap as Platform];
  }
  if (mask <= 0 || (mask & ~ALL_CAPABILITIES_MASK) !== 0) {
    throw new Error("Capability bitmask must be non-zero within supported platforms");
  }
  return mask.toString(16).padStart(4, "0").toLowerCase();
}

/**
 * Decodes a 4-hex-digit capability code into an array of Platform capabilities.
 * Returns null if the code is invalid, zero, or sets unsupported upper bits.
 */
export function decodeCapabilityCode(code: string): Platform[] | null {
  if (typeof code !== "string" || !/^[0-9a-fA-F]{4}$/.test(code)) return null;
  const mask = Number.parseInt(code, 16);
  if (!Number.isInteger(mask) || mask <= 0 || (mask & ~ALL_CAPABILITIES_MASK) !== 0) return null;

  const result: Platform[] = [];
  for (const platform of PlatformSchema.options) {
    const bit = PLATFORM_BIT_MAP[platform];
    if ((mask & bit) !== 0) {
      result.push(platform);
    }
  }
  return result.length > 0 ? result : null;
}

/**
 * Checks if a bearer token matches the capability-encoded node token grammar.
 */
export function isCapabilityToken(token: string): boolean {
  return typeof token === "string" && CAPABILITY_TOKEN_REGEX.test(token);
}

/**
 * Formats a capability token: vrcp_<auth_token><capability>.
 * Throws explicitly when caller-supplied entropyHex is not a 64-hex string.
 */
export function formatCapabilityToken(
  capabilities: readonly Platform[],
  entropyHex?: string
): string {
  const code = encodeCapabilityCode(capabilities);
  let entropy: string;
  if (entropyHex !== undefined) {
    if (typeof entropyHex !== "string" || !/^[0-9a-fA-F]{64}$/.test(entropyHex)) {
      throw new Error("entropyHex must be a 64-character hexadecimal string");
    }
    entropy = entropyHex.toLowerCase();
  } else {
    entropy = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0")
    ).join("");
  }
  return `vrcp_${entropy}${code}`;
}

/**
 * Parses and validates a capability token, extracting its decoded capabilities, code, and entropy.
 */
export function parseCapabilityToken(token: string): ParsedCapabilityToken | null {
  if (typeof token !== "string") return null;
  const match = CAPABILITY_TOKEN_REGEX.exec(token);
  if (!match) return null;

  const entropy = match[1].toLowerCase();
  const code = match[2].toLowerCase();

  const capabilities = decodeCapabilityCode(code);
  if (!capabilities) return null;
  return { capabilities, code, entropy };
}
