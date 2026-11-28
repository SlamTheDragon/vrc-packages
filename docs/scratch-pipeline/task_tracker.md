# Task Tracker: Sector 4 (Root Distribution Pipeline and Monorepo Management)

## Active Working Context

- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`, active integration on `preview/crawler-network`)
- **Current Milestone**: `DELIVERY-MAINTENANCE` (Wave 7 preview chain verified through `vrcp-api/v2026.11.5-pre`, `vrcp-network/v2026.11.7` run `#46079605465`, `cloudflare-worker/v2026.11.5-pre` run `#46079941847`, and `vrcp-crawler/v2026.11.1-pre` run `#46080442798`)
- **Active Task Slice**: None active after Wave 7 ledger clearing (`INT-006`, `INT-018`..`INT-022` cleared; `R50-C31-RECOVERY` awaits `main` promotion; Sector 2 `REORIENT-DC-01` remains open on `preview/desktop-client`).
- **Working Theories and Hypotheses**:
  - Live Worker `https://vrc-package-crawler-preview.slamthedragon.workers.dev` runs `cloudflare-worker/v2026.11.5-pre` (run `#46079941847`) with bound KV `0a8237b498334dd7b1f58fb7807a68c6` (`preview-RATE_LIMIT_KV`), remote preview `VRCP_D1` migrated from legacy to `v0-17`, CI `worker:preview:live-crawl --execute` verified, and public `/v1/app/index` and `/v1/app/index/delta` readback verified via `vrc-packages-api-preview@2026.11.5-pre` (`com.vrchat.demo-template`, `verificationStatus: "unverified"`, `0` binary URLs).
  - Wave 7 cleared the `[P19]` / `PN-010` (`REORIENT-LIVE-DEBUG`) hold after `NODE-CWD-CONTAINMENT`, `LIVE-LOCAL-ASSESS-01`, `UNTANGLE-PRE-PREVIEW-01`, preview publications (`vrcp-network/v2026.11.7` `#46079605465`, `cloudflare-worker/v2026.11.5-pre` `#46079941847`, `vrcp-crawler/v2026.11.1-pre` `#46080442798`), and `LIVE-PREVIEW-ASSESS-01` passed.
  - Any edit to `scripts/`, `.github/workflows/`, or `config*.versions.json` triggers Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31-RECOVERY | verified | `.github/delivery-recoveries.json`, `scripts/delivery-recovery.mjs`, `tests/delivery-recovery.test.ts` | Recorded `vrcp-crawler/v2026.10.10-pre` (`build-smoke`, run `38308127484`) and updated recovery validators; live main dispatch awaits owner promotion. | `bun test ./tests` (`280 pass, 0 fail`) |
| REORIENT-V0-PIPELINE | in_progress | `docs/scratch-*/`, `docs/source/CHANGELOG.md`, `docs/source/`, `docs/research/` | Completed Stages 1 to 6 and Wave 7 preview releases across Sectors 1, 3, 4, and 5 (`INT-006`, `INT-018`..`INT-022` cleared). Track remaining Sector 2 (`REORIENT-DC-01`) alignment. | `vrcp-network/v2026.11.7` (`#46079605465`), `cloudflare-worker/v2026.11.5-pre` (`#46079941847`), `vrcp-crawler/v2026.11.1-pre` (`#46080442798`), `bun test ./tests` (`295 pass`) |

---

## Next Steps

1. Keep `HO-S3B-006` (`vrcp-api/v2026.11.5-pre`, `run 45396768194`) and `vrc-packages-network@2026.11.7` (`run 46079605465`) active for remaining downstream alignment (`REORIENT-DC-01` in Sector 2 and `UNTANGLE-AW-04` in `src-web-search/`).
2. Promote `R50-C31-RECOVERY` to `main` via an owner PR when ready, and optionally run an operator-authenticated 7-lane remote backfill on `vrc-package-crawler-preview.slamthedragon.workers.dev` with `OPERATOR_TOKEN`.
3. Keep `docs/source/CHANGELOG.md` ASD-STE100 compliant (`ste-lint.py`) and validate doc changes with `bun .agents/scripts/check_doc_links.ts`.
