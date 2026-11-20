import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { extractProductChangelog } from "./changelog.mjs";
import {
  bumpVersion,
  productDirectories,
  productTagPrefixes,
  productWorkflows,
  readVersionConfig,
  sdkPackageNames,
  versionFiles
} from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const releaseProducts = ["package", "crawler", "crawler-client", "worker"];
const approvedTaskTrackers = new Set([
  "docs/scratch-crawler-network/task_tracker.md",
  "docs/scratch-desktop-client/task_tracker.md",
  "docs/scratch-api-web/task_tracker.md",
  "docs/scratch-pipeline/task_tracker.md",
  "docs/scratch-legal-research/task_tracker.md"
]);
const isApprovedTaskTracker = filename => typeof filename === "string" && approvedTaskTrackers.has(filename);

export const isColorSupported = !process.env.NO_COLOR && (process.stdout?.isTTY || process.env.FORCE_COLOR);
export const style = {
  reset: isColorSupported ? "\x1b[0m" : "",
  bold: isColorSupported ? "\x1b[1m" : "",
  dim: isColorSupported ? "\x1b[2m" : "",
  cyan: isColorSupported ? "\x1b[36m" : "",
  blue: isColorSupported ? "\x1b[34m" : "",
  green: isColorSupported ? "\x1b[32m" : "",
  yellow: isColorSupported ? "\x1b[33m" : "",
  red: isColorSupported ? "\x1b[31m" : "",
  magenta: isColorSupported ? "\x1b[35m" : ""
};

export const symbols = {
  diamond: "◆",
  pointer: "❯",
  check: "✔",
  cross: "✖",
  warn: "⚠",
  info: "ℹ"
};

export async function askBinary(ask, query, defaultYes = true) {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  const raw = await ask(`${query} ${hint}: `);
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return defaultYes;
  return trimmed === "y" || trimmed === "yes";
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function renderProgressBar(current, total, label = "", barWidth = 24) {
  const percent = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.min(barWidth, Math.round((current / total) * barWidth));
  const empty = Math.max(0, barWidth - filled);
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const line = `  ${style.cyan}[${bar}]${style.reset} ${String(percent).padStart(3)}% (${current}/${total}) ${style.dim}${label}${style.reset}`;
  if (process.stdout.isTTY && !process.env.CI) {
    process.stdout.write(`\r\x1b[K${line}`);
    if (current >= total) process.stdout.write("\n");
  } else {
    console.log(line);
  }
}

export function renderTable(headers, rows) {
  if (!rows || !rows.length) return;
  const stripAnsi = str => String(str ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  const colWidths = headers.map((h, i) => {
    const cellLens = rows.map(r => stripAnsi(r[i]).length);
    return Math.max(stripAnsi(h).length, ...cellLens);
  });

  const sep = (left, mid, right, line) =>
    left + colWidths.map(w => line.repeat(w + 2)).join(mid) + right;

  const top = sep("┌", "┬", "┐", "─");
  const mid = sep("├", "┼", "┤", "─");
  const bot = sep("└", "┴", "┘", "─");

  const formatRow = cells =>
    "│ " + cells.map((cell, i) => {
      const pad = " ".repeat(Math.max(0, colWidths[i] - stripAnsi(cell).length));
      return `${cell}${pad} │`;
    }).join(" ");

  console.log(top);
  console.log(formatRow(headers.map(h => `${style.bold}${h}${style.reset}`)));
  console.log(mid);
  for (const row of rows) {
    console.log(formatRow(row));
  }
  console.log(bot);
}

export function renderCardTable(title, entries) {
  const stripAnsi = str => String(str ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  const maxKeyLen = Math.max(4, ...entries.map(([k]) => stripAnsi(k).length));
  const maxValLen = Math.max(4, ...entries.map(([_, v]) => stripAnsi(v).length));
  const totalInner = Math.max(stripAnsi(title).length + 4, maxKeyLen + maxValLen + 5);

  console.log(`\n┌─ ${style.bold}${style.cyan}${title}${style.reset} ${"─".repeat(Math.max(0, totalInner - stripAnsi(title).length - 3))}┐`);
  for (const [k, v] of entries) {
    const padKey = " ".repeat(Math.max(0, maxKeyLen - stripAnsi(k).length));
    const padVal = " ".repeat(Math.max(0, totalInner - maxKeyLen - stripAnsi(v).length - 5));
    console.log(`│  ${style.dim}${k}${style.reset}${padKey} : ${v}${padVal} │`);
  }
  console.log(`└${"─".repeat(totalInner + 2)}┘\n`);
}

export function notifyNative(title, message) {
  try { process.stdout.write("\x07"); } catch {}
  if (process.platform === "win32") {
    try {
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $notify = New-Object System.Windows.Forms.NotifyIcon
        $notify.Icon = [System.Drawing.SystemIcons]::Information
        $notify.Visible = $true
        $notify.ShowBalloonTip(5000, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)
      `.replace(/\n\s*/g, " ");
      execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: "ignore",
        timeout: 5000
      });
    } catch {}
  } else if (process.platform === "linux") {
    try {
      execFileSync("notify-send", [title, message], { stdio: "ignore", timeout: 5000 });
    } catch {}
  } else if (process.platform === "darwin") {
    try {
      execFileSync("osascript", ["-e", `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`], { stdio: "ignore", timeout: 5000 });
    } catch {}
  }
}

export function loadRootEnv(workspace = root) {
  const envFile = resolve(workspace, ".env");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(envFile); } catch {}
  } else if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(); } catch {}
  }
}

loadRootEnv();

export function resolveGitHubToken(workspace = root) {
  loadRootEnv(workspace);
  if (process.env.GH_TOKEN !== undefined) return process.env.GH_TOKEN || undefined;
  if (process.env.GITHUB_TOKEN !== undefined) return process.env.GITHUB_TOKEN || undefined;
  if (process.env.RELEASE_TOKEN !== undefined) return process.env.RELEASE_TOKEN || undefined;
  if (resolve(workspace) === resolve(root)) {
    try {
      const out = execFileSync("git", ["credential", "fill"], {
        cwd: workspace,
        input: "protocol=https\nhost=github.com\n\n",
        stdio: ["pipe", "pipe", "ignore"],
        encoding: "utf8",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" }
      });
      const token = out.split("\n").find(l => l.startsWith("password="))?.slice(9).trim();
      if (token) return token;
    } catch {}
  }
  return undefined;
}

export function runGit(workspace, ...args) {
  try {
    const output = execFileSync("git", args, {
      cwd: workspace,
      encoding: "utf8",
      timeout: 60_000,
      stdio: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" }
    });
    return args.includes("-z") ? output : output.trim();
  } catch {
    throw new Error(`Git ${args[0]} failed. Inspect repository state before retrying; no rollback or tag replacement ran.`);
  }
}

export const readGit = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, stdio: "pipe" });

export function repositoryFromRemote(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error("Delivery requires a GitHub origin without embedded credentials");
  return match[1];
}

export function checkSDKPublicationVersion(version, channel = "release", name = sdkPackageNames.release) {
  const parsed = semver.parse(version);
  if (channel === "preview" && name === sdkPackageNames.preview && parsed?.prerelease[0] === "pre") return;
  if (channel !== "release" || name !== sdkPackageNames.release || !parsed || parsed.major !== 0 || parsed.minor !== 0 || parsed.prerelease.length) {
    throw new Error("SDK publication requires a pre-0.1 version. The owner API review hold includes v0.1 prereleases.");
  }
}

/** Read GitHub metadata only; never consult local credential storage. */
export function readGitHubAPI(env = process.env, request = fetch) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  return async path => {
    if (typeof path !== "string" || !/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//.test(path) ||
        /[\r\n#\\]/.test(path)) throw new Error("Expected a repository GitHub API path");
    const url = new URL(path, "https://api.github.com");
    if (url.origin !== "https://api.github.com" || !url.pathname.startsWith("/repos/")) throw new Error("Unexpected GitHub API origin");
    const response = await request(url.href, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/vnd.github+json",
        "cache-control": "no-cache",
        "user-agent": "VRCPDelivery",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
        const reset = response.headers.get("x-ratelimit-reset") ?? "";
        const retry = /^\d{1,12}$/.test(reset) ? ` Retry after ${new Date(Number(reset) * 1000).toISOString()}.` : "";
        throw new Error(`Release proof metadata is rate-limited (${response.status}).${retry} No tag push ran. Use an explicit read credential or retry after the limit resets.`);
      }
      throw new Error(`Release proof metadata unavailable (${response.status}); an explicit read credential may be required`);
    }
    if (!response.body) throw new Error("Missing release proof metadata");
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1_048_576) throw new Error("Release proof metadata exceeds its limit");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new Error("Invalid release proof metadata JSON"); }
  };
}

/** Bind a remote ref to its checked source, with bounded annotated-tag peeling. */
export async function checkRemoteTag(api, repository, tag, commit, expectedTagObject) {
  const ref = await api("GET", `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
  const validObject = object => object && /^[a-f0-9]{40}$/.test(object.sha ?? "") && ["tag", "commit"].includes(object.type);
  if (!/^[a-f0-9]{40}$/.test(commit ?? "") || ref?.ref !== `refs/tags/${tag}` || !validObject(ref.object)) {
    throw new Error("Invalid remote tag binding");
  }
  const tagObject = ref.object.sha;
  if (expectedTagObject && tagObject !== expectedTagObject) throw new Error("Remote tag object differs from the checked tag");
  let object = ref.object;
  for (let depth = 0; object.type === "tag"; depth++) {
    if (depth >= 4) throw new Error("Remote annotated tag chain exceeds its bound");
    const annotation = await api("GET", `/repos/${repository}/git/tags/${object.sha}`);
    if (annotation?.sha !== object.sha || !validObject(annotation.object)) throw new Error("Invalid remote annotated tag object");
    object = annotation.object;
  }
  if (object.sha !== commit) throw new Error("Remote tag differs from the checked source commit");
  return { tagObject, commit };
}

export function validateCIArtifact(receipt, expected, bytes) {
  if (!/^[a-f0-9]{40}$/.test(expected.commit ?? "") || receipt?.purpose !== "ci-release" ||
      !Object.entries(expected).every(([key, value]) => receipt[key] === value) ||
      receipt.sha256 !== createHash("sha256").update(bytes).digest("hex")) {
    throw new Error("CI artifact differs from its checked identity, configuration, commit or digest");
  }
}

export function selectTag(tag, configs, historical = false) {
  if (typeof tag !== "string" || tag.trim() !== tag) throw new Error("Tag must be an exact canonical string");
  const match = /^([a-z-]+)\/v(.+)$/.exec(tag);
  const product = match && Object.keys(productTagPrefixes).find(key =>
    productTagPrefixes[key] === match[1] || (historical && key === match[1]));
  if (!product || semver.valid(match[2]) !== match[2]) throw new Error("Expected a product-specific prefix and canonical version tag");
  const version = match[2];
  const matches = [];
  for (const channel of ["release", "preview"]) {
    if (product === "network" && channel === "release" && !historical) continue;
    if (configs[channel]?.[`${channel}-${product}`] === version) matches.push(channel);
  }
  if (matches.length !== 1) throw new Error("Tag must match exactly one version config. Equal channel values need an explicit channel-tag decision.");
  const channel = matches[0];
  const environment = product === "package"
    ? channel === "preview" ? "vrcp-api-preview" : "vrcp-api-release"
    : product === "worker" && channel === "preview" ? "cloudflare-preview"
    : channel === "preview" ? "preview" : "production";
  return { product, version, channel, environment };
}

export async function resolveTag(tag, workspace = root, historical = false) {
  const configs = Object.fromEntries(await Promise.all(["release", "preview"].map(async channel =>
    [channel, historical ? JSON.parse(readFileSync(resolve(workspace,
      channel === "release" ? "config.versions.json" : "config.preview.versions.json"), "utf8"))
      : (await readVersionConfig(channel, workspace)).config])));
  return selectTag(tag, configs, historical);
}

export function readReleaseTagProof(annotation, expected) {
  const boundary = typeof annotation === "string" ? annotation.indexOf("\n\n") : -1;
  if (boundary < 0) throw new Error("Invalid release tag annotation");
  const headers = annotation.slice(0, boundary).split("\n");
  if (!expected || !/^[a-f0-9]{40}$/.test(expected.commit ?? "") || typeof expected.tag !== "string") {
    throw new Error("Missing expected release tag identity");
  }
  for (const [key, value] of Object.entries({ object: expected.commit, type: "commit", tag: expected.tag })) {
    const values = headers.filter(line => line.startsWith(`${key} `));
    if (values.length !== 1 || values[0] !== `${key} ${value}`) throw new Error("Release annotation header differs from the expected tag identity");
  }
  const message = annotation.slice(boundary + 2);
  const trailer = key => {
    const lines = message.split(/\r?\n/).filter(line => line.startsWith(`${key}:`));
    if (lines.length !== 1 || !lines[0].startsWith(`${key}: `)) throw new Error("Missing or duplicated release tag proof trailer");
    return lines[0].slice(key.length + 2);
  };
  const directLines = message.split(/\r?\n/).filter(line => line.startsWith("VRCP-Release-Direct:"));
  if (directLines.length === 1 && directLines[0] === "VRCP-Release-Direct: true") {
    const base = trailer("VRCP-Release-Base");
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Invalid release direct base locator");
    return { direct: true, base, head: expected.commit };
  }
  const pr = trailer("VRCP-Release-PR"), head = trailer("VRCP-Release-Head"), base = trailer("VRCP-Release-Base");
  if (!/^[1-9][0-9]*$/.test(pr) || !Number.isSafeInteger(Number(pr)) || ![head, base].every(value => /^[a-f0-9]{40}$/.test(value))) {
    throw new Error("Invalid release PR locator");
  }
  return { prNumber: Number(pr), head, base };
}

/** Prove a single reviewed version commit. This does not authorize or perform a remote write. */
export async function checkReviewedRelease(selected, proof, api = readGitHubAPI()) {
  const { repository, commit, tag, prNumber, head, base, actor } = proof;
  const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const human = value => value?.type === "User" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.login ?? "");
  const timestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
      ![commit, head, base].every(sha) || head === base || !Number.isSafeInteger(prNumber) || prNumber < 1 ||
      selected?.channel !== "release" || !Object.hasOwn(productTagPrefixes, selected?.product ?? "") ||
      ["network", "web"].includes(selected.product) ||
      tag !== `${productTagPrefixes[selected.product]}/v${selected.version}` || semver.valid(selected.version) !== selected.version ||
      semver.prerelease(selected.version) !== null || (actor !== undefined && !human(actor))) {
    throw new Error("Invalid reviewed release identity or non-human release actor");
  }
  if (selected.product === "package") checkSDKPublicationVersion(selected.version);
  const prefix = `/repos/${repository}`, pull = `${prefix}/pulls/${prNumber}`;
  const pr = await api(pull);
  if (pr?.number !== prNumber || pr.state !== "closed" || pr.merged !== true || pr.draft !== false ||
      pr.base?.ref !== "main" || pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository ||
      pr.head?.sha !== head || pr.merge_commit_sha !== commit || pr.commits !== 1 || !human(pr.merged_by) ||
      pr.merged_by.login.toLowerCase() !== repository.split("/")[0].toLowerCase() ||
      !human(pr.user) || pr.auto_merge != null || !timestamp(pr.merged_at)) throw new Error("Release requires the exact merged main version PR");
  const commits = await api(`${pull}/commits?per_page=2`);
  if (!Array.isArray(commits) || commits.length !== 1 || commits[0]?.sha !== head ||
      commits[0].parents?.length !== 1 || commits[0].parents[0]?.sha !== base) {
    throw new Error("Version PR must contain one preparation commit based on the prepared main commit");
  }
  const prepared = await api(`${prefix}/commits/${head}`);
  const message = prepared?.commit?.message;
  if (prepared?.sha !== head || prepared.parents?.length !== 1 || prepared.parents[0]?.sha !== base || typeof message !== "string") {
    throw new Error("Invalid version preparation commit");
  }
  for (const [key, value] of Object.entries({ "VRCP-Release-Product": selected.product,
    "VRCP-Release-Version": selected.version, "VRCP-Release-Base": base })) {
    const lines = message.split(/\r?\n/).filter(line => line.startsWith(`${key}:`));
    if (lines.length !== 1 || lines[0] !== `${key}: ${value}`) throw new Error("Version preparation trailers differ from the selected release");
  }
  if (![`release/candidate/${selected.product}/v${selected.version}`, `codex/release/${selected.product}/v${selected.version}`].includes(pr.head.ref)) throw new Error("Unexpected version preparation branch");
  const merged = await api(`${prefix}/commits/${commit}`);
  if (merged?.sha !== commit || !Array.isArray(merged.parents) || ![1, 2].includes(merged.parents.length) ||
      !sha(merged.parents[0]?.sha) || (merged.parents.length === 2 && merged.parents[1]?.sha !== head)) {
    throw new Error("Main advanced beyond the reviewed preparation base");
  }
  let trackerParent;
  if (merged.parents[0].sha !== base) {
    trackerParent = merged.parents[0].sha;
    const advancement = await api(`${prefix}/compare/${base}...${trackerParent}`);
    if (advancement?.status !== "ahead" || advancement.base_commit?.sha !== base ||
        advancement.merge_base_commit?.sha !== base || !Number.isSafeInteger(advancement.total_commits) ||
        advancement.total_commits < 1 || advancement.total_commits > 20 ||
        !Array.isArray(advancement.commits) || advancement.commits.length !== advancement.total_commits ||
        advancement.commits.at(-1)?.sha !== trackerParent ||
        new Set(advancement.commits.map(value => value.sha)).size !== advancement.total_commits) {
      throw new Error("Incomplete tracker-only main advancement evidence");
    }
    // Check each commit, not only the net diff: reverted runtime changes are not exempt.
    for (const entry of advancement.commits) {
      if (!sha(entry?.sha)) throw new Error("Invalid tracker advancement commit");
      const changed = await api(`${prefix}/commits/${entry.sha}`);
      if (changed?.sha !== entry.sha || !Array.isArray(changed.files) || changed.files.length !== 1 ||
          !isApprovedTaskTracker(changed.files[0]?.filename) || changed.files[0]?.status !== "modified") {
        throw new Error("Main advancement changed more than the approved task tracker");
      }
    }
  }
  const ancestry = await api(`${prefix}/compare/${commit}...main`);
  if (!["ahead", "identical"].includes(ancestry?.status) || ancestry.base_commit?.sha !== commit ||
      ancestry.merge_base_commit?.sha !== commit) throw new Error("Reviewed release commit is not reachable from main");
  const configs = {};
  for (const revision of [base, head, commit]) {
    configs[revision] = {};
    for (const channel of ["release", "preview"]) {
      const path = channel === "release" ? "config.versions.json" : "config.preview.versions.json";
      const file = await api(`${prefix}/contents/${path}?ref=${revision}`);
      if (file?.type !== "file" || file.path !== path || file.encoding !== "base64" ||
          typeof file.content !== "string" || file.content.length > 32_768 ||
          !/^[A-Za-z0-9+/=\r\n]*$/.test(file.content)) throw new Error("Invalid version config evidence");
      const config = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
      const keys = Object.keys(productDirectories).filter(product => channel !== "release" || product !== "network")
        .map(product => `${channel}-${product}`);
      if (!config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).length !== keys.length ||
          keys.some(key => !Object.hasOwn(config, key) || semver.valid(config[key]) !== config[key] ||
            (channel === "release" && semver.prerelease(config[key]) !== null))) {
        throw new Error("Version config evidence has invalid keys or versions");
      }
      configs[revision][channel] = config;
    }
  }
  const key = `release-${selected.product}`, previous = configs[base].release[key];
  if (semver.inc(previous, "patch") !== selected.version ||
      Object.keys(configs[base].release).some(name => configs[head].release[name] !== (name === key ? selected.version : configs[base].release[name])) ||
      Object.keys(configs[base].preview).some(name => configs[head].preview[name] !== configs[base].preview[name]) ||
      ["release", "preview"].some(channel => Object.keys(configs[head][channel]).some(name => configs[commit][channel][name] !== configs[head][channel][name]))) {
    throw new Error("Reviewed version PR must change only the selected release config patch");
  }
  for (const revision of [head, commit]) {
    const routed = selectTag(tag, configs[revision]);
    if (routed.product !== selected.product || routed.channel !== "release" || routed.version !== selected.version) {
      throw new Error("Reviewed release tag differs from its configs");
    }
  }
  const reviews = await api(`${pull}/reviews?per_page=100`);
  if (!Array.isArray(reviews) || reviews.length >= 100) throw new Error("Review evidence is missing or exceeds its limit");
  const latest = new Map(), ids = new Set();
  for (const review of reviews) {
    if (!Number.isSafeInteger(review?.id) || review.id < 1 || ids.has(review.id) || !review.user?.login ||
        !["APPROVED", "CHANGES_REQUESTED", "DISMISSED", "COMMENTED", "PENDING"].includes(review.state)) throw new Error("Malformed release review evidence");
    ids.add(review.id);
    if (["COMMENTED", "PENDING"].includes(review.state)) continue;
    if (!timestamp(review.submitted_at)) throw new Error("Invalid release review timestamp");
    const old = latest.get(review.user.login.toLowerCase());
    if (!old || Date.parse(old.submitted_at) < Date.parse(review.submitted_at) ||
        (Date.parse(old.submitted_at) === Date.parse(review.submitted_at) && old.id < review.id)) latest.set(review.user.login.toLowerCase(), review);
  }
  if ([...latest.values()].some(review => review.state === "CHANGES_REQUESTED")) throw new Error("Release PR has unresolved requested changes");
  // Owner-selected policy: manual owner inspection and merge replaces a second-person approval.
  // The API proves merge identity, not the human inspection process. Never merge through this executor.
  if (!Array.isArray(prepared.files) || !prepared.files.length || prepared.files.length > 8 ||
      prepared.files.some(file => typeof file?.filename !== "string" || !["modified", "added"].includes(file.status)) ||
      new Set(prepared.files.map(file => file.filename)).size !== prepared.files.length) throw new Error("Invalid prepared metadata file evidence");
  return { repository, commit, tag, prNumber, head, base, previous, version: selected.version,
    preparedFiles: prepared.files.map(file => file.filename), ...(trackerParent ? { trackerParent } : {}) };
}

/** Reproduce metadata with the existing allocator. Never run code from the reviewed tree. */
export async function checkReleaseMetadata(selected, proof, workspace = root, git = readGit) {
  const { base, head, commit = head } = proof;
  if (selected?.channel !== "release" || !releaseProducts.includes(selected.product) ||
      ![base, head, commit].every(value => /^[a-f0-9]{40}$/.test(value ?? ""))) throw new Error("Invalid release metadata identity");
  const paths = ["config.versions.json", "config.preview.versions.json", `${productDirectories[selected.product]}/package.json`,
    ...(selected.product === "package" ? [`${productDirectories.network}/package.json`] : []),
    ...(selected.product === "crawler-client" ? ["src-crawler-client/src-tauri/Cargo.toml", "src-crawler-client/src-tauri/tauri.conf.json"] : [])];
  const text = (revision, path) => {
    const entry = git(workspace, "ls-tree", revision, "--", path).trim();
    if (!/^100644 blob [a-f0-9]{40}\t/.test(entry) || entry.split("\t")[1] !== path) throw new Error("Release metadata must be regular tracked files");
    const value = git(workspace, "show", `${revision}:${path}`);
    if (Buffer.byteLength(value) > 524_288) throw new Error("Release metadata exceeds its size limit");
    return value.replace(/\r\n/g, "\n").trimEnd() + "\n";
  };
  const parent = realpathSync(tmpdir()), directory = mkdtempSync(join(parent, "vrcp-release-metadata-"));
  if (!realpathSync(directory).startsWith(parent + sep)) throw new Error("Unsafe release metadata fixture");
  try {
    for (const path of ["CHANGELOG.md", "docs/source/CHANGELOG.md"]) {
      if (git(workspace, "ls-tree", base, "--", path).trim()) paths.push(path);
    }
    const hasChangelog = paths.includes("CHANGELOG.md") || paths.includes("docs/source/CHANGELOG.md");
    const prior = new Map();
    for (const path of paths) {
      const value = text(base, path);
      prior.set(path, value);
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, value);
    }
    const bumped = await bumpVersion("release", selected.product, "patch", directory);
    if (bumped.version !== selected.version) throw new Error("Release metadata skips the next configured patch");
    await versionFiles("sync", "release", selected.product, directory);
    if (hasChangelog) {
      const changelogResult = extractProductChangelog("release", selected.product, bumped.version, directory);
      for (const file of changelogResult?.changed ?? []) {
        const rel = relative(directory, file).replace(/\\/g, "/");
        if (!paths.includes(rel)) paths.push(rel);
      }
    }
    const expected = new Map(paths.map(path => [path, readFileSync(join(directory, path), "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n"]));
    const changed = paths.filter(path => expected.get(path) !== prior.get(path)).sort();
    const actual = git(workspace, "diff", "--name-only", "--no-renames", base, head, "--").trim().split("\n").filter(Boolean).sort();
    if (JSON.stringify(actual) !== JSON.stringify(changed) || (proof.preparedFiles &&
        JSON.stringify([...proof.preparedFiles].sort()) !== JSON.stringify(changed))) throw new Error("Release preparation changes files outside generated metadata");
    for (const path of paths) {
      if (text(head, path) !== expected.get(path)) throw new Error("Release preparation differs from generated metadata");
    }
    if (git(workspace, "rev-parse", `${head}^{tree}`).trim() !== git(workspace, "rev-parse", `${commit}^{tree}`).trim()) {
      const diffLines = git(workspace, "diff", "--name-status", "--no-renames", head, commit, "--").trim().split(/\r?\n/).filter(Boolean);
      const trackerEntries = diffLines.map(line => line.split("\t"));
      if (!/^[a-f0-9]{40}$/.test(proof.trackerParent ?? "") ||
          trackerEntries.length === 0 ||
          trackerEntries.some(parts => parts.length !== 2 || parts[0] !== "M" || !isApprovedTaskTracker(parts[1])) ||
          trackerEntries.some(([, file]) => text(proof.trackerParent, file) !== text(commit, file))) {
        throw new Error("Merged release tree differs from the reviewed preparation");
      }
    }
    return { changed, previous: bumped.previous, version: bumped.version };
  } finally {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() ||
        !realpathSync(directory).startsWith(parent + sep)) throw new Error("Unsafe release metadata cleanup");
    rmSync(directory, { recursive: true });
  }
}

/** Bind an immutable tag to reviewed main metadata, or one exact historical identity. */
export async function checkReleaseSource(selected, source, api = readGitHubAPI(), git = readGit, workspace = root) {
  const { repository, commit, tag, tagObject: expectedTagObject, actor, context } = source;
  const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const human = value => value?.type === "User" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.login ?? "");
  if (selected?.channel !== "release" || !releaseProducts.includes(selected?.product ?? "") ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !sha(commit) ||
      (expectedTagObject !== undefined && !sha(expectedTagObject)) || (actor !== undefined && !human(actor)) ||
      semver.valid(selected.version) !== selected.version || semver.prerelease(selected.version) !== null ||
      ![`${productTagPrefixes[selected.product]}/v${selected.version}`, `${selected.product}/v${selected.version}`].includes(tag)) {
    throw new Error("Invalid release source identity or non-human release actor");
  }
  if (selected.product === "package") checkSDKPublicationVersion(selected.version);
  if (context && (context.event !== "push" || context.head_branch !== tag || context.head_sha !== commit ||
      context.head_repository?.full_name !== repository || context.path !== `.github/workflows/${productWorkflows[selected.product]}.yml` ||
      !human(context.actor) || (actor !== undefined && (context.actor.login !== actor.login || context.actor.type !== actor.type)))) {
    throw new Error("Release source differs from the original product tag-push run");
  }
  const ref = `refs/tags/${tag}`;
  const tagObject = git(workspace, "rev-parse", "--verify", ref).trim();
  if (!sha(tagObject) || (expectedTagObject && expectedTagObject !== tagObject) ||
      git(workspace, "cat-file", "-t", tagObject).trim() !== "tag" ||
      git(workspace, "rev-parse", "--verify", `${ref}^{commit}`).trim() !== commit) {
    throw new Error("Release requires the exact local annotated tag and source commit");
  }
  let remoteAnnotation;
  await checkRemoteTag(async (method, path) => {
    if (method !== "GET") throw new Error("Release proof permits only metadata reads");
    const value = await api(path);
    if (path.includes("/git/ref/tags/") && value?.object?.type !== "tag") throw new Error("Release requires an annotated remote tag");
    if (path === `/repos/${repository}/git/tags/${tagObject}`) remoteAnnotation = value;
    return value;
  }, repository, tag, commit, tagObject);
  const baselinePath = join(workspace, ".github/release-baseline.json");
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (baseline?.schemaVersion !== 1 || typeof baseline.repository !== "string" ||
        !baseline.tags || typeof baseline.tags !== "object" || Array.isArray(baseline.tags)) throw new Error("Invalid immutable release baseline");
    const identity = Object.hasOwn(baseline.tags, tag) ? baseline.tags[tag] : undefined;
    if (baseline.repository === repository && identity?.tagObject === tagObject && identity.commit === commit) {
      return { repository, commit, tag, tagObject, baseline: true };
    }
  }
  if (tag !== `${productTagPrefixes[selected.product]}/v${selected.version}`) throw new Error("Historical release tag has no exact baseline identity");
  const annotation = git(workspace, "cat-file", "-p", tagObject);
  const tagProof = readReleaseTagProof(annotation, { tag, commit });
  if (remoteAnnotation?.object?.type !== "commit" ||
      remoteAnnotation.object.sha !== commit || remoteAnnotation.tag !== tag) throw new Error("Invalid release tag annotation");
  if (tagProof.direct) {
    const owner = repository.split("/")[0].toLowerCase();
    const releaseActor = actor ?? context?.actor;
    if (!human(releaseActor) || releaseActor.login.toLowerCase() !== owner) {
      throw new Error("Direct release requires repository owner actor");
    }
    const proof = { repository, commit, tag, head: commit, base: tagProof.base, direct: true };
    const metadata = await checkReleaseMetadata(selected, proof, workspace, git);
    return { ...proof, tagObject, metadata, baseline: false };
  }
  const proof = await checkReviewedRelease(selected, { repository, commit, tag, ...tagProof, actor: actor ?? context?.actor }, api);
  const metadata = await checkReleaseMetadata(selected, proof, workspace, git);
  return { ...proof, tagObject, metadata, baseline: false };
}
