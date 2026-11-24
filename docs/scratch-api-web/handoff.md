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
| `pipeline` | [`PN-009`](../scratch-pipeline/handoff.md) | integrated (Stage 4) | Version 0 reorientation Stages 1 to 4 verified across Sector 3 and Sector 1 (`REORIENT-AW-01`). `PN-009` is `active` for Stage 5-6 execution (`REORIENT-AW-02` in `src-package/` first, then `REORIENT-AW-03..04` in `src-web/`). | `REORIENT-AW-01..04` |
| `legal-research` | `HO-L1-003` | integrated (Stage 4) | Adopted 17-table schema alignment, `'unverified'` default with trusted-app attestations, `relationship_feedback` telemetry, and `VRCP_ENV=development` UI purge gate into `consumer_sdk_and_web.md` and `wire_and_protocol_contracts.md`. | `REORIENT-AW-01..04` |
| `crawler-network` | `HO-S1-BLUEPRINT-001` | integrated (Stage 4) | Aligned Tier 3B and Tier 5 Stage 4 blueprints with Sector 1 target Worker, Network, and Crawler blueprints. Producer SDK (`REORIENT-AW-02`) executes first in Stage 5. | `REORIENT-AW-01..04` |

---

## Tier 3B: Outbound Handoffs (Public Consumer API SDK: `src-package/`)

Publish SDK method signatures, wire DTO exports (`VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`), cursor contracts, and channel readiness here for Tier 2 (`src-worker/` preview), Tier 4A (`src-crawler/` preview), Tier 4B (`src-crawler-client/` preview per `PN-008`), and Tier 5 (`src-web/` preview per `PN-008`; `src-web-search/` submodule stays on `^0.0.6` until submodule alignment).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-S3B-001` | Tier 2, Tier 4A, Tier 4B, Tier 5 | `src-package/`, [`consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | no | active | Strict snake-case wire DTOs enforced without aliases. Pre-0.1 releases (`v0.0.1+`) are permitted after verification; `v0.1.0` remains held on owner `Q-API-REVIEW`. |
| `HO-S3-BLUEPRINT-001` | Tier 2 (`src-worker/`), Tier 4B (`src-crawler-client/`), Tier 5 (`src-web/`), Oversight (`pipeline`) | [`consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | yes | draft | **Stage 4 SDK & Operator UIUX Blueprint Published (`REORIENT-AW-01`, pending Stage 5 code execution):** (1) Tier 3B SDK (`src-package/`) adds `PATCH` HTTP support, exports single-owner `NODE_TOKEN_REGEX`/`isNodeToken` from `./auth`, purges `"curated"` from `PlatformSchema` (9 platforms), removes manual `capabilities` from `IssueNodeCredentialSchema`, replaces `SourceAccessProfile`/`AutoQueueRule` with `SteeringProfile` + `SuppressedTarget` CRUD, adds `jobs.{update,requeue,delete}`, `leads.{bulkApprove,suppressDomain}`, `operator.status()`, `VRCP_ENV=development`-gated `operator.systemPurge()`, extended `CatalogPackageSchema` (`ownerKey`, `ownerName`, `verificationStatus`, `qualityFlags`, `summary`, `tags`, `vpmLatestVersion`, `relations`, `sources`), and `relationship_feedback` signal. (2) Tier 5 `src-web/` deletes drifted `VRCPAdminClient` forwarding shim, fixes `GovernancePanel.svelte` null guards, removes raw checkboxes and duplicate triggers/footers, removes 10-checkbox picker, adds environment + Fleet Queue Readiness cues and `VRCP_ENV=development`-only System Purge `AlertDialog`. Execute `REORIENT-AW-02` first when Stage 5 starts. |

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
| *(none pending)* | | | | | | | |
