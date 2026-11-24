# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (preview chain verified: `vrcp-api/v2026.11.4-pre`, `vrcp-network/v2026.11.4`, `cloudflare-worker/v2026.11.4-pre` with live Cloudflare Worker deployment and live VPM crawling proof via probe `ci-preview-probe-6afae9eb2e96`)
- **Active Task Slice**: `REORIENT-V0-PIPELINE` (`in_progress`: Stages 1 to 4 complete across Sectors 5, 1, and 3; `REORIENT-LR-01`, `REORIENT-CN-01`, and `REORIENT-AW-01` verified; awaiting owner sign-off on updated `docs/source/` blueprints before Stage 5-6 execution). Prior `INT-001`..`INT-003` and `WEB-ADMIN-INIT-PIPELINE` stay verified; `INT-004`..`INT-011` and `R50-C31-RECOVERY` remain open.
- **Working Theories and Hypotheses**:
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.4-pre` (run `44971664056`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1`, hard node pruning (`DELETE /v1/operator/nodes/{nodeId}`), and verified `worker:preview:live-crawl --execute` (`nodeId: "ci-preview-probe-6afae9eb2e96"`, `nodeRevoked: true`, `canonicalPackages: ["com.vrchat.demo-template"]`, `deltaCount: 1`, `leadsCount: 0`).
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| WEB-ADMIN-INIT-PIPELINE | verified | `src-web/.agents/skills/`, `src-web/src/lib/components/ui/`, `.agents/rules/09-frontend-design-system-invariants.md`, `docs/scratch-api-web/`, `docs/scratch-crawler-network/` | Imported 6 UI skills and 6-domain + `workbench` UI primitives from `avali-clock` and `culinary-tree` into `src-web/`, updated Rule 09, distributed initializer packets `WEB-INIT-01`..`05` to Sector 3 (`api-web`) and `R47-C27-CORS` to Sector 1 (`crawler-network`), reframed full-viewport NOC/SRE workbench, and implemented bulk triage and multi-selection workbenches (`WEB-BULK-01`..`03`). | `astro check` (16 files, 0 errors); `astro build` (5 static pages `/`, `/login`, `/operator`, `/moderator`, `/design` in 20.48s); `check_doc_links.ts` (exit 0) |
| REORIENT-V0-PIPELINE | in_progress | `docs/scratch-*/`, `docs/source/`, `docs/research/` | Completed Stages 1 to 4 (`REORIENT-LR-01`, `REORIENT-CN-01`, `REORIENT-AW-01` verified): online research, `untangle-codebase` audits, Blueprint `/grill-me` Q1..Q6, and updated `docs/source/` blueprints (`HO-L1-003`, `HO-S1-BLUEPRINT-001`, `HO-S3-BLUEPRINT-001`). Hold code edits for owner review. | `check_doc_links.ts` (482 docs, exit 0), `ste-lint.py --strict` (`docs/source/` 0.52..1.33/100w, `0` em-dash) |
| WORKER-PIPELINE-ALIGN-01 | open | `scripts/{delivery.mjs,worker-preview-init.mjs,worker-preview-live-crawl.mjs,worker-dev-purge.mjs}`, `.github/workflows/{cloudflare-worker.yml,worker-preview-init.yml}`, `package.json`, `tests/` | Align Worker `--env preview`/`production` delivery targets, remove `continue-on-error: true` and legacy `--seed` from preview CI, requeue/verify fresh claims and prune probe nodes in `worker-preview-live-crawl.mjs`, and add optional guarded `worker:dev:purge` CLI (`VRCP_ENV=development`) keeping all 14 workflows intact. | Pending `REORIENT-CN-02` |

---

## Next Steps

1. Await owner go-ahead on the updated Stage 4 `docs/source/` blueprints (`REORIENT-LR-01`, `REORIENT-CN-01`, `REORIENT-AW-01` verified).
2. Execute Stages 5 and 6 in producer order: Sector 3B (`REORIENT-AW-02`) -> Sector 1 (`REORIENT-CN-02..06`) -> Sector 4 (`WORKER-PIPELINE-ALIGN-01` + preview delivery + live crawl proof) -> Sector 3 Tier 5 (`REORIENT-AW-03..04`) -> Sector 2 (`REORIENT-DC-01`).
3. Reconcile `INT-004`..`INT-011`, `CLR-LR-001`, and `R50-C31-RECOVERY` at the next Pipeline changelog and ledger-clearance sweep.
