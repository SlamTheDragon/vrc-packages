import { isOperatorToken } from "vrc-packages-api/auth";
import { timingSafeEqual } from "../domain/security/crypto_primitives.ts";

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function isOperatorBearerToken(token: string, configuredToken: string): boolean {
  if (!isOperatorToken(configuredToken) || !isOperatorToken(token)) return false;
  return timingSafeEqual(token, configuredToken);
}

export function isOperatorAuthorized(request: Request, configuredToken: string): boolean {
  const token = extractBearerToken(request);
  if (!token) return false;
  return isOperatorBearerToken(token, configuredToken);
}

export function parseIntegerQueryParam(value: string | null, defaultValue?: number): number | undefined {
  if (value === null) return defaultValue;
  if (!/^-?\d+$/.test(value.trim())) return Number.NaN;
  return Number.parseInt(value.trim(), 10);
}
