# Active slice: STAGE-4-CRAWLER-CONCURRENCY-TIMING (2026-10-18, local commit, no push)

- Objective: Handle batched job claims and calibrate lease expiration deadlines via coordinator serverTime clock offset.
- Working theory:
  1. In `src-crawler/src/runner/daemon.ts:262`, `const { job } = claim;` ignored `claim.jobs` when multiple jobs were returned in a batched claim response, abandoning subsequent leases.
  2. Introducing `claimedJobsQueue: CrawlJob[] = []` buffers all jobs from a batch claim and processes them sequentially in subsequent daemon steps without redundant coordinator calls.
  3. Distributed nodes may suffer from clock drift against the coordinator. Calculating `clockOffset = serverTime - Date.now()` from heartbeat responses and HTTP date headers allows local lease preflight and execution deadlines to stay synchronized with the coordinator authority.
- Implementation steps:
  1. Add `getClockOffset()` and track clock offset from HTTP Date header and heartbeat responses in `src-crawler/src/client/node_client.ts`.
  2. In `src-crawler/src/runner/lease_runner.ts`, calibrate execution deadline and pre-submission lease validity using `nowServerMs() = Date.now() + clockOffsetMs`.
  3. In `src-crawler/src/runner/daemon.ts`, queue `claim.jobs` into `claimedJobsQueue` and use clock offset in preflight lease check.
  4. Add unit tests for batch queueing in `src-crawler/tests/node_daemon.test.ts` and clock offset calibration in `src-crawler/tests/node_lease_runner.test.ts`.
  5. Update `docs/source/CHANGELOG.md` under `vrcp-crawler-node-preview`.
- Verification status: Verified locally.
  - Crawler test suite: `bun test` passed 181 tests across 27 files (1529 assertions).
  - Crawler typecheck: `bunx tsc --noEmit` clean.

# Previous checkpoints

# STAGE-3-COORDINATOR-SCALING checkpoint (2026-10-18, local commit 3573ef5)
- Objective: Scale coordinator queries and protect Cloudflare Worker D1 subrequest limits with high-frequency indexes, batch statement chunking, and source-access profile lookup memoization.
- Implemented: 10 targeted D1 query indexes, 50-statement batch chunking helper, profileCache memoization, and safe upgrade test ordering.
- Verification: 299 worker tests pass, 3 Vitest tests pass, all typechecks clean, 100% native runtime smoke checks pass.

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
