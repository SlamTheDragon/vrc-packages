# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 0 ledger cleared by Sector 4 Pipeline)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: `REORIENT-AW-02` (`open`: Stage 5 Tier 3B producer SDK rewrite in `src-package/` after Stage 4 blueprint approval `HO-S3-BLUEPRINT-001` and `PN-009` `active`), followed by `REORIENT-AW-03..04` (`src-web/` V0 Operator/Moderator workbench alignment) after Worker adoption. Prior delivered slices (`WEB-INIT-01..05`, `WEB-PREVIEW-SDK`, `UNTANGLE-AW-01`, `SDK-OP-LIST-01`, `WEB-OP-FLEET-UX`, `WEB-UX-REFRAME-01`, `NODE-PRUNE-01`, `WEB-BULK-01..03`, `REORIENT-AW-01`) cleared post-changelog transfer.
- **Working Theories and Hypotheses**:
  - `src-package/src/protocol/operator.ts` keeps internal `OperatorPageQuerySchema` above `OperatorNodeListQuerySchema` and `OperatorJobListQuerySchema`, supports UUID and legacy non-UUID `jobId`/`activeJobId` rows up to 120 chars, and excludes secret fields (`token`, `token_hash`, `leaseId`, `lease_id`) via `z.strictObject`.
  - `src-web/` Admin UI follows [`docs/research/UIUX/README.md`](../research/UIUX/README.md) and [`05-recommended-tooling-and-ecosystem-suite.md`](../research/UIUX/05-skills-assessment-and-synthesis/05-recommended-tooling-and-ecosystem-suite.md) (`consumer_sdk_and_web.md`).
  - `src-package/src/protocol/downstream.ts` enforces the orthogonal 3-branch `ReportSubmissionRequestSchema` discriminated union (`demand_signal`, `issue_report`, `removal_request`) and strict `z.number()` query limits (`user.ts`, `moderator.ts`, `app_candidate.ts`).
  - `src-package/README.md` contains owner lock headers (`<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->` at lines 1 and 80) and stays untouched pending owner unlock.
  - Current verified SDK and web state is documented in [`docs/source/specifications/consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md) and [`docs/source/schemas/wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) (Tier 3B demarcation in `wire_and_protocol_contracts.md:4,25-41` stays pending under `UNTANGLE-AW-05`).
  - Six concrete discrepancies for human-readable `docs/applications/` wiki pages are staged in [`docs/source/reliability/proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md) awaiting owner approval.
  - Note: `src-web-search/` is a Git submodule with its own commit tree (untouched; tracked in `UNTANGLE-AW-04`).

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| Q-API-REVIEW | blocked | `src-package/`, `docs/research/audits/api_contract_review.md` | Complete owner review of all 26 Worker handlers vs 23 SDK methods before `v0.1.0`. | Held by owner review gate |
| R47-C27-WEB | in_progress | `src-web/`, `src-web-search/` | Keep existing `src-web/` Admin UI verified across `/`, `/login`, `/operator`, `/moderator`, and `/design`; complete V0 workbench alignment (`REORIENT-AW-03..04`), `src-web-search/`, and public legal/registry pages. | `src-web/` baseline verified (`astro check` 0 errors, `astro build` 5 pages) |
| UNTANGLE-AW-03 | in_progress | `src-package/`, `src-web/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`, `src-web/CLAUDE.md`, `src-web/src/pages/components/.gitkeep`, `src-web/.gemini/`, and `src-web/.github/`, and rewrote `src-web/README.md` in ASD-STE100. `src-web-search/` remains open in its submodule. | `ste-lint.py --strict` (`src-web/README.md`: 1.48/100w, 0 em-dash), `bun run --cwd src-web build` |
| UNTANGLE-AW-05 | in_progress | `docs/source/specifications/consumer_sdk_and_web.md`, `docs/source/schemas/wire_and_protocol_contracts.md` | Cleaned `consumer_sdk_and_web.md` in ASD-STE100 and updated Section 2 `src-web/` live state row to reflect initialized `/`, `/login`, `/operator`, `/moderator`, `/design` routes. `wire_and_protocol_contracts.md:4,25-41` Tier 3B demarcation stays open outside current write containment. | `ste-lint.py --strict` (`consumer_sdk_and_web.md`), `check_doc_links.ts` |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-web/AGENTS.md`, `src-package/src/`, `src-package/tests/`, `docs/source/reliability/proposed_wiki_changes.md` | Cleaned `src-package/AGENTS.md`, `src-web/AGENTS.md`, and `proposed_wiki_changes.md`. `src-package/README.md` stays untouched (owner lock headers); `src-web-search/AGENTS.md` remains open in its submodule. | `ste-lint.py --strict` (`src-web/AGENTS.md`: 0.00/100w, 0 em-dash), `check_doc_links.ts` |
| REORIENT-AW-02 | open | `src-package/src/`, `src-package/tests/` | Stage 5-6 SDK Version 0 rewrite under Rule 06 `edit-guard`: add `PATCH`, `NODE_TOKEN_REGEX`, 9-platform `PlatformSchema`, Coordinator-only `IssueNodeCredentialSchema`, `SteeringProfile` + `SuppressedTarget` CRUD, jobs CRUD/requeue, bulk leads, `operator.status()`, dev-only `operator.systemPurge()`, extended `CatalogPackageSchema`, and `relationship_feedback`. | Pending Stage 5 start |
| REORIENT-AW-03 | open | `src-web/src/lib/{api/admin-client.ts,stores/admin-session.svelte.ts,components/}` | Stage 5-6 Operator Workbench UIUX rewrite per Cardinal Rules 1-9: remove drifted `VRCPAdminClient`, fix raw checkboxes and duplicate triggers/footers, add `AdminShell` pin toggle, remove 10-checkbox picker, unify `SteeringProfilesPanel`, and add job blockers/CRUD plus grouped custom-domain actions. | Pending `REORIENT-AW-02` |
| REORIENT-AW-04 | open | `src-web/src/lib/components/admin/operator/{OperatorDashboard.svelte,CatalogInitPanel.svelte,GovernancePanel.svelte}` | Add environment badge and Fleet Queue Readiness strip, `VRCP_ENV=development`-gated `System Purge` `AlertDialog` (`PURGE_DEVELOPMENT_D1`), nullable field guards and trusted-app usage cues in `GovernancePanel.svelte`, UIUX Cardinal Rules 1-9 verification, and web Publication Request. | Pending `REORIENT-AW-03` |

---

## Next Steps

1. Execute `REORIENT-AW-02` (`src-package/` Tier 3B producer SDK) first in Stage 5 under `PN-009` (`active`) and `HO-S3-BLUEPRINT-001`, emit `HO-S3B-006`, and submit a Publication Request for `vrc-packages-api-preview`.
2. Execute `REORIENT-AW-03` and `REORIENT-AW-04` (`src-web/` V0 Operator/Moderator workbench rewrite and `VRCP_ENV=development` purge gate) after `REORIENT-AW-02` publishes and Sector 1 deploys matching Worker preview contracts (`REORIENT-CN-02..06`).
3. Complete Tier 3B demarcation follow-up in `wire_and_protocol_contracts.md` (`UNTANGLE-AW-05`), await owner unlock on `src-package/README.md` and `Q-API-REVIEW` (`v0.1.0`), and align `src-web-search/` in its separate submodule slice (`UNTANGLE-AW-04`).
