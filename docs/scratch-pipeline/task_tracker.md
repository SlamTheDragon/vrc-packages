# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (`verified` locally; live CI & crawl verification active)
- **Active Task Slice**: Cross-sector sweep & preview publication orchestration (Wave 1 -> Wave 2 -> Live Worker Deploy & Crawl)
- **Working Theories and Hypotheses**:
  - Phase 1 Sector 4 Pipeline sweep is complete and verified (`bun test ./tests` 271/271 pass across 20 files; `bun .agents/scripts/check_doc_links.ts` exit 0 across 465 docs).
  - Immutable tag ruleset `24553469` blocks deleting `vrcp-crawler/v2026.10.10-pre` (`HTTP 403`); `.github/delivery-recoveries.json` + `scripts/delivery-recovery.mjs` now support `failedStage: "build-smoke"` recovery when promoted to `main`.
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| STAGE-21-PREDECESSOR-PROOF | verified | `scripts/delivery-chain.mjs`, `scripts/delivery.mjs`, `tests/delivery-chain.test.ts`, `tests/delivery.test.ts` | Added `inspectPredecessorAssets`, enforced `finalizeRelease` proof before early return, gated `trackDeliveryPipeline` completion, and removed preview test swallowing. | `bun test ./tests` (`271 pass, 0 fail`) |
| DELIVERY-CLI-CONTRACT | verified | `scripts/delivery-chain.mjs`, `docs/source/PUBLISHING.md`, `scripts/help.mjs`, `tests/delivery-chain.test.ts` | Enforced lead-branch preview ancestry when `origin/<leadBranch>` exists and stripped `--json` position-independently. | `bun test ./tests` (`271 pass, 0 fail`) |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`271 pass, 0 fail`) |
| UNTANGLE-PL-01..07 | verified | `scripts/pipeline-utils.mjs`, `scripts/*.mjs`, `.agents/scripts/check_doc_links.ts`, `.github/workflows/*.yml`, `docs/source/{PUBLISHING,README}.md`, `tests/*` | Broke circular imports, deduplicated maps/helpers/docs/fixtures, removed `node-client.yml` `continue-on-error`, and exempted `docs/changelogs/` archive links. | `bun test ./tests` (`271/271`); `check_doc_links.ts` (`0` broken / 465 docs) |
| WORKER-PREVIEW-LIVE-CRAWL | verified | `scripts/worker-preview-live-crawl.mjs`, `.github/workflows/cloudflare-worker.yml`, `package.json`, `tests/worker-preview-live-crawl.test.ts` | Added compiled Linux crawler live verification step to preview Worker deployment using `FLEET-S2` VPM sources and mandatory node revocation. | `bun test ./tests/worker-preview-live-crawl.test.ts` (`3/3 pass`) |
| WEB-ADMIN-INIT-PIPELINE | in_progress | `src-web/.agents/skills/`, `src-web/src/lib/components/ui/`, `.agents/rules/09-frontend-design-system-invariants.md`, `docs/scratch-api-web/`, `docs/scratch-crawler-network/` | Imported 6 UI skills and 6-domain + `workbench` UI primitives (`tokens.ts`, `types.ts`, 39 `.svelte` primitives) from `avali-clock` and `culinary-tree` into `src-web/`, updated Rule 09, and distributed `WEB-INIT-01`..`05` initializer packets to Sector 3 (`api-web`) and `R47-C27-CORS` to Sector 1 (`crawler-network`). | `edit-guard` `[PERMITTED]`; `check_doc_links.ts`; `bun run --cwd src-web build` |

---

## Next Steps

1. Summon Wave 1 subagents (`src-package/` and `src-worker/packages/network/`) and verify preview Publication Requests.
2. Transfer verified SDK & Network notes to `docs/source/CHANGELOG.md` and publish preview tags in producer-before-consumer order (`package` then `network`), then run `sync:deps`.
3. Summon Wave 2 subagents (`src-worker/` and `src-crawler/`), sync container workflow if needed, verify live preview D1 cleanup, and execute live Worker deployment + live crawl proof.
4. Clear transferred `verified` rows across sector ledgers once Phase 6 completes.
