# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 0 ledger cleared by Sector 4 Pipeline)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: None pending local Sector 3 gates (`PR-AW-WEB-005` transferred into `docs/source/CHANGELOG.md` and verified rows cleared by Sector 4 Pipeline `INT-021`; `Q-API-REVIEW`, `UNTANGLE-AW-03..06`, `R47-C27-WEB`, and `src-web-search/` submodule stay separate).
- **Working Theories and Hypotheses**:
  - `src-package/src/auth/tokens.ts` exports `NODE_TOKEN_REGEX` and `isNodeToken` so `operator.ts` reuses one token format check.
  - `src-package/src/types/platform.ts` exposes 9 atomic platforms (no `"curated"`) and 7 `STOREFRONT_PLATFORMS`.
  - `src-package/src/types/package.ts` purges `CatalogIdentityLinkSchema`, `acceptedLinks`, and `fronts`, keeps `PackageFrontSchema`, and adds `ownerKey`, `ownerName`, `verificationStatus`, `verifiedByAppId`, `vpmLatestVersion`, `vpmRepoUrl`, `summary`, `tags`, `qualityFlags`, `"deleted"` lifecycle, `sources`, and `relations`.
  - `src-package/src/protocol/downstream.ts` adds `"relationship_feedback"` to `ReportSubmissionRequestSchema` and enforces target fields for both `removal_request` and `relationship_feedback`.
  - `src-package/src/protocol/operator.ts` removes manual `capabilities` from `IssueNodeCredentialSchema`, forces `autoSeed: false`, adds `OperatorStatusResponseSchema` and `SystemPurge*`, unifies steering profiles into `SteeringProfile*` plus `SuppressedTarget*`, and adds job lifecycle CRUD and lead bulk actions.
  - `src-package/src/client.ts` adds `"PATCH"` transport, `operator.status()`, `operator.systemPurge()`, `operator.jobs.{update,requeue,delete}`, `operator.leads.{bulkApprove,suppressDomain}`, `operator.steeringProfiles.*`, `operator.suppressedTargets.*`, and `nodeId` check on `operator.nodes.prune()`.
  - `src-package/README.md` retains owner lock headers (`<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->` at lines 1 and 80) and stays untouched pending owner unlock.

### Rule 09 Pre-Code Action-Path Sketch (`REORIENT-AW-03..04`)

1. **Auth & Navigation Shell (`/login`, `AdminShell`, `AdminIndexView`)**: Goal is zero-shim `VRCPackageClient` session bootstrap (`operator.status()` for environment/readiness badge, `moderator.ratings.list` for moderator), pinned or hover-expanded rail (`isPinned` localStorage + `bits-ui`/existing `Button`), and non-nested `<astro-island>` `navOnly` isolation. Feedback: instant probe spinner, toast, `measured`/`failed` `EvidenceBadge`.
2. **Nodes Fleet (`/operator?tab=nodes`)**: Goal is Coordinator-derived capability credential issuance (`nodes.issue({ schemaVersion: 1, nodeId, reason })`), bulk revoke/prune via `DataTable` `bits-ui` `Checkbox`, and Coordinator pagination footer via `AdminMasterDetail`. Pruned: manual 10-checkbox picker and legacy `"curated"`. Feedback: `Dialog` form validation -> token snippet `Codeblock` + CWD containment reminder + refresh.
3. **Steering & Suppression (`/operator?tab=policies`)**: Goal is managing `SteeringProfile` (with `hostMatchMode` contextual field pruning for `any_vpm_https` and `queryScope` pruning when `queryMode === "none"`) and `SuppressedTarget` (`domain`/`origin`/`url`) via `ToggleGroup`, `DropdownSelect`, `Switch`, and `Dialog`. Feedback: instant kill-switch (`enable`/`disable`), `Delete` confirmation, and zero verbose prose banners.
4. **Leads & Jobs (`/operator?tab=leads`)**: Goal is triage of `LeadRow` (`target_host` bulk approve in one batch call, `suppressDomain` host-level block, host grouping cue) and full `OperatorJobRecord` CRUD (`priorityLane`, `claimabilityBlockers`, `requeue`, `update`, `delete`, multi-select bulk requeue/delete) scoped to unleased jobs (`state !== "leased"`).
5. **Catalog, Purge & Governance (`/operator?tab=catalog`, `/operator?tab=governance`, `/moderator`)**: Goal is V0 `CatalogPackage` provenance (`sources`, `relations`, `tags`, `qualityFlags`, `verificationStatus`), explicit `init({ autoSeed: false })`, `VRCP_ENV=development && purgeEnabled`-gated `Dialog` (`alert={true}`) requiring `PURGE_DEVELOPMENT_D1`, and nullable field guards + `pending`-scoped Verify actions + trusted-app cues on `GovernancePanel`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| Q-API-REVIEW | blocked | `src-package/`, `docs/research/audits/api_contract_review.md` | Complete owner review of all 26 Worker handlers vs SDK methods before `v0.1.0`. | Held by owner review gate |
| R47-C27-WEB | in_progress | `src-web/`, `src-web-search/` | Keep existing `src-web/` Admin UI verified across `/`, `/login`, `/operator`, `/moderator`, and `/design`; complete V0 workbench alignment (`REORIENT-AW-03..04`), `src-web-search/`, and public legal/registry pages. | `src-web/` baseline verified (`astro check` 0 errors, `astro build` 5 pages) |
| UNTANGLE-AW-03 | in_progress | `src-package/`, `src-web/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`, `src-web/CLAUDE.md`, `src-web/src/pages/components/.gitkeep`, `src-web/.gemini/`, and `src-web/.github/`, and rewrote `src-web/README.md` in ASD-STE100. `src-web-search/` remains open in its submodule. | `ste-lint.py --strict` (`src-web/README.md`: 1.48/100w, 0 em-dash), `bun run --cwd src-web build` |
| UNTANGLE-AW-05 | in_progress | `docs/source/specifications/consumer_sdk_and_web.md`, `docs/source/schemas/wire_and_protocol_contracts.md` | Cleaned `consumer_sdk_and_web.md` in ASD-STE100 and updated Section 2 `src-web/` live state row to reflect initialized `/`, `/login`, `/operator`, `/moderator`, `/design` routes. `wire_and_protocol_contracts.md:4,25-41` Tier 3B demarcation stays open outside current write containment. | `ste-lint.py --strict` (`consumer_sdk_and_web.md`), `check_doc_links.ts` |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-web/AGENTS.md`, `src-package/src/`, `src-package/tests/`, `docs/source/reliability/proposed_wiki_changes.md` | Cleaned `src-package/AGENTS.md`, `src-web/AGENTS.md`, and `proposed_wiki_changes.md`. `src-package/README.md` stays untouched (owner lock headers); `src-web-search/AGENTS.md` remains open in its submodule. | `ste-lint.py --strict` (`src-web/AGENTS.md`: 0.00/100w, 0 em-dash), `check_doc_links.ts` |

---

## Next Steps

1. Keep `HO-S3B-006` (`vrcp-api/v2026.11.5-pre`, `run 45396768194`, `INT-016` cleared) active across preview consumers (`INT-021` cleared `PR-AW-WEB-005`; remote web hosting remains deferred).
2. Complete Tier 3B demarcation follow-up in `wire_and_protocol_contracts.md` (`UNTANGLE-AW-05`), await owner unlock on `src-package/README.md` (`UNTANGLE-AW-06`) and `Q-API-REVIEW` (`v0.1.0`), and align `src-web-search/` in its separate submodule slice (`UNTANGLE-AW-04`).
