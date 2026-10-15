# Active slice: R16-C20-DOCS (2026-10-16, local commit, no push)

- Objective: Reconcile source/runbook drafts with delivered code and verified capabilities.
- Working theory:
  Earlier docs described outdated or unsupported capabilities:
  1. `SPECIFICATION_CRAWLER_CLIENT.md` cited `node.config.json`, which was removed under `M-CRAWLER-HEADLESS-ENV` in favor of direct `.env` ingestion. It also omitted the dedicated `[ACTIVITY]` and `[FINDING]` broadcast logging to `latest.log`.
  2. `SPECIFICATION_CRAWLER_NETWORK.md` claimed delta synchronization lacked tombstones for deletions/withdrawals and claimed public responses exposed provisional cross-source fronts. `R13-C9-DELTA` delivered `catalog_tombstones` and unified delta feeds; `R13-C9-IDENTITY` isolated provisional fronts behind accepted `identity_links`.
  3. `DELEGATES.md` needed reconciliation regarding `.env` node configuration, activity broadcasts, delta tombstones, and provisional front isolation.
  4. `DATABASE_SCHEMAS.md` lacked documentation of `catalog_tombstones` and consolidated audit log entities.
  Updating these drafts aligns documentation with delivered code without asserting unsupported capabilities.
- Implementation steps:
  1. Update `docs/source/SPECIFICATION_CRAWLER_CLIENT.md` to remove `node.config.json` references and document `.env` configuration and dedicated activity/finding logging.
  2. Update `docs/source/SPECIFICATION_CRAWLER_NETWORK.md` to document `catalog_tombstones` delta streaming and accepted identity link front isolation.
  3. Update `DELEGATES.md` to reflect headless `.env` configuration and delta tombstone delivery.
  4. Update `docs/source/DATABASE_SCHEMAS.md` to document `catalog_tombstones`.
  5. Run documentation and link validation checks.
  6. Document changes in `docs/source/CHANGELOG.md`.
- Verification status: Verified locally.
  - Link audit: `.agents/scripts/check_doc_links.ts` confirmed zero new broken links.
  - Crawler domain: 174 tests pass, typecheck clean, dev build compiles.
  - Worker domain: `bun run check` clean across all 3 tsconfigs.
  - Documentation: updated `docs/source/CHANGELOG.md`.

# Previous checkpoints

# R16-C19-BROADCAST checkpoint (2026-10-16, local commit 38d47ab)
- Implemented: Added `activity()` and `finding()` methods to `Logger` in `logger.ts`; instrumented `daemon.ts` and `main.ts` to broadcast lifecycle activities and package discovery findings to `latest.log`.
- Verified: Crawler `bun test` 174 pass, `bunx tsc --noEmit` clean, dev build compiles.

# R13-C9-DELTA checkpoint (2026-10-16, local commit 0ecf467)
- Implemented: Added `catalog_tombstones` table and cursor index; recorded tombstones on rating withdrawal, hard deletion, and delist requests; updated `listCatalogDeltasPage` to union tombstones with `NOT EXISTS`.
- Verified: Worker `bun test` 298 pass, 3 Vitest pass, workerd smoke pass, typecheck clean.

# R13-C9-IDENTITY checkpoint (2026-10-16, local commit 68e695f)
- Implemented: `buildCatalogPackagesBatch` enforces `EXISTS` on accepted `identity_links`. Provisional storefront fronts stay internal.
- Verified: Worker 297 pass, Vitest pass, native smoke pass (`provisionalFrontStillPublic: false`).
