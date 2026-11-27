import { fileURLToPath, pathToFileURL } from "node:url";
import { previewOrigin, requirePreviewInitialization } from "./worker-preview-init.mjs";

export const DEFAULT_LOCAL_DEV_ORIGIN = "http://127.0.0.1:8787";
export const PURGE_CONFIRMATION_TOKEN = "PURGE_DEVELOPMENT_D1";

export function validatePurgeTarget(targetUrl = DEFAULT_LOCAL_DEV_ORIGIN) {
  let url;
  try {
    url = new URL(String(targetUrl));
  } catch {
    throw new Error("Development purge target must be local loopback or the approved preview worker origin");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Development purge target must not include credentials, paths, query parameters, or fragments");
  }
  const isLoopback = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const isPreview = url.origin === previewOrigin;
  if (!isLoopback && !isPreview) {
    throw new Error("Development purge target must be local loopback or the approved preview worker origin");
  }
  return { origin: url.origin, isPreview };
}

export function parsePurgeArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.length === 0) {
    return {
      execute: false,
      target: DEFAULT_LOCAL_DEV_ORIGIN,
      preserveNodes: true,
      seedPreviewStarter: false,
      confirm: ""
    };
  }
  const parsed = {
    execute: false,
    target: DEFAULT_LOCAL_DEV_ORIGIN,
    preserveNodes: true,
    seedPreviewStarter: false,
    confirm: ""
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--execute") {
      parsed.execute = true;
    } else if (arg === "--seed-starter") {
      parsed.seedPreviewStarter = true;
    } else if (arg === "--drop-nodes") {
      parsed.preserveNodes = false;
    } else if (arg === "--target") {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --target");
      }
      parsed.target = value;
    } else if (arg === "--confirm") {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --confirm");
      }
      parsed.confirm = value;
    } else {
      throw new Error("Usage: bun scripts/worker-dev-purge.mjs [--execute --confirm PURGE_DEVELOPMENT_D1 [--target <url>] [--seed-starter] [--drop-nodes]]");
    }
  }
  return parsed;
}

export function purgeFetch(request = fetch, expectedOrigin = DEFAULT_LOCAL_DEV_ORIGIN) {
  return async (input, init) => {
    const url = new URL(String(input));
    const isStatusGet = init?.method === "GET" && url.pathname === "/v1/operator/status" && !url.search;
    const isPurgePost = init?.method === "POST" && url.pathname === "/v1/operator/system/purge" && !url.search;
    if (url.origin !== expectedOrigin || url.username || url.password || url.hash || (!isStatusGet && !isPurgePost)) {
      throw new Error("Unexpected development purge request");
    }
    if (isPurgePost) {
      let body;
      try {
        body = JSON.parse(String(init.body ?? ""));
      } catch {
        throw new Error("Development purge body must be valid JSON");
      }
      if (body?.schemaVersion !== 1 || body?.confirm !== PURGE_CONFIRMATION_TOKEN) {
        throw new Error("Development purge requires schemaVersion 1 and explicit confirmation");
      }
    }
    const response = await request(url.href, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
      await response.body?.cancel();
      throw new Error("Development purge request failed");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error("Development purge response exceeds its size limit");
        chunks.push(value);
      }
    } catch {
      await reader.cancel().catch(() => {});
      throw new Error("Development purge response could not be read within its limits");
    } finally {
      reader.releaseLock();
    }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  };
}

export function sanitizePurgeErrorMessage(error, secretToken) {
  let msg = error instanceof Error ? error.message : String(error ?? "unknown error");
  if (secretToken) {
    msg = msg.split(secretToken).join("[REDACTED]");
  }
  return msg
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[a-f0-9]{64}/gi, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function executeDevPurge(Client, options = {}) {
  const {
    env = process.env,
    request = fetch,
    target = DEFAULT_LOCAL_DEV_ORIGIN,
    confirm = "",
    preserveNodes = true,
    seedPreviewStarter = false,
    requirePreviewGuard = requirePreviewInitialization
  } = options;

  const { origin, isPreview } = validatePurgeTarget(target);
  if (!/^[a-f0-9]{64}$/i.test(env.OPERATOR_TOKEN ?? "")) {
    throw new Error("Development purge requires a 64-hex OPERATOR_TOKEN");
  }
  if (confirm !== PURGE_CONFIRMATION_TOKEN) {
    throw new Error(`Development purge requires explicit --confirm ${PURGE_CONFIRMATION_TOKEN}`);
  }
  if (isPreview && env.VRCP_ALLOW_PREVIEW_PURGE !== "true") {
    requirePreviewGuard(env);
  }

  const client = new Client({
    baseUrl: origin,
    operatorToken: env.OPERATOR_TOKEN,
    fetch: purgeFetch(request, origin)
  });

  const status = await client.operator.status();
  if (status.environment === "production" || status.purgeEnabled !== true) {
    throw new Error("Coordinator rejected development purge (production or purge disabled)");
  }

  const purged = await client.operator.systemPurge({
    schemaVersion: 1,
    confirm: PURGE_CONFIRMATION_TOKEN,
    preserveNodes,
    seedPreviewStarter
  });

  return {
    target: origin,
    environment: status.environment,
    status: purged.status,
    d1SchemaState: purged.d1SchemaState,
    preservedNodes: purged.preservedNodes,
    seededProfiles: purged.seededProfiles
  };
}

if (import.meta.main) {
  try {
    const parsed = parsePurgeArgs(process.argv.slice(2));
    if (!parsed.execute) {
      const { origin } = validatePurgeTarget(parsed.target);
      console.log(JSON.stringify({
        purpose: "plan-only",
        target: origin,
        preserveNodes: parsed.preserveNodes,
        seedPreviewStarter: parsed.seedPreviewStarter,
        next: `Pass --execute --confirm ${PURGE_CONFIRMATION_TOKEN} with OPERATOR_TOKEN set to reset a development Coordinator`
      }));
    } else {
      const workerDirectory = fileURLToPath(new URL("../src-worker/", import.meta.url));
      const { VRCPackageClient } = await import(pathToFileURL(Bun.resolveSync("vrc-packages-api", workerDirectory)).href);
      console.log(JSON.stringify(await executeDevPurge(VRCPackageClient, {
        env: process.env,
        target: parsed.target,
        confirm: parsed.confirm,
        preserveNodes: parsed.preserveNodes,
        seedPreviewStarter: parsed.seedPreviewStarter
      })));
    }
  } catch (error) {
    console.error("Development purge failed:", sanitizePurgeErrorMessage(error, process.env.OPERATOR_TOKEN));
    process.exitCode = 1;
  }
}
