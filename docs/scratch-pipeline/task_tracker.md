# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (preview chain verified: `vrcp-api/v2026.11.5-pre` in `run 45396768194`, `vrcp-network/v2026.11.4`, `cloudflare-worker/v2026.11.4-pre` with live Cloudflare Worker deployment and live VPM crawling proof via probe `ci-preview-probe-6afae9eb2e96`)
- **Active Task Slice**: `REORIENT-V0-PIPELINE` (`in_progress`: Wave 0 baseline reconciliation and `INT-016` / `PR-AW-SDK-005` verified and cleared after `vrcp-api/v2026.11.5-pre` passed `publish:check` in `run 45396768194`; `[P19]` / `PN-010` active holding remote `worker` and `crawler` preview pushes behind `NODE-CWD-CONTAINMENT`, `LIVE-LOCAL-ASSESS-01`, and `UNTANGLE-PRE-PREVIEW-01`; `INT-006` / `PR-CN-CRAWL-001` and `R50-C31-RECOVERY` retained).
- **Working Theories and Hypotheses**:
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.4-pre` (run `44971664056`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1`, hard node pruning (`DELETE /v1/operator/nodes/{nodeId}`), and verified `worker:preview:live-crawl --execute` (`nodeId: "ci-preview-probe-6afae9eb2e96"`, `nodeRevoked: true`, `canonicalPackages: ["com.vrchat.demo-template"]`, `deltaCount: 1`, `leadsCount: 0`).
  - Under `[P19]` / `PN-010` (`REORIENT-LIVE-DEBUG`), remote `worker` and `crawler` preview tag pushes remain held until `NODE-CWD-CONTAINMENT`, local `wrangler dev` + multi-node live ingestion (`LIVE-LOCAL-ASSESS-01`), bulk assessment, adversarial break-testing, and `/untangle-codebase` (`UNTANGLE-PRE-PREVIEW-01`) pass cleanly.
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| REORIENT-V0-PIPELINE | in_progress | `docs/scratch-*/`, `docs/source/CHANGELOG.md`, `docs/source/`, `docs/research/` | Completed Stages 1 to 4 (`REORIENT-LR-01`, `REORIENT-CN-01`, `REORIENT-AW-01`), reconciled Wave 0 ledgers (`CLR-LR-001`, `INT-004`, `INT-005`, `INT-007`..`INT-015`), transferred `PR-AW-WEB-001..004` into `docs/source/CHANGELOG.md`, set `PN-009` active, and distributed `[P19]` / `PN-010` (`REORIENT-LIVE-DEBUG`, `NODE-CWD-CONTAINMENT`, `live_ingestion_assessment_strategy.md`). | `check_doc_links.ts` (exit 0), `ste-lint.py --strict` (`CHANGELOG.md` 1.09/100w, `0` em-dash) |
| WORKER-PIPELINE-ALIGN-01 | open | `scripts/{delivery.mjs,worker-preview-init.mjs,worker-preview-live-crawl.mjs,worker-dev-purge.mjs}`, `.github/workflows/{cloudflare-worker.yml,worker-preview-init.yml}`, `package.json`, `tests/` | Align Worker `--env preview`/`production` delivery targets, remove `continue-on-error: true` and legacy `--seed` from preview CI, requeue/verify fresh claims and prune probe nodes in `worker-preview-live-crawl.mjs`, and add optional guarded `worker:dev:purge` CLI (`VRCP_ENV=development`) keeping all 14 workflows intact. | Pending `REORIENT-CN-02` |
| LIVE-LOCAL-ASSESS-01 | open | [`live_ingestion_assessment_strategy.md`](../research/architecture/live_ingestion_assessment_strategy.md), [`02-boundary-and-review.md`](../../.agents/rules/02-boundary-and-review.md), `docs/scratch-*/` | Enforce `NODE-CWD-CONTAINMENT` oversight and hold remote `worker` and `crawler` preview pushes while local `wrangler dev` + multi-node live ingestion, bulk survivor plus anti-survivorship-bias funnel attrition auditing (initial 9 non-survivor buckets + initial 9 break-test suggestions, unpacking R&D dynamically per Rule 02.5), and OOP/semantic abstractions complete. | Strategy drafted (`PN-010` `active`) |
| UNTANGLE-PRE-PREVIEW-01 | open | `src-*/`, `scripts/`, `docs/source/`, `docs/research/` | Oversee mandatory `/untangle-codebase` across all touched code and docs after `LIVE-LOCAL-ASSESS-01` and before remote `worker` and `crawler` preview pushes (`REORIENT-LIVE-DEBUG`). | Pending `LIVE-LOCAL-ASSESS-01` |
| LIVE-PREVIEW-ASSESS-01 | open | `.github/workflows/cloudflare-worker.yml`, `scripts/worker-preview-live-crawl.mjs`, [`live_ingestion_assessment_strategy.md`](../research/architecture/live_ingestion_assessment_strategy.md) | After `UNTANGLE-PRE-PREVIEW-01` passes, publish `worker` and `crawler` previews and validate remote live survivor plus initial and R&D-discovered non-survivor attrition quality (`Rule 02.5`). | Pending `UNTANGLE-PRE-PREVIEW-01` |

---

## Next Steps

1. Keep `HO-S3B-006` (`vrcp-api/v2026.11.5-pre`, `run 45396768194`, `INT-016` cleared) ready for Sector 1/2/3 adoption and enforce `PN-010` (`REORIENT-LIVE-DEBUG` holding remote `worker` and `crawler` preview pushes until `LIVE-LOCAL-ASSESS-01` and `UNTANGLE-PRE-PREVIEW-01` pass).
2. Oversee Sector 1 (`NODE-CWD-CONTAINMENT`, `REORIENT-CN-02..05`), Sector 3 (`LIVE-LOCAL-ASSESS-01` + `REORIENT-AW-03..04`), and Sector 5 provenance checks during local `wrangler dev` + multi-node ingestion, bulk survivor + initial 9-bucket attrition assessment (expanding R&D dynamically per Rule 02.5), and adversarial break-testing.
3. Run `UNTANGLE-PRE-PREVIEW-01` (`/untangle-codebase`) across all touched files, execute `WORKER-PIPELINE-ALIGN-01` (`bun test ./tests`), lift `REORIENT-LIVE-DEBUG`, and run `LIVE-PREVIEW-ASSESS-01` (plus `INT-006` / `PR-CN-CRAWL-001` once `R50-C31-RECOVERY` promotes to `main`).
4. Keep `docs/source/CHANGELOG.md` ASD-STE100 compliant (`ste-lint.py`) and validate every doc change with `bun .agents/scripts/check_doc_links.ts`.
