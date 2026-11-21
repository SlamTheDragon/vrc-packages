# Task Tracker: Sector 1 (Crawler Network)

## Active Working Context

- **Sector Anchor**: `docs/scratch-crawler-network/` (branch `preview/crawler-network`)
- **Current Milestone**: `G6` / `G12` / `G16` (preview Worker `cloudflare-worker/v2026.11.0-pre` live deployment and live VPM crawling verified; open architecture and security contracts remain)
- **Active Task Slice**: Worker slices (`PR-CN-WRK-001`, `PN-006`, `PN-007`) cleared after `cloudflare-worker/v2026.11.0-pre` verification; `R47-C27-CORS` (`PN-005` / `HO-W5-002`) and deferred `PR-CN-CRAWL-001` remain queued
- **Working Theories and Hypotheses**:
  - Live D1 schema DDL lives in five plane modules under `src-worker/src/storage/d1/schema/` (aggregated by `src-worker/src/storage/d1/utils.ts`: 26 tables, 10 views, 46 indexes) and is documented 1:1 in [`docs/source/schemas/coordinator_d1.md`](../source/schemas/coordinator_d1.md).
  - Live crawler node storage (`node.db`) and daemon/outbox reliability contracts are documented in [`docs/source/schemas/crawler_node_sqlite.md`](../source/schemas/crawler_node_sqlite.md) and [`docs/source/specifications/crawler_node.md`](../source/specifications/crawler_node.md).
  - Any edit to `src-worker/packages/network/` or D1/SQLite schemas triggers the Rule 06 `edit-guard`.
  - `src-worker/packages/network/` retains `peerDependencies["vrc-packages-api"]` and `NodeIdSchema === IssueNodeCredentialSchema.shape.nodeId` until Sector 4 pipeline checks (`scripts/versioning.mjs`, `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, `tests/delivery.test.ts`) decouple them together.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31 | unverified | `src-crawler/src/runner/daemon.ts`, `src-worker/src/storage/d1/coordinator.ts` | Measure live preview D1 row reads/writes and Worker CPU under 10-node fleet after preview tag recovery clears. | Local backoff/heartbeat suites pass; live preview telemetry pending |
| R54-C38 | open | `src-worker/src/api/downstream_handler.ts`, `docs/research/architecture/cryptographic_delegation.md` | Benchmark HMAC vs JWS within 10ms Worker CPU budget and settle verifier admission before implementing automated proof verification. | Pending owner protocol selection |
| UNTANGLE-CN-03 | in_progress | `src-worker/src/domain/ports/stores.ts`, `src-worker/src/api/protocol/operator_protocol.ts`, `src-worker/src/domain/access/source_access_profile.ts`, `src-crawler/src/shared/identity_config.ts` | Worker parts done (moved 6 store ports and `CoordinatorConflict`, removed pass-through SDK re-exports, restored `OriginSchema` SSRF refinement); Crawler deleted dead `src-crawler/src/shared/identity_config.ts` while keeping `"vrc-packages-api"` and `"vrc-packages-network"` in both manifests until Sector 4 decouples `vrc-packages-network` peer checks. | Worker (`check`, `test` 310 pass, `test:runtime`) and Crawler (`typecheck`, `bun test` 167 pass) |
| UNTANGLE-CN-08 | verified | `src-crawler/src/client/fetch_outcome.ts`, `src-crawler/src/utils/`, `src-crawler/src/index.ts`, `src-crawler/tests/` | Deleted 7 dead pre-lease source files (`fetch_outcome.ts`, `adaptive_limiter.ts`, `circuit_breaker.ts`, `robots.ts`, `iana.ts`, `simhash.ts`, `utils/index.ts`), pruned unused exports in `sanitizer.ts`, deleted 5 orphaned test files, and moved `Retry-After` cap and HTML challenge assertions to `node_observation_adapter.test.ts`. | `src-crawler`: `typecheck` (0 errors), `bun test` (167 pass across 23 files), `build:dev`, `build:node:linux` |
| UNTANGLE-CN-09 | in_progress | `docs/source/schemas/{coordinator_d1.md,wire_and_protocol_contracts.md}`, `docs/source/specifications/coordinator_worker.md`, `docs/source/reliability/failure_and_recovery_matrix.md` | Worker and shared docs done: stripped `local_sqlite.ts` and count workaround from `coordinator_d1.md`, split tables to match 5 DDL planes, updated `wire_and_protocol_contracts.md` Tier 3A without hardcoded versions, subdivided `coordinator_worker.md` 1.3-1.6 and 3.1-3.4, moved HTTP/rate-limit rules to Sec 2, and stripped volatile slice statuses and Sec 4 delivery row from `failure_and_recovery_matrix.md`. `crawler_node_sqlite.md` and `crawler_node.md` remain. | `bun .agents/scripts/check_doc_links.ts` (486 docs, exit 0), `ste-lint.py --strict` (< 1.5/100w, 0 em-dash on all edited docs) |
| UNTANGLE-CN-10 | in_progress | `src-worker/AGENTS.md`, `src-crawler/AGENTS.md`, `src-worker/src/`, `src-crawler/src/`, `docs/source/schemas/logging_and_telemetry.md` | Worker (`src-worker/AGENTS.md`, `logging_and_telemetry.md`, `worker_logger.ts`, `taxonomy.ts`, tests) and Crawler (`src-crawler/AGENTS.md` 0.00/100w, `src/index.ts`, `phase1_sanitizer.test.ts`, `phase2_log_rotation.test.ts`) cleaned. Locked `src-crawler/README.md` untouched pending owner unlock. | `check_doc_links.ts` (exit 0), `ste-lint.py --strict` (`AGENTS.md` Worker/Crawler: 0.00, `logging_and_telemetry.md`: 1.34, 0 em-dash), `bun run test` |
| R47-C26 | unverified | `src-worker/src/storage/d1/planes/observation_plane.ts`, `src-worker/test/operator_control_api.test.ts` | Atomic D1 batching for leads/events/receipts and `promotion_failed` audit logging verified in `observation_plane.ts`; claim-time durable promotion sweep remains unimplemented. | `bun run test` (`operator_control_api.test.ts` passes); claim-time retry pending |
| R15-C18 | unverified | `src-worker/packages/network/` (Wave 1); `src-worker/` (Wave 2); `src-crawler/` (Wave 2) | Verified Wave 1 `test:distribution`, Wave 2 Worker (`check`, `test`, `test:workers`, `build:preview`, `test:runtime`), and Wave 2 Crawler (`typecheck`, `bun test`, `container_dependencies.test.ts`, `build:dev`, `build:node:linux`) with `vrc-packages-network@2026.11.0`. Clean-checkout `src-crawler/` trial and legal license review remain open. | `test:distribution`, Worker `test:runtime`, Crawler `container_dependencies.test.ts` (4 pass), `build:node:linux` |
| R47-C27-CORS | open | `src-worker/src/worker_entry.ts`, `src-worker/src/api/*_handler.ts` | Initializer packet from `PN-005` / `HO-W5-002`: implement origin-validated browser CORS and `OPTIONS` preflight headers for `/v1/operator/*`, `/v1/moderator/*`, `/v1/user/*`, and `/v1/app/*` to support `src-web/` admin dashboards. | Queued per Goal Addendum |

---

## Next Steps

1. Sector 1 implements `R47-C27-CORS` for authenticated browser CORS preflight to unblock Sector 3 `src-web/` (`WEB-INIT-01`..`05`), completes `UNTANGLE-CN-09` (`crawler_node*.md`), and completes `UNTANGLE-CN-10` once `src-crawler/README.md` is unlocked.
2. Standalone `vrcp-crawler` publication (`PR-CN-CRAWL-001`) proceeds after `R50-C31-RECOVERY` promotes to `main`.
