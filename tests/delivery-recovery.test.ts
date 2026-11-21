import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";
import { recoveryIdentity, recoveryRunMatches, checkRecoveryRun, checkRecoveryRetry, checkRecoveryReceipts, requireRecoveryCI, ciSourceCommit, authorizeRecovery, diagnoseFailure, rerunWorkflowRun, revertDeliveryTag, createPatchBranch, mergeAndCleanupPatchBranch, promptInteractiveRecovery, supersededPreviewTag, temporaryVersionRule, activeTemporaryVersionRule, occupiedTemporaryVersions } from "../scripts/delivery-recovery.mjs";
import { deliveryTroubleshooting, resolveEffectivePredecessor, requirePredecessorPublicationProof, requirePublicationProof, inspectPredecessorAssets, planDelivery } from "../scripts/delivery-chain.mjs";

function fixture(tag = "vrcp-crawler/v0.0.6") {
  const identity = recoveryIdentity(tag);
  const workflow = { crawler: "node-docker", network: "network", "crawler-client": "node-client" }[identity.product];
  const toolingCommit = "a".repeat(40);
  const run = { id: 99, event: "workflow_dispatch", head_branch: "main", head_sha: toolingCommit,
    head_repository: { full_name: identity.repository }, path: `.github/workflows/${workflow}.yml`,
    display_title: `Recover ${identity.product} ${identity.tag}`, actor: { type: "User", login: "SlamTheDragon" } };
  const prefix = `/repos/${identity.repository}`;
  const responses: Record<string, any> = {
    [`${prefix}/compare/${toolingCommit}...main`]: { status: "identical", base_commit: { sha: toolingCommit }, merge_base_commit: { sha: toolingCommit } },
    [`${prefix}/contents/.github/delivery-recoveries.json?ref=${toolingCommit}`]: {
      type: "file", path: ".github/delivery-recoveries.json", encoding: "base64",
      content: Buffer.from(readFileSync(new URL("../.github/delivery-recoveries.json", import.meta.url))).toString("base64") },
    [`${prefix}/actions/runs/${identity.failedRun}`]: { event: "push", head_branch: identity.tag, head_sha: identity.commit,
      path: run.path, head_repository: run.head_repository, status: "completed", conclusion: "failure" },
    [`${prefix}/actions/runs/${identity.failedRun}/jobs?per_page=100`]: { total_count: 2,
      jobs: [{ name: identity.product === "crawler" ? "route" : "build", conclusion: "failure" },
        { name: "release-assets", conclusion: "skipped" }] },
    [`${prefix}/actions/runs/${identity.failedRun}/artifacts?per_page=100`]: { total_count: 0, artifacts: [] },
  };
  const api = async (path: string) => {
    if (!Object.hasOwn(responses, path)) throw new Error(`Unexpected recovery read: ${path}`);
    return structuredClone(responses[path]);
  };
  return { identity, run, prefix, responses, api, toolingCommit };
}

test("only the exact approved failed crawler identity can enter recovery", () => {
  const f = fixture();
  expect(f.identity.commit).toBe("995db61eeafdf9a51f09902387411b258080fdc3");
  expect(f.identity.tagObject).toBe("41039d1f0020a95eda00cd898654d35c093bde25");
  for (const tag of ["vrcp-crawler/v0.0.999", "vrcp-api/v0.0.6", "vrcp-crawler/v0.0.6-retry1", "__proto__"]) {
    expect(() => recoveryIdentity(tag)).toThrow("exact owner-reviewed");
  }
  expect(ciSourceCommit({ GITHUB_SHA: f.toolingCommit } as any)).toBe(f.toolingCommit);
  expect(ciSourceCommit({ GITHUB_SHA: f.toolingCommit, VRCP_RECOVERY_TAG: f.identity.tag } as any)).toBe(f.identity.commit);
});

test("recovery binds an owner-dispatched main attempt to reviewed tooling and the original failed route", async () => {
  const f = fixture();
  expect(await checkRecoveryRun(f.run, f.identity, f.api)).toEqual({ ...f.identity, toolingCommit: f.toolingCommit, recoveryRun: 99 });
  for (const changes of [ { event: "push" }, { head_branch: "preview" }, { path: ".github/workflows/other.yml" },
    { head_sha: "bad" }, { display_title: "another attempt" }, { actor: { type: "Bot", login: "SlamTheDragon" } },
    { actor: { type: "User", login: "other" } }, { head_repository: { full_name: "fork/repo" } } ]) {
    expect(recoveryRunMatches({ ...f.run, ...changes }, f.identity)).toBe(false);
    await expect(checkRecoveryRun({ ...f.run, ...changes }, f.identity, f.api)).rejects.toThrow("owner on reviewed main");
  }
});

test("exact preview recoveries retain failed source and reject changed stages or outputs", async () => {
  for (const tag of ["vrcp-network/v2026.10.4", "vrcp-crawler-client/v26.10.5-pre"]) {
    const f = fixture(tag);
    const proof = await checkRecoveryRun(f.run, f.identity, f.api);
    expect(proof.commit).toBe(f.identity.commit);
    expect(proof.tagObject).toBe(f.identity.tagObject);
    const name = f.identity.product === "network" ? `vrc-packages-network-${f.identity.version}.tgz.json` : "crawler-client.receipt.json";
    const receipt = { commit: proof.commit, recovery: { toolingCommit: proof.toolingCommit,
      sourceRun: proof.recoveryRun, failedRun: proof.failedRun } };
    const files = new Map([[name, Buffer.from(JSON.stringify(receipt))]]);
    expect(() => checkRecoveryReceipts(files, proof)).not.toThrow();
    receipt.recovery.toolingCommit = "b".repeat(40);
    expect(() => checkRecoveryReceipts(new Map([[name, Buffer.from(JSON.stringify(receipt))]]), proof)).toThrow();
    f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`].jobs[1].conclusion = "success";
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
    expect(recoveryRunMatches({ ...f.run, head_branch: "preview" }, f.identity)).toBe(false);
  }
});

test("GitHub's terminal acknowledgment record does not become a prior publication job", async () => {
  const f = fixture("vrcp-crawler-client/v26.10.5-pre");
  const jobs = f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`];
  const job = { id: 123, name: `VRCP Discord release: ${f.identity.tag}`, runner_id: null,
    labels: [], status: "completed", conclusion: "success" };
  jobs.jobs.push(job); jobs.total_count++;
  const check = { id: job.id, name: job.name, head_sha: f.identity.commit, status: "completed", conclusion: "success",
    external_id: "discord:123456", app: { slug: "github-actions" } };
  f.responses[`${f.prefix}/check-runs/123`] = check;
  expect((await checkRecoveryRun(f.run, f.identity, f.api)).commit).toBe(f.identity.commit);
  for (const change of [{ head_sha: "b".repeat(40) }, { external_id: "release:123" },
    { app: { slug: "other" } }, { conclusion: "failure" }, { name: "another check" }]) {
    f.responses[`${f.prefix}/check-runs/123`] = { ...check, ...change };
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("Terminal check identity");
  }
  f.responses[`${f.prefix}/check-runs/123`] = check;
  job.runner_id = 1 as any;
  await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("Unverified terminal");
  job.runner_id = null;
  jobs.jobs.push({ name: "publish", conclusion: "success" }); jobs.total_count++;
  await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
});

test("crawler dependency recovery permits only the exact output-free preparation failure", async () => {
  const f = fixture("vrcp-crawler/v0.0.7");
  const path = `${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`;
  const steps = [
    { name: "Run bun test ./tests", number: 8, status: "completed", conclusion: "success" },
    { name: "Run node scripts/delivery.mjs prepare 'release' crawler --ci", number: 9, status: "completed", conclusion: "failure" },
    { name: "Verify package contracts and node", number: 10, status: "completed", conclusion: "skipped" },
    { name: "Post Checkout repository", number: 20, status: "completed", conclusion: "success" }
  ];
  const jobs = [ { name: "route", conclusion: "success" },
    ...["build-linux", "standalone-windows"].map(name => {
      const cloned = structuredClone(steps);
      if (name === "standalone-windows") cloned[3].name = "Post Run actions/checkout@v4";
      return { name, conclusion: "failure", steps: cloned };
    }),
    { name: "publish-container", conclusion: "skipped" }, { name: "release-assets", conclusion: "skipped" } ];
  f.responses[path] = { total_count: jobs.length, jobs };
  expect((await checkRecoveryRun(f.run, f.identity, f.api)).failedStage).toBe("dependency-prepare");
  for (const mutate of [
    (j: any[]) => { j[1].steps[1].name = "Build product"; },
    (j: any[]) => { j[2].steps[2].conclusion = "success"; },
    (j: any[]) => { j[1].steps[0].conclusion = "failure"; },
    (j: any[]) => { j[1].steps = undefined; },
    (j: any[]) => { j[4].conclusion = "success"; },
    (j: any[]) => { j[0].conclusion = "failure"; },
    (j: any[]) => { j[2].name = "build-linux"; },
    (j: any[]) => { j[1].steps[3].name = "Post Build product"; },
    (j: any[]) => { j[1].steps[2].number = 8; },
    (j: any[]) => { j[1].steps[0].number = 0; },
    (j: any[]) => { j[1].steps.reverse(); },
    (j: any[]) => { j[1].steps[2].name = steps[1].name; }
  ]) {
    const changed = structuredClone(jobs); mutate(changed);
    f.responses[path] = { total_count: changed.length, jobs: changed };
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
  }
  f.responses[path] = { total_count: jobs.length, jobs };
  const retryJobsPath = `${f.prefix}/actions/runs/99/jobs?per_page=100`;
  f.responses[retryJobsPath] = structuredClone(f.responses[path]);
  f.responses[`${f.prefix}/actions/runs/99/artifacts?per_page=100`] = { total_count: 0, artifacts: [] };
  const attempt = { ...f.run, status: "completed", conclusion: "failure" };
  expect(await checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).toEqual([99]);
  f.responses[retryJobsPath].jobs[1].steps[1].name = "Build product";
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("publication activity");
});

test("recovery rejects changed authorization, missing ancestry, prior builds and partial artifacts", async () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.responses[`${f.prefix}/compare/${f.toolingCommit}...main`].status = "diverged"; },
    f => { f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${f.toolingCommit}`].content = Buffer.from('{"schemaVersion":1,"repository":"SlamTheDragon/vrc-packages","tags":{}}').toString("base64"); },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}`].head_sha = f.toolingCommit; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`].jobs[1].conclusion = "success"; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/artifacts?per_page=100`].total_count = 1; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/artifacts?per_page=100`].artifacts = [{}]; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow();
  }
});

test("manual recovery retry rejects active, unchanged-tooling and publication-output attempts", async () => {
  const f = fixture();
  const attempt = { ...f.run, status: "completed", conclusion: "failure" };
  const jobsPath = `${f.prefix}/actions/runs/99/jobs?per_page=100`;
  f.responses[jobsPath] = { total_count: 3, jobs: [
    { name: "route", conclusion: "success" }, { name: "build-linux", conclusion: "failure" },
    { name: "publish-container", conclusion: "skipped" }] };
  // Build artifacts alone no longer block a retry; only publication activity does.
  expect(await checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).toEqual([99]);
  await expect(checkRecoveryRetry([], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  await expect(checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api)).rejects.toThrow("different reviewed tooling");
  await expect(checkRecoveryRetry([{ ...attempt, status: "in_progress" }], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  // Publication job running must still block retry.
  f.responses[jobsPath].jobs[2].conclusion = "failure";
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("publication activity");
  f.responses[jobsPath].jobs[2].conclusion = "skipped";
  f.responses[jobsPath].total_count = 4;
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("incomplete evidence");
});

test("a recovery environment variable cannot turn a local or non-main job into a release", async () => {
  const f = fixture();
  const env = { VRCP_RECOVERY_TAG: f.identity.tag, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_SHA: f.toolingCommit, GITHUB_REPOSITORY: f.identity.repository, GITHUB_RUN_ID: "99" };
  for (const changes of [{ GITHUB_ACTIONS: "false" }, { GITHUB_REF: "refs/heads/preview" }, { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY: "other/repo" }, { GITHUB_RUN_ID: "" }]) {
    await expect(requireRecoveryCI("crawler", "release", { ...env, ...changes }, ".", f.api)).rejects.toThrow("dedicated owner-dispatched");
  }
  await expect(requireRecoveryCI("crawler", "preview", env, ".", f.api)).rejects.toThrow("dedicated owner-dispatched");
  f.responses[`${f.prefix}/actions/runs/99`] = f.run;
  await expect(requireRecoveryCI("crawler", "release", env, ".", f.api, () => f.toolingCommit))
    .rejects.toThrow("product source or saved version configs");
  await expect(requireRecoveryCI("crawler", "release", env, ".", f.api,
    (_workspace: string, action: string) => action === "rev-parse" ? f.identity.commit : "changed source"))
    .rejects.toThrow("product source or saved version configs");
});

test("crawler recovery stays in the existing chain and preserves publication approval and source checkout", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/node-docker.yml", import.meta.url), "utf8"));
  expect(workflow.on.workflow_dispatch.inputs["recovery-tag"].required).toBe(true);
  expect(workflow.env.VRCP_RECOVERY_TAG).toBe("${{ inputs.recovery-tag || '' }}");
  for (const name of ["route", "build-linux", "standalone-windows", "publish-container"]) {
    const steps = workflow.jobs[name].steps;
    expect(steps.find((step: any) => step.uses === "actions/checkout@v4").with.ref).toBe("${{ inputs.recovery-tag || github.ref }}");
    const install = steps.find((step: any) => step.name === "Restore reviewed recovery tooling only");
    expect(install.if).toBe("inputs.recovery-tag != ''");
    expect(install.run).toContain('git restore --source="$GITHUB_SHA" --worktree --no-overlay -- scripts tests package.json .github');
    expect(install.run).not.toContain("src-crawler");
  }
  expect(workflow.jobs["publish-container"].environment.name).toContain("vrcp-crawler-release");
  expect(workflow.jobs["release-assets"].needs).toContain("publish-container");
  expect(workflow.jobs["release-assets"].with.tag).toBe("${{ inputs.recovery-tag || '' }}");
  const rootScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  expect(rootScripts["publish:recover"]).toBe("node scripts/delivery-recovery.mjs");
});

test("the real recovery CLI reaches metadata reads without an unsettled ESM entry point", () => {
  const directory = mkdtempSync(join(tmpdir(), "vrcp-recovery-cli-"));
  try {
    const preload = join(directory, "offline-metadata.mjs");
    // This entry-point test must not depend on historical objects in a shallow checkout.
    // Supply only its historical config reads. The production Git reader stays unchanged.
    const identity = recoveryIdentity("vrcp-crawler/v0.0.6");
    const configs = Object.fromEntries(["config.versions.json", "config.preview.versions.json"].map(path => {
      const config = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
      if (path === "config.versions.json") config["release-crawler"] = "0.0.6";
      return [`${identity.commit}:${path}`, JSON.stringify(config)];
    }));
    writeFileSync(preload, `import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const original = childProcess.execFileSync;
const configs = ${JSON.stringify(configs)};
childProcess.execFileSync = function(file, args, options) {
  if (file === "git" && args[0] === "show" && Object.hasOwn(configs, args[1])) return configs[args[1]];
  return original(file, args, options);
};
syncBuiltinESMExports();
globalThis.fetch = async () => new Response("{}", {status: 503});
`);
    const result = spawnSync("node", ["--import", pathToFileURL(preload).href, "scripts/delivery-recovery.mjs", "vrcp-crawler/v0.0.6"],
      { encoding: "utf8", timeout: 20_000, env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "" } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("503");
    expect(result.stderr).not.toContain("unsettled top-level await");
  } finally { rmSync(directory, { recursive: true }); }
});

test("troubleshooting adapts to observed phases without authorizing blind retries", () => {
  for (const [status, job, stage] of [
    ["ci-failed", "route", "routing"], ["ci-failed", "build-linux", "build-or-runtime-check"],
    ["ci-failed", "publish-container", "publication"], ["ci-failed", "release-assets / attach", "release-attachment"],
    ["ci-active-or-awaiting-environment", "publish-container", "execution-or-review-pending"],
    ["awaiting-npm-owner-approval", "publish", "npm-staging"], ["ci-not-observed", "", "tag-trigger"] ]) {
    const result = deliveryTroubleshooting({ tag: "vrcp-crawler/v0.0.6", status,
      jobs: job ? [{ name: job, conclusion: "failure" }] : [] });
    expect(result.stage).toBe(stage);
    expect(result.readOnly).toBe(true);
    expect(result.automaticRetry).toBe(false);
    expect(result.next.every((command: string) => !command.includes("--execute"))).toBe(true);
  }
  const unknown = deliveryTroubleshooting({ tag: "vrcp-crawler/v0.0.999", status: "ci-failed", jobs: [] });
  expect(unknown.next.join("\n")).not.toContain("delivery:recover");
});

test("public recovery receipts bind both binaries to source, reviewed tooling and the exact attempt", async () => {
  const f = fixture(), proof = await checkRecoveryRun(f.run, f.identity, f.api);
  const recovery = { toolingCommit: f.toolingCommit, sourceRun: 99, failedRun: f.identity.failedRun };
  const files = () => new Map(["crawler-linux.receipt.json", "crawler-windows.receipt.json"].map(name =>
    [name, Buffer.from(JSON.stringify({ commit: f.identity.commit, recovery }))]));
  expect(() => checkRecoveryReceipts(files(), proof)).not.toThrow();
  for (const changes of [{ toolingCommit: f.identity.commit }, { sourceRun: 100 }, { failedRun: 1 }, { unexpected: true }]) {
    const altered = files();
    altered.set("crawler-linux.receipt.json", Buffer.from(JSON.stringify({ commit: f.identity.commit, recovery: { ...recovery, ...changes } })));
    expect(() => checkRecoveryReceipts(altered, proof)).toThrow("Recovery receipt differs");
  }
  const absent = files(); absent.delete("crawler-windows.receipt.json");
  expect(() => checkRecoveryReceipts(absent, proof)).toThrow("missing");
});

test("authorizeRecovery resolves tag data and produces a valid manifest entry without manual JSON editing", async () => {
  const f = fixture();
  const tag = "vrcp-crawler/v0.0.8";
  const commit = "69387f5944a18819be763d80201c0cc7197cc717";
  const tagObject = "54dcc2f18367530ce18cdededc5142cb4ca5b3b7";
  const failedRunId = 37513932543;
  const api = async (path: string) => {
    if (path.includes(`/git/refs/tags/${tag}`))
      return { ref: `refs/tags/${tag}`, object: { type: "tag", sha: tagObject } };
    if (path.includes(`/git/tags/${tagObject}`))
      return { object: { sha: commit } };
    if (path.includes(`/actions/runs/${failedRunId}`))
      return { event: "push", head_branch: tag, head_sha: commit, status: "completed", conclusion: "failure" };
    throw new Error(`Unexpected authorize read: ${path}`);
  };
  const result = await authorizeRecovery(tag, { execute: false, failedRunId }, f.prefix.split("/repos/")[1] ? undefined : undefined, api);
  expect(result.status).toBe("authorize-plan");
  expect(result.readOnly).toBe(true);
  expect(result.entry.product).toBe("crawler");
  expect(result.entry.version).toBe("0.0.8");
  expect(result.entry.commit).toBe(commit);
  expect(result.entry.tagObject).toBe(tagObject);
  expect(result.entry.failedRun).toBe(failedRunId);
  expect(result.next).toContain("--execute");
  // Rejects unknown product prefix
  await expect(authorizeRecovery("unknown/v0.0.1", {}, undefined, api)).rejects.toThrow("recoverable product prefix");
});

test("retry allows prior build artifacts when no publication activity occurred", async () => {
  const f = fixture();
  const retryTooling = "b".repeat(40);
  const attempt = { id: 200, event: "workflow_dispatch", head_branch: "main",
    head_sha: retryTooling, head_repository: f.run.head_repository,
    path: f.run.path, display_title: f.run.display_title,
    actor: f.run.actor, status: "completed", conclusion: "failure" };
  // Wire ancestry and manifest reads for the recovery attempt's head_sha.
  f.responses[`${f.prefix}/compare/${retryTooling}...main`] =
    { status: "identical", base_commit: { sha: retryTooling }, merge_base_commit: { sha: retryTooling } };
  f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${retryTooling}`] =
    f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${f.toolingCommit}`];
  const jobsPath = `${f.prefix}/actions/runs/200/jobs?per_page=100`;
  f.responses[jobsPath] = { total_count: 3, jobs: [
    { name: "route", conclusion: "success" },
    { name: "standalone-windows", conclusion: "success" },
    { name: "build-linux", conclusion: "failure" }
  ]};
  // Should NOT throw — Windows build artifact existed but no publication ran.
  // retryTooling differs from f.toolingCommit so same-tooling guard passes.
  const retryOf = await checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api);
  expect(retryOf).toEqual([200]);
  // Publication job running must still block retry.
  f.responses[jobsPath].jobs[2] = { name: "publish-container", conclusion: "success" };
  f.responses[jobsPath].total_count = 3;
  await expect(checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api))
    .rejects.toThrow("publication activity");
});

test("diagnoseFailure categorizes transient, collision, and defect failures accurately", () => {
  // Transient error
  const transientDiag = diagnoseFailure({ error: "FetchError: request to https://api.github.com timed out" });
  expect(transientDiag.category).toBe("transient");
  expect(transientDiag.severity).toBe("low");
  expect(transientDiag.continuity).toBe("resumable");
  expect(transientDiag.suggestedActions).toContain("rerun-failed-jobs");

  // Transient job conclusion
  const jobTimeoutDiag = diagnoseFailure({ jobs: [{ name: "build-linux", status: "completed", conclusion: "timed_out" }] });
  expect(jobTimeoutDiag.category).toBe("transient");
  expect(jobTimeoutDiag.continuity).toBe("resumable");

  // Collision error
  const collisionDiag = diagnoseFailure({ error: "Delivery aborted: Local tag already exists" });
  expect(collisionDiag.category).toBe("collision");
  expect(collisionDiag.severity).toBe("medium");
  expect(collisionDiag.continuity).toBe("requires-reversion");
  expect(collisionDiag.suggestedActions).toContain("revert-tag");

  // Defect / test failure
  const defectDiag = diagnoseFailure({ error: "bun test failed with 2 assertions failing" });
  expect(defectDiag.category).toBe("defect");
  expect(defectDiag.severity).toBe("critical");
  expect(defectDiag.continuity).toBe("requires-patch");
  expect(defectDiag.suggestedActions).toContain("create-patch-branch");

  // Build failure in jobs
  const buildJobDiag = diagnoseFailure({ jobs: [{ name: "build", status: "completed", conclusion: "failure" }] });
  expect(buildJobDiag.category).toBe("defect");
  expect(buildJobDiag.severity).toBe("critical");
  expect(buildJobDiag.continuity).toBe("requires-patch");

  // Unknown failure
  const unknownDiag = diagnoseFailure({ error: "Something unusual happened" });
  expect(unknownDiag.category).toBe("unknown");
  expect(unknownDiag.severity).toBe("high");
  expect(unknownDiag.continuity).toBe("requires-investigation");
});

test("rerunWorkflowRun calls GitHub actions rerun endpoint", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  const fetchMock = async (url: string, opts: any) => {
    requestedUrl = url;
    requestedMethod = opts.method;
    return new Response(JSON.stringify({}), { status: 201 });
  };
  const res = await rerunWorkflowRun("SlamTheDragon/vrc-packages", 12345, {
    failedJobsOnly: true,
    token: "ghp_fake_token",
    fetchFn: fetchMock as any
  });
  expect(res.status).toBe("rerun-dispatched");
  expect(requestedUrl).toBe("https://api.github.com/repos/SlamTheDragon/vrc-packages/actions/runs/12345/rerun-failed-jobs");
  expect(requestedMethod).toBe("POST");
});

test("revertDeliveryTag deletes local tag and invokes remote DELETE when requested", async () => {
  const gitLog: string[] = [];
  const mockGit = (_cwd: string, ...args: string[]) => {
    gitLog.push(args.join(" "));
    return "";
  };
  let remoteDeletedUrl = "";
  const fetchMock = async (url: string, opts: any) => {
    if (opts.method === "DELETE") remoteDeletedUrl = url;
    return new Response(null, { status: 204 });
  };

  const res = await revertDeliveryTag("vrcp-api/v0.0.9", {
    workspace: "/test",
    readGit: mockGit,
    deleteRemote: true,
    repository: "test/repo",
    token: "ghp_token",
    fetchFn: fetchMock as any
  });

  expect(res.status).toBe("tag-reverted");
  expect(gitLog).toContain("tag -d vrcp-api/v0.0.9");
  expect(remoteDeletedUrl).toBe("https://api.github.com/repos/test/repo/git/refs/tags/vrcp-api%2Fv0.0.9");
});

test("revertDeliveryTag keeps the local tag when the credential is missing or the remote delete fails", async () => {
  const gitLog: string[] = [];
  const mockGit = (_cwd: string, ...args: string[]) => { gitLog.push(args.join(" ")); return ""; };
  await expect(revertDeliveryTag("vrcp-api/v0.0.9", { workspace: "/test", readGit: mockGit, deleteRemote: true, token: "" }))
    .rejects.toThrow("requires a GitHub token");
  await expect(revertDeliveryTag("vrcp-api/v0.0.9", { workspace: "/test", readGit: mockGit, deleteRemote: true, token: "t",
    fetchFn: (async () => new Response(null, { status: 403 })) as any })).rejects.toThrow("HTTP 403");
  expect(gitLog).toEqual([]);
});

test("createPatchBranch retains the release tag by default", () => {
  const gitLog: string[] = [];
  const mockGit = (_cwd: string, ...args: string[]) => { gitLog.push(args.join(" ")); return "main"; };
  const res = createPatchBranch("crawler", "0.0.13", { workspace: "/test", readGit: mockGit, baseBranch: "main" });
  expect(res.tagDeleted).toBeNull();
  expect(gitLog.some(entry => entry.startsWith("tag -d"))).toBe(false);
});

test("patch branch lifecycle creates temporary branch and merges back cleanly", () => {
  const gitLog: string[] = [];
  let currentBranch = "main";
  let porcelainStatus = "";
  const mockGit = (_cwd: string, ...args: string[]) => {
    gitLog.push(args.join(" "));
    if (args[0] === "symbolic-ref") return currentBranch;
    if (args[0] === "checkout" && args[1] === "-b") {
      currentBranch = args[2];
      return "";
    }
    if (args[0] === "checkout") {
      currentBranch = args[1];
      return "";
    }
    if (args[0] === "status" && args.includes("--porcelain")) return porcelainStatus;
    if (args[0] === "config" && args[1] === "--get") return "main";
    return "";
  };

  // Create patch branch
  const createRes = createPatchBranch("crawler", "0.0.12", {
    workspace: "/test",
    readGit: mockGit,
    baseBranch: "main",
    deleteTag: true
  });
  expect(createRes.status).toBe("patch-branch-created");
  expect(createRes.branch).toBe("release/patch/crawler/v0.0.12");
  expect(createRes.tagDeleted).toBe("vrcp-crawler/v0.0.12");
  expect(gitLog).toContain("checkout -b release/patch/crawler/v0.0.12");
  expect(gitLog).toContain("tag -d vrcp-crawler/v0.0.12");

  // Merge and cleanup patch branch
  const mergeRes = mergeAndCleanupPatchBranch("crawler", "0.0.12", {
    workspace: "/test",
    readGit: mockGit,
    targetBranch: "main"
  });
  expect(mergeRes.status).toBe("patch-branch-merged-and-deleted");
  expect(mergeRes.branch).toBe("release/patch/crawler/v0.0.12");
  expect(mergeRes.mergedInto).toBe("main");
  expect(gitLog).toContain("checkout main");
  expect(gitLog).toContain("merge --no-ff release/patch/crawler/v0.0.12 -m merge: apply patch fixes from release/patch/crawler/v0.0.12");
  expect(gitLog).toContain("branch -D release/patch/crawler/v0.0.12");
});

test("promptInteractiveRecovery presents menu and dispatches chosen recovery action", async () => {
  const messages: string[] = [];
  const askFn = async (_q: string) => "1"; // Choose option 1: rerun failed jobs
  let rerunCalled = false;
  const fetchMock = async (url: string) => {
    if (url.includes("/rerun-failed-jobs")) rerunCalled = true;
    return new Response(JSON.stringify({}), { status: 201 });
  };

  const res = await promptInteractiveRecovery({
    runId: 9999,
    tag: "vrcp-api/v0.0.5",
    error: "Test assertion failed in CI"
  }, {
    askFn,
    onProgress: (msg: string) => messages.push(msg),
    token: "ghp_mock",
    fetchFn: fetchMock as any
  });

  expect(res.status).toBe("rerun-dispatched");
  expect(rerunCalled).toBe(true);
  expect(messages.some(m => m.includes("VRCP Delivery Failure Recovery Console"))).toBe(true);
});

test("checkRecoveryRun accepts Test crawler node step name for test-failed stage", async () => {
  const f = fixture("vrcp-crawler/v0.0.9");
  const path = `${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`;
  const steps = [
    { name: "Checkout repository", number: 1, status: "completed", conclusion: "success" },
    { name: "Test crawler node", number: 5, status: "completed", conclusion: "failure" },
    { name: "Post Checkout repository", number: 20, status: "completed", conclusion: "success" }
  ];
  const jobs = [
    { name: "route", conclusion: "success" },
    ...["build-linux", "standalone-windows"].map(name => {
      const cloned = structuredClone(steps);
      if (name === "standalone-windows") cloned[2].name = "Post Run actions/checkout@v4";
      return { name, conclusion: "failure", steps: cloned };
    }),
    { name: "publish-container", conclusion: "skipped" },
    { name: "release-assets", conclusion: "skipped" }
  ];
  f.responses[path] = { total_count: jobs.length, jobs };
  const res = await checkRecoveryRun(f.run, f.identity, f.api);
  expect(res.failedStage).toBe("test-failed");
});

test("promptInteractiveRecovery option 3 switches to temporary patch branch and deletes tag", async () => {
  const messages: string[] = [];
  const askFn = async (_q: string) => "3"; // Choose option 3: patch branch
  const mockGit = (_cwd: string, ...args: string[]) => {
    if (args[0] === "symbolic-ref") return "main";
    return "";
  };

  const res = await promptInteractiveRecovery({
    product: "crawler",
    version: "0.0.12",
    tag: "vrcp-crawler/v0.0.12",
    error: "Critical compilation error"
  }, {
    askFn,
    readGit: mockGit as any,
    onProgress: (msg: string) => messages.push(msg)
  });

  expect(res.status).toBe("patch-branch-created");
  expect(res.branch).toBe("release/patch/crawler/v0.0.12");
  expect(messages.some(m => m.includes("release/patch/crawler/v0.0.12"))).toBe(true);
});

test("revertDeliveryTag rejects deletion when remote publication with assets exists", async () => {
  const gitLog: string[] = [];
  const mockGit = (_cwd: string, ...args: string[]) => { gitLog.push(args.join(" ")); return ""; };
  const fetchMock = async (url: string) => {
    if (url.includes("/releases/tags/")) {
      return new Response(JSON.stringify({ draft: false, assets: [{ name: "release-asset.zip" }] }), { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
  await expect(revertDeliveryTag("vrcp-api/v0.0.9", {
    workspace: "/test",
    readGit: mockGit,
    deleteRemote: true,
    repository: "test/repo",
    token: "ghp_token",
    fetchFn: fetchMock as any
  })).rejects.toThrow("remote publication exists with published assets");
  expect(gitLog).toEqual([]);
});

test("revertDeliveryTag rejects local deletion when remote tag exists without deleteRemote", async () => {
  const gitLog: string[] = [];
  const mockGit = (_cwd: string, ...args: string[]) => {
    gitLog.push(args.join(" "));
    if (args[0] === "ls-remote") return "abcd\trefs/tags/vrcp-api/v0.0.9";
    return "";
  };
  await expect(revertDeliveryTag("vrcp-api/v0.0.9", {
    workspace: "/test",
    readGit: mockGit,
    deleteRemote: false,
    repository: "test/repo",
    token: ""
  })).rejects.toThrow("remote tag exists on remote repository");
  expect(gitLog.some(entry => entry.startsWith("tag -d"))).toBe(false);
});

test("diagnoseFailure detects partial publication and recommends reconciliation instead of tag deletion", () => {
  const diagnosis = diagnoseFailure({
    tag: "vrcp-api/v0.0.9",
    hasPublishedOutputs: true,
    error: "release attachment failed after upload"
  });
  expect(diagnosis.category).toBe("partial-publication");
  expect(diagnosis.continuity).toBe("requires-reconciliation");
  expect(diagnosis.suggestedActions).toContain("reconcile");
  expect(diagnosis.suggestedActions).not.toContain("revert-tag");
});

test("deliveryTroubleshooting recommends reconciliation and avoids revert-tag when failure is post-publication", () => {
  const result = {
    tag: "vrcp-crawler/v2026.10.15-pre",
    status: "ci-failed",
    jobs: [{ name: "release-attachment", conclusion: "failure" }],
    artifactsVerified: true
  };
  const troubleshooting = deliveryTroubleshooting(result as any);
  expect(troubleshooting.stage).toBe("release-attachment");
  expect(troubleshooting.next.some(n => n.includes("publish:reconcile"))).toBe(true);
  expect(troubleshooting.next.some(n => n.includes("revert-tag"))).toBe(false);
});

test("recoveryIdentity, checkRecoveryRun, and requireRecoveryCI support R50-C31 preview crawler build-smoke recovery", async () => {
  const tag = "vrcp-crawler/v2026.10.10-pre";
  const identity = recoveryIdentity(tag);
  expect(identity.product).toBe("crawler");
  expect(identity.version).toBe("2026.10.10-pre");
  expect(identity.failedRun).toBe(38308127484);
  expect(identity.failedStage).toBe("build-smoke");

  const prefix = `/repos/${identity.repository}`;
  const toolingCommit = "f".repeat(40);
  const run = {
    id: 9001,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: toolingCommit,
    head_repository: { full_name: identity.repository },
    path: ".github/workflows/node-docker.yml",
    display_title: `Recover crawler ${tag}`,
    actor: { login: "SlamTheDragon", type: "User" }
  };
  const manifestContent = Buffer.from(readFileSync(new URL("../.github/delivery-recoveries.json", import.meta.url))).toString("base64");
  const buildLinuxSteps = [
    { number: 1, name: "Set up job", status: "completed", conclusion: "success" },
    { number: 2, name: "Checkout repository", status: "completed", conclusion: "success" },
    { number: 3, name: "Build and verify crawler node", status: "completed", conclusion: "failure" },
    { number: 4, name: "Post Checkout repository", status: "completed", conclusion: "success" },
    { number: 5, name: "Complete job", status: "completed", conclusion: "success" }
  ];
  const jobsPayload = {
    total_count: 5,
    jobs: [
      { name: "route", status: "completed", conclusion: "success" },
      { name: "build-linux", status: "completed", conclusion: "failure", steps: buildLinuxSteps },
      { name: "standalone-windows", status: "completed", conclusion: "success" },
      { name: "publish-container", status: "completed", conclusion: "skipped" },
      { name: "release-assets", status: "completed", conclusion: "skipped" }
    ]
  };
  const api = async (path: string) => {
    if (path === `${prefix}/compare/${toolingCommit}...main`) {
      return { status: "identical", base_commit: { sha: toolingCommit }, merge_base_commit: { sha: toolingCommit } };
    }
    if (path === `${prefix}/contents/.github/delivery-recoveries.json?ref=${toolingCommit}`) {
      return { type: "file", path: ".github/delivery-recoveries.json", encoding: "base64", content: manifestContent };
    }
    if (path === `${prefix}/actions/runs/${identity.failedRun}`) {
      return {
        id: identity.failedRun,
        event: "push",
        head_branch: tag,
        head_sha: identity.commit,
        path: ".github/workflows/node-docker.yml",
        head_repository: { full_name: identity.repository },
        status: "completed",
        conclusion: "failure"
      };
    }
    if (path === `${prefix}/actions/runs/${identity.failedRun}/jobs?per_page=100`) return jobsPayload;
    if (path === `${prefix}/actions/runs/${identity.failedRun}/artifacts?per_page=100`) {
      return { total_count: 1, artifacts: [{ name: "crawler-2026.10.10-pre-windows-x64", size_in_bytes: 1024 }] };
    }
    if (path === `${prefix}/actions/runs/9001`) return run;
    if (path === `${prefix}/git/ref/tags/${encodeURIComponent(tag)}`) {
      return { ref: `refs/tags/${tag}`, object: { type: "tag", sha: identity.tagObject } };
    }
    if (path === `${prefix}/git/tags/${identity.tagObject}`) {
      return { sha: identity.tagObject, object: { type: "commit", sha: identity.commit } };
    }
    throw new Error(`Unexpected recovery API lookup: ${path}`);
  };

  const checked = await checkRecoveryRun(run, identity, api);
  expect(checked.failedStage).toBe("build-smoke");

  const env = {
    VRCP_RECOVERY_TAG: tag,
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: identity.repository,
    GITHUB_SHA: toolingCommit,
    GITHUB_RUN_ID: "9001"
  };
  await expect(requireRecoveryCI("crawler", "release", env, ".", api, (_ws: string, ...args: string[]) => args[0] === "rev-parse" ? identity.commit : ""))
    .rejects.toThrow("dedicated owner-dispatched");
  const recoveryProof = await requireRecoveryCI("crawler", "preview", env, ".", api, (_ws: string, ...args: string[]) => args[0] === "rev-parse" ? identity.commit : "");
  expect(recoveryProof.version).toBe("2026.10.10-pre");
});

test("delivery-recovery CLI patch-branch defaults omitted action to create", () => {
  const missing = spawnSync(process.execPath, ["scripts/delivery-recovery.mjs", "patch-branch"], {
    encoding: "utf8",
    timeout: 15_000
  });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain("[create|merge]");

  const omittedAction = spawnSync(process.execPath, ["scripts/delivery-recovery.mjs", "patch-branch", "package"], {
    encoding: "utf8",
    timeout: 15_000
  });
  expect(omittedAction.status).not.toBe(0);
  expect(omittedAction.stderr).toContain("[create|merge]");

  const dir = mkdtempSync(join(tmpdir(), "vrcp-patch-cli-"));
  try {
    spawnSync("git", ["init", "-b", "main"], { cwd: dir, stdio: "pipe" });
    spawnSync("git", ["config", "user.name", "VRCP Test"], { cwd: dir, stdio: "pipe" });
    spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: dir, stdio: "pipe" });
    writeFileSync(join(dir, "README.md"), "base\n");
    spawnSync("git", ["add", "."], { cwd: dir, stdio: "pipe" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
    const res = createPatchBranch("package", "0.0.1", { workspace: dir });
    expect(res.previousBranch).toBe("main");
    expect(res.branch).toBe("release/patch/package/v0.0.1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("supersededPreviewTag returns null when manifest is missing and fails closed when malformed", () => {
  const missingDir = mkdtempSync(join(tmpdir(), "vrcp-superseded-missing-"));
  const malformedDir = mkdtempSync(join(tmpdir(), "vrcp-superseded-bad-"));
  try {
    expect(supersededPreviewTag("cloudflare-worker/v2026.11.12-pre", missingDir)).toBeNull();
    mkdirSync(join(malformedDir, ".github"), { recursive: true });
    writeFileSync(join(malformedDir, ".github", "delivery-recoveries.json"), "{broken json");
    expect(() => supersededPreviewTag("cloudflare-worker/v2026.11.12-pre", malformedDir)).toThrow();
  } finally {
    rmSync(missingDir, { recursive: true, force: true });
    rmSync(malformedDir, { recursive: true, force: true });
  }
});

test("supersededPreviewTag rejects non-deliverable web, release channel, invalid progression, and placeholder fallback", () => {
  const baseCommit = "01e5ba428327dc70d29fe9faca9b2cafe8240d4f";
  const baseTagObj = "e25b7f358b261b5c73c9612e11915628f9dc9713";
  const cases = [
    {
      tag: "web/v2026.11.1-pre",
      entry: {
        product: "web", channel: "preview", version: "2026.11.1-pre",
        commit: baseCommit, tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.10.1-pre", reason: "web is non-deliverable"
      }
    },
    {
      tag: "cloudflare-worker/v2026.11.12",
      entry: {
        product: "worker", channel: "release", version: "2026.11.12",
        commit: baseCommit, tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.10.11", reason: "release tags are never superseded"
      }
    },
    {
      tag: "cloudflare-worker/v2026.11.12-pre",
      entry: {
        product: "worker", channel: "preview", version: "2026.11.12-pre",
        commit: baseCommit, tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.11.13-pre", reason: "forward predecessor invalid"
      }
    },
    {
      tag: "cloudflare-worker/v2026.11.12-pre",
      entry: {
        product: "worker", channel: "preview", version: "2026.11.12-pre",
        commit: baseCommit, tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.10.0-pre", reason: "initial placeholder predecessor rejected"
      }
    },
    {
      tag: "cloudflare-worker/v2026.11.12-pre",
      entry: {
        product: "worker", channel: "preview", version: "2026.11.12-pre",
        commit: "badsha", tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.10.11-pre", reason: "bad commit sha"
      }
    },
    {
      tag: "cloudflare-worker/v2026.11.12-pre",
      entry: {
        product: "worker", channel: "preview", version: "2026.11.12-pre",
        commit: baseCommit, tagObject: baseTagObj, failedRun: 123, failedStage: "deploy",
        supersededByPredecessor: "2026.10.11-pre", reason: "   "
      }
    }
  ];

  for (const testCase of cases) {
    const dir = mkdtempSync(join(tmpdir(), "vrcp-superseded-invalid-"));
    try {
      mkdirSync(join(dir, ".github"), { recursive: true });
      writeFileSync(
        join(dir, ".github", "delivery-recoveries.json"),
        JSON.stringify({
          schemaVersion: 1,
          repository: "SlamTheDragon/vrc-packages",
          tags: {},
          supersededPreviewTags: { [testCase.tag]: testCase.entry }
        })
      );
      expect(() => supersededPreviewTag(testCase.tag, dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("requirePredecessorPublicationProof resolves superseded preview tag while requirePublicationProof stays exact", async () => {
  const supersededManifest = JSON.stringify({
    schemaVersion: 1,
    repository: "SlamTheDragon/vrc-packages",
    tags: {},
    supersededPreviewTags: {
      "cloudflare-worker/v2026.11.12-pre": {
        product: "worker",
        channel: "preview",
        version: "2026.11.12-pre",
        commit: "01e5ba428327dc70d29fe9faca9b2cafe8240d4f",
        tagObject: "e25b7f358b261b5c73c9612e11915628f9dc9713",
        failedRun: 44762274301,
        failedStage: "deploy",
        supersededByPredecessor: "2026.10.11-pre",
        reason: "Fixture superseded preview entry for unit isolation"
      }
    }
  });
  const supersededDir = mkdtempSync(join(tmpdir(), "vrcp-superseded-live-"));
  try {
    mkdirSync(join(supersededDir, ".github"), { recursive: true });
    writeFileSync(join(supersededDir, ".github", "delivery-recoveries.json"), supersededManifest);

    const valid = supersededPreviewTag("cloudflare-worker/v2026.11.12-pre", supersededDir);
    expect(valid).not.toBeNull();
    expect(valid?.supersededByPredecessor).toBe("2026.10.11-pre");

    const resolved = resolveEffectivePredecessor("preview", "worker", "2026.11.12-pre", supersededDir);
    expect(resolved).toEqual({
      version: "2026.10.11-pre",
      supersededFrom: ["cloudflare-worker/v2026.11.12-pre"]
    });

    const releaseResolved = resolveEffectivePredecessor("release", "worker", "2026.11.12-pre", supersededDir);
    expect(releaseResolved).toEqual({
      version: "2026.11.12-pre",
      supersededFrom: []
    });

    const mockInspect = async (tag) => {
      if (tag === "cloudflare-worker/v2026.10.11-pre") {
        return {
          tag,
          product: "worker",
          channel: "preview",
          version: "2026.10.11-pre",
          artifactsVerified: true,
          status: "preview-deployed-no-release-assets"
        };
      }
      return {
        tag,
        product: "worker",
        channel: "preview",
        version: "2026.11.12-pre",
        artifactsVerified: false,
        status: "deploy-failed"
      };
    };

    const pred = await requirePredecessorPublicationProof("preview", "worker", "2026.11.12-pre", supersededDir, mockInspect);
    expect(pred.tag).toBe("cloudflare-worker/v2026.10.11-pre");
    expect(pred.artifactsVerified).toBe(true);

    await expect(
      requirePublicationProof("preview", "worker", "2026.11.12-pre", supersededDir, mockInspect)
    ).rejects.toThrow(/lacks publication\/artifact proof/);

    const bundleBytes = Buffer.from("export default { fetch() { return new Response('ok'); } };\n");
    const bundleSha = createHash("sha256").update(bundleBytes).digest("hex");
    const receiptBytes = Buffer.from(JSON.stringify({
      purpose: "ci-release",
      product: "worker",
      channel: "preview",
      version: "2026.10.11-pre",
      tag: "cloudflare-worker/v2026.10.11-pre",
      commit: "01e5ba428327dc70d29fe9faca9b2cafe8240d4f",
      environment: "cloudflare-preview",
      sha256: bundleSha
    }));
    const archiveBytes = Buffer.from(zipSync({
      "worker_entry.js": bundleBytes,
      "worker_entry.js.json": receiptBytes
    }));
    const archiveDigest = `sha256:${createHash("sha256").update(archiveBytes).digest("hex")}`;

    const inspectedPredecessor = await inspectPredecessorAssets(
      "preview",
      "worker",
      "2026.11.12-pre",
      supersededDir,
      async (path) => {
        if (path.endsWith("/git/ref/tags/cloudflare-worker%2Fv2026.10.11-pre")) {
          return {
            ref: "refs/tags/cloudflare-worker/v2026.10.11-pre",
            object: { sha: "01e5ba428327dc70d29fe9faca9b2cafe8240d4f", type: "commit" }
          };
        }
        if (path.includes("/actions/workflows/cloudflare-worker.yml/runs")) {
          return {
            workflow_runs: [
              {
                id: 99,
                path: ".github/workflows/cloudflare-worker.yml",
                head_sha: "01e5ba428327dc70d29fe9faca9b2cafe8240d4f",
                head_branch: "cloudflare-worker/v2026.10.11-pre",
                status: "completed",
                conclusion: "success"
              }
            ]
          };
        }
        if (path.includes("/actions/runs/99/jobs")) {
          return {
            jobs: [
              { name: "build", status: "completed", conclusion: "success" },
              { name: "deploy", status: "completed", conclusion: "success" }
            ]
          };
        }
        if (path.includes("/actions/runs/99/artifacts")) {
          return {
            total_count: 1,
            artifacts: [
              {
                id: 501,
                name: "worker-preview-bundle",
                expired: false,
                size_in_bytes: archiveBytes.byteLength,
                digest: archiveDigest,
                workflow_run: { head_sha: "01e5ba428327dc70d29fe9faca9b2cafe8240d4f" }
              }
            ]
          };
        }
        if (path.endsWith("/actions/artifacts/501/zip")) {
          return archiveBytes;
        }
        if (path.endsWith("/releases/tags/cloudflare-worker%2Fv2026.10.11-pre")) {
          return null;
        }
        throw new Error(`Unexpected GitHub path ${path}`);
      },
      (_cwd, ...args) =>
        args.flat().includes("remote")
          ? "https://github.com/SlamTheDragon/vrc-packages.git"
          : "01e5ba428327dc70d29fe9faca9b2cafe8240d4f"
    );
    expect(inspectedPredecessor.tag).toBe("cloudflare-worker/v2026.10.11-pre");
    expect(inspectedPredecessor.status).toBe("preview-deployed-no-release-assets");

    const planDir = mkdtempSync(join(tmpdir(), "vrcp-superseded-plan-"));
    try {
      mkdirSync(join(planDir, ".github"), { recursive: true });
      writeFileSync(join(planDir, "config.preview.versions.json"), JSON.stringify({
        "preview-crawler": "2026.10.10-pre",
        "preview-crawler-client": "26.10.8-pre",
        "preview-package": "2026.11.12-pre",
        "preview-web": "2026.10.0-pre",
        "preview-worker": "2026.11.12-pre",
        "preview-network": "2026.11.9"
      }));
      writeFileSync(join(planDir, "config.versions.json"), JSON.stringify({
        "release-crawler": "0.0.1",
        "release-crawler-client": "0.0.1",
        "release-package": "0.0.1",
        "release-web": "0.0.1",
        "release-worker": "0.0.1"
      }));
      writeFileSync(
        join(planDir, ".github", "delivery-recoveries.json"),
        supersededManifest
      );
      const mockPlanGit = (_cwd, ...args) => {
        if (args[0] === "symbolic-ref") return "preview/crawler-network";
        if (args[0] === "remote") return "https://github.com/SlamTheDragon/vrc-packages.git";
        if (args[0] === "status" || args[0] === "for-each-ref") return "";
        if (args[0] === "rev-parse") return "a".repeat(40);
        if (args[0] === "ls-remote") {
          return `${"a".repeat(40)}\trefs/heads/preview/crawler-network\n${"b".repeat(40)}\trefs/heads/main\n`;
        }
        if (args[0] === "show") return JSON.stringify({ "preview-worker": "2026.10.11-pre" });
        return "";
      };
      const planned = await planDelivery(
        "preview",
        "worker",
        planDir,
        new Date("2026-11-21T00:00:00Z"),
        mockPlanGit,
        false,
        false,
        "patch",
        mockInspect
      );
      expect(planned.blockers).toEqual([]);
      expect(planned.version).toBe("2026.11.13-pre");
      expect(planned.predecessorProof?.tag).toBe("cloudflare-worker/v2026.10.11-pre");
      expect(planned.predecessorProof?.verified).toBe(true);
    } finally {
      rmSync(planDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(supersededDir, { recursive: true, force: true });
  }
});

test("temporaryVersionRule activates before expiry, skips occupied iterations, and self-expires on collision or calendar rollover", () => {
  const liveRule = temporaryVersionRule("preview", "package");
  expect(liveRule).not.toBeNull();
  expect(liveRule?.id).toBe("calver-2026-11-preview-npm-rollback");
  expect(liveRule?.occupiedVersions).toEqual(["2026.11.12-pre"]);
  expect(liveRule?.expiresAtVersion).toBe("2026.11.12-pre");

  // Active strictly before expiresAtVersion within period 2026.11
  expect(activeTemporaryVersionRule("preview", "package", "2026.11.0-pre")?.id).toBe("calver-2026-11-preview-npm-rollback");
  expect(activeTemporaryVersionRule("preview", "package", "2026.11.11-pre")?.id).toBe("calver-2026-11-preview-npm-rollback");
  // Self-expires when iterations reach expiresAtVersion or go past it, or roll over to next month/year
  expect(activeTemporaryVersionRule("preview", "package", "2026.11.12-pre")).toBeNull();
  expect(activeTemporaryVersionRule("preview", "package", "2026.11.13-pre")).toBeNull();
  expect(activeTemporaryVersionRule("preview", "package", "2026.12.0-pre")).toBeNull();
  expect(activeTemporaryVersionRule("preview", "package", "2027.1.0-pre")).toBeNull();
  expect(activeTemporaryVersionRule("release", "package", "2026.11.0-pre")).toBeNull();

  // Occupied versions list stays active up to and including expiresAtVersion so .11 bumps skip .12 -> .13
  expect(occupiedTemporaryVersions("preview", "package", "2026.11.0-pre")).toEqual(["2026.11.12-pre"]);
  expect(occupiedTemporaryVersions("preview", "package", "2026.11.12-pre")).toEqual(["2026.11.12-pre"]);
  expect(occupiedTemporaryVersions("preview", "package", "2026.11.13-pre")).toEqual([]);
  expect(occupiedTemporaryVersions("preview", "package", "2026.12.0-pre")).toEqual([]);
  expect(occupiedTemporaryVersions("preview", "package", "2027.1.0-pre")).toEqual([]);

  const missingDir = mkdtempSync(join(tmpdir(), "vrcp-temp-rule-missing-"));
  try {
    expect(temporaryVersionRule("preview", "package", missingDir)).toBeNull();
    expect(activeTemporaryVersionRule("preview", "package", "2026.11.0-pre", missingDir)).toBeNull();
    expect(occupiedTemporaryVersions("preview", "package", "2026.11.12-pre", missingDir)).toEqual([]);
  } finally {
    rmSync(missingDir, { recursive: true, force: true });
  }

  const invalidRules = [
    {
      id: "bad-release",
      product: "package",
      channel: "release",
      packageName: "vrc-packages-api-preview",
      period: "2026.11",
      occupiedVersions: ["2026.11.1-pre"],
      expiresAtVersion: "2026.11.1-pre",
      reason: "release cannot use temporary rules"
    },
    {
      id: "bad-web",
      product: "web",
      channel: "preview",
      period: "2026.11",
      occupiedVersions: ["2026.11.1-pre"],
      expiresAtVersion: "2026.11.1-pre",
      reason: "web is non-deliverable"
    },
    {
      id: "bad-duplicate-occupied",
      product: "package",
      channel: "preview",
      packageName: "vrc-packages-api-preview",
      period: "2026.11",
      occupiedVersions: ["2026.11.5-pre", "2026.11.5-pre"],
      expiresAtVersion: "2026.11.5-pre",
      reason: "duplicate occupied entries must fail closed"
    },
    {
      id: "bad-wrong-period",
      product: "package",
      channel: "preview",
      packageName: "vrc-packages-api-preview",
      period: "2026.11",
      occupiedVersions: ["2026.12.1-pre"],
      expiresAtVersion: "2026.12.1-pre",
      reason: "version period mismatch must fail closed"
    },
    {
      id: "bad-pkg-name",
      product: "package",
      channel: "preview",
      packageName: "vrc-packages-api",
      period: "2026.11",
      occupiedVersions: ["2026.11.12-pre"],
      expiresAtVersion: "2026.11.12-pre",
      reason: "wrong npm package name must fail closed"
    },
    {
      id: "bad-expiry-not-max",
      product: "package",
      channel: "preview",
      packageName: "vrc-packages-api-preview",
      period: "2026.11",
      occupiedVersions: ["2026.11.5-pre", "2026.11.12-pre"],
      expiresAtVersion: "2026.11.5-pre",
      reason: "expiresAtVersion must be max occupied version"
    }
  ];

  for (const badRule of invalidRules) {
    const dir = mkdtempSync(join(tmpdir(), "vrcp-temp-rule-bad-"));
    try {
      mkdirSync(join(dir, ".github"), { recursive: true });
      writeFileSync(
        join(dir, ".github", "delivery-recoveries.json"),
        JSON.stringify({
          schemaVersion: 1,
          repository: "SlamTheDragon/vrc-packages",
          tags: {},
          temporaryVersionRules: [badRule]
        })
      );
      expect(() => temporaryVersionRule("preview", "package", dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Network uses suffix-free CalVer and validates cleanly when configured
  const networkDir = mkdtempSync(join(tmpdir(), "vrcp-temp-rule-net-"));
  try {
    mkdirSync(join(networkDir, ".github"), { recursive: true });
    writeFileSync(
      join(networkDir, ".github", "delivery-recoveries.json"),
      JSON.stringify({
        schemaVersion: 1,
        repository: "SlamTheDragon/vrc-packages",
        tags: {},
        temporaryVersionRules: [
          {
            id: "network-2026-11",
            product: "network",
            channel: "preview",
            period: "2026.11",
            occupiedVersions: ["2026.11.9"],
            expiresAtVersion: "2026.11.9",
            reason: "network rapid stream validation"
          }
        ]
      })
    );
    expect(occupiedTemporaryVersions("preview", "network", "2026.11.9", networkDir)).toEqual(["2026.11.9"]);
    expect(occupiedTemporaryVersions("preview", "network", "2026.11.10", networkDir)).toEqual([]);
  } finally {
    rmSync(networkDir, { recursive: true, force: true });
  }
});

test("live supersededPreviewTags resolves failed vrcp-crawler/v2026.10.10-pre to verified 2026.10.9-pre", () => {
  const entry = supersededPreviewTag("vrcp-crawler/v2026.10.10-pre");
  expect(entry).not.toBeNull();
  expect(entry?.product).toBe("crawler");
  expect(entry?.channel).toBe("preview");
  expect(entry?.failedStage).toBe("build");
  expect(entry?.failedRun).toBe(38308127484);
  expect(entry?.supersededByPredecessor).toBe("2026.10.9-pre");

  expect(resolveEffectivePredecessor("preview", "crawler", "2026.10.10-pre")).toEqual({
    version: "2026.10.9-pre",
    supersededFrom: ["vrcp-crawler/v2026.10.10-pre"]
  });
});



