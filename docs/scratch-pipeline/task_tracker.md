# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (preview chain verified: `vrcp-api/v2026.11.4-pre`, `vrcp-network/v2026.11.4`, `cloudflare-worker/v2026.11.4-pre` with live Cloudflare Worker deployment and live VPM crawling proof via probe `ci-preview-probe-6afae9eb2e96`)
- **Active Task Slice**: `REORIENT-V0-PIPELINE` (`in_progress`: Wave 0 baseline reconciliation complete across `docs/source/CHANGELOG.md` and `scratch-legal-research`, `scratch-api-web`, `scratch-crawler-network`, `scratch-pipeline` ledgers; `PN-009` `active`; Stage 5 producer execution starting with `REORIENT-AW-02` in `src-package/`). `INT-006` (`PR-CN-CRAWL-001`) and `R50-C31-RECOVERY` stay retained.
- **Working Theories and Hypotheses**:
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.4-pre` (run `44971664056`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1`, hard node pruning (`DELETE /v1/operator/nodes/{nodeId}`), and verified `worker:preview:live-crawl --execute` (`nodeId: "ci-preview-probe-6afae9eb2e96"`, `nodeRevoked: true`, `canonicalPackages: ["com.vrchat.demo-template"]`, `deltaCount: 1`, `leadsCount: 0`).
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| REORIENT-V0-PIPELINE | in_progress | `docs/scratch-*/`, `docs/source/CHANGELOG.md`, `docs/source/`, `docs/research/` | Completed Stages 1 to 4 (`REORIENT-LR-01`, `REORIENT-CN-01`, `REORIENT-AW-01`), reconciled Wave 0 ledgers (`CLR-LR-001`, `INT-004`, `INT-005`, `INT-007`..`INT-015`), transferred `PR-AW-WEB-001..004` into `docs/source/CHANGELOG.md`, and set `PN-009` to `active` for Stage 5-6 execution starting with `REORIENT-AW-02`. | `check_doc_links.ts` (exit 0), `ste-lint.py --strict` (`CHANGELOG.md` 1.09/100w, `0` em-dash) |
| WORKER-PIPELINE-ALIGN-01 | open | `scripts/{delivery.mjs,worker-preview-init.mjs,worker-preview-live-crawl.mjs,worker-dev-purge.mjs}`, `.github/workflows/{cloudflare-worker.yml,worker-preview-init.yml}`, `package.json`, `tests/` | Align Worker `--env preview`/`production` delivery targets, remove `continue-on-error: true` and legacy `--seed` from preview CI, requeue/verify fresh claims and prune probe nodes in `worker-preview-live-crawl.mjs`, and add optional guarded `worker:dev:purge` CLI (`VRCP_ENV=development`) keeping all 14 workflows intact. | Pending `REORIENT-CN-02` |

---

## Next Steps

1. Execute Stage 5-6 in strict producer order under active `PN-009`: Sector 3B (`REORIENT-AW-02` in `src-package/`) -> Sector 1 (`REORIENT-CN-02..06` in `vrc-packages-network`, `src-worker/`, `src-crawler/`) -> Sector 4 (`WORKER-PIPELINE-ALIGN-01` + preview delivery + live crawl proof) -> Sector 3 Tier 5 (`REORIENT-AW-03..04` in `src-web/`) -> Sector 2 (`REORIENT-DC-01` in `src-crawler-client/`).
2. Complete `INT-006` (`PR-CN-CRAWL-001`, next target `2026.11.1-pre` after `vrcp-crawler/v2026.11.0-pre` failed digest verify in `run 44917130159`) once `R50-C31-RECOVERY` promotes to `main`.
3. Keep `docs/source/CHANGELOG.md` ASD-STE100 compliant (`ste-lint.py`) and validate every doc change with `bun .agents/scripts/check_doc_links.ts`.
