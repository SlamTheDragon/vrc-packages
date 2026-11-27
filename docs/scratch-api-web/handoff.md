# Integration Handoff Ledger: Sector 3 (Consumer API and Web)

## Department Scope and Hierarchy Position

- **Cascade Tiers Owned**:
  - **Tier 3B (API and Networking: Public Consumer SDK)**: `src-package/` (`vrc-packages-api` / `vrc-packages-api-preview`, `docs/source/schemas/wire_and_protocol_contracts.md`, `docs/source/specifications/consumer_sdk_and_web.md`)
  - **Tier 5 (Downstream Web Applications)**: `src-web/` (`vrcp-web`), `src-web-search/` (Git submodule)
- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`)
- **Permitted Upstream Reads**:
  - Tier 1: [`docs/scratch-legal-research/handoff.md`](../scratch-legal-research/handoff.md)
  - Tier 2, Tier 3A, and Tier 4A: [`docs/scratch-crawler-network/handoff.md`](../scratch-crawler-network/handoff.md)
  - Tier 4B (for Tier 5 web distribution pages): [`docs/scratch-desktop-client/handoff.md`](../scratch-desktop-client/handoff.md)
  - Independent Oversight: [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Downstream Readers**:
  - Tier 2 (`src-worker/`), Tier 4A (`src-crawler/`), Tier 4B (`src-crawler-client/`), and Tier 5 (`src-web/`) read **Tier 3B** when adopting `vrc-packages-api-preview` updates (`PN-008`)
  - Tier 5 (`src-web-search/`) stays on `"vrc-packages-api": "^0.0.6"` in its separate Git submodule until its next submodule alignment
  - Independent Oversight: Sector 4 Pipeline via [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Write Containment and Ledger Clearing**:
  - Sector 3 agents edit strictly inside `src-package/`, `src-web/`, `src-web-search/` (separate submodule worktree), owned `docs/source/` truth files, and `docs/scratch-api-web/`. Keep `docs/applications/` untouched (stage wiki proposals in [`proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md)).
  - Sector 3 agents **must not** edit upstream code or upstream `handoff.md` files, **must not** edit `docs/source/CHANGELOG.md`, **must not** run root `bun run publish:*` directly, and **must not** clear or delete `verified` rows from `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or this `handoff.md`.
  - Only Sector 4 (`pipeline`) agents transfer verified product notes into `docs/source/CHANGELOG.md`, clear transferred `verified` rows across ledgers, and execute root publication routines.

---

## Upstream Handoffs Consumed

| source_sector | handoff_id | status | summary | local_slice_id |
| :--- | :--- | :--- | :--- | :--- |
| `legal-research` | `HO-L1-001` | pending | Preserve mandatory outbound storefront deep-routing on `src-web/` and `src-web-search/`, and surface legal/ToS pages aligned with `LEGAL.md`. | `R47-C27-WEB` |
| `crawler-network` | `HO-W2-001` | blocked | Reconcile all 26 live Worker `/v1/` handlers against 23 SDK methods and staged wiki deltas (`WIKI-01`..`WIKI-06`) under owner review before SDK `v0.1.0`. | `Q-API-REVIEW` |
| `desktop-client` | `HO-D4B-001` | pending | Consume finalized desktop client installer metadata on `src-web/` download and registry views once `R55-C55D-CLIENT` clears. | `R47-C27-WEB` |
| `pipeline` | `PN-001` | acknowledged | Departmental Handoff Cascade active: submit Publication Requests here and defer changelog edits and verified-row clearing to Sector 4 Pipeline. | `G15` / `G9-WEB` |
| `pipeline` | [`PN-009`](../scratch-pipeline/handoff.md) | integrated (Stage 5 SDK) | Version 0 reorientation Stages 1 to 4 verified across Sector 3 and Sector 1 (`REORIENT-AW-01`). `PN-009` is `active` for Stage 5-6 execution (`REORIENT-AW-02` in `src-package/` first, then `REORIENT-AW-03..04` in `src-web/`). | `REORIENT-AW-01..04` |
| `pipeline` | [`PN-010`](../scratch-pipeline/handoff.md) | acknowledged | Owner Live Lifecycle & Debug Directives (`2026-11-24 to 2026-11-25`, `[P19]`): verify live `vrc-packages-api-preview` SDK and local `src-web/` workbench comprehension across catalog survivors and initial anti-survivorship-bias attrition buckets (`crawl_jobs` blockers, `source_leads` false negatives, excluded `canonical_packages`, expanding R&D probes dynamically per [`Rule 02.5`](../../.agents/rules/02-boundary-and-review.md)) against local `wrangler dev` + real multi-node ingested packages (`LIVE-LOCAL-ASSESS-01`), and run `/untangle-codebase` across all touched Sector 3 code and docs (`UNTANGLE-PRE-PREVIEW-01`) before remote preview alignment (`REORIENT-LIVE-DEBUG`). | `LIVE-LOCAL-ASSESS-01`, `UNTANGLE-PRE-PREVIEW-01` |
| `legal-research` | `HO-L1-003` | integrated (Stage 4) | Adopted 17-table schema alignment, `'unverified'` default with trusted-app attestations, `relationship_feedback` telemetry, and `VRCP_ENV=development` UI purge gate into `consumer_sdk_and_web.md` and `wire_and_protocol_contracts.md`. | `REORIENT-AW-01..04` |
| `crawler-network` | `HO-S1-BLUEPRINT-001` | integrated (Stage 5 SDK) | Aligned Tier 3B Stage 5 producer SDK (`REORIENT-AW-02`) with Sector 1 target Worker, Network, and Crawler blueprints. | `REORIENT-AW-02` |

---

## Tier 3B: Outbound Handoffs (Public Consumer API SDK: `src-package/`)

Publish SDK method signatures, wire DTO exports (`VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`), cursor contracts, and channel readiness here for Tier 2 (`src-worker/` preview), Tier 4A (`src-crawler/` preview), Tier 4B (`src-crawler-client/` preview per `PN-008`), and Tier 5 (`src-web/` preview per `PN-008`; `src-web-search/` submodule stays on `^0.0.6` until submodule alignment).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-S3B-001` | Tier 2, Tier 4A, Tier 4B, Tier 5 | `src-package/`, [`consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | no | active | Strict snake-case wire DTOs enforced without aliases. Pre-0.1 releases (`v0.0.1+`) are permitted after verification; `v0.1.0` remains held on owner `Q-API-REVIEW`. |
| `HO-S3-BLUEPRINT-001` | Tier 2 (`src-worker/`), Tier 4B (`src-crawler-client/`), Tier 5 (`src-web/`), Oversight (`pipeline`) | [`consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | yes | active | Stage 4 blueprint implemented in Tier 3B producer SDK (`REORIENT-AW-02` verified / `HO-S3B-006` `active`). Tier 5 `src-web/` Stage 5-6 (`REORIENT-AW-03..04`) starts after preview SDK publish and Sector 1 Worker adoption. |
| `HO-S3B-006` | Tier 2 (`src-worker/`), Tier 4A (`src-crawler/`), Tier 4B (`src-crawler-client/`), Tier 5 (`src-web/`), Oversight (`pipeline`) | `src-package/src/{auth/tokens.ts,types/platform.ts,types/package.ts,protocol/downstream.ts,protocol/operator.ts,client.ts}` | yes | active | **Stage 5 Tier 3B Producer SDK Published (`vrcp-api/v2026.11.5-pre`, `run 45396768194`, `release-artifacts-verified`; ready for downstream adoption):** (1) `./auth` exports `NODE_TOKEN_REGEX` and `isNodeToken` (single owner). (2) `PlatformSchema` purges `"curated"` (9 atomic platforms; 7 `STOREFRONT_PLATFORMS`). (3) `CatalogPackageSchema` purges `acceptedLinks`, `fronts`, and `CatalogIdentityLinkSchema`; keeps `PackageFrontSchema`; adds `ownerKey`, `ownerName`, `verificationStatus`, `verifiedByAppId`, `vpmLatestVersion`, `vpmRepoUrl`, `summary`, `tags`, `qualityFlags`, `"deleted"` lifecycle, `sources` (`CatalogListingSourceSchema`), and `relations` (`CatalogRelationSchema`). (4) `downstream.ts` adds `"relationship_feedback"` (`RelationshipFeedbackReportRequestSchema`) to `ReportSubmissionRequestSchema`. (5) `operator.ts` removes manual `capabilities` from `IssueNodeCredentialSchema`, locks `autoSeed: false`, adds `OperatorStatusResponseSchema` and `SystemPurge*`, replaces `SourceAccessProfile*`/`AutoQueueRule*` with `SteeringProfile*` + `SuppressedTarget*` (`SuppressedTargetResponseSchema.suppressedTarget`, `SuppressedTargetListResponseSchema.targets`), adds `PriorityLaneSchema`, `OperatorJobIdSchema`, `UpdateJob*`, `RequeueJob*`, `DeleteJob*`, `LeadRowSchema.target_host`, `BulkApproveLeads*`, and `SuppressLeadDomain*`. (6) `VRCPackageClient` adds `PATCH`, `operator.status()`, `operator.systemPurge()`, `operator.jobs.{update,requeue,delete}`, `operator.leads.{bulkApprove,suppressDomain}`, `operator.steeringProfiles.*`, `operator.suppressedTargets.*`, and `nodeId` check on `operator.nodes.prune()`. |

---

## Tier 5: Outbound Handoffs (Downstream Web Applications: `src-web/`, `src-web-search/`)

Tier 5 sits at the consumer end of the product cascade. Record web deployment constraints, Firebase Auth/CORS integration notes, or submodule release alignment needed by Sector 4 (`pipeline`) here.

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-W5-001` | Pipeline | `src-web/`, `src-web-search/` (Git submodule) | no | active | `src-web-search/` is a separate Git submodule; pipeline builds and releases must preserve recursive submodule checkouts (`submodules: recursive`). |

---

## Publication Requests (For Sector 4 Pipeline Oversight)

Write a request here only after the owning product gate passes all Sector 3 verification checks (`src-package`: `bun run typecheck`, `bun test`; `src-web` / `src-web-search`: `bun run build`). Producer SDK (`src-package/`) must publish before consumer apps adopt updates. Sector 4 Pipeline transfers `proposed_changelog_notes` into `docs/source/CHANGELOG.md`, clears transferred `verified` rows from Sector 3 ledgers, and executes root publication scripts.

| req_id | product | channel | producer_prereqs | source_slice_ids | proposed_changelog_notes | verification_proof | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PR-AW-WEB-005` | `vrcp-web` | `preview` | `HO-S3B-006` (`vrc-packages-api-preview@2026.11.5-pre`, `run 45396768194`), Sector 1 + Sector 3 `LIVE-LOCAL-ASSESS-01` & `UNTANGLE-PRE-PREVIEW-01` (verified locally) | `REORIENT-AW-03`, `REORIENT-AW-04`, `LIVE-LOCAL-ASSESS-01`, `UNTANGLE-PRE-PREVIEW-01` | Align `src-web/` Operator and Moderator workbenches directly to `vrc-packages-api-preview@2026.11.5-pre` without the `VRCPAdminClient` shim, clear `[P20]` `template-package` form defaults, use unified Steering Profiles and Target Suppression panels, display Coordinator environment and queue readiness telemetry, add full crawl job lifecycle actions and domain lead suppression, enforce nullable governance guards, and gate development D1 system purge under `VRCP_ENV=development`. | Rule 06 `edit-guard` (`[PERMITTED]`), `bun run prepare:dev preview web` (`2026.11.5-pre`), `src-package` (`93 pass`), `src-web` (`astro check` `0` errors, `astro build` `5 page(s)`), live `wrangler dev` SDK comprehension (`13` packages, `13` deltas), `check_doc_links.ts`, `ste-lint.py --strict` | pending (held behind `REORIENT-LIVE-DEBUG` until Wave 7) |
