# Publishing Guide and Monorepo Operations

This guide describes how to build, verify, and publish products across the monorepo.
It covers automated commands, recovery pathways, and manual web procedures.

## Changelog Procedure

- Write pending notes in `docs/source/CHANGELOG.md`, under the target product and channel.
- Preserve channel, product, Added, Bugs Fixed, and Changes headings.
- Planning does not copy or clear notes.
- Publication preparation copies the complete source to root `CHANGELOG.md`, replacing its previous snapshot.
- Tooling archives the selected notes and clears only that product and channel in the source.
- The publication metadata commit includes the snapshot, source reset, and archive.
- Other channels and products keep their notes. Root is a snapshot, not the editing entry point.
- If remote delivery fails, recover the same committed version. Do not clear notes manually or allocate another version.
- Existing version archives with different contents block preparation before version allocation.

---

## 1. Repository Branch Layout

Check [SYSTEM_MAP.md](SYSTEM_MAP.md) for the authoritative 5-sector branch layout, owned paths, and domain verification commands.

---

## 2. Command Selection Matrix

Select the command that matches your task:

| Task | Command | Type | Description |
| :--- | :--- | :--- | :--- |
| First-time setup | `bun run setup` | Interactive | Installs dependencies and prompts for tokens |
| Build all products | `bun run build` | Automated | Builds 7 products in dependency order |
| Run repository tests | `bun run test` | Automated | Runs root pipeline test suites |
| Interactive publishing | `bun run publish` | Interactive | Prompts for target, channel, bump, and action |
| Plan preview publishing | `bun run publish:preview <product>` | Dry-run | Shows next CalVer patch version and lists blockers |
| Execute preview publish | `bun run publish:preview <product> --execute` | Automated | Commits, tags, and pushes to trigger preview CI |
| Plan release publishing | `bun run publish:release <product>` | Dry-run | Shows next SemVer version and creates PR plan |
| Execute release publish | `bun run publish:release <product> --execute` | Automated | Pushes version candidate branch and gives PR URL |
| Finalize release | `bun run publish:finalize <product> <pr> <sha> --execute` | Automated | Tags merged commit on `main` to trigger release CI |
| Check CI run status | `bun run publish:status <tag>` | Read-only | Reads live status of GitHub Actions run |
| Verify published assets | `bun run publish:check <tag>` | Read-only | Verifies release assets, hashes, or registry presence |
| Diagnose failure | `bun run publish:diagnose <tag>` | Read-only | Analyzes failure point and prints recovery options |
| Interactive recovery | `bun run recovery` | Interactive | Prompts for tag and runs selected recovery action |
| Rerun frozen CI run | `bun run recovery:rerun <runId>` | Automated | Dispatches rerun for transient CI failures |
| Revert unverified tag | `bun run recovery:revert-tag <tag> [--remote]` | Automated | Deletes failed tag locally and remotely |
| Create patch branch | `bun run recovery:patch [create\|merge] <product> <version>` | Automated | Creates or merges temporary `release/patch/*` branch |
| Check branch sync | `bun run sync:check` | Read-only | Detects drift between local branch and remote origin |
| Sync internal network | `bun run sync:deps` | Automated | Aligns network package version across consumers |

---

## 3. Core Operational Checklists

### A. Initial Setup and Onboarding Checklist
- [ ] Run `bun run setup` from the repository root.
- [ ] Enter your GitHub Personal Access Token when prompted.
- [ ] Make sure your token has repo and workflow permissions.
- [ ] Skip optional tokens if you do not build or deploy those services locally.
- [ ] Confirm that all subprojects finish dependency installation.

### B. Preview Channel Publishing Checklist
Use the preview channel for fast iteration and verification.
Designated sector lead branches publish previews when ahead of `origin`. Non-lead branches must merge the latest lead branch first.

- [ ] Make sure your current branch is ahead of `origin`.
- [ ] Run `bun run sync:check` to detect branch drift.
- [ ] Run domain tests inside the changed subproject to confirm local checks pass.
- [ ] Run `bun run publish:preview <product>` to inspect the plan.
- [ ] Run `bun run publish:preview <product> --execute` to publish.
- [ ] Wait for the terminal to print the GitHub Actions run URL.
- [ ] Run `bun run publish:status <tag>` to monitor CI progress.
- [ ] Run `bun run publish:check <tag>` to confirm published assets.

### C. Release Channel Publishing Checklist
Release publishing requires strict review.
Releases must start from a clean `main` branch.

- [ ] Check out the `main` branch: `git checkout main`.
- [ ] Pull latest changes: `git pull origin main`.
- [ ] Make sure your working tree is clean.
- [ ] Run domain and root verification suites to confirm all checks pass.
- [ ] Run `bun run publish:release <product>` to plan the version bump.
- [ ] Run `bun run publish:release <product> --execute` to create the candidate PR.
- [ ] Open the pull request URL printed in the terminal.
- [ ] Review changes and merge the pull request into `main`.
- [ ] Pull the merged commit locally: `git pull origin main`.
- [ ] Run `bun run publish:finalize <product> <pr-number> <merged-sha> --execute`.
- [ ] Complete the protected environment approvals in GitHub Actions.
- [ ] Run `bun run publish:check <tag>` to verify final release assets.

---

## 4. Problem Diagnosis and Recovery Checklists

Choose the recovery pathway that matches the failure type:

### Pathway 1: Transient Failures (Network, Registry Timeout, Rate Limits)
Use this pathway when code is correct but external services failed.
A rerun executes the frozen tagged commit.

- [ ] Run `bun run publish:diagnose <tag>` to inspect the failed step.
- [ ] If the error was transient, locate the CI run ID in the output.
- [ ] Run `bun run recovery:rerun <runId>` to re-execute failed jobs.
- [ ] Monitor the run with `bun run publish:status <tag>`.

### Pathway 2: Code Defects and Test Failures (Code Fixes)
Do not rerun a workflow to verify code fixes.
Workflow reruns test the frozen commit, not your new code.

- [ ] Identify the failure in the CI logs.
- [ ] If immutable tag rules permit deletion, remove the unverified tag with `bun run recovery:revert-tag <tag> --remote`; otherwise authorize recovery in `.github/delivery-recoveries.json`.
- [ ] Apply the necessary code fix to your working branch.
- [ ] Run domain tests to verify the fix.
- [ ] Commit your fix locally to the active branch.
- [ ] Re-trigger publishing from your lead branch (or a branch merged from it):
  ```sh
  bun run publish:preview <product> --execute
  ```

### Pathway 3: Release Hotfixes via Patch Branches
Use this pathway when a release failure needs an isolated fix.

- [ ] Run `bun run recovery:patch <product> <version>`.
- [ ] The command creates and checks out `release/patch/<product>/v<version>`.
- [ ] Apply the code fix on the patch branch.
- [ ] Commit your changes locally.
- [ ] Merge the patch branch back with `bun run recovery:patch merge <product> <version>`.
- [ ] Restart the release publishing sequence.

### Pathway 4: Version and Configuration Drift
Use this pathway when local version files disagree with remote tags.

- [ ] Run `bun run sync:check` to inspect drift across all products.
- [ ] If preview versions drifted, run `bun run versions:sync:preview`.
- [ ] If release versions drifted, run `bun run versions:sync:release`.
- [ ] If internal dependencies drifted, run `bun run sync:deps`.
- [ ] Commit any corrected configuration files.

---

## 5. Manual and Web UI Procedures

These actions require human operator intervention and cannot run via CLI. Run `bun run help manual` for interactive reference steps:

1. **GitHub Protected Environment Approvals**: Open Actions -> review deployments -> approve target environment (`vrcp-api-release`, `vrcp-crawler-release`).
2. **Candidate Pull Request Review and Merge**: Review the `release/candidate/*` PR, merge into `main`, then pass the PR number and merged SHA to `bun run publish:finalize`.
3. **Discord Webhook CI Secrets Configuration**: Configure `DISCORD_RELEASE_WEBHOOK`, `DISCORD_STAGING_WEBHOOK`, and optional `DISCORD_STAGING_PING` in GitHub Secrets/Variables (never in `.env`).
4. **Emergency Protected Tag / Recovery Handling**: Immutable tag rulesets block remote tag deletion; authorize failed pre-publication recovery in `.github/delivery-recoveries.json` on `main`.

---

## 6. Diagnostics & Troubleshooting Matrix

| Symptom | Root Cause | Exact Remediation Command |
| :--- | :--- | :--- |
| `Needed a single revision` | Shallow clone missing git tags | Run `git fetch --tags` or set `fetch-depth: 0` in CI |
| Submodule package missing | Submodules not checked out recursively | Run `git submodule update --init --recursive` |
| `Branch behind origin` | Local branch lacks remote commits | Run `git pull origin <branch>` before publishing |
| `Version config drift` | Local version JSON out of sync with tags | Run `bun run versions:sync:<channel>` |
| Edge CDN timeout on publish | Registry replication delay (transient) | Run `bun run recovery:rerun <runId>` |
| Test failure in CI step | Code defect in source files | Fix code locally, commit, and publish next version (or recover pre-publication tag) |
| Draft release unlinked | CI stopped before asset finalization | Run `bun run publish:reconcile` |
| Missing staging alerts | Webhook not configured in CI secrets | Add `DISCORD_STAGING_WEBHOOK` to environment secrets in GitHub |
