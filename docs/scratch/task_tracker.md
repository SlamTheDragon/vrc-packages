# Active slice: STAGE-3-COORDINATOR-SCALING (2026-10-18, local commit, no push)

- Objective: Scale coordinator queries and protect Cloudflare Worker D1 subrequest limits with high-frequency indexes, batch statement chunking, and source-access profile lookup memoization.
- Working theory:
  1. High-frequency queries in `crawl_jobs`, `source_items`, `source_leads`, `package_fronts`, `registered_apps`, and `canonical_packages` lack composite and single-column indexes, resulting in full table scans under load.
  2. Adding 10 targeted indexes reduces query latency and row reads significantly in D1.
  3. D1 has a hard limit on batch statement sizes. Adding `executeBatchChunked<T>(statements, chunkSize = 50)` ensures batch writes never breach Cloudflare Worker limits.
  4. Repeated source profile lookups in claim loops cause redundant D1 queries for the same origin/path. Memoizing lookups in `Coordinator.claim()` eliminates repetitive D1 calls per invocation.
- Implementation steps:
  1. Add 10 high-frequency indexes to `D1_SCHEMA_SQL` in `src-worker/src/storage/d1/utils.ts`.
  2. Add indexes in `src-worker/test/support/local_sqlite.ts`, ensuring post-migration indexing for schema upgrade test safety.
  3. Add `executeBatchChunked<T>` to `Coordinator` in `src-worker/src/storage/d1/coordinator.ts`.
  4. Wire `profileCache` memoization in `Coordinator.claim()` and `activeSourceAccessProfileForTarget()`.
  5. Update `docs/source/CHANGELOG.md` under `vrcp-worker-preview`.
- Verification status: Verified locally.
  - Worker domain suite: `bun test` passed 299 tests across 23 files (3514 assertions).
  - Worker typechecks: `bun run check` clean across all 3 tsconfigs.
  - Worker Vitest: `bun run test:workers` passed 3 tests.
  - Native runtime smoke: `node src-worker/test/coordinator_runtime_smoke.mjs` passed 100% of checks.

# Previous checkpoints

# STAGE-2-SECURITY-POLICY checkpoint (2026-10-18, local commit 2d26f30)
- Objective: Enforce strict capability token format in Coordinator.authenticate() and block binary URLs/content types in crawler fetchPublicMetadata().
- Implemented: Fail-closed capability authentication in Worker/SQLite, pre-fetch extension blocking and post-header content-type streaming abort in crawler.
- Verification: 179 crawler tests pass, 299 worker tests pass, all typechecks clean.

# STAGE-1-OPERATIONAL-SYNC checkpoint (2026-10-18, local commit 7fbfb6e, pushed to origin)
- Objective: Reconcile double-entry scratch ledgers and synchronize branch `preview/crawler-network` with origin.
- Implemented:
  1. Pruned duplicated rows from `docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md`.
  2. Committed scratch ledger reconciliation and status audit doc `2026-10-18_STATUS.md`.
  3. Pushed 16 commits on `preview/crawler-network` to `origin/preview/crawler-network`.
- Verification: Clean origin tracking, zero duplicate tracking rows, scratch footprint invariant preserved.

# R14-C14 checkpoint (2026-10-16, local commit 21a53d5)
- Objective: Bound coordinator claim scans with explicit invocation budgets and measure D1 execution in runtime harness.
- Verified: Native runtime smoke verified claim budgets (empty: 21ms, leased: 34ms, 3 scan pages enforced); 299 worker tests pass; 177 crawler tests pass; typechecks clean.
