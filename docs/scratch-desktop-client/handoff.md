# Integration Handoff Ledger: Sector 2 (Crawler Desktop Client)

## Department Scope and Hierarchy Position

- **Cascade Tier Owned**: **Tier 4B (Crawler Desktop Client: `src-crawler-client/`)**
- **Sector Anchor**: `docs/scratch-desktop-client/` (branch `preview/desktop-client`)
- **Owned Paths**: `src-crawler-client/`, `docs/source/specifications/desktop_client.md`
- **Permitted Upstream Reads**:
  - Tier 1: [`docs/scratch-legal-research/handoff.md`](../scratch-legal-research/handoff.md)
  - Tier 2, Tier 3A, and Tier 4A: [`docs/scratch-crawler-network/handoff.md`](../scratch-crawler-network/handoff.md)
  - Tier 3B: [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md) (Section: Tier 3B)
  - Independent Oversight: [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Downstream Readers**:
  - Tier 5 (`src-web/` download/distribution pages) via [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md)
  - Independent Oversight: Sector 4 Pipeline via [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Write Containment and Ledger Clearing**:
  - Sector 2 agents edit strictly inside `src-crawler-client/`, `docs/source/specifications/desktop_client.md`, and `docs/scratch-desktop-client/`.
  - Sector 2 agents **must not** edit upstream code or upstream `handoff.md` files, **must not** edit `docs/source/CHANGELOG.md`, **must not** run root `bun run publish:*` directly, and **must not** clear or delete `verified` rows from `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or this `handoff.md`.
  - Only Sector 4 (`pipeline`) agents transfer verified product notes into `docs/source/CHANGELOG.md`, clear transferred `verified` rows across ledgers, and execute root publication routines.

---

## Upstream Handoffs Consumed

| source_sector | handoff_id | status | summary | local_slice_id |
| :--- | :--- | :--- | :--- | :--- |
| `crawler-network` | `HO-C4A-001` | pending | Consume headless `vrcp-crawler-node` CLI, `node.db` outbox, and `[ACTIVITY]` / `[FINDING]` `latest.log` supervision contracts when building Tauri process supervision. | `R47-C27-CLIENT` |
| `api-web` | `HO-S3B-001` | pending | Consume preview-channel `vrc-packages-api-preview` (`vrc-packages-api`, `VRCPackageClient`) for desktop node management and consumer API actions. | `R47-C27-CLIENT` |
| `pipeline` | `PN-001` | acknowledged | Departmental Handoff Cascade active: submit Publication Requests here and defer changelog edits and verified-row clearing to Sector 4 Pipeline. | `G9-CLIENT` |
| `pipeline` | `PN-008` | integrated | Aligned `src-crawler-client/package.json`, `src-crawler-client/AGENTS.md`, `docs/source/specifications/desktop_client.md`, and Sector 2 ledgers to `vrc-packages-api-preview` (`npm:vrc-packages-api-preview@latest`). Install and build checks await `vrcp-api/v2026.11.2-pre`. | `G9-CLIENT` |
| `pipeline` | `PN-009` | acknowledged | Version 0 reorientation ([`VISION.md`](../research/decisions/VISION.md) `[P18]`, [`PN-009`](../scratch-pipeline/handoff.md)). Crawler nodes offload heavy sanitization, diagnostics, and `304` diffing across the 7-lane preview pool. Coordinator purges `"curated"` from `PlatformSchema` and auto-generates node capabilities on registration. All runtime apps consume `vrc-packages-api-preview` under [`docs/research/UIUX/`](../research/UIUX/README.md) rules. Follow the 6-stage flow: research, review, `untangle-codebase`, `docs/source/` blueprint `/grill-me`, plan, and execute. | `REORIENT-DC-01` |
| `pipeline` | [`PN-010`](../scratch-pipeline/handoff.md) | acknowledged | Owner Live Lifecycle & Debug Directives (`2026-11-24 to 2026-11-25`, `[P19]`): enforce `NODE-CWD-CONTAINMENT` (`<cwd>/logs`, `<cwd>/node.db`, `<cwd>/node.stop`, `<cwd>/node.config.json`, `<cwd>/.env` strictly per working directory for Tauri child supervision), apply open R&D unpacking ([`Rule 02.5`](../../.agents/rules/02-boundary-and-review.md)) during live child/telemetry debugging, and run `/untangle-codebase` (`UNTANGLE-PRE-PREVIEW-01`) across touched code and docs before remote preview pushes (`REORIENT-LIVE-DEBUG`). | `R47-C27-CLIENT`, `REORIENT-DC-01` |

---

## Tier 4B: Outbound Handoffs (Crawler Desktop Client: `src-crawler-client/`)

Publish Windows installer naming, channel identity conventions, and desktop distribution metadata here for Tier 5 (`src-web/`) and Sector 4 (`pipeline`).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-D4B-001` | Tier 5, Pipeline | [`desktop_client.md`](../source/specifications/desktop_client.md), `src-crawler-client/src-tauri/tauri.conf.json` | no | blocked | Preview vs release Windows identifier and data-directory coexistence plan (`R55-C55D-CLIENT`) awaits finalization before installer publication. |

---

## Publication Requests (For Sector 4 Pipeline Oversight)

Write a request here only after the owning product gate passes all Sector 2 verification checks (`bun run check`, `bun run build:web`, and `bun run build:dev` when Rust/Tauri files change). Sector 4 Pipeline transfers `proposed_changelog_notes` into `docs/source/CHANGELOG.md`, clears transferred `verified` rows from Sector 2 ledgers, and executes root publication scripts.

| req_id | product | channel | producer_prereqs | source_slice_ids | proposed_changelog_notes | verification_proof | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(none pending)* | | | | | | | |
