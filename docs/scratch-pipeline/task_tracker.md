# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (checkpoint saved; awaiting owner action on failed tag `cloudflare-worker/v2026.11.12-pre` before live Worker preview deploy)
- **Active Task Slice**: `INT-003` (`PR-CN-WRK-001`) + `PN-007` (`RATE_LIMIT_KV` preview binding) + CalVer rollover fix (`f1d3359`)
- **Working Theories and Hypotheses**:
  - Phase 1 Sector 4 Pipeline sweep and CalVer month/year patch-reset fix (`f1d3359`) are committed locally (`scripts/versioning.mjs`, `scripts/pipeline-utils.mjs`; targeted `delivery.test.ts` and `release-provenance.test.ts` `61 pass, 0 fail`).
  - Remote preview D1 (`fbef6ce1-4145-45ae-ae91-5d617a1f2672`) had `0` rows across all `33` legacy tables and was emptied cleanly (`sqlite_master` empty).
  - Provisioned real Cloudflare preview KV namespace `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`) and bound it in `src-worker/wrangler.toml` via Sector 1 subagent (`PN-007`, removing fabricated production placeholder `722bdd0d-92ca-445b-9319-da0b27ad0001`; all 7 Sector 1 checks green).
  - Immutable tag ruleset `24553469` blocks deleting `vrcp-crawler/v2026.10.10-pre` (`HTTP 403`) and failed preview Worker tag `cloudflare-worker/v2026.11.12-pre` (`01e5ba42`, run `44762274301` failed at KV deploy); agents must never disable rulesets.
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

1. Confirm owner decision on failed remote tag `cloudflare-worker/v2026.11.12-pre` (manual owner deletion on GitHub for `v2026.11.0-pre` vs. sanctioned recovery rule under `.github/delivery-recoveries.json` for `v2026.11.13-pre`).
2. Restore consumed Worker preview changelog notes if resetting to `2026.10.11-pre`, publish Worker preview (`cloudflare-worker.yml`), and verify live Worker deployment + live VPM crawl proof + remote preview D1 population.
3. Transfer final ledger clearance across `docs/scratch-pipeline/` and `docs/scratch-crawler-network/`, verify `check_doc_links.ts` + `ste-lint.py`, and push `preview/crawler-network`.
