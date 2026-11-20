# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (`in_progress`)
- **Active Task Slice**: `STAGE-21-PREDECESSOR-PROOF` (`in_progress`, carried over from uncommitted `docs/scratch/task_tracker.md`)
- **Working Theories and Hypotheses**:
  - `STAGE-21` targets `scripts/delivery-chain.mjs` (`planDelivery`, `finalizeRelease`, `requirePublicationProof` / `inspectPredecessorAssets`, `trackDeliveryPipeline`) and `scripts/delivery.mjs` (`verify`).
  - `PIPELINE-SCRATCH-RETIRE` will update `scripts/delivery.mjs:130,245`, `tests/preprod_layout.test.ts:71,88-99`, `tests/delivery-chain.test.ts`, `tests/release-provenance.test.ts`, and `.gitignore:44` so legacy `docs/scratch/` can be safely deleted after `STAGE-21` lands.
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers the Rule 06 `edit-guard` and requires running `bun test ./tests`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| STAGE-21-PREDECESSOR-PROOF | in_progress | `scripts/delivery-chain.mjs`, `scripts/delivery.mjs`, `tests/delivery-chain.test.ts`, `tests/delivery.test.ts` | Enforce remote GitHub assets verification in all environments (including local dev), verify predecessor artifact existence/publication path without full streaming, gate completion notices on `artifactsVerified === true`, and stop swallowing preview test failures. | Pending execution |
| PIPELINE-SCRATCH-RETIRE | open | `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, `tests/delivery-chain.test.ts`, `tests/release-provenance.test.ts`, `.gitignore`, `docs/scratch/` | Migrate root tracker-only advancement and layout conformance assertions from `docs/scratch/` to `docs/scratch-*/task_tracker.md`, verify `bun test ./tests`, and delete legacy `docs/scratch/`. | Blocked on Sector 4 authorization / sequence after `STAGE-21` |
| R50-C31-RECOVERY | open | `scripts/delivery-recovery.mjs`, `.github/workflows/node-docker.yml` | Recover frozen crawler preview `2026.10.10-pre` via root delivery recovery tooling. | Pending |

---

## Next Steps

1. Finish `STAGE-21-PREDECESSOR-PROOF` and verify with `bun test ./tests/delivery-chain.test.ts ./tests/delivery.test.ts`.
2. Execute `PIPELINE-SCRATCH-RETIRE` (with `edit-guard` audit and full `bun test ./tests`) to retire legacy `docs/scratch/`.
3. Resolve `R50-C31-RECOVERY` using `scripts/delivery-recovery.mjs` before advancing crawler preview versions.
