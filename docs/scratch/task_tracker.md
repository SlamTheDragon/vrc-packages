# STAGE-21-PREDECESSOR-PROOF-AND-ASSETS checkpoint (2026-10-18, local commit)
- Status: in_progress
- Objective: Enforce remote GitHub assets verification in all environments including local development (R58-CONFIG-TAMPER), and implement predecessor artifact existence and publication path verification without full binary streaming (DELIVERY-PROOF-SEMANTICS).
- Scope: In `scripts/delivery-chain.mjs`, check predecessor publication and remote asset presence during `planDelivery` (blockers) and `finalizeRelease` (even when `execute: false`); implement predecessor asset existence and publication path checking (`requirePublicationProof` / `inspectPredecessorAssets`); ensure `trackDeliveryPipeline` notifies completion only on `artifactsVerified === true`; in `scripts/delivery.mjs` `verify`, ensure test failures are not swallowed in preview.
- Verification: Scoped delivery and delivery-chain tests in `tests/delivery-chain.test.ts` and `tests/delivery.test.ts`.

# STAGE-20-DELIVERY-SCRIPT-HARDENING checkpoint (2026-10-18, local commit 6f531a8)
- Status: verified
- Objective: Implement targeted delivery script hardening: add atomic rollback on delivery preparation crash (R60-C60C) and read-only failure diagnosis with publication preconditions on tag deletion (DELIVERY-RECOVERY-GUARDS).
- Implemented: Added `rollbackPreparation` in `scripts/delivery-chain.mjs` resetting staged files, restoring tracked files, cleaning untracked artifacts (`git clean -fd`), and cleaning temporary release branches upon crash before git commit; guarded `deliveryTroubleshooting` and CLI `diagnose` output against suggesting tag reversion after publication; added partial publication detection in `scripts/delivery-recovery.mjs` `diagnoseFailure` returning strictly read-only reconciliation actions; enforced verified absence of published release assets in `revertDeliveryTag` before tag deletion and blocked local deletion when remote tag exists without explicit `deleteRemote: true`.
- Verification: 27/27 tests pass in `tests/delivery-recovery.test.ts` (212 assertions); 56/56 tests pass in `tests/delivery-chain.test.ts` (491 assertions); 50/50 delivery workflow tests pass in `tests/delivery.test.ts` (1081 assertions).

# STAGE-19-PREVIEW-D1-INIT-AUTOMATION checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Implement automated preview D1 schema verification and non-production seed population script (`R58-PREVIEW-INIT` / `Q-WORKER-PREVIEW`).
- Implemented: Added `isAutomatedPreviewDelivery` in `scripts/worker-preview-init.mjs` authorizing `cloudflare-worker.yml` on preview tags; added `--seed` / `--auto-seed` supporting `autoSeed: true` with 64 KiB limits and operator token validation; added steps in `.github/workflows/cloudflare-worker.yml` to prepare dependencies and initialize preview D1 schema with seeds; verified R13-C2 invariant that `autoSeed` creates candidate jobs only with 0 profiles.
- Verification: 9/9 unit tests pass in `tests/worker-preview-init.test.ts` (58 assertions); 50/50 workflow delivery tests pass in `tests/delivery.test.ts` (1081 assertions); 321/321 worker tests pass (3675 assertions); 100% native workerd runtime smoke check passes (24/24 steps); 189/189 crawler tests pass (1700 assertions); all typechecks clean.

# STAGE-18-TRUSTED-APP-TAKEDOWN-INTAKE checkpoint (2026-10-18, local commit 5c97ad2)
- Status: verified
- Objective: Route trusted application creator takedown submissions directly into `catalog_tickets` as `'removal_report'` tickets with `'app'` requester type, gated by trusted registered app status (`R54-C38A / R54-C38R / R54-C38B` / `G15`). Reject untrusted applications with 403 Forbidden.
- Implemented: `DownstreamAppPrincipal` with `candidateStatus` and `isTrusted` in `downstream_handler.ts`; gated `removal_request` on trusted app status; populated `catalog_tickets` with `requester_type = 'app'` and `reason` in `coordinator.ts` and `local_sqlite.ts`; added `"takedowns:submit"` in `reviewAppCandidate`; verified in `downstream_client_protocol.test.ts`.
- Verification: 321/321 worker tests pass, 100% native workerd runtime smoke passes, 189/189 crawler tests pass, clean typechecks.

# STAGE-17-DYNAMIC-HEARTBEAT-AND-LEASE-CALIBRATION checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Standardize coordinator crawl lease durations to fixed 120s and implement dynamic crawler heartbeat scaling (5s to 30s) based on origin fetch duration, adhering to Cloudflare free subrequest quotas (`R54-C39A / R54-C39B`).
- Implemented: `CRAWL_JOB_LEASE_MS = 120 * 1000` in `coordinator.ts` and `local_sqlite.ts`; `originDurations` tracking map and `computeDynamicHeartbeatInterval` (5s-30s) in `daemon.ts`; dynamic pulse timer rescheduling in `lease_runner.ts`; verified in `node_daemon.test.ts`, `node_lease_runner.test.ts`, and `d1_coordinator_store.test.ts`.
- Verification: 189/189 crawler tests pass, 320/320 worker tests pass, 100% native workerd runtime smoke passes, clean typechecks.

# STAGE-16-DISTRIBUTED-KV-RATE-LIMITING checkpoint (2026-10-18, local commit 393571b)
- Status: verified
- Objective: Implement distributed Cloudflare KV and native Rate Limiting bindings for coordinator rate limiting per author requirement (`R54-C39C-RATE-LIMIT`: "Require distributed Cloudflare KV or Rate Limiting bindings before considering rate limiting verified").
- Implemented: Expanded `IRateLimiter` to support async checks; implemented `KvRateLimiter` with bucket keying (`rl:${key}:${bucket}`) and expirationTtl; implemented `CloudflareBindingRateLimiter`; implemented `createRateLimiter(env)` factory; wired KV binding into `wrangler.toml` and awaited checks in all route handlers.
- Verification: 320/320 worker unit tests passed across 23 files; 3/3 Cloudflare Vitest tests passed; 100% native workerd runtime smoke check passed; clean typechecks.


# STAGE-15-AUTHOR-ROULETTE-AND-LEDGER-COMPACTION checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Reconcile unmerged implementation plan rows by conducting question roulette to gather author comments for pending unmerged rows (`R50-C31-RECOVERY`, `R60-C60C`, `R54-C39C-RATE-LIMIT`, `R58-CONFIG-TAMPER`), and compact scratch ledgers.
- Implemented: Question roulette collected 4 author decisions. Recorded author comment cells in `UNMERGED_IMPLEMENTATION_PLAN.md` and appended author comment dispositions to `IMPLEMENTATION_PLAN.md`.
- Verification: Clean double-entry ledgers aligned with author instructions.


# STAGE-14-HIGH-CONFIDENCE-STOREFRONT-AUTO-LINK checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Revise `R13-C9-IDENTITY` per author direction to allow high-confidence storefront leads to auto-link with accepted review state without operator review, while keeping unverified heuristic outbound links as provisional.
- Implemented: Updated `Coordinator.submit` and `LocalCoordinatorStore` to track `highConfidenceCanonicalIds` from approved leads (`sl.status === 'approved'`), inserting `identity_links` with `review_state = 'accepted'`, `confidence = 0.95`, and `reviewed_at = now`. Added unit tests in `src-worker/test/identity_links.test.ts` verifying approved storefront leads auto-link and project package fronts while heuristic links remain provisional. Updated `docs/source/CHANGELOG.md`.
- Verification: 312 worker tests pass (3626 assertions) across 23 files; 3 Vitest tests pass; 100% native workerd runtime smoke passes; 187 crawler tests pass (1686 assertions) across 28 files; clean typechecks across worker and crawler.


# STAGE-13-AUTHOR-LEDGER-RECONCILIATION checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Reconcile unmerged implementation plan rows by conducting question roulette to gather author comments for verified R13-C9 slices (`R13-C9-LEASE-DEADLINE`, `R13-C9-IDENTITY`, `R13-C9-TEST-TYPES`, `R13-C9-DELTA`), and prepare ledger compaction.
- Implemented: Question roulette collected author decisions. Pruned accepted rows `R13-C9-LEASE-DEADLINE`, `R13-C9-TEST-TYPES`, and `R13-C9-DELTA` from `UNMERGED_IMPLEMENTATION_PLAN.md` and merged into `IMPLEMENTATION_PLAN.md`. Recorded author revision disposition for `R13-C9-IDENTITY` (`Revise: Allow high-confidence storefront leads to auto-link without operator review`). Added 2026-10-18 dispositions section.
- Verification: 310 worker tests pass (3611 assertions); 3 Vitest tests pass; 100% native runtime smoke passes; 187 crawler tests pass (1686 assertions); clean typechecks across worker and crawler.

# STAGE-12-MULTI-PLATFORM-FLEET-INGESTION checkpoint (2026-10-18, local commit)
- Status: verified
- Objective: Implement multi-platform end-to-end fleet crawl simulation (`FLEET-S4`) in `src-crawler/tests/fleet_crawl_simulation.test.ts`, exercising concurrent coordinator leases, multi-driver fetching (VPM community listing, GitHub release, Booth/Ko-fi storefront product leads), schema-valid receipt ingestion, outbox replay, and backoff handling without cross-project imports.
- Implemented: `src-crawler/tests/fleet_crawl_simulation.test.ts` with 5 operational tests covering multi-node lease isolation, multi-driver ingestion (VPM, GitHub, Booth, Ko-fi), outbox edge retry under 522 Origin Timeout, crash-restart recovery with SQLite outbox draining, and delegated robots preflight ingestion.
- Verification: 5/5 fleet simulation tests pass (50 assertions); 187/187 crawler tests pass (1686 assertions); 310/310 worker tests pass (3611 assertions); 3 Vitest tests pass; 100% native workerd runtime smoke passes; clean typechecks across crawler and worker.

# STAGE-11-INITIAL-SEEDS-AND-STOREFRONT-DISCOVERY checkpoint (2026-10-18, local commit 818744e)
- Status: verified
- Objective: Implement approved initial seed definitions and explicit source access profiles policy for open VPM community listings with robots preflight required, add Ko-fi storefront seed and classification, and partition storefront leads into pending operator review (`FLEET-S2`).
- Implemented: `DEFAULT_SEED_JOBS` contains Ko-fi sample seed; `DEFAULT_APPROVED_SOURCE_PROFILES` provides pre-configured approved VPM community listings; coordinator `seedInitialProfiles` seeds profiles idempotently; `classifyOutboundLeadKind` recognizes `ko-fi.com` as `storefront_product`; storefront leads stay partitioned in `source_leads` with `pending_review` status.
- Verification: 310 worker tests passed, 3 Vitest tests passed, 100% native runtime smoke passed, 182 crawler tests passed, clean typechecks across worker and crawler.

# STAGE-10-REPORT-INTAKE-PARTITIONING checkpoint (2026-10-18, local commit 84cb2b3)
- Status: verified
- Objective: Partition application report intake between rating calibration disputes and safety quarantine tickets (`R56-C56C`).
- Implemented: `catalog_tickets` CHECK constraint includes `'rating_dispute'`, `'safety_quarantine'`, and `'metadata_issue'`; `recordIssueReport` partitions incoming safety vs calibration challenges; `listModeratorRatingsPage` counts `rating_dispute` and `removal_report` while excluding `safety_quarantine`.
- Verification: 307 worker tests passed, 3 vitest tests passed, 100% native runtime smoke passed, 182 crawler tests passed, clean typechecks.

# STAGE-9-DELEGATED-ROBOTS-PREFLIGHT checkpoint (2026-10-18, local commit 7e69552)
- Status: verified
- Objective: Delegate robots.txt preflight fetching to crawler nodes via coordinator leases (`R24-C21`).
- Implemented: Coordinator exposes `/v1/node/robots/claim` and `/v1/node/robots/result`; crawler daemon executes robots preflight checks on empty job claim using SSRF-safe pinned metadata transport; D1 stores origin snapshots.
- Verification: 305 worker tests passed, 3 vitest tests passed, 100% native runtime smoke passed, 182 crawler tests passed, clean typechecks.

# STAGE-8-PUBLICATION-CLASSES-ENFORCEMENT checkpoint (2026-10-18, local commit 9e27525)
- Status: verified
- Objective: Enforce source access profile publication rights (`publishClasses`) in public catalog projection and delta streaming (`R13-C3` / `Q-PUBLICATION`).
- Implemented: `buildCatalogPackagesBatch` filters packages originating wholly from `publishClasses: []` and filters restricted fronts/links; `listCatalogDeltasPage` emits delist tombstones.
- Verification: 303 worker tests passed, 3 vitest tests passed, 100% native runtime smoke passed, 181 crawler tests passed, clean typechecks.

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
