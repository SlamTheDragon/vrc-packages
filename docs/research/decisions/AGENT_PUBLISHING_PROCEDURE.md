# Agent Publishing Procedure

Human steps live in [`PUBLISHING.md`](../../source/PUBLISHING.md).
This file defines agent publishing rules and branch invariants for Sector 4 (`pipeline`).

---

## 1. Core Lifecycle Rules

1. **Slices mean local commit; completed gates mean push** unless the owner requires local-only commits. Commit each implemented slice locally as a checkpoint. Push to the remote tracking branch only when the capability gate passes all checks.
2. **Start every publication from root `package.json` scripts**. Write pending product release notes only in [`docs/source/CHANGELOG.md`](../../source/CHANGELOG.md). Preparation copies the complete source to root `CHANGELOG.md`, archives selected notes, and clears only the selected product/channel body in the source while preserving its skeleton. Never edit or clear root `CHANGELOG.md` or version config JSON files manually. Publish only products whose delivered behavior changed.
3. **Publish producers before consumers**:
   - Publish SDK contracts (`src-package/`) first.
   - Publish network contracts (`src-worker/packages/network/`) next if peer bounds or wire schemas changed.
   - Publish dependent services and applications (`src-worker/`, `src-crawler/`, `src-crawler-client/`, `src-web/`) last.

---

## 2. Repository Branch Layout

Agents must operate within the designated product branches:

| Branch Name | Products Covered | Channel | Rules |
| :--- | :--- | :--- | :--- |
| `main` | All products | Production | Protected branch. Clean tree required. |
| `preview/crawler-network` | `src-worker`, `src-crawler`, `src-worker/packages/network` | Preview | Sector 1 feature branch for crawler and worker fleet. |
| `preview/desktop-client` | `src-crawler-client` | Preview | Sector 2 feature branch for desktop client. |
| `preview/web` | `src-web`, `src-web-search` | Preview | Sector 3 feature branch for web and search modules. |
| `preview/workers-api` | `src-package` (`vrc-packages-api`) | Preview | Sector 3 feature branch for consumer API SDK. |
| `release/patch/*` | Target product undergoing hotfix | Release / Patch | Short-lived patch branch. Merged and deleted after fix. |
| `release/candidate/*` | Candidate release items | Release candidate | Short-lived candidate PR into `main`. Overridden only with `--force`. |

---

## 3. Preview Publishing Rules

1. Any branch can publish a preview if the branch is ahead of origin (and identified as the lead branch per `DELIVERY-CLI-CONTRACT`). Preview publishing does not require a pull request or clean `main`.
2. Run `bun run publish:preview <product> --execute`. The command checkpoints pending non-ignored files, bumps CalVer patch, tags, and pushes. Inspect printed paths before execution and never force-add ignored files.
3. Monitor the resulting CI workflow run with `bun run publish:status <tag>` and verify published assets with `bun run publish:check <tag>`.

---

## 4. Release Publishing Rules

1. Release preparation requires clean `main` synchronized with `origin/main`.
2. Prepare a candidate pull request with `bun run publish:release <product> --execute`. The command pushes the candidate metadata branch to origin and outputs the pull request URL.
3. The repository owner reviews and merges the pull request. Never merge or approve pull requests on the owner's behalf.
4. Finalize the release tag on `main`: pull merged `main` (`git pull origin main`) and run `bun run publish:finalize <product> <pr-number> <merged-sha> --execute`.
5. Protected environment approvals remain owner-only. Never approve GitHub deployment environments or npm stages for the owner.

---

## 5. Failure Diagnosis and Recovery Rules

1. **Reruns execute the frozen tagged commit**: Use `bun run recovery:rerun <runId>` strictly for transient network drops, CDN timeouts, or rate limits.
2. **Code fixes require a new commit from an ahead branch**: Never rerun a failed workflow to test a code fix. To fix code in preview: verify absence of remote published assets, delete the unverified tag via `bun run recovery:revert-tag <tag> --remote`, commit the fix locally, and re-trigger `bun run publish:preview <product> --execute`.
3. **Critical release fixes**: Run `bun run recovery:patch <product> <version>`, apply and verify the fix on `release/patch/*`, merge back, and delete the patch branch.
4. **Checkout invariants**: Keep repository test workflows configured with `fetch-depth: 0` and `submodules: recursive`. Do not weaken test assertions to hide missing tags or submodules.
5. **Tracking**: Record the tag, CI run ID, asset check result, and remaining risks in [`docs/scratch-pipeline/task_tracker.md`](../../scratch-pipeline/task_tracker.md) (and preserve root `docs/scratch/task_tracker.md` compatibility until `PIPELINE-SCRATCH-RETIRE` completes).
