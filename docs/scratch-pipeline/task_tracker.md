# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (preview chain verified: `vrcp-api/v2026.11.4-pre`, `vrcp-network/v2026.11.4`, `cloudflare-worker/v2026.11.4-pre` with live Cloudflare Worker deployment and live VPM crawling proof via probe `ci-preview-probe-6afae9eb2e96`)
- **Active Task Slice**: `REORIENT-V0-PIPELINE` (`PN-009` distributed across Sectors 5, 1, 3, and 2; awaiting owner ledger review before Stage 1 online research and `docs/source/` blueprint `/grill-me`). Prior `INT-001`..`INT-003` and `WEB-ADMIN-INIT-PIPELINE` stay verified; `INT-004`..`INT-011` and `R50-C31-RECOVERY` remain open.
- **Working Theories and Hypotheses**:
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.4-pre` (run `44971664056`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1`, hard node pruning (`DELETE /v1/operator/nodes/{nodeId}`), and verified `worker:preview:live-crawl --execute` (`nodeId: "ci-preview-probe-6afae9eb2e96"`, `nodeRevoked: true`, `canonicalPackages: ["com.vrchat.demo-template"]`, `deltaCount: 1`, `leadsCount: 0`).
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| WEB-ADMIN-INIT-PIPELINE | verified | `src-web/.agents/skills/`, `src-web/src/lib/components/ui/`, `.agents/rules/09-frontend-design-system-invariants.md`, `docs/scratch-api-web/`, `docs/scratch-crawler-network/` | Imported 6 UI skills and 6-domain + `workbench` UI primitives from `avali-clock` and `culinary-tree` into `src-web/`, updated Rule 09, distributed initializer packets `WEB-INIT-01`..`05` to Sector 3 (`api-web`) and `R47-C27-CORS` to Sector 1 (`crawler-network`), reframed full-viewport NOC/SRE workbench, and implemented bulk triage and multi-selection workbenches (`WEB-BULK-01`..`03`). | `astro check` (16 files, 0 errors); `astro build` (5 static pages `/`, `/login`, `/operator`, `/moderator`, `/design` in 20.48s); `check_doc_links.ts` (exit 0) |
| REORIENT-V0-PIPELINE | in_progress | `docs/scratch-pipeline/`, `docs/research/decisions/`, `docs/scratch-legal-research/`, `docs/scratch-crawler-network/`, `docs/scratch-api-web/`, `docs/scratch-desktop-client/` | Publish `PN-009` Version 0 reorientation (`[P18]`), coordinate Sector 5 `VISION.md` updates, and distribute 6-stage cascading blueprint slices across Sectors 5, 1, 3, and 2. | Pending ledger distribution and owner review |
| PREVIEW-D1-RESET-01 | open | `scripts/worker-preview-reset.mjs`, `package.json`, `tests/` | Implement guarded `bun run worker:preview:reset` CLI (`--execute --confirm-preview-reset`, `--preserve-nodes`) after Sector 1 exposes preview-only `POST /v1/operator/reset-preview`. | Pending Sector 1 preview reset endpoint |

---

## Next Steps

1. Complete `PN-009` ledger distribution across Sectors 5, 1, 3, and 2 and stop for owner review before Stage 1 research, `untangle-codebase` audits, or `docs/source/` blueprint `/grill-me`.
2. Execute the 6-stage cascade in producer order: Sector 5 (`REORIENT-LR-01`), Sector 1 (`REORIENT-CN-01`..`06`), Sector 3 (`REORIENT-AW-01`..`04`), Sector 4 (`PREVIEW-D1-RESET-01` and preview publication chain), and Sector 2 (`REORIENT-DC-01`).
3. Reconcile `INT-004`..`INT-011` (`docs/source/CHANGELOG.md` transfer and verified-row cleanup) and promote `preview/crawler-network` to `main` via owner review for `R50-C31-RECOVERY`.
