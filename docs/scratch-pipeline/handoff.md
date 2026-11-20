# Independent Pipeline Oversight and Integration Handoff Ledger: Sector 4 (Root Distribution Pipeline)

## Department Scope and Oversight Authority

- **Role**: Independent repository-wide distribution, versioning, changelog maintenance, ledger-clearing, and pipeline integrity department.
- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`)
- **Owned Paths**: Root `package.json`, `scripts/`, `.github/workflows/`, `config.versions.json`, `config.preview.versions.json`, `tests/`, and exclusive write stewardship of [`docs/source/CHANGELOG.md`](../source/CHANGELOG.md) (generated root `CHANGELOG.md` and `docs/changelogs/` remain script-managed).
- **Oversight Read Access (All Sector Ledgers)**:
  - Tier 1 (`legal-research`): [`docs/scratch-legal-research/handoff.md`](../scratch-legal-research/handoff.md) and [`task_tracker.md`](../scratch-legal-research/task_tracker.md)
  - Tier 2 / 3A / 4A (`crawler-network`): [`docs/scratch-crawler-network/handoff.md`](../scratch-crawler-network/handoff.md) and [`task_tracker.md`](../scratch-crawler-network/task_tracker.md)
  - Tier 4B (`desktop-client`): [`docs/scratch-desktop-client/handoff.md`](../scratch-desktop-client/handoff.md) and [`task_tracker.md`](../scratch-desktop-client/task_tracker.md)
  - Tier 3B / 5 (`api-web`): [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md) and [`task_tracker.md`](../scratch-api-web/task_tracker.md)
- **Exclusive Pipeline Responsibilities**:
  1. **Keep pipeline scripts intact**: Guard `scripts/delivery*.mjs`, `scripts/changelog.mjs`, `.github/workflows/`, and root `tests/` from product-sector drift.
  2. **Intake written Publication Requests**: Sweep all four sector `handoff.md` ledgers for `requested` items and verify producer-before-consumer ordering (`src-package` -> `src-worker/packages/network` -> `src-worker` / `src-crawler` / `src-crawler-client` / `src-web`).
  3. **Maintain changelog tidiness (`docs/source/CHANGELOG.md`)**: Transfer verified product release notes from sector `handoff.md` Publication Requests into [`docs/source/CHANGELOG.md`](../source/CHANGELOG.md) in strict ASD-STE100 compliance (`ste-lint.py`) while preserving locked headings and delimiters.
  4. **Exclusive ledger row clearing**: Only Sector 4 Pipeline agents may clear or delete `verified` rows from any sector's `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or `handoff.md`. Clear product rows **only after** transferring notes into `docs/source/CHANGELOG.md` (and/or completing publication). Clear non-product rows (such as Sector 5 `legal-research` or doc-only slices) **without** bumping versions or adding product changelog entries.
  5. **Execute publication routines**: Run root `bun run publish:preview`, `bun run publish:release`, `bun run publish:finalize`, `bun run publish:status`, `bun run publish:check`, and `bun run recovery:*` per [`AGENT_PUBLISHING_PROCEDURE.md`](../research/decisions/AGENT_PUBLISHING_PROCEDURE.md) and [`PUBLISHING.md`](../source/PUBLISHING.md). Pipeline scripts snapshot `docs/source/CHANGELOG.md` to root `CHANGELOG.md` and append consumed notes to `docs/changelogs/`.

---

## Consolidated Publication Request and Ledger-Clearance Intake Queue

Sweep all sector `handoff.md` files and stage accepted intake rows here in strict producer-before-consumer order before transferring notes to `docs/source/CHANGELOG.md` or invoking root publication scripts.

| intake_id | source_sector | req_id | product_or_scope | channel | prereqs_satisfied | changelog_transferred | rows_cleared | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *(no sector publication requests currently queued)* | | | | | | | | |

---

## Outbound Pipeline Notices (Readable by All Sectors)

Publish distribution blocks, recovery gates, toolchain upgrades, and repository-wide layout migrations here so product and legal sectors can read them without touching Sector 4 files.

| notice_id | target_sectors | related_slice | status | directive |
| :--- | :--- | :--- | :--- | :--- |
| `PN-001` | All sectors | `DELIVERY-MAINTENANCE` | active | Departmental Handoff Cascade active: every `docs/scratch-<sector>/` folder holds strictly 3 files (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`). Submit Publication Requests strictly inside your own `handoff.md`; do not edit `docs/source/CHANGELOG.md` or clear `verified` rows directly. |
| `PN-002` | `crawler-network` | `R50-C31-RECOVERY` | open | Frozen crawler preview tag `2026.10.10-pre` requires Sector 4 `scripts/delivery-recovery.mjs` resolution before advancing crawler preview publications. |
| `PN-003` | All sectors | `PIPELINE-SCRATCH-RETIRE` | open | Legacy root `docs/scratch/` remains intact for `scripts/delivery.mjs` and `tests/preprod_layout.test.ts` until `STAGE-21-PREDECESSOR-PROOF` and `PIPELINE-SCRATCH-RETIRE` complete. |
