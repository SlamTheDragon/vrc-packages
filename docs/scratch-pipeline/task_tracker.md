# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (`in_progress`)
- **Active Task Slice**: `STAGE-21-PREDECESSOR-PROOF` (`in_progress`, carried over from uncommitted `docs/scratch/task_tracker.md`)
- **Working Theories and Hypotheses**:
  - `STAGE-21` targets `scripts/delivery-chain.mjs` (`planDelivery`, `finalizeRelease`, `requirePublicationProof` / `inspectPredecessorAssets`, `trackDeliveryPipeline`) and `scripts/delivery.mjs` (`verify`).
  - `PIPELINE-SCRATCH-RETIRE` is verified: `scripts/delivery.mjs` now enforces a 5-path `approvedTaskTrackers` allowlist (`docs/scratch-<sector>/task_tracker.md`), `tests/preprod_layout.test.ts` enforces the 3-file footprint per sector and absence of `docs/scratch/`, `.gitignore` and `.agents/scripts/check_doc_links.ts` are updated, and legacy `docs/scratch/` is deleted.
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers the Rule 06 `edit-guard` and requires running `bun test ./tests`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| STAGE-21-PREDECESSOR-PROOF | in_progress | `scripts/delivery-chain.mjs`, `scripts/delivery.mjs`, `tests/delivery-chain.test.ts`, `tests/delivery.test.ts` | Enforce remote GitHub assets verification in all environments (including local dev), verify predecessor artifact existence/publication path without full streaming, gate completion notices on `artifactsVerified === true`, and stop swallowing preview test failures. | Pending execution |
| PIPELINE-SCRATCH-RETIRE | verified | `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, `tests/delivery-chain.test.ts`, `tests/release-provenance.test.ts`, `.gitignore`, `.agents/scripts/check_doc_links.ts` | Migrated root tracker-only advancement and layout conformance assertions to the five 3-file `docs/scratch-<sector>/` ledgers and deleted legacy `docs/scratch/`. | `bun test ./tests` (262/262 pass, 3,095 assertions across 19 files); `bun .agents/scripts/check_doc_links.ts` (0 broken active links) |
| R50-C31-RECOVERY | open | `scripts/delivery-recovery.mjs`, `.github/workflows/node-docker.yml` | Recover frozen crawler preview `2026.10.10-pre` via root delivery recovery tooling. | Pending |

---

## Next Steps

1. Finish `STAGE-21-PREDECESSOR-PROOF` and verify with `bun test ./tests/delivery-chain.test.ts ./tests/delivery.test.ts`.
2. Resolve `R50-C31-RECOVERY` using `scripts/delivery-recovery.mjs` before advancing crawler preview versions.
3. Clear `PIPELINE-SCRATCH-RETIRE` verified rows on next Pipeline housekeeping pass (non-product root tooling/governance slice; no software version bump required).
