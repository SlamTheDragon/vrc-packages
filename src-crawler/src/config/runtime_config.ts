import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { NodeIdSchema, PlatformSchema, type Platform } from "vrc-packages-network/node";
import { parseCapabilityToken } from "vrc-packages-network/token";
import { coordinatorEndpointAllowed } from "../client/node_client.ts";

const MAX_CONFIG_BYTES = 64 * 1024;

export const NodeRuntimeConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodeId: NodeIdSchema,
  coordinatorUrl: z.url().refine(coordinatorEndpointAllowed, "Safe coordinator endpoint required"),
  capabilities: z
    .array(PlatformSchema)
    .min(1)
    .max(PlatformSchema.options.length)
    .refine((items) => new Set(items).size === items.length, "Duplicate capability")
    .optional(),
  databaseFile: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9._-]+$/, "databaseFile must be a safe filename")
    .optional()
    .default("node.db")
});

export type NodeRuntimeConfig = {
  nodeId: string;
  baseUrl: string;
  capabilities: Platform[];
  token: string;
  databasePath: string;
};

/**
 * Safely resolves an existing scoped GitHub token from `<cwd>/.env` without exposing it.
 * Used exclusively for scoped rate scaling on api.github.com (`NODE-CWD-CONTAINMENT`).
 */
export function loadScopedGitHubTokenFromEnvFile(dir: string = process.cwd()): string | undefined {
  const envPath = join(dir, ".env");
  try {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf8");
      const match = content.match(/^ *(?:export +)?(?:GITHUB_TOKEN|GH_TOKEN) *= *["']?([^"'#\r\n]+)["']?/m);
      if (match && match[1]?.trim()) {
        return match[1].trim();
      }
    }
  } catch {
    // Fall through safely on permission or missing file error
  }
  return undefined;
}

function resolveContainedDbPath(cwd: string, configuredDbPath: string | undefined, fallbackFile: string): string {
  if (configuredDbPath && configuredDbPath.trim().length > 0) {
    const raw = configuredDbPath.trim();
    return isAbsolute(raw) ? raw : resolve(cwd, raw);
  }
  return join(cwd, fallbackFile);
}

function resolveCapabilities(
  requested: Platform[] | undefined,
  tokenCapabilities: Platform[],
  sourceLabel: string
): Platform[] {
  if (!requested) {
    return [...tokenCapabilities];
  }
  const allowed = new Set<Platform>(tokenCapabilities);
  if (requested.some((cap) => !allowed.has(cap))) {
    throw new Error(`${sourceLabel} capabilities exceed NODE_TOKEN grant`);
  }
  return requested;
}

/** A launch-directory config contains no credential; NODE_TOKEN governs token-bound capabilities. */
export function loadNodeRuntimeConfig(cwd: string, env: NodeJS.ProcessEnv): NodeRuntimeConfig {
  const token = env.NODE_TOKEN || "";
  if (!token) throw new Error("NODE_TOKEN is required for the crawler node");
  const parsedToken = parseCapabilityToken(token);
  if (!parsedToken) {
    throw new Error("NODE_TOKEN must be a valid capability token");
  }

  const configuredPath = env.NODE_CONFIG_PATH;
  const configPath = configuredPath
    ? isAbsolute(configuredPath)
      ? configuredPath
      : resolve(cwd, configuredPath)
    : join(cwd, "node.config.json");

  if (configuredPath || existsSync(configPath)) {
    let parsed: unknown;
    try {
      const size = statSync(configPath).size;
      if (size > MAX_CONFIG_BYTES) throw new Error("oversized");
      parsed = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      throw new Error("Node config is missing, oversized, or invalid JSON");
    }
    const result = NodeRuntimeConfigSchema.safeParse(parsed);
    if (!result.success) throw new Error("Node config does not match the versioned schema");

    const capabilities = resolveCapabilities(result.data.capabilities, parsedToken.capabilities, "Node config");
    const databaseFile = result.data.databaseFile || "node.db";
    return {
      nodeId: result.data.nodeId,
      baseUrl: result.data.coordinatorUrl,
      capabilities,
      token,
      databasePath: resolveContainedDbPath(cwd, env.NODE_DB_PATH, databaseFile)
    };
  }

  const explicitEnvCaps = env.NODE_CAPABILITIES
    ? env.NODE_CAPABILITIES.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const envConfig = NodeRuntimeConfigSchema.safeParse({
    schemaVersion: 1,
    nodeId: env.NODE_ID || "",
    coordinatorUrl: env.COORDINATOR_URL || "http://127.0.0.1:8787",
    ...(explicitEnvCaps !== undefined ? { capabilities: explicitEnvCaps } : {}),
    databaseFile: "node.db"
  });
  if (!envConfig.success) throw new Error("Set NODE_ID and valid NODE_CAPABILITIES/COORDINATOR_URL in .env");

  const capabilities = resolveCapabilities(envConfig.data.capabilities, parsedToken.capabilities, "NODE_CAPABILITIES");
  return {
    nodeId: envConfig.data.nodeId,
    baseUrl: envConfig.data.coordinatorUrl,
    capabilities,
    token,
    databasePath: resolveContainedDbPath(cwd, env.NODE_DB_PATH, "node.db")
  };
}
