import { fileURLToPath, pathToFileURL } from "node:url";

// Fixed credential destination. A new origin requires an explicit target review.
export const previewOrigin = "https://vrc-package-crawler-preview.slamthedragon.workers.dev";

export function requirePreviewInitialization(env) {
  if (env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_REPOSITORY !== "SlamTheDragon/vrc-packages" ||
      env.VRCP_WORKER_OPERATION_ENV !== "cloudflare-preview" ||
      !/^[a-f0-9]{64}$/i.test(env.OPERATOR_TOKEN ?? "")) {
    throw new Error("Preview initialization requires its verified GitHub environment and protected operator secret");
  }

  const isManualMainDispatch =
    env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    env.GITHUB_REF === "refs/heads/main" &&
    env.GITHUB_WORKFLOW_REF === "SlamTheDragon/vrc-packages/.github/workflows/worker-preview-init.yml@refs/heads/main";

  const isAutomatedPreviewDelivery =
    typeof env.GITHUB_WORKFLOW_REF === "string" &&
    env.GITHUB_WORKFLOW_REF.startsWith("SlamTheDragon/vrc-packages/.github/workflows/cloudflare-worker.yml@") &&
    (env.GITHUB_REF?.startsWith("refs/tags/cloudflare-worker/v") || env.GITHUB_REF === "refs/heads/main") &&
    (env.GITHUB_EVENT_NAME === "push" || env.GITHUB_EVENT_NAME === "workflow_dispatch");

  if (!isManualMainDispatch && !isAutomatedPreviewDelivery) {
    throw new Error("Preview initialization requires its main-ref manual workflow or preview delivery context");
  }
}

export function previewFetch(request = fetch) {
  return async (input, init) => {
    const url = new URL(String(input));
    const isStatusGet = init?.method === "GET" && url.pathname === "/v1/operator/status" && !url.search;
    const isPurgePost = init?.method === "POST" && url.pathname === "/v1/operator/system/purge" && !url.search;
    const isInitPost = init?.method === "POST" && url.pathname === "/v1/operator/init" && !url.search;
    const isIndexGet = init?.method === "GET" && url.pathname === "/v1/app/index" && url.search === "?limit=1";
    if (url.origin !== previewOrigin || url.username || url.password || url.hash ||
        !(isStatusGet || isPurgePost || isInitPost || isIndexGet)) {
      throw new Error("Unexpected preview initialization request");
    }
    if (isInitPost) {
      let body;
      try {
        body = JSON.parse(init.body);
      } catch {
        throw new Error("Preview initialization must explicitly disable seeding");
      }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          body.schemaVersion !== 1 || body.autoSeed !== false || Object.keys(body).length !== 2) {
        throw new Error("Preview initialization must explicitly disable seeding");
      }
    }
    if (isPurgePost) {
      let body;
      try {
        body = JSON.parse(init.body);
      } catch {
        throw new Error("Preview legacy reset must disable seeding and confirm development purge");
      }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          body.schemaVersion !== 1 || body.confirm !== "PURGE_DEVELOPMENT_D1" ||
          body.preserveNodes !== false || body.seedPreviewStarter !== false ||
          Object.keys(body).length !== 4) {
        throw new Error("Preview legacy reset must disable seeding and confirm development purge");
      }
    }
    const response = await request(url.href, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
      await response.body?.cancel();
      throw new Error("Preview initialization request failed");
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error("Preview response exceeds its size limit");
        chunks.push(value);
      }
    } catch {
      await reader.cancel().catch(() => {});
      throw new Error("Preview response could not be read within its limits");
    } finally { reader.releaseLock(); }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  };
}

export async function initializePreview(Client, env = process.env, request = fetch) {
  requirePreviewInitialization(env);
  const client = new Client({ baseUrl: previewOrigin, operatorToken: env.OPERATOR_TOKEN, fetch: previewFetch(request) });
  let legacyReset = false;
  if (typeof client.operator?.status === "function") {
    const status = await client.operator.status();
    if (status?.d1SchemaState === "legacy" && status?.purgeEnabled === true) {
      if (typeof client.operator?.systemPurge !== "function") {
        throw new Error("Preview legacy reset requires operator.systemPurge");
      }
      await client.operator.systemPurge({
        schemaVersion: 1,
        confirm: "PURGE_DEVELOPMENT_D1",
        preserveNodes: false,
        seedPreviewStarter: false
      });
      legacyReset = true;
    }
  }
  const initialized = await client.operator.init({ autoSeed: false });
  if (initialized.autoSeed !== false) throw new Error("Preview initialization did not confirm expected seeding");
  const catalog = await client.index.query({ limit: 1 });
  return {
    target: previewOrigin,
    autoSeed: false,
    schemaVersion: catalog.schemaVersion,
    catalogRead: "passed",
    ...(legacyReset ? { legacyReset: true } : {})
  };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.log(JSON.stringify({ purpose: "plan-only", target: previewOrigin, autoSeed: false,
        next: "Run worker-preview-init.yml on main to initialize preview without a version bump" }));
    } else if (args.length === 1 && args[0] === "--execute") {
      requirePreviewInitialization(process.env);
      const workerDirectory = fileURLToPath(new URL("../src-worker/", import.meta.url));
      const { VRCPackageClient } = await import(pathToFileURL(Bun.resolveSync("vrc-packages-api", workerDirectory)).href);
      console.log(JSON.stringify(await initializePreview(VRCPackageClient, process.env, fetch)));
    } else throw new Error("Invalid initialization arguments");
  } catch {
    // SDK, transport and schema errors can contain remote data. Do not print them.
    console.error("Preview initialization failed. Check the workflow scope, secret and preview runtime privately.");
    process.exitCode = 1;
  }
}
