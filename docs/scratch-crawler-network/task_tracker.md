# Task Tracker: Sector 1 (Crawler Network)

## Active Working Context

- **Sector Anchor**: `docs/scratch-crawler-network/` (branch `preview/crawler-network`)
- **Current Milestone**: `G12` / `G16` / `G17` (local verification complete; live preview fleet measurement and unresolved architecture/security contracts open)
- **Active Task Slice**: None actively executing (all open/unverified Sector 1 rows migrated from legacy `docs/scratch/IMPLEMENTATION_PLAN.md`)
- **Working Theories and Hypotheses**:
  - Live D1 schema DDL lives in `src-worker/src/storage/d1/utils.ts` (26 tables, 10 views, 46 indexes) and is documented 1:1 in [`docs/source/schemas/coordinator_d1.md`](../source/schemas/coordinator_d1.md).
  - Live crawler node storage (`node.db`) and daemon/outbox reliability contracts are documented in [`docs/source/schemas/crawler_node_sqlite.md`](../source/schemas/crawler_node_sqlite.md) and [`docs/source/specifications/crawler_node.md`](../source/specifications/crawler_node.md).
  - Any edit to `src-worker/packages/network/` or D1/SQLite schemas triggers the Rule 06 `edit-guard`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31 | unverified | `src-crawler/src/runner/daemon.ts`, `src-worker/src/storage/d1/coordinator.ts` | Measure live preview D1 row reads/writes and Worker CPU under 10-node fleet after preview tag recovery clears. | Local backoff/heartbeat suites pass; live preview telemetry pending |
| R13-C4 | open | `src-worker/src/storage/d1/coordinator.ts`, `src-worker/src/api/operator_handler.ts` | Audit `submitDelistRequest` and `verifyTakedown` rejection restoration and preserve `actor` audit records. | Pending |
| R54-C38 | open | `src-worker/src/api/downstream_handler.ts`, `docs/research/architecture/cryptographic_delegation.md` | Benchmark HMAC vs JWS within 10ms Worker CPU budget and settle verifier admission before implementing automated proof verification. | Pending owner protocol selection |

---

## Next Steps

1. Await owner selection of the next Sector 1 slice (`R13-C4`, `R50-C31` live measurement, `R14-C15` search/FTS5 benchmark, or `R54-C38` cryptographic verification).
2. Run domain checks at capability gate completion (`src-worker`: `bun run check`, `bun run test`, `bun run test:workers`, `bun run build:preview && bun run test:runtime`; `src-crawler`: `bun run typecheck`, `bun test`, `bun run build:dev`).
