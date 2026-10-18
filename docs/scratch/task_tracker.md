# Active slice: STAGE-11-INITIAL-SEEDS-AND-STOREFRONT-DISCOVERY (2026-10-18, local commit, local-only session per user instructions)

- Status: verified
- Objective: Implement approved initial seed definitions and explicit source access profiles policy for open VPM community listings with robots preflight required, add Ko-fi storefront seed and classification, and support auto-queue rule matching for high-confidence storefront leads while keeping domain/custom-domain storefronts in operator review (`FLEET-S2`).
- Working theory:
  1. Candidate jobs in `DEFAULT_SEED_JOBS` include approved open VPM listings and storefronts with Ko-fi added (`https://ko-fi.com/s/sample-vrc-item`).
  2. `DEFAULT_APPROVED_SOURCE_PROFILES` defines explicit, non-synthetic source access profiles for open VPM community listings (`vrchat-community.github.io/template-package/` and `raw.githubusercontent.com/vrchat-community/template-package-listing/`).
  3. Coordinator exposes `seedInitialProfiles(actor?: string)` for explicit profile attachment without violating the candidate-only `autoSeed` invariant.
  4. `classifyOutboundLeadKind` recognizes `ko-fi.com` as a `storefront_product`.
  5. `activeAutoQueueRuleForLead` supports `storefront_product`, `github_repository`, and `publisher_site` alongside `vpm_listing`, enabling high-confidence auto-queue rules to autopass reviewed storefronts while unreviewed domain-level and custom-domain storefronts stay pending review.
- Verification status: verified. 310 worker tests passed (3611 assertions), 3 Vitest tests passed, 100% native workerd runtime smoke check passed, 182 crawler tests passed (1636 assertions), worker and crawler typechecks clean.

# Previous checkpoints

# STAGE-11-INITIAL-SEEDS-AND-STOREFRONT-DISCOVERY checkpoint (2026-10-18, local commit)
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
