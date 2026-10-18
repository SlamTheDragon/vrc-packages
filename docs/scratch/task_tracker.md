# Active slice: STAGE-5-DOCS-AND-SDK-ALIGNMENT (2026-10-18, local commit, capability gate push)

- Objective: Align API route documentation with actual coordinator routes and enforce downstream application permissions.
- Working theory:
  1. `AGENTS.md` referenced `docs/source/API_ROUTES.md`, which was relocated to `docs/applications/VRCP API/API_ROUTES.md`.
  2. `POST /v1/node/jobs/results` (batch results submission) and `POST /v1/operator/apps/{appId}/delegation` (key generation for delegated apps) were implemented in the coordinator but omitted from route documentation.
  3. In `src-worker/src/api/downstream_handler.ts`, registered app permissions were checked for `catalog:read` and `sync:read`, but `catalog:search` and `demand:feedback` were unenforced despite being declared in `APP_CAPABILITIES` and capability sets.
- Implementation steps:
  1. Correct documentation reference in `AGENTS.md` to `docs/applications/VRCP API/API_ROUTES.md`.
  2. Add route documentation and payload schemas for `POST /v1/node/jobs/results` and `POST /v1/operator/apps/{appId}/delegation` in `docs/applications/VRCP API/API_ROUTES.md`.
  3. Enforce `catalog:search` on downstream search routes and `demand:feedback` on demand/issue report routes (with removal requests exempt) in `src-worker/src/api/downstream_handler.ts`.
  4. Add downstream client protocol permission test in `src-worker/test/downstream_client_protocol.test.ts`.
  5. Update `docs/source/CHANGELOG.md` under `vrcp-worker-preview`.
- Verification status: Verified locally.
  - Worker test suite: 300 tests passed (3588 assertions) in `src-worker/test/`.
  - Worker Vitest suite: 3 tests passed in `src-worker`.
  - Native runtime smoke: `coordinator_runtime_smoke.mjs` passed 100%.
  - Worker typecheck: `bun run check` clean across all 3 tsconfigs.
  - Crawler test suite: 181 tests passed (1529 assertions) in `src-crawler/tests/`.
  - Crawler typecheck: `bunx tsc --noEmit` clean.

# Previous checkpoints

# STAGE-4-CRAWLER-CONCURRENCY-TIMING checkpoint (2026-10-18, local commit 6d7ef39)
- Objective: Handle batched job claims and calibrate lease expiration deadlines via coordinator serverTime clock offset.
- Implemented: `claimedJobsQueue` buffer in `daemon.ts`, `getClockOffset()` tracking in `node_client.ts`, `nowServerMs()` calibration in `lease_runner.ts`, and unit tests in `node_daemon.test.ts` and `node_lease_runner.test.ts`.
- Verification: 181 crawler tests pass, crawler typecheck clean.

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
