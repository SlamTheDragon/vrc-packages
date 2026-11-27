import { describe, expect, spyOn, test } from "bun:test";
import {
  PLATFORM_BIT_MAP,
  encodeCapabilityCode,
  decodeCapabilityCode,
  formatCapabilityToken,
  parseCapabilityToken,
  isCapabilityToken
} from "../src/domain/security/capability_token.ts";
import { PlatformSchema, type Platform } from "vrc-packages-network/node";

describe("Capability Token Encoding and Decoding", () => {
  test("generates node-token entropy with portable Web Crypto", () => {
    const nativeRandom = crypto.getRandomValues.bind(crypto);
    const random = spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array!.byteLength).toBe(32);
      return nativeRandom(array);
    });
    try {
      const token = formatCapabilityToken(["vpm"]);
      expect(parseCapabilityToken(token)?.capabilities).toEqual(["vpm"]);
      expect(random).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
    }
  });

  test("PLATFORM_BIT_MAP covers all 9 V0 PlatformSchema options without curated or bit collisions", () => {
    const seenBits = new Set<number>();
    expect(PlatformSchema.options).toHaveLength(9);
    expect(PlatformSchema.options as readonly string[]).not.toContain("curated");
    for (const platform of PlatformSchema.options) {
      const bit = PLATFORM_BIT_MAP[platform];
      expect(bit).toBeDefined();
      expect(bit).toBeGreaterThan(0);
      expect(seenBits.has(bit)).toBe(false);
      seenBits.add(bit);
    }
    expect(seenBits.size).toBe(9);
  });

  test("encodeCapabilityCode encodes single capability accurately", () => {
    expect(encodeCapabilityCode(["booth"])).toBe("0001");
    expect(encodeCapabilityCode(["github"])).toBe("0002");
    expect(encodeCapabilityCode(["vpm"])).toBe("0004");
    expect(encodeCapabilityCode(["gumroad"])).toBe("0008");
    expect(encodeCapabilityCode(["shopify"])).toBe("0040");
    expect(encodeCapabilityCode(["sellfy"])).toBe("0080");
    expect(encodeCapabilityCode(["custom_domain"])).toBe("0100");
  });

  test("encodeCapabilityCode encodes multiple capabilities as bitwise OR up to 01ff", () => {
    // vpm (4) + github (2) = 6
    expect(encodeCapabilityCode(["vpm", "github"])).toBe("0006");
    // booth (1) + shopify (64 = 0x40) = 65 = 0x41
    expect(encodeCapabilityCode(["booth", "shopify"])).toBe("0041");
    // booth (1) + sellfy (128 = 0x80) = 129 = 0x81
    expect(encodeCapabilityCode(["booth", "sellfy"])).toBe("0081");
    // All 9 platforms: 0x01ff
    expect(encodeCapabilityCode(PlatformSchema.options)).toBe("01ff");
  });

  test("decodeCapabilityCode round-trips correctly", () => {
    for (const platform of PlatformSchema.options) {
      const code = encodeCapabilityCode([platform]);
      const decoded = decodeCapabilityCode(code);
      expect(decoded).toEqual([platform]);
    }

    const multi: Platform[] = ["vpm", "booth", "shopify"];
    const code = encodeCapabilityCode(multi);
    const decoded = decodeCapabilityCode(code);
    expect(decoded?.sort()).toEqual(multi.sort());
  });

  test("decodeCapabilityCode returns null for invalid codes including stale 0200 and 03ff bits", () => {
    expect(decodeCapabilityCode("0000")).toBeNull();
    expect(decodeCapabilityCode("0200")).toBeNull(); // Former bit 9 (curated) removed in V0
    expect(decodeCapabilityCode("03ff")).toBeNull(); // Sets removed upper bit 0x0200
    expect(decodeCapabilityCode("ffff")).toBeNull(); // Has bits above 0x01ff
    expect(decodeCapabilityCode("xyz1")).toBeNull(); // Non-hex
    expect(decodeCapabilityCode("001")).toBeNull(); // Too short
    expect(decodeCapabilityCode("00001")).toBeNull(); // Too long
  });

  test("formatCapabilityToken and parseCapabilityToken round-trip in vrcp_<auth_token><capability> format", () => {
    const caps: Platform[] = ["vpm", "github"];
    const token = formatCapabilityToken(caps);
    expect(isCapabilityToken(token)).toBe(true);
    expect(token.startsWith("vrcp_")).toBe(true);
    expect(token.endsWith("0006")).toBe(true);
    expect(token.length).toBe(73); // 5 (vrcp_) + 64 (entropy) + 4 (code)

    const parsed = parseCapabilityToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.code).toBe("0006");
    expect(parsed!.capabilities.sort()).toEqual(caps.sort());
    expect(parsed!.entropy.length).toBe(64);
  });

  test("parseCapabilityToken rejects tampered or invalid tokens", () => {
    expect(parseCapabilityToken("invalid-token")).toBeNull();
    expect(parseCapabilityToken("vrcp_" + "a".repeat(64) + "0000")).toBeNull(); // 0000 has 0 caps
    expect(parseCapabilityToken("vrcp_" + "a".repeat(64) + "0200")).toBeNull(); // removed upper bit
    expect(parseCapabilityToken("vrcp_" + "a".repeat(64) + "ffff")).toBeNull(); // ffff has invalid bits
    expect(parseCapabilityToken("vrcp_" + "a".repeat(32) + "0004")).toBeNull(); // short entropy
    expect(parseCapabilityToken("vrc_cap_0004_" + "a".repeat(64))).toBeNull(); // legacy format purged
  });
});
