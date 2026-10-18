# Active slice: STAGE-2-SECURITY-POLICY (2026-10-18, local commit, no push)

- Objective: Enforce strict capability token format in Coordinator.authenticate() and block binary URLs/content types in crawler fetchPublicMetadata().
- Working theory:
  1. In `src-worker/src/storage/d1/coordinator.ts`, `authenticate()` previously wrapped capability decoding in `if (isCapabilityToken(bearer))`, allowing raw non-capability bearer tokens to bypass capability checks.
  2. Changing the check to `if (!isCapabilityToken(bearer)) return null;` enforces strict fail-closed security for all node credentials.
  3. In `src-crawler/src/client/public_metadata_fetch.ts`, the zero-binary covenant was incomplete: payloads under 2 MB were fetched without inspecting URL extensions or response Content-Type.
  4. Adding `PROHIBITED_BINARY_EXTENSIONS` (`.zip`, `.unitypackage`, `.exe`, `.tar`, `.gz`, `.tgz`, `.7z`, etc.) rejects binary targets before socket/DNS creation.
  5. Adding `PROHIBITED_BINARY_CONTENT_TYPES` (`application/zip`, `application/octet-stream`, etc.) aborts response streams immediately upon header receipt.
- Implementation steps:
  1. Update `Coordinator.authenticate()` in `src-worker/src/storage/d1/coordinator.ts` to fail closed if `!isCapabilityToken(bearer)`.
  2. Align `authenticate()` in `src-worker/test/support/local_sqlite.ts`.
  3. Add non-capability bearer token test assertion in `src-worker/test/d1_coordinator_store.test.ts`.
  4. Define `PROHIBITED_BINARY_EXTENSIONS` and `PROHIBITED_BINARY_CONTENT_TYPES` in `src-crawler/src/client/public_metadata_fetch.ts`.
  5. Add unit tests in `src-crawler/tests/node_public_metadata_fetch.test.ts` for binary URL and content-type rejection.
  6. Update `docs/source/CHANGELOG.md` under `vrcp-crawler-node-preview` and `vrcp-worker-preview`.
- Verification status: Verified locally.
  - Crawler test suite: `bun test` passed 179 tests across 27 files (1490 assertions).
  - Crawler typecheck: `bunx tsc --noEmit` clean.
  - Worker domain suite: `bun test` passed 299 tests across 23 files (3514 assertions).
  - Worker typechecks: `bun run check` clean across all 3 tsconfigs.
  - Worker Vitest: `bun run test:workers` passed 3 tests.
  - Native runtime smoke: `node src-worker/test/coordinator_runtime_smoke.mjs` passed 100% of checks.

# Previous checkpoints

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
