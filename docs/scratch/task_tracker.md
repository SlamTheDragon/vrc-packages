# Active slice: STAGE-8-PUBLICATION-CLASSES-ENFORCEMENT (2026-10-18, local commit, local-only session per user instructions)

- Status: verified
- Objective: Enforce source access profile publication rights (`publishClasses`) in public catalog projection and delta streaming (`R13-C3` / `Q-PUBLICATION`).
- Working theory:
  1. Under `R13-C3` and author decision for `Q-PUBLICATION`, a source access profile's `publishClasses` determines publication authority. If a profile sets `publishClasses: []`, it permits retention of facts/evidence but withholds them from public catalog projection.
  2. In `buildCatalogPackagesBatch` (in `coordinator.ts` and `local_sqlite.ts`), query `publish_classes_json` from `source_access_profiles` via `source_versions`. Withhold packages from public projection if all accepted links originate from restricted profiles (`publishClasses: []`).
  3. For packages with mixed authority, filter restricted identity links and package fronts while retaining authorized normalized facts.
  4. In `listCatalogDeltasPage`, emit an automatic `{ action: "delist", canonicalId, updatedAt }` tombstone when a non-delisted package is withheld from projection.
  5. In `test/helpers/source_access_fixture.ts`, ensure `approveFixtureSource` grants `publishClasses: ["normalized_facts"]` so offline fixture targets can be verified.
- Verification status: verified.
  - Worker test suite: 303 tests passed (3545 assertions) in `src-worker/test/`.
  - Public catalog protocol tests: 17 tests passed (170 assertions) in `src-worker/test/public_catalog_protocol.test.ts`.
  - Worker vitest suite: 3 tests passed in `src-worker/test/worker_runtime.vitest.ts`.
  - Coordinator runtime smoke: 100% passed in `src-worker/test/coordinator_runtime_smoke.mjs`.
  - Crawler test suite: 181 tests passed (1529 assertions) in `src-crawler/tests/`.
  - Worker typecheck: `bun run check` clean across 3 tsconfigs.
  - Crawler typecheck: `bunx tsc --noEmit` clean.

# Previous checkpoints

# STAGE-7-RATE-LIMIT-VERIFICATION-AND-LEDGER-AUDIT checkpoint (2026-10-18, local commit 525f659)
- Status: verified
- Objective: Audit inbound rate limiting implementation across coordinator routes, verify test suite baselines, and audit unmerged ledger saturation for author review.
- Implemented: Reconciled `UNMERGED_IMPLEMENTATION_PLAN.md` advancing `R54-C39C-RATE-LIMIT` to `verified`, updated `docs/source/CHANGELOG.md` under `vrcp-worker-preview`.
- Verification: 300 worker tests pass, 181 crawler tests pass, 74 package tests pass, all typechecks clean.

# STAGE-6-RULES-ADAPTATION-AND-SCHEMA-RECONCILIATION checkpoint (2026-10-18, local commit f66ccb9)
- Status: verified
- Objective: Adapt Rule 06 into repository rules and reconcile database schema documentation with executable D1 and SQLite implementations.
- Implemented: Adapted `.agents/rules/06-self-management-and-guard-edits.md`, updated `AGENTS.md` range to `00-06`, reconciled `DATABASE_SCHEMAS.md` (tables, views, indexes, outbox), updated `docs/source/CHANGELOG.md`.
- Verification: Clean doc link checks, 300 worker tests pass, 181 crawler tests pass, all typechecks clean.

# STAGE-5-DOCS-AND-SDK-ALIGNMENT checkpoint (2026-10-18, local commit fe5f25b, pushed to origin)
- Status: verified
- Objective: Align API route documentation with actual coordinator routes and enforce downstream application permissions.
- Implemented: Corrected route path in `AGENTS.md`; documented missing routes `POST /v1/node/jobs/results` and `POST /v1/operator/apps/{appId}/delegation` in `API_ROUTES.md`; enforced `catalog:search` and `demand:feedback` in `downstream_handler.ts`.
- Verification: 300 worker tests pass, 100% native workerd runtime smoke pass, all typechecks clean.

# STAGE-4-CRAWLER-CONCURRENCY-TIMING checkpoint (2026-10-18, local commit 6d7ef39)
- Status: verified
- Objective: Handle batched job claims and calibrate lease expiration deadlines via coordinator serverTime clock offset.
- Implemented: `claimedJobsQueue` buffer in `daemon.ts`, `getClockOffset()` tracking in `node_client.ts`, `nowServerMs()` calibration in `lease_runner.ts`, and unit tests in `node_daemon.test.ts` and `node_lease_runner.test.ts`.
- Verification: 181 crawler tests pass, crawler typecheck clean.

# STAGE-3-COORDINATOR-SCALING checkpoint (2026-10-18, local commit 3573ef5)
- Status: verified
- Objective: Scale coordinator queries and protect Cloudflare Worker D1 subrequest limits with high-frequency indexes, batch statement chunking, and source-access profile lookup memoization.
- Implemented: 10 targeted D1 query indexes, 50-statement batch chunking helper, profileCache memoization, and safe upgrade test ordering.
- Verification: 299 worker tests pass, 3 Vitest tests pass, all typechecks clean, 100% native runtime smoke checks pass.

# STAGE-2-SECURITY-POLICY checkpoint (2026-10-18, local commit 2d26f30)
- Status: verified
- Objective: Enforce strict capability token format in Coordinator.authenticate() and block binary URLs/content types in crawler fetchPublicMetadata().
- Implemented: Fail-closed capability authentication in Worker/SQLite, pre-fetch extension blocking and post-header content-type streaming abort in crawler.
- Verification: 179 crawler tests pass, 299 worker tests pass, all typechecks clean.

# STAGE-1-OPERATIONAL-SYNC checkpoint (2026-10-18, local commit 7fbfb6e, pushed to origin)
- Status: verified
- Objective: Reconcile double-entry scratch ledgers and synchronize branch `preview/crawler-network` with origin.
- Implemented: Pruned duplicated rows from `docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md`; committed status audit doc `2026-10-18_STATUS.md`; pushed 16 commits to `origin/preview/crawler-network`.
- Verification: Clean origin tracking, zero duplicate tracking rows, scratch footprint invariant preserved.
