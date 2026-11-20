import { z } from "zod";

/** Creates a strict HTTPS URL schema with an optional maximum character length. */
export function createHttpsUrlSchema(maxLength?: number, message = "HTTPS URL required") {
  const base = maxLength === undefined ? z.url() : z.url().max(maxLength);
  return base.refine((value) => new URL(value).protocol === "https:", message);
}

/** Strict HTTPS URL string schema. */
export const HttpsUrlSchema = createHttpsUrlSchema();
