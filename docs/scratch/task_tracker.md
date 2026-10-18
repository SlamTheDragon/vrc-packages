# Active slice: STAGE-6-RULES-ADAPTATION-AND-SCHEMA-RECONCILIATION (2026-10-18, local commit, capability gate push)

- Status: verified
- Objective: Adapt Rule 06 (self-management, resilience, operational evidence) into repository rules and reconcile database schema documentation with executable D1 and SQLite implementations.
- Working theory:
  1. `f:/.repo/.main/avali-clock/.agents/rules/06-self-management-and-guard-edits.md` establishes core operational discipline: task resilience, zero data invention, strict 5-value status tracking (`open`, `in_progress`, `unverified`, `verified`, `blocked`), and no unearned completion claims without executed operational evidence. Adapting this rule into `.agents/rules/06-self-management-and-guard-edits.md` strengthens cognitive discipline across coding sessions.
  2. `AGENTS.md` referenced rules `00` through `05`; updating it to `00` through `06` integrates the rule into the agent entry point.
  3. `docs/source/DATABASE_SCHEMAS.md` contained significant drift against `src-worker/src/storage/d1/utils.ts` and `src-crawler/src/storage/local_sqlite.ts`:
     - Retained obsolete `registered_registrants` with an unresolved FIXME comment, whereas code implements `registered_users` with `vrcp_usr_` tokens, `age_verified`, and `is_moderator`.
     - Documented separate action tables instead of the unified `operator_audit_log` table with its 5 SQL compatibility views.
     - Omitted 10 high-frequency query indexes added in Stage 3.
     - Mismatched `catalog_tombstones` columns (`tombstoned_at` / `cursor_seq` vs. `recorded_at` composite primary key).
     - Named delegated claims view `creator_claims` instead of `delegated_creator_claims`.
     - Omitted `node_outbox` table and its indexes from Section 4 crawler storage documentation.
- Implementation steps:
  1. Adapt `.agents/rules/06-self-management-and-guard-edits.md` for `vrc-packages`.
  2. Update `AGENTS.md` rule reference range to `00` through `06`.
  3. Reconcile `docs/source/DATABASE_SCHEMAS.md` across Mermaid diagrams, D1 tables, compatibility views, all 10 query indexes, and node outbox storage.
  4. Update `docs/source/CHANGELOG.md` under `vrcp-worker-preview`.
- Verification status: verified.
  - Link check: `bun run .agents/scripts/check_doc_links.ts` passed (zero broken links in active documentation; 20 historical archive links in immutable changelogs preserved).
  - Worker test suite: 300 tests passed (3520 assertions) in `src-worker/test/`.
  - Crawler test suite: 181 tests passed (1529 assertions) in `src-crawler/tests/`.
  - Worker typecheck: `bun run check` clean across 3 tsconfigs.
  - Crawler typecheck: `bunx tsc --noEmit` clean.

# Previous checkpoints

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
