import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, realpathSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { resolveBuildScript } from "./build.mjs";
import { readNetworkDistribution } from "./delivery-chain.mjs";
import { activeTemporaryVersionRule, ciSourceCommit, recoveryIdentity, requireCI } from "./delivery-recovery.mjs";
import {
  checkReleaseMetadata,
  checkReleaseSource,
  checkReviewedRelease,
  checkSDKPublicationVersion,
  loadRootEnv,
  readGit,
  readGitHubAPI,
  readReleaseTagProof,
  resolveTag,
  selectTag,
  validateCIArtifact
} from "./pipeline-utils.mjs";
import {
  bumpVersion,
  distributedArtifact,
  productDirectories,
  productTagPrefixes,
  readVersionConfig,
  sdkPackageNames,
  sdkChannelForProduct,
  versionFiles
} from "./versioning.mjs";

export {
  checkReleaseMetadata,
  checkReleaseSource,
  checkReviewedRelease,
  checkSDKPublicationVersion,
  readGitHubAPI,
  readReleaseTagProof,
  requireCI,
  resolveTag,
  selectTag,
  validateCIArtifact
};

const root = fileURLToPath(new URL("../", import.meta.url));
loadRootEnv(root);

const artifacts = { "vrc-packages-api": "package", "vrc-packages-network": "network" };

export function workerSecretBindings(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.OPERATOR_TOKEN ?? "")) {
    throw new Error("CI preview deployment requires an environment-scoped 64-hex OPERATOR_TOKEN secret");
  }
  return { OPERATOR_TOKEN: env.OPERATOR_TOKEN };
}

export function validateSDKStage(stage, expected, bytes) {
  if (!Object.values(sdkPackageNames).includes(expected.name) ||
      typeof stage?.id !== "string" || stage.id.length !== 36 ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stage.id) ||
      stage.packageName !== expected.name || stage.version !== expected.version || stage.tag !== "latest" ||
      stage.shasum !== createHash("sha1").update(bytes).digest("hex")) {
    throw new Error("npm stage identity, tag or tarball checksum differs from the checked SDK");
  }
  return stage.id;
}

export function stageSDKArtifact(artifact, expected, receipt, run) {
  const project = dirname(artifact);
  const bytes = readFileSync(artifact);
  validateCIArtifact(receipt, expected, bytes);
  if (semver.lt(run(["--version"], project, true).trim(), "11.15.0")) throw new Error("npm staging requires CLI 11.15.0 or later");
  const registry = "--registry=https://registry.npmjs.org";
  const stages = JSON.parse(run(["stage", "list", expected.name, "--json", registry], project, true));
  if (!Array.isArray(stages) || stages.some(stage => !stage || typeof stage !== "object")) {
    throw new Error("npm pending-stage list is malformed");
  }
  const matches = stages.filter(stage => stage.packageName === expected.name && stage.version === expected.version);
  if (matches.length > 1) throw new Error("Multiple npm stages claim the configured SDK version");
  let stageId;
  if (matches.length === 1) {
    stageId = validateSDKStage(matches[0], expected, bytes);
  } else {
    const result = JSON.parse(run(["stage", "publish", artifact, "--access", "public", "--tag", "latest",
      "--ignore-scripts", "--json", registry], project, true))[expected.name];
    stageId = validateSDKStage({ id: result?.stageId, packageName: result?.name, version: result?.version,
      tag: "latest", shasum: result?.shasum }, expected, bytes);
  }
  validateSDKStage(JSON.parse(run(["stage", "view", stageId, "--json", registry], project, true)), expected, bytes);
  console.log(JSON.stringify({ name: expected.name, version: expected.version, stageId, status: "staged-unverified" }));
  const stageDirectory = mkdtempSync(join(tmpdir(), "vrcp-sdk-stage-"));
  const stagedArtifact = join(stageDirectory, `${expected.name}-${expected.version}-${stageId}.tgz`);
  try {
    run(["stage", "download", stageId, "--json", registry], stageDirectory, true);
    validateCIArtifact(receipt, expected, readFileSync(stagedArtifact));
  } finally {
    if (existsSync(stagedArtifact)) unlinkSync(stagedArtifact);
    rmdirSync(stageDirectory);
  }
  return { ...expected, stageId, tag: "latest", sha256: receipt.sha256, status: "awaiting-npm-approval", purpose: "npm-stage" };
}

async function readPublicSDK(name, version, signal) {
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, {
    redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    headers: { accept: "application/json", "cache-control": "no-cache" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry check failed (${response.status}). No publication retry ran.`);
  return response.json();
}

/** Preview is directly published through OIDC. Releases still use owner-approved stages. */
export async function publishPreviewSDKArtifact(artifact, expected, receipt, run, registry = readPublicSDK,
  wait = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds)), workspace = root) {
  // The SDK project .npmrc is for token-backed staging. Its empty token would
  // shadow the user-level credential installed by npm's OIDC exchange.
  const bytes = readFileSync(artifact), project = root;
  validateCIArtifact(receipt, expected, bytes);
  if (expected.name !== sdkPackageNames.preview) throw new Error("Direct publication is preview-only");
  checkSDKPublicationVersion(expected.version, "preview", expected.name);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const check = metadata => {
    if (metadata?.name !== expected.name || metadata.version !== expected.version || metadata.dist?.integrity !== integrity) {
      throw new Error("Public preview SDK differs from its checked artifact");
    }
  };
  const tempRule = activeTemporaryVersionRule("preview", "package", expected.version, workspace);
  const allowedOccupiedLatest = version =>
    Boolean(tempRule && tempRule.packageName === expected.name && tempRule.occupiedVersions.includes(version));
  const existing = await registry(expected.name, expected.version);
  if (existing) check(existing);
  const latest = await registry(expected.name, "latest");
  if (latest && (latest.name !== expected.name || !semver.valid(latest.version) ||
      (semver.gt(latest.version, expected.version) && !allowedOccupiedLatest(latest.version)))) {
    throw new Error("Preview latest would roll back or has invalid identity");
  }
  if (!existing) {
    if (semver.lt(run(["--version"], project, true).trim(), "11.19.0")) throw new Error("Preview OIDC publication requires CLI 11.19.0 or later");
    // Do not approve stages, change dist-tags on retries, or fall back to a write token.
    run(["publish", artifact, "--access", "public", "--tag", "latest", "--ignore-scripts",
      "--json", "--registry=https://registry.npmjs.org"], project, true);
  }
  // npm can acknowledge publication before its public version and alias reads converge.
  // Retry reads only. Different bytes or identity fail immediately, with no second publish.
  const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000], signal = AbortSignal.timeout(90_000);
  for (let attempt = 0;; attempt++) {
    signal.throwIfAborted();
    const published = await registry(expected.name, expected.version, signal);
    if (published !== null) check(published);
    const alias = await registry(expected.name, "latest", signal);
    const olderAlias = alias?.name === expected.name && semver.valid(alias.version) &&
      (semver.lt(alias.version, expected.version) || allowedOccupiedLatest(alias.version));
    if (alias !== null && !olderAlias) check(alias);
    if (published !== null && alias !== null && !olderAlias) break;
    if (attempt === delays.length) throw new Error("Preview publication readback did not converge. No publication retry ran.");
    await wait(delays[attempt]);
  }
  return { ...expected, channel: "preview", tag: "latest", sha256: receipt.sha256, integrity,
    status: "published-verified", purpose: "npm-publication" };
}

/** Keep npm's auth diagnostics useful without forwarding raw logs or credentials. */
export function previewOIDCFailure(stderr) {
  const log = String(stderr ?? "");
  const exchange = log.split("\n").filter(line => line.includes("http fetch POST") &&
    line.includes("https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/"));
  const statuses = exchange.map(line => /\bPOST(?:\s+https:\/\/\S+)?\s+([1-5][0-9]{2})\b/.exec(line)?.[1])
    .filter(Boolean).slice(-8).map(Number);
  return { action: "preview-npm-auth-failure", exchangeStatuses: statuses,
    tokenInstalled: log.includes("oidc Successfully retrieved and set token"),
    exchangeRejected: log.includes("oidc Failed token exchange request"),
    oidcException: log.includes("oidc Failure with message"),
    noCredentials: /\bENEEDAUTH\b/.test(log) };
}

function packageCommand(args, cwd, capture = false) {
  // Bun owns installs and package scripts. npm remains the checked registry/staging interface.
  if (["install", "run"].includes(args[0])) {
    return execFileSync("bun", args, { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  }
  const cli = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")]
    .find(path => path?.endsWith("npm-cli.js") && existsSync(path));
  if (!cli) throw new Error("Registry checks require a Node installation that includes npm. Use Bun for project scripts.");
  const diagnose = capture && args[0] === "publish";
  try {
    return execFileSync(process.execPath, [cli, ...args, ...(diagnose ? ["--loglevel=verbose"] : [])],
      { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  } catch (error) {
    if (!diagnose) throw error;
    console.error(JSON.stringify(previewOIDCFailure(error.stderr)));
    throw new Error("Preview npm publication failed. Read its sanitized authentication summary.");
  }
}

function inspectDependencies(project, latestVersion) {
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  for (const name of Object.keys(artifacts)) {
    const peer = manifest.peerDependencies?.[name];
    const expected = manifest.dependencies?.[name] ?? (peer ? manifest.devDependencies?.[name] : undefined);
    if (peer && !expected) throw new Error(`${name} peer requires an explicit development dependency for package verification`);
    if (!expected) continue;
    const artifact = distributedArtifact(name, expected, latestVersion);
    const path = join(project, "node_modules", name);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(realpathSync(project) + sep)) {
      throw new Error(`${name} requires an installed artifact, not a sibling/workspace link. Run delivery prepare first.`);
    }
    const installed = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (installed.name !== artifact.name || installed.version !== artifact.version) throw new Error(`${name} installed identity/version differs from its declared artifact`);
    if (peer && !semver.satisfies(installed.version, peer)) throw new Error(`${name} installed version falls outside the checked peer contract`);
    if (name === "vrc-packages-network" && (installed.dependencies?.["vrc-packages-api"] ||
        !semver.satisfies(latestVersion, installed.peerDependencies?.["vrc-packages-api"] ?? ""))) {
      throw new Error("Installed network archive does not accept the consumer's SDK channel");
    }
  }
}

export function validateRegistrySDK(result, metadata, expected, bytes, name = sdkPackageNames.release) {
  if (!Object.values(sdkPackageNames).includes(name) || metadata.name !== name || metadata.version !== expected ||
      result.name !== metadata.name || result.version !== expected ||
      result.filename !== `${name}-${expected}.tgz` ||
      !metadata.dist?.integrity || result.integrity !== metadata.dist.integrity ||
      result.integrity !== `sha512-${createHash("sha512").update(bytes).digest("base64")}` ||
      !result.files.every(file => ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file.path) ||
        /^dist\/.*\.(js|d\.ts)$/.test(file.path))) {
    throw new Error("Registry SDK identity, integrity or distribution contents differ from the configured artifact");
  }
}

function packRegistrySDK(project, channel, configuredVersion, runCommand = packageCommand, workspace = root) {
  const name = sdkPackageNames[channel];
  const version = configuredVersion ?? JSON.parse(readFileSync(join(project, "package.json"), "utf8")).version;
  const registry = "https://registry.npmjs.org";
  // Recovery must use the tag's saved dependency, not a newer moving registry alias.
  const spec = process.env.VRCP_RECOVERY_TAG ? `${name}@${version}` : `${name}@latest`;
  const metadata = JSON.parse(runCommand(["view", spec, "--json", `--registry=${registry}`], workspace, true));
  if (metadata.name !== sdkPackageNames[channel] || metadata.version !== version) {
    throw new Error("Registry SDK channel resolves outside the authoritative version config");
  }
  const destination = join(project, ".artifacts/dev");
  mkdirSync(destination, { recursive: true });
  const [result] = JSON.parse(runCommand(["pack", `${name}@${version}`, "--ignore-scripts", "--json", `--registry=${registry}`,
    "--pack-destination", destination], workspace, true));
  const artifact = join(destination, `${name}-${version}.tgz`);
  const bytes = readFileSync(artifact);
  validateRegistrySDK(result, metadata, version, bytes, name);
  writeFileSync(`${artifact}.json`, JSON.stringify({ name: result.name, version, integrity: result.integrity,
    sha256: createHash("sha256").update(bytes).digest("hex"), purpose: "registry-dependency", registry }, null, 2) + "\n");
  console.log(JSON.stringify({ name: result.name, version, integrity: result.integrity, source: registry }));
  return artifact;
}

function pack(project, ci, runCommand = packageCommand, workspace = root) {
  const destination = join(project, ".artifacts", ci ? "ci" : "dev");
  mkdirSync(destination, { recursive: true });
  const [result] = JSON.parse(runCommand(["pack", "--ignore-scripts", "--json", "--pack-destination", destination], project, true));
  const expected = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  if (result.name !== expected.name || result.version !== expected.version ||
      !result.files.every(file => ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file.path) ||
        /^dist\/.*\.(js|d\.ts)$/.test(file.path))) throw new Error("Packed artifact contains unexpected identity or files");
  console.log(JSON.stringify({ name: result.name, version: result.version, integrity: result.integrity, purpose: ci ? "ci-release" : "development" }));
  const artifact = join(destination, result.filename);
  writeFileSync(`${artifact}.json`, JSON.stringify({ name: result.name, version: result.version,
    integrity: result.integrity, sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
    purpose: ci ? "ci-release" : "development", commit: ci ? ciSourceCommit(process.env, workspace) : null,
    ...(ci && process.env.VRCP_RECOVERY_TAG ? { recovery: { toolingCommit: process.env.GITHUB_SHA,
      sourceRun: Number(process.env.GITHUB_RUN_ID), failedRun: recoveryIdentity(process.env.VRCP_RECOVERY_TAG, workspace).failedRun } } : {}) }, null, 2) + "\n");
  return artifact;
}

/** Produce product-local development artifacts or CI-only release artifacts. Never tag or push. */
export async function deliver(action, channel, product, ci = false, skipTests = false, options = {}) {
  if (product === "network" && channel === "release") throw new Error("Network has one rapid stream; use preview network");
  if (!["prepare", "build", "pack", "verify", "deploy", "publish"].includes(action) ||
      !["release", "preview"].includes(channel) || !Object.hasOwn(productDirectories, product)) {
    throw new Error("Usage: delivery.mjs <prepare|build|pack|verify|deploy|publish> <release|preview> <product> [--ci] [--skip-tests]");
  }
  const {
    workspace = root,
    runCommand = packageCommand,
    verifyCI = requireCI,
    readNetwork = readNetworkDistribution
  } = options;
  const skipTestsRequested = Boolean(
    skipTests ||
    process.env.VRCP_SKIP_TESTS === "true" ||
    process.env.VRCP_SKIP_TESTS === "1"
  );
  if (skipTestsRequested && channel === "release") {
    throw new Error("Tests cannot be disabled on release/production routes");
  }
  if (["deploy", "publish"].includes(action) && !ci) throw new Error("Remote actions are CI-only");
  if (action === "deploy" && product !== "worker") throw new Error("Only Worker deployment is configured. Web hosting remains owner-selected.");
  if (action === "publish" && product !== "package") throw new Error("Only SDK npm publication is conditionally authorized. Internal registry remains undecided.");
  if (["pack", "verify"].includes(action) && !["package", "network"].includes(product)) throw new Error("Pack/verify applies only to distributed packages");
  if (ci) await verifyCI(product, channel, process.env, workspace);
  await versionFiles("check", channel, product, workspace);
  const sdkChannel = sdkChannelForProduct(product, channel);
  const { config: sdkConfig } = await readVersionConfig(sdkChannel, workspace);
  const sdkVersion = sdkConfig[`${sdkChannel}-package`];
  const project = resolve(workspace, productDirectories[product]);
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));

  if (action === "prepare") {
    const inputs = [];
    const needsNetwork = !!manifest.dependencies?.["vrc-packages-network"];
    const needsSDK = product === "network" || !!manifest.dependencies?.["vrc-packages-api"];
    if (needsSDK) inputs.push(`vrc-packages-api@file:${packRegistrySDK(resolve(workspace, productDirectories.package), sdkChannel, sdkVersion, runCommand, workspace)}`);
    if (needsNetwork) {
      if (!needsSDK) throw new Error("Network consumers must declare their selected SDK dependency");
      const { config: networkConfig } = await readVersionConfig("preview", workspace);
      const version = networkConfig["preview-network"];
      const downloaded = await readNetwork(version, workspace);
      const destination = resolve(workspace, productDirectories.network, ".artifacts/dev");
      mkdirSync(destination, { recursive: true });
      const artifact = join(destination, `vrc-packages-network-${version}.tgz`);
      writeFileSync(artifact, downloaded.bytes);
      writeFileSync(`${artifact}.json`, JSON.stringify(downloaded.receipt, null, 2) + "\n");
      writeFileSync(`${artifact}.dependency.json`, JSON.stringify({ purpose: "hosted-development-dependency",
        version, url: downloaded.url, sourceRun: downloaded.sourceRun, tag: downloaded.tag, tagObject: downloaded.tagObject,
        sha256: downloaded.receipt.sha256 }, null, 2) + "\n");
      inputs.push(`vrc-packages-network@file:${artifact}`);
    }
    // These are packed JS/type dependencies. No sibling source is read by a consumer build.
    runCommand(["install", "--no-save", "--ignore-scripts", ...inputs], project);
    inspectDependencies(project, sdkVersion);
    if (needsNetwork) execFileSync(process.execPath, ["--input-type=module", "-e",
      "import { NodeIdSchema } from 'vrc-packages-network/node'; import { IssueNodeCredentialSchema } from 'vrc-packages-api'; if (NodeIdSchema !== IssueNodeCredentialSchema.shape.nodeId) throw new Error('Network resolved another SDK');"],
      { cwd: project, stdio: "inherit", timeout: 30_000 });
  } else {
    if (!["deploy", "publish"].includes(action)) inspectDependencies(project, sdkVersion);
    if (action === "build") {
      if (product === "worker") {
        runCommand(["run", resolveBuildScript(product, channel)], project);
        if (ci) {
          const bundle = join(project, ".wrangler/dev-build", channel === "preview" ? "preview" : "production", "worker_entry.js");
          writeFileSync(`${bundle}.json`, JSON.stringify({ purpose: "ci-release", product,
            name: manifest.name, version: manifest.version, channel, commit: process.env.GITHUB_SHA,
            configSha256: createHash("sha256").update(readFileSync(join(project, "wrangler.toml"))).digest("hex"),
            sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex") }, null, 2) + "\n");
        }
      } else if (product === "crawler-client" && ci) {
        runCommand(["run", "build"], project);
      } else {
        runCommand(["run", resolveBuildScript(product, channel)], project);
      }
    } else if (action === "pack") {
      runCommand(["run", "build"], project);
      console.log(JSON.stringify({ artifact: pack(project, ci, runCommand, workspace), purpose: ci ? "ci-release" : "development" }));
    } else if (action === "verify") {
      const runTest = (cmd, cwd) => runCommand(cmd, cwd);
      if (!skipTestsRequested) {
        if (product === "package") runTest(["run", "test"], project);
      }
      if (runCommand === packageCommand) packageCommand(["run", "typecheck"], project);
      else runCommand(["run", "typecheck"], project);
      if (product === "network") {
        // Pack once. Both SDK channels must consume these same network bytes.
        runCommand(["run", "build"], project);
        const network = pack(project, false, runCommand, workspace);
        if (!skipTestsRequested) {
          for (const sdkCh of ["release", "preview"]) {
            const cfg = (await readVersionConfig(sdkCh, workspace)).config;
            const sdk = packRegistrySDK(resolve(workspace, productDirectories.package), sdkCh, cfg[`${sdkCh}-package`], runCommand, workspace);
            runTest(["run", "test:distribution", "--sdk-tarball", sdk, "--network-tarball", network], project);
          }
        }
      } else if (!skipTestsRequested) runTest(["run", "test:distribution"], project);
    } else if (action === "deploy") {
      if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) throw new Error("CI requires protected Cloudflare account/token secrets");
      const directory = channel === "preview" ? "preview" : "production";
      const bundle = join(project, ".wrangler/dev-build", directory, "worker_entry.js");
      const cli = join(project, ".wrangler/ci-tools/node_modules/wrangler/bin/wrangler.js");
      if (!existsSync(bundle) || !existsSync(cli)) throw new Error("Deploy requires the CI-verified bundle and pinned Wrangler tools. It does not rebuild source.");
      validateCIArtifact(JSON.parse(readFileSync(`${bundle}.json`, "utf8")), {
        product, name: manifest.name, version: manifest.version, channel, commit: process.env.GITHUB_SHA,
        configSha256: createHash("sha256").update(readFileSync(join(project, "wrangler.toml"))).digest("hex")
      }, readFileSync(bundle));
      const bindings = workerSecretBindings(process.env);
      const secretDirectory = mkdtempSync(join(tmpdir(), "vrcp-worker-deploy-"));
      const secretPath = join(secretDirectory, "secrets.json");
      try {
        writeFileSync(secretPath, JSON.stringify(bindings), { flag: "wx", mode: 0o600 });
        execFileSync(process.execPath, [cli, "deploy", bundle, "--no-bundle", "--autoconfig=false",
          "--env", channel === "preview" ? "preview" : "", "--config", "wrangler.toml",
          "--secrets-file", secretPath], { cwd: project, stdio: "inherit" });
      } finally {
        if (existsSync(secretPath)) unlinkSync(secretPath);
        rmdirSync(secretDirectory);
      }
    } else if (action === "publish") {
      checkSDKPublicationVersion(manifest.version, channel, manifest.name);
      if (manifest.private) throw new Error("SDK remains private until its package gate passes. Do not publish by bypassing this hold.");
      const artifact = join(project, ".artifacts/ci", `${manifest.name}-${manifest.version}.tgz`);
      const receipt = JSON.parse(readFileSync(`${artifact}.json`, "utf8"));
      const expected = { name: manifest.name, version: manifest.version, commit: process.env.GITHUB_SHA };
      if (channel === "preview") {
        if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
            process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
          throw new Error("Direct preview publication requires OIDC without npm write tokens");
        }
        const publication = await publishPreviewSDKArtifact(artifact, expected, receipt, runCommand, readPublicSDK, undefined, workspace);
        writeFileSync(`${artifact}.published.json`, JSON.stringify(publication, null, 2) + "\n");
        return { action, channel, product, purpose: "ci-release", status: publication.status };
      }
      const stage = stageSDKArtifact(artifact, expected, receipt, runCommand);
      writeFileSync(`${artifact}.stage.json`, JSON.stringify({ ...stage, channel }, null, 2) + "\n");
      return { action, channel, product, purpose: "ci-release", status: stage.status, stageId: stage.stageId };
    }
  }
  return { action, channel, product, purpose: ci ? "ci-release" : "development" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, channel, product, flag, ...extra] = process.argv.slice(2);
  try {
    if (action === "tag") {
      if (product || flag || extra.length) throw new Error("Tag command takes exactly one tag");
      const selected = await resolveTag(channel);
      if (selected.channel === "release" && (process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_OUTPUT)) {
        if (!process.env.VRCP_RECOVERY_TAG && process.env.GITHUB_REF !== `refs/tags/${channel}`) throw new Error("CI routing tag differs from the original push ref");
        await requireCI(selected.product, selected.channel);
      }
      console.log(JSON.stringify(selected));
      if (process.env.GITHUB_OUTPUT) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selected).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
        appendFileSync(process.env.GITHUB_OUTPUT, `commit=${ciSourceCommit()}\n`);
      }
    } else {
      const allFlags = [flag, ...extra].filter(Boolean);
      const ci = allFlags.includes("--ci");
      const skipTests = allFlags.includes("--skip-tests");
      const unknownFlags = allFlags.filter(arg => arg !== "--ci" && arg !== "--skip-tests");
      if (unknownFlags.length) throw new Error("Only --ci and --skip-tests are accepted after the product");
      console.log(JSON.stringify(await deliver(action, channel, product, ci, skipTests)));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Delivery command failed");
    process.exitCode = 1;
  }
}
