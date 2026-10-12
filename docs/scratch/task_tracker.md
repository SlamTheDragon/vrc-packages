# Active tooling gate R60 — source changelog and simpler setup (2026-10-13)

- Branch: `preview/crawler-network`. Owner confirms main sign-off passed. Do not reopen the old delivery sign-off.
- This iteration permits root tooling and agent-rule edits. Commits remain local; no push or publication has run.
- Preserve the owner's pending `src-worker/src/worker_logger.ts` edit; exclude it from tooling commits.
- R60-C60A: copied root notes intact to `docs/source/CHANGELOG.md`. Preparation snapshots that source to root, archives selected notes and clears only their product/channel body. Headings, comment delimiters and other notes remain.
- Release metadata verification now reproduces the snapshot and source reset instead of allowing arbitrary changelog edits.
- R60-C60B: removed duplicate setup sync/help calls and unified the installation execution path. Updated publishing guidance and lifecycle rules.
- Verification: final changelog/setup checks passed (15 tests, 81 assertions). Full delivery/provenance run `9956` is running. Four-product source integration run `72251` found a Windows CRLF assertion mismatch; corrected run `45405` is running. Syntax and whitespace checks passed.
- Documentation audit: 109 existing broken local links remain after folder moves. No finding targets the migrated source changelog or an unexpected docs category. Published history archives were not edited. Broad relinking is deferred in R60-C60D.
- Deferred R60-C60C: filesystem/Git crash recovery needs a distinct design; no claim of atomic multi-file writes or automatic retry. Existing root snapshot retains consumed notes.
- Next: inspect those exact test handles, record failures or results, and commit only the tooling slice locally. Continue the crawler/network goal afterward.

## Previous completed gate G18

## Milestone Gate Status & Bounded Vertical Slices

- Branch: `preview/crawler-network`
- Active Gate: G18 (D1 Schema Consolidation, Entity Unification & Table Optimization)
- Gate Status: **Verified & Committed Locally**
- Completed Slices in Gate G18:
  - `R59-C59A`: Consolidated 5 redundant action tables into `operator_audit_log`, verified & committed locally (`34e43dd`).
  - `R59-C59B`: Inlined `owner_user_id` into `registered_apps`, eliminated `user_app_ownership` table, verified & committed locally (`7181166`).
  - `R59-C59C`: Merged `refresh_lease_id` and `refresh_lease_expires_at` into `origin_robots`, eliminated separate lease table, verified & committed locally (`13f925b`).
  - `R59-C59D`: Consolidated `creator_opt_outs`, `delegated_creator_claims`, and `catalog_reports` into `catalog_tickets`, preserving backward-compatible read views, verified & committed locally (`372978f`).
- Verification Evidence:
  - `src-worker`: `bun test ./test` (267/267 pass, 22 files), `bun run test:runtime` (0 exit code, miniflare workerd D1 smoke passed), `bun run check` (typegen + tsc clean), `bun run build:preview` (clean preview build).
  - `src-crawler`: `bun test` (158/158 pass, 24 files).
  - `src-package`: `bun test` (61/61 pass, 7 files).
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Target Architecture & Safety Invariants

1. **Schema Refactoring**:
   - `catalog_tickets`: table consolidating ticket_id, ticket_type ('opt_out','delegated_claim','removal_report'), app_id, target_url, canonical_id, requester_type, requester_id, creator_id, reason, proof_kind, proof_value, contact_email, challenge_token, expires_at, nonce, signature, payload_json, review_status, review_notes, recorded_at.
   - Indexes:
     - `idx_catalog_tickets_nonce`: UNIQUE on (app_id, nonce) WHERE nonce IS NOT NULL
     - `idx_catalog_tickets_review`: on (ticket_type, review_status, recorded_at, ticket_id)
     - `idx_catalog_tickets_canonical`: on (canonical_id)
     - `idx_catalog_tickets_target_url`: on (target_url)
   - Compatibility Views:
     - `creator_opt_outs`: SELECT from `catalog_tickets` WHERE `ticket_type = 'opt_out'`
     - `delegated_creator_claims`: SELECT from `catalog_tickets` WHERE `ticket_type = 'delegated_claim'`
     - `catalog_reports`: SELECT from `catalog_tickets` WHERE `ticket_type = 'removal_report'`

2. **Coordinator Operations**:
   - Update `recordCreatorOptOut`, `listCreatorOptOuts`, `verifyTakedown`, `submitDelegatedClaim`, `listDelegatedClaims`, `verifyDelegatedClaim`, and `recordRemovalReport` in `coordinator.ts` and `local_sqlite.ts`.
   - Preserve existing method contracts and wire endpoints completely.

3. **Storage Parity**:
   - Maintained identically across D1 coordinator engine (`src-worker/src/storage/d1/utils.ts`, `coordinator.ts`) and local SQLite simulation (`src-worker/test/support/local_sqlite.ts`).
