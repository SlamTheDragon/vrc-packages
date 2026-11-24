import { describe, it, expect } from "bun:test";
import {
  NODE_TOKEN_REGEX,
  isNodeToken,
  formatAppToken,
  isAppToken,
  formatUserToken,
  isUserToken,
  isOperatorToken
} from "../src/auth/tokens.ts";

describe("src-package auth tokens", () => {
  it("validates crawler node tokens (vrcp_<64-hex><4-hex>)", () => {
    const hex64 = "a".repeat(64);
    const validLower = `vrcp_${hex64}01ff`;
    const validMixed = `vrcp_${"AbCdEf01".repeat(8)}01FF`;
    expect(validLower.length).toBe(73);
    expect(isNodeToken(validLower)).toBe(true);
    expect(isNodeToken(validMixed)).toBe(true);

    const match = NODE_TOKEN_REGEX.exec(validLower);
    expect(match?.[1]).toBe(hex64);
    expect(match?.[2]).toBe("01ff");

    expect(isNodeToken(`vrcp_${hex64}`)).toBe(false);
    expect(isNodeToken(`vrcp_${hex64}01fff`)).toBe(false);
    expect(isNodeToken(`vrcp_app_${hex64}`)).toBe(false);
    expect(isNodeToken(`vrcp_${"g".repeat(64)}01ff`)).toBe(false);
    expect(isNodeToken("vrcp_invalid")).toBe(false);
  });

  it("formats and validates app tokens (vrcp_app_<64-hex>)", () => {
    const hex64 = "a".repeat(64);
    const token = formatAppToken(hex64);
    expect(token).toBe(`vrcp_app_${hex64}`);
    expect(token.length).toBe(73);
    expect(isAppToken(token)).toBe(true);

    expect(isAppToken("vrcp_app_short")).toBe(false);
    expect(isAppToken(`vrcp_usr_${hex64}`)).toBe(false);
    expect(isAppToken(`vrcp_app_${"G".repeat(64)}`)).toBe(false);
  });

  it("formats and validates user tokens (vrcp_usr_<64-hex>)", () => {
    const hex64 = "b".repeat(64);
    const token = formatUserToken(hex64);
    expect(token).toBe(`vrcp_usr_${hex64}`);
    expect(token.length).toBe(73);
    expect(isUserToken(token)).toBe(true);

    expect(isUserToken("vrcp_usr_invalid")).toBe(false);
    expect(isUserToken(`vrcp_app_${hex64}`)).toBe(false);
  });

  it("validates operator tokens (64-hex secrets)", () => {
    const validOpToken = "c".repeat(64);
    expect(isOperatorToken(validOpToken)).toBe(true);
    expect(isOperatorToken("short")).toBe(false);
    expect(isOperatorToken("g".repeat(64))).toBe(false);
  });
});
