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
  - Tier 2 (`src-worker/`) and Tier 4A (`src-crawler/`) read **Tier 3B** when adopting `vrc-packages-api-preview` updates
  - Tier 4B (`src-crawler-client/`) reads **Tier 3B** when adopting `vrc-packages-api` release updates
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

---

## Tier 3B: Outbound Handoffs (Public Consumer API SDK: `src-package/`)

Publish SDK method signatures, wire DTO exports (`VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`), cursor contracts, and channel release readiness here for Tier 2 (`src-worker/` preview), Tier 4A (`src-crawler/` preview), Tier 4B (`src-crawler-client/` release), and Tier 5 (`src-web/`, `src-web-search/` release).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-S3B-001` | Tier 2, Tier 4A, Tier 4B, Tier 5 | `src-package/`, [`consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | no | active | Strict snake-case wire DTOs enforced without aliases. Pre-0.1 releases (`v0.0.1+`) are permitted after verification; `v0.1.0` remains held on owner `Q-API-REVIEW`. |

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
