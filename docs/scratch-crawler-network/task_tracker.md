# Task Tracker: Sector 1 (Crawler Network)

## Active Working Context

- **Sector Anchor**: `docs/scratch-crawler-network/` (branch `preview/crawler-network`)
- **Current Milestone**: `G6` / `G12` / `G13` / `G16` (Wave 7 preview chain verified: `vrcp-network/v2026.11.7` run `#46079605465`, `cloudflare-worker/v2026.11.5-pre` run `#46079941847`, and `vrcp-crawler/v2026.11.1-pre` run `#46080442798`. Verified Sector 1 rows cleared by Sector 4 Pipeline `INT-006`, `INT-018`..`INT-020`.)
- **Active Task Slice**: None active after Wave 7 clearance (`R50-C31`, `R54-C38`, `R15-C18`, `UNTANGLE-CN-03`, and `UNTANGLE-CN-10` remain open/in_progress; optional remote 7-lane authenticated backfill awaits owner `OPERATOR_TOKEN` if needed).
- **Working Theories and Hypotheses**:
  - Wave 3A consolidated Coordinator D1 (`src-worker/`) from 26 tables and 10 views to 17 tables, 0 views, and 39 indexes (`v0-17` matching [`docs/source/schemas/coordinator_d1.md`](../source/schemas/coordinator_d1.md)) within local SQLite and `workerd` tests.
  - Live crawler node storage (`node.db`) retains 4 tables (`docs/source/schemas/crawler_node_sqlite.md`), while `[P19]` / `PN-010` mandates strict per-node `process.cwd()` containment (`NODE-CWD-CONTAINMENT`) for `node.db`, `-wal`/`-shm`, `logs/latest.log`, `logs/archive/`, `node.stop`, `node.config.json`, and `.env` (`docs/source/schemas/logging_and_telemetry.md`).
  - Any edit to `src-worker/packages/network/` or D1/SQLite schemas triggers the Rule 06 `edit-guard`.
  - `src-worker/packages/network/` retains `peerDependencies["vrc-packages-api"]` and `NodeIdSchema === IssueNodeCredentialSchema.shape.nodeId` until Sector 4 pipeline checks (`scripts/versioning.mjs`, `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, `tests/delivery.test.ts`) decouple them together.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31 | unverified | `src-crawler/src/runner/daemon.ts`, `src-worker/src/storage/d1/coordinator.ts` | Measure live preview D1 row reads/writes and Worker CPU under 10-node fleet after preview tag recovery clears. | Local backoff/heartbeat suites pass; live preview telemetry pending |
| R54-C38 | open | `src-worker/src/api/downstream_handler.ts`, `docs/research/architecture/cryptographic_delegation.md` | Benchmark HMAC vs JWS within 10ms Worker CPU budget and settle verifier admission before implementing automated proof verification. | Pending owner protocol selection |
| UNTANGLE-CN-03 | in_progress | `src-worker/src/domain/ports/stores.ts`, `src-worker/src/api/protocol/operator_protocol.ts`, `src-worker/src/domain/access/steering_profile.ts`, `src-crawler/src/shared/identity_config.ts` | Worker parts done (moved 6 store ports and `CoordinatorConflict`, removed pass-through SDK re-exports, replaced `source_access_profile.ts` with `steering_profile.ts`); Crawler deleted dead `src-crawler/src/shared/identity_config.ts` while keeping `"vrc-packages-api"` and `"vrc-packages-network"` in both manifests until Sector 4 decouples `vrc-packages-network` peer checks. | Wave 3A Worker (`check`, `test`, `test:workers`, `test:runtime`) and Crawler (`typecheck`, `bun test` 167 pass) |
| UNTANGLE-CN-10 | in_progress | `src-worker/AGENTS.md`, `src-crawler/AGENTS.md`, `src-worker/src/`, `src-crawler/src/`, `docs/source/schemas/logging_and_telemetry.md` | Worker (`src-worker/AGENTS.md`, `logging_and_telemetry.md`, `worker_logger.ts`, `taxonomy.ts`, tests) and Crawler (`src-crawler/AGENTS.md` 0.00/100w, `src/index.ts`, `phase1_sanitizer.test.ts`, `phase2_log_rotation.test.ts`) cleaned. Locked `src-crawler/README.md` untouched pending owner unlock. | `check_doc_links.ts` (exit 0), `ste-lint.py --strict` (`AGENTS.md` Worker/Crawler: 0.00, `logging_and_telemetry.md`: 1.28, 0 em-dash), `bun run test` |
| R15-C18 | unverified | `src-worker/packages/network/`, `src-worker/`, `src-crawler/` | Verified `vrc-packages-network@2026.11.7` (`#46079605465`), `cloudflare-worker/v2026.11.5-pre` (`#46079941847`), and `vrcp-crawler/v2026.11.1-pre` (`#46080442798`) with zero sibling imports. Clean-checkout `src-crawler/` trial and formal license review remain open. | `test:runtime`, `container_dependencies.test.ts`, `publish:check` `#46079605465` / `#46080442798` |

---

## Next Steps

1. Measure live preview Worker and D1 telemetry (`R50-C31`) and optionally execute an operator-authenticated 7-lane remote backfill on `vrc-package-crawler-preview.slamthedragon.workers.dev` with `OPERATOR_TOKEN`.
2. Complete `UNTANGLE-CN-03` once Sector 4 decouples `vrc-packages-network` peer checks, and finish `UNTANGLE-CN-10` once `src-crawler/README.md` is unlocked.
3. Resolve `R15-C18` (clean-checkout trial + license review) and `R54-C38` (cryptographic delegated removal proof) prior to production release.
