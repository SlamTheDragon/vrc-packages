import { NODE_TOKEN_REGEX } from "vrc-packages-api/auth";
import {
  ALL_CAPABILITIES_MASK,
  CAPABILITY_TOKEN_REGEX,
  PLATFORM_BIT_MAP,
  decodeCapabilityCode,
  encodeCapabilityCode,
  formatCapabilityToken,
  isCapabilityToken,
  parseCapabilityToken,
  type ParsedCapabilityToken
} from "vrc-packages-network/token";

export {
  ALL_CAPABILITIES_MASK,
  CAPABILITY_TOKEN_REGEX,
  NODE_TOKEN_REGEX,
  PLATFORM_BIT_MAP,
  decodeCapabilityCode,
  encodeCapabilityCode,
  formatCapabilityToken,
  isCapabilityToken,
  parseCapabilityToken,
  type ParsedCapabilityToken
};

/**
 * Verifies a node credential bearer string matches the shared 9-platform V0 token grammar
 * (`vrcp_<64-hex><4-hex>`) and decodes to a non-empty valid platform capability bitmask.
 */
export function isValidNodeCredentialToken(token: string): boolean {
  return NODE_TOKEN_REGEX.test(token) && parseCapabilityToken(token) !== null;
}
