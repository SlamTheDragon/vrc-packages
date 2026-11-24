# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 0 ledger cleared by Sector 4 Pipeline)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: `REORIENT-AW-03..04` (`open`: `src-web/` V0 Operator/Moderator workbench alignment, awaiting preview SDK publish `PR-AW-SDK-005` and Sector 1 Worker adoption `REORIENT-CN-02..06`); `REORIENT-AW-02` verified in `src-package/` (`HO-S3B-006` `active`, `PR-AW-SDK-005` `requested`).
- **Working Theories and Hypotheses**:
  - `src-package/src/auth/tokens.ts` exports `NODE_TOKEN_REGEX` and `isNodeToken` so `operator.ts` reuses one token format check.
  - `src-package/src/types/platform.ts` exposes 9 atomic platforms (no `"curated"`) and 7 `STOREFRONT_PLATFORMS`.
  - `src-package/src/types/package.ts` purges `CatalogIdentityLinkSchema`, `acceptedLinks`, and `fronts`, keeps `PackageFrontSchema`, and adds `ownerKey`, `ownerName`, `verificationStatus`, `verifiedByAppId`, `vpmLatestVersion`, `vpmRepoUrl`, `summary`, `tags`, `qualityFlags`, `"deleted"` lifecycle, `sources`, and `relations`.
  - `src-package/src/protocol/downstream.ts` adds `"relationship_feedback"` to `ReportSubmissionRequestSchema` and enforces target fields for both `removal_request` and `relationship_feedback`.
  - `src-package/src/protocol/operator.ts` removes manual `capabilities` from `IssueNodeCredentialSchema`, forces `autoSeed: false`, adds `OperatorStatusResponseSchema` and `SystemPurge*`, unifies steering profiles into `SteeringProfile*` plus `SuppressedTarget*`, and adds job lifecycle CRUD and lead bulk actions.
  - `src-package/src/client.ts` adds `"PATCH"` transport, `operator.status()`, `operator.systemPurge()`, `operator.jobs.{update,requeue,delete}`, `operator.leads.{bulkApprove,suppressDomain}`, `operator.steeringProfiles.*`, `operator.suppressedTargets.*`, and `nodeId` check on `operator.nodes.prune()`.
  - `src-package/README.md` retains owner lock headers (`<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->` at lines 1 and 80) and stays untouched pending owner unlock.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| Q-API-REVIEW | blocked | `src-package/`, `docs/research/audits/api_contract_review.md` | Complete owner review of all 26 Worker handlers vs SDK methods before `v0.1.0`. | Held by owner review gate |
| R47-C27-WEB | in_progress | `src-web/`, `src-web-search/` | Keep existing `src-web/` Admin UI verified across `/`, `/login`, `/operator`, `/moderator`, and `/design`; complete V0 workbench alignment (`REORIENT-AW-03..04`), `src-web-search/`, and public legal/registry pages. | `src-web/` baseline verified (`astro check` 0 errors, `astro build` 5 pages) |
| UNTANGLE-AW-03 | in_progress | `src-package/`, `src-web/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`, `src-web/CLAUDE.md`, `src-web/src/pages/components/.gitkeep`, `src-web/.gemini/`, and `src-web/.github/`, and rewrote `src-web/README.md` in ASD-STE100. `src-web-search/` remains open in its submodule. | `ste-lint.py --strict` (`src-web/README.md`: 1.48/100w, 0 em-dash), `bun run --cwd src-web build` |
| UNTANGLE-AW-05 | in_progress | `docs/source/specifications/consumer_sdk_and_web.md`, `docs/source/schemas/wire_and_protocol_contracts.md` | Cleaned `consumer_sdk_and_web.md` in ASD-STE100 and updated Section 2 `src-web/` live state row to reflect initialized `/`, `/login`, `/operator`, `/moderator`, `/design` routes. `wire_and_protocol_contracts.md:4,25-41` Tier 3B demarcation stays open outside current write containment. | `ste-lint.py --strict` (`consumer_sdk_and_web.md`), `check_doc_links.ts` |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-web/AGENTS.md`, `src-package/src/`, `src-package/tests/`, `docs/source/reliability/proposed_wiki_changes.md` | Cleaned `src-package/AGENTS.md`, `src-web/AGENTS.md`, and `proposed_wiki_changes.md`. `src-package/README.md` stays untouched (owner lock headers); `src-web-search/AGENTS.md` remains open in its submodule. | `ste-lint.py --strict` (`src-web/AGENTS.md`: 0.00/100w, 0 em-dash), `check_doc_links.ts` |
| REORIENT-AW-02 | verified | `src-package/src/`, `src-package/tests/` | Completed Stage 5 Tier 3B producer SDK Version 0 rewrite under Rule 06 `edit-guard`: added `PATCH`, `NODE_TOKEN_REGEX`, 9-platform `PlatformSchema`, Coordinator-only `IssueNodeCredentialSchema`, `SteeringProfile` + `SuppressedTarget` CRUD, jobs CRUD/requeue, bulk leads, `operator.status()`, dev-only `operator.systemPurge()`, extended `CatalogPackageSchema`, and `relationship_feedback`. | `bun run --cwd src-package typecheck` (exit 0); `bun run --cwd src-package test` (exit 0: `build` + `93` pass, `0` fail, `1989` expect() calls across `8` files); `bun run --cwd src-package test:distribution` (exit 0: `packed_sdk_distribution`, `node=true`, `types=true`, `workerBuild=true`, `nativeWorker=true`, `externalFetches=0`, `files=39`, `cleanedUp=true`). |
| REORIENT-AW-03 | open | `src-web/src/lib/{api/admin-client.ts,stores/admin-session.svelte.ts,components/}` | Stage 5-6 Operator Workbench UIUX rewrite per Cardinal Rules 1-9: remove drifted `VRCPAdminClient`, fix raw checkboxes and duplicate triggers/footers, add `AdminShell` pin toggle, remove 10-checkbox picker, unify `SteeringProfilesPanel`, and add job blockers/CRUD plus grouped custom-domain actions. | Pending `REORIENT-AW-02` |
| REORIENT-AW-04 | open | `src-web/src/lib/components/admin/operator/{OperatorDashboard.svelte,CatalogInitPanel.svelte,GovernancePanel.svelte}` | Add environment badge and Fleet Queue Readiness strip, `VRCP_ENV=development`-gated `System Purge` `AlertDialog` (`PURGE_DEVELOPMENT_D1`), nullable field guards and trusted-app usage cues in `GovernancePanel.svelte`, UIUX Cardinal Rules 1-9 verification, and web Publication Request. | Pending `REORIENT-AW-03` |

---

## Next Steps

1. Publish `vrc-packages-api-preview` via `PR-AW-SDK-005` (Sector 4 Pipeline) before downstream Sector 1 (`src-worker/`, `src-crawler/`) and Sector 2 (`src-crawler-client/`) adoption.
2. Execute `REORIENT-AW-03` and `REORIENT-AW-04` (`src-web/` V0 Operator/Moderator workbench rewrite and `VRCP_ENV=development` purge gate) after `REORIENT-AW-02` publishes and Sector 1 deploys matching Worker preview contracts (`REORIENT-CN-02..06`).
3. Complete Tier 3B demarcation follow-up in `wire_and_protocol_contracts.md` (`UNTANGLE-AW-05`), await owner unlock on `src-package/README.md` and `Q-API-REVIEW` (`v0.1.0`), and align `src-web-search/` in its separate submodule slice (`UNTANGLE-AW-04`).
