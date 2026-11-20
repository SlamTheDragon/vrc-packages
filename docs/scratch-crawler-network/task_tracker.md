# Task Tracker: Sector 1 (Crawler Network)

## Active Working Context

- **Sector Anchor**: `docs/scratch-crawler-network/` (branch `preview/crawler-network`)
- **Current Milestone**: `G12` / `G16` / `G17` (local verification complete; live preview fleet measurement and unresolved architecture/security contracts open)
- **Active Task Slice**: Wave 1 (`src-worker/packages/network/`): `UNTANGLE-CN-01` (network IP helper), `UNTANGLE-CN-04` (network robots + source-targets), `UNTANGLE-CN-10` (network `README.md`), `R15-C18` (network package verification). `src-worker/` and `src-crawler/` remain open for Wave 2.
- **Working Theories and Hypotheses**:
  - Live D1 schema DDL lives in `src-worker/src/storage/d1/utils.ts` (26 tables, 10 views, 46 indexes) and is documented 1:1 in [`docs/source/schemas/coordinator_d1.md`](../source/schemas/coordinator_d1.md).
  - Live crawler node storage (`node.db`) and daemon/outbox reliability contracts are documented in [`docs/source/schemas/crawler_node_sqlite.md`](../source/schemas/crawler_node_sqlite.md) and [`docs/source/specifications/crawler_node.md`](../source/specifications/crawler_node.md).
  - Any edit to `src-worker/packages/network/` or D1/SQLite schemas triggers the Rule 06 `edit-guard`.
  - `src-worker/packages/network/` retains `peerDependencies["vrc-packages-api"]` and `NodeIdSchema === IssueNodeCredentialSchema.shape.nodeId` until Sector 4 pipeline checks (`scripts/versioning.mjs`, `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, `tests/delivery.test.ts`) decouple them together.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R50-C31 | unverified | `src-crawler/src/runner/daemon.ts`, `src-worker/src/storage/d1/coordinator.ts` | Measure live preview D1 row reads/writes and Worker CPU under 10-node fleet after preview tag recovery clears. | Local backoff/heartbeat suites pass; live preview telemetry pending |
| R13-C4 | open | `src-worker/src/storage/d1/coordinator.ts`, `src-worker/src/api/operator_handler.ts` | Audit `submitDelistRequest` and `verifyTakedown` rejection restoration and preserve `actor` audit records. | Pending |
| R54-C38 | open | `src-worker/src/api/downstream_handler.ts`, `docs/research/architecture/cryptographic_delegation.md` | Benchmark HMAC vs JWS within 10ms Worker CPU budget and settle verifier admission before implementing automated proof verification. | Pending owner protocol selection |
| UNTANGLE-CN-01 | open | `src-worker/packages/network/src/policy/ip_policy.ts` (Wave 1); `src-worker/` (Wave 2) | Wave 1 exported unified `isIp` alongside `isPrivateOrReservedIp` in `vrc-packages-network/ip-policy`; Wave 2 `src-worker/` split and `utils.ts` `isIp` removal remain open. | `src-worker/packages/network`: `typecheck`, `build`, `bun test` (6 pass, 134 expects), `test:distribution` pass (`0.0.8` + `2026.10.11-pre`) |
| UNTANGLE-CN-03 | open | `src-worker/packages/network/package.json`, `node_protocol.ts`, `src-worker/`, `src-crawler/` | Network peer decoupling from `vrc-packages-api` explicitly deferred for pipeline compatibility (`scripts/versioning.mjs`, `scripts/delivery.mjs`, `test/fixtures/check.mjs`). | `NodeIdSchema === IssueNodeCredentialSchema.shape.nodeId` verified in `network_unit.test.ts` and `test:distribution` |
| UNTANGLE-CN-04 | open | `src-worker/packages/network/src/robots/robots_snapshot.ts`, `src-worker/packages/network/src/protocol/node_protocol.ts`, `src-worker/packages/network/src/policy/source_targets.ts` (Wave 1); `src-worker/` + `src-crawler/` (Wave 2) | Wave 1 aligned `/v1/node/robots/*` schemas with `OriginRobotsSnapshotSchema` and consolidated `ARCHIVE_BINARY_EXTENSIONS`, GitHub normalization, storefront predicates, `classifyOutboundLeadKind`, and `resolveDiscoveryLeadTarget` in `source-targets`; Wave 2 consumer adoption remains open. | `src-worker/packages/network`: `typecheck`, `build`, `bun test` (6 pass, 134 expects), `test:distribution` pass (`0.0.8` + `2026.10.11-pre`) |
| UNTANGLE-CN-10 | open | `src-worker/packages/network/README.md` (Wave 1); `src-worker/AGENTS.md` + `src-crawler/` + `logging_and_telemetry.md` (Wave 2) | Wave 1 updated `src-worker/packages/network/README.md` to Bun commands and ASD-STE100 prose; Wave 2 `src-worker/` and `src-crawler/` prose cleanup remains open. | `ste-lint.py --strict src-worker/packages/network/README.md` (`0.53` per 100w, `0` em-dash); `check_doc_links.ts` (`465` docs OK) |
| R15-C18 | unverified | `src-worker/packages/network/` (Wave 1); `src-worker/` + `src-crawler/` (Wave 2) | Verified `package.json` `exports`, `files`, `AGPL-3.0-or-later`, clean `dist/`, and packed `test:distribution` across `0.0.8` and `2026.10.11-pre`; consumer clean-install proof awaits preview tarball release and Wave 2. | `test:distribution` pass (`files: 23`, `node: true`, `bun: true`, `types: true`, `workerBuild: true`, `nativeWorker: true`) |

---

## Next Steps

1. Sector 4 Pipeline processes Preview Publication Request `PR-CN-NET-001` in [`handoff.md`](handoff.md) (`product: network`, `channel: preview`) so Wave 2 can adopt the published `vrc-packages-network` tarball.
2. Wave 2 `Worker Engineer` (`src-worker/`) and `Crawler Node Engineer` (`src-crawler/`) integrate `HO-N3A-002` exports and complete remaining open slices (`UNTANGLE-CN-01`..`UNTANGLE-CN-10`).
3. Run domain checks at capability gate completion (`src-worker`: `bun run check`, `bun run test`, `bun run test:workers`, `bun run build:preview && bun run test:runtime`; `src-crawler`: `bun run typecheck`, `bun test`, `bun run build:dev`).
