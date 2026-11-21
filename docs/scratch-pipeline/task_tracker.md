# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (Option 3 pause checkpoint saved; waiting for owner cleanup of premature `2026.11.*` GitHub tags and releases before `2026.11.0(-pre)` redeploy)
- **Active Task Slice**: `INT-003` (`PR-CN-WRK-001`) + `PN-007` (`RATE_LIMIT_KV` preview binding) + CalVer index-reset and Option 3 temporary ruleset
- **Working Theories and Hypotheses**:
  - CalVer month/year index reset to `0` and SemVer minor/major lower-index reset checks are committed (`f1d3359`) and extended with `occupiedVersions` collision skipping (`scripts/versioning.mjs`, `scripts/delivery-chain.mjs`).
  - Temporary self-expiring version ruleset `calver-2026-11-preview-npm-rollback` (`.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `scripts/delivery.mjs`) permits `vrc-packages-api-preview` `latest` transitions from permanently published `2026.11.12-pre` during `2026.11.0-pre`..`2026.11.11-pre`, skips `2026.11.12-pre` when iterations meet it, and expires automatically at `2026.11.12-pre` or on calendar rollover to `2026.12.0-pre`.
  - Remote preview D1 (`fbef6ce1-4145-45ae-ae91-5d617a1f2672`) was cleared cleanly (`0` legacy tables), and real preview KV namespace `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`) is bound in `src-worker/wrangler.toml` (`9f920c5`).
  - Owner directed Option 3: temporarily relax GitHub ruleset `24553469`, delete premature November tags (`vrcp-api/v2026.11.12-pre`, `vrcp-network/v2026.11.9`, `cloudflare-worker/v2026.11.12-pre`, `cloudflare-worker/v2026.11.13-pre`) and their GitHub Releases, then restore ruleset `24553469`.
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

1. Owner temporary cleanup on GitHub: relax ruleset `24553469`, delete premature tags and Releases (`vrcp-api/v2026.11.12-pre` + Release, `vrcp-network/v2026.11.9` + Release, `cloudflare-worker/v2026.11.12-pre`, `cloudflare-worker/v2026.11.13-pre`), delete local tags if present, and re-enable ruleset `24553469`.
2. On resume (after owner confirms deletion): reset `config.preview.versions.json` to October baselines (`preview-package: "2026.10.11-pre"`, `preview-network: "2026.10.8"`, `preview-worker: "2026.10.11-pre"`), remove the obsolete `cloudflare-worker/v2026.11.12-pre` entry from `.github/delivery-recoveries.json` (`supersededPreviewTags`), restore consumed preview changelogs in `docs/source/CHANGELOG.md` from archived notes and commits, sync metadata, and commit locally.
3. Publish preview chain in strict producer-before-consumer order starting at index `0`: `vrcp-api/v2026.11.0-pre` (`package`), then `vrcp-network/v2026.11.0` (`network`), then `cloudflare-worker/v2026.11.0-pre` (`worker`).
4. Verify CI live deployment, `worker:preview:live-crawl --execute` output, live Worker HTTP endpoints (`/v1/app/index`, `/v1/app/index/delta`), and remote preview D1 state + `ci-preview-probe-*` node revocation, then transfer final ledger clearance across `docs/scratch-pipeline/` and `docs/scratch-crawler-network/` and push `preview/crawler-network`.
