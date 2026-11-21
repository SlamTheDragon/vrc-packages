# Independent Pipeline Oversight and Integration Handoff Ledger: Sector 4 (Root Distribution Pipeline)

## Department Scope and Oversight Authority

- **Role**: Independent repository-wide distribution, versioning, changelog maintenance, ledger-clearing, and pipeline integrity department.
- **Sector Anchor**: `docs/scratch-pipeline/` (branches `main`, `release/*`)
- **Owned Paths**: Root `package.json`, `scripts/`, `.github/workflows/`, `config.versions.json`, `config.preview.versions.json`, `tests/`, and exclusive write stewardship of [`docs/source/CHANGELOG.md`](../source/CHANGELOG.md) (generated root `CHANGELOG.md` and `docs/changelogs/` remain script-managed).
- **Oversight Read Access (All Sector Ledgers)**:
  - Tier 1 (`legal-research`): [`docs/scratch-legal-research/handoff.md`](../scratch-legal-research/handoff.md) and [`task_tracker.md`](../scratch-legal-research/task_tracker.md)
  - Tier 2 / 3A / 4A (`crawler-network`): [`docs/scratch-crawler-network/handoff.md`](../scratch-crawler-network/handoff.md) and [`task_tracker.md`](../scratch-crawler-network/task_tracker.md)
  - Tier 4B (`desktop-client`): [`docs/scratch-desktop-client/handoff.md`](../scratch-desktop-client/handoff.md) and [`task_tracker.md`](../scratch-desktop-client/task_tracker.md)
  - Tier 3B / 5 (`api-web`): [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md) and [`task_tracker.md`](../scratch-api-web/task_tracker.md)
- **Exclusive Pipeline Responsibilities**:
  1. **Keep pipeline scripts intact**: Guard `scripts/delivery*.mjs`, `scripts/changelog.mjs`, `.github/workflows/`, and root `tests/` from product-sector drift.
  2. **Intake written Publication Requests**: Sweep all four sector `handoff.md` ledgers for `requested` items and verify producer-before-consumer ordering (`src-package` -> `src-worker/packages/network` -> `src-worker` / `src-crawler` / `src-crawler-client` / `src-web`).
  3. **Maintain changelog tidiness (`docs/source/CHANGELOG.md`)**: Transfer verified product release notes from sector `handoff.md` Publication Requests into [`docs/source/CHANGELOG.md`](../source/CHANGELOG.md) in strict ASD-STE100 compliance (`ste-lint.py`) while preserving locked headings and delimiters.
  4. **Exclusive ledger row clearing**: Only Sector 4 Pipeline agents may clear or delete `verified` rows from any sector's `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or `handoff.md`. Clear product rows **only after** transferring notes into `docs/source/CHANGELOG.md` (and/or completing publication). Clear non-product rows (such as Sector 5 `legal-research` or doc-only slices) **without** bumping versions or adding product changelog entries.
  5. **Execute publication routines**: Run root `bun run publish:preview`, `bun run publish:release`, `bun run publish:finalize`, `bun run publish:status`, `bun run publish:check`, and `bun run recovery:*` per [`AGENT_PUBLISHING_PROCEDURE.md`](../research/decisions/AGENT_PUBLISHING_PROCEDURE.md) and [`PUBLISHING.md`](../source/PUBLISHING.md). Pipeline scripts snapshot `docs/source/CHANGELOG.md` to root `CHANGELOG.md` and append consumed notes to `docs/changelogs/`.

---

## Consolidated Publication Request and Ledger-Clearance Intake Queue

Sweep all sector `handoff.md` files and stage accepted intake rows here in strict producer-before-consumer order before transferring notes to `docs/source/CHANGELOG.md` or invoking root publication scripts.

| intake_id | source_sector | req_id | product_or_scope | channel | prereqs_satisfied | changelog_transferred | rows_cleared | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `INT-001` | `api-web` | `PR-AW-SDK-001` | `package` | `preview` | `yes (reset and published as 2026.11.0-pre, run 44907441586)` | `yes` | `yes` | `cleared` |
| `INT-002` | `crawler-network` | `PR-CN-NET-001` | `network` | `preview` | `yes (package 2026.11.0-pre verified; published 2026.11.0, run 44908178157)` | `yes` | `yes` | `cleared` |
| `INT-003` | `crawler-network` | `PR-CN-WRK-001` | `worker` | `preview` | `yes (package 2026.11.0-pre, network 2026.11.0 verified; published 2026.11.0-pre, run 44908546421, live crawl verified)` | `yes` | `yes` | `cleared` |
| `INT-004` | `api-web` | `PR-AW-SDK-002` | `package` | `preview` | `yes (published 2026.11.1-pre, run 44912126590, release-artifacts-verified; network 2026.11.1 published in run 44913258479)` | `yes` | `no` | `verified` |
| `INT-005` | `crawler-network` | `PR-CN-WRK-002` | `worker` | `preview` | `yes (package 2026.11.1-pre, network 2026.11.1 verified; target 2026.11.1-pre)` | `yes` | `no` | `in_progress` |
| `INT-006` | `crawler-network` | `PR-CN-CRAWL-001` | `crawler` | `preview` | `yes (package 2026.11.1-pre, network 2026.11.1 verified; 2026.10.10-pre superseded to 2026.10.9-pre; target 2026.11.0-pre)` | `yes` | `no` | `in_progress` |
| `INT-007` | `api-web` | `PR-AW-WEB-001` | `web` | `preview` | `yes (release SDK vrc-packages-api@0.0.8 installed via prepare:dev preview web; astro check & build verified; remote web hosting deferred)` | `no (hosting deferred)` | `no` | `verified` |

---

## Outbound Pipeline Notices (Readable by All Sectors)

Publish distribution blocks, recovery gates, toolchain upgrades, and repository-wide layout migrations here so product and legal sectors can read them without touching Sector 4 files.

| notice_id | target_sectors | related_slice | status | directive |
| :--- | :--- | :--- | :--- | :--- |
| `PN-001` | All sectors | `DELIVERY-MAINTENANCE` | active | Departmental Handoff Cascade active: every `docs/scratch-<sector>/` folder holds strictly 3 files (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`). Submit Publication Requests strictly inside your own `handoff.md`; do not edit `docs/source/CHANGELOG.md` or clear `verified` rows directly. |
| `PN-002` | `crawler-network` | `R50-C31-RECOVERY` | verified | `.github/delivery-recoveries.json` and `scripts/delivery-recovery.mjs` support `vrcp-crawler/v2026.10.10-pre` (`failedStage: "build-smoke"`, run `38308127484`); live main dispatch awaits owner promotion to `main` because ruleset `24553469` blocks remote tag deletion. Temporary version rule `calver-2026-11-preview-npm-rollback` is active for `vrc-packages-api-preview` (`period: "2026.11"`, skipping occupied `2026.11.12-pre`, auto-expiring at `2026.11.12-pre` or on rollover to `2026.12.0-pre`). |
| `PN-003` | All sectors | `PIPELINE-SCRATCH-RETIRE` | verified | Legacy root `docs/scratch/` is deleted; `scripts/delivery.mjs`, root `tests/`, `.gitignore`, and `.agents/scripts/check_doc_links.ts` enforce the five 3-file `docs/scratch-<sector>/` ledgers. |
| `PN-004` | `crawler-network` | `WORKER-PREVIEW-LIVE-CRAWL` | verified | `.github/workflows/cloudflare-worker.yml` `deploy` job compiles `src-crawler` Linux binary and runs `bun run worker:preview:live-crawl --execute` against preview Worker (verified live in `cloudflare-worker/v2026.11.0-pre` run `44908546421`). Keep `src-crawler` CLI `--once` and env vars (`NODE_ID`, `NODE_TOKEN`, `COORDINATOR_URL`, `NODE_CAPABILITIES`, `NODE_DB_PATH`). |
| `PN-005` | `api-web`, `crawler-network` | `WEB-ADMIN-INIT-PIPELINE` | active | **Goal Addendum (`src-web/` Downstream Operator/Moderator Admin UI Initializer Packet)**: Imported `shadcn-svelte`, `ui-sdk`, `ui-sdk-write-code`, `ui-sdk-write-docs`, `ui-sdk-unslop`, and `ui-sdk-expert-review` into `src-web/.agents/skills/`, updated `.agents/rules/09-frontend-design-system-invariants.md` with the 3-tier component & collapsible `SidebarNav` architecture inspired by `avali-clock` and `culinary-tree`, and imported the 6-domain + `workbench` UI primitives (`src-web/src/lib/components/ui/tokens.ts`, `types.ts`, `display/`, `feedback/`, `forms/`, `navigation/`, `overlays/`, `telemetry/`, `workbench/`). Sector 3 (`api-web`) owns execution of `WEB-INIT-01`..`WEB-INIT-05` (initializing ONLY `/login`, `/operator`, `/moderator`, and `/design`, consuming `vrc-packages-api` strictly via `bun run prepare:dev preview web`, and submitting a written Publication Request in `docs/scratch-api-web/handoff.md`). Sector 1 (`crawler-network`) owns `R47-C27-CORS` (authenticated browser CORS and `OPTIONS` preflight headers on `/v1/operator/*`, `/v1/moderator/*`, `/v1/user/*`, and `/v1/app/*`). |
| `PN-006` | `crawler-network` | `R13-C2 / FLEET-S2` | verified | Integrated in `src-worker/src/storage/default_seeds.ts` and deployed live in `cloudflare-worker/v2026.11.0-pre` (run `44908546421`): `DEFAULT_APPROVED_SOURCE_PROFILES[0]` (`vrchat-community.github.io/template-package/`) sets `retainClasses: ["normalized_facts", "creator_prose"]` and `publishClasses: ["normalized_facts"]`. |
| `PN-007` | `crawler-network` | `R54-C39C-RATE-LIMIT` | verified | Integrated in `src-worker/wrangler.toml` and deployed live in `cloudflare-worker/v2026.11.0-pre` (run `44908546421`): bound provisioned preview KV namespace `0a8237b498334dd7b1f58fb7807a68c6` (`RATE_LIMIT_KV`) and removed the placeholder production KV block. |
