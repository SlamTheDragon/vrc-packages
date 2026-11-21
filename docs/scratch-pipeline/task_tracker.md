# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (index-0 preview chain verified: `vrcp-api/v2026.11.0-pre`, `vrcp-network/v2026.11.0`, `cloudflare-worker/v2026.11.0-pre` with live deployment and live VPM crawling proof)
- **Active Task Slice**: Closed `INT-001`..`INT-003` and cleared transferred `verified` ledger rows; `WEB-ADMIN-INIT-PIPELINE` (downstream Sector 3/Sector 1 execution) and `R50-C31-RECOVERY` (main promotion) remain open
- **Working Theories and Hypotheses**:
  - CalVer month/year index reset to `0`, SemVer minor/major lower-index reset checks, and temporary self-expiring version ruleset `calver-2026-11-preview-npm-rollback` enabled index-0 redeploy over permanently published npm `vrc-packages-api-preview@2026.11.12-pre`.
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.0-pre` (run `44908546421`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1` (`26` tables, `10` views, `46` indexes), and verified `worker:preview:live-crawl --execute` (`nodeId: "ci-preview-probe-05883a714203"`, `nodeRevoked: true`, `canonicalPackages: ["com.vrchat.demo-template"]`, `deltaCount: 1`, `leadsCount: 6`).
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| WEB-ADMIN-INIT-PIPELINE | in_progress | `src-web/.agents/skills/`, `src-web/src/lib/components/ui/`, `.agents/rules/09-frontend-design-system-invariants.md`, `docs/scratch-api-web/`, `docs/scratch-crawler-network/` | Imported 6 UI skills and 6-domain + `workbench` UI primitives (`tokens.ts`, `types.ts`, 39 `.svelte` primitives) from `avali-clock` and `culinary-tree` into `src-web/`, updated Rule 09, and distributed `WEB-INIT-01`..`05` initializer packets to Sector 3 (`api-web`) and `R47-C27-CORS` to Sector 1 (`crawler-network`). | `edit-guard` `[PERMITTED]`; `check_doc_links.ts`; `bun run --cwd src-web build` |

---

## Next Steps

1. Downstream execution by Sector 3 (`api-web`: `WEB-INIT-01`..`05`) and Sector 1 (`crawler-network`: `R47-C27-CORS`, deferred `PR-CN-CRAWL-001`) remains queued separately.
2. Promote `preview/crawler-network` changes to `main` via owner review to execute `R50-C31-RECOVERY` for `vrcp-crawler` and finalize release channels.
