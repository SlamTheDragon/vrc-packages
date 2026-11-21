# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 1 SDK Layer A executed on `preview/crawler-network`)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: Wave 2 `src-package/` Layer B (`UNTANGLE-AW-01` verified; `PR-AW-SDK-002` submitted for `vrc-packages-api-preview`), `consumer_sdk_and_web.md` and `proposed_wiki_changes.md` cleaned under `UNTANGLE-AW-05` / `UNTANGLE-AW-06`; `src-web/` Downstream Operator/Moderator Admin UI Initializer Packets (`WEB-INIT-01`..`WEB-INIT-05`) queued under `G9-WEB` with UI skills (`shadcn-svelte`, `ui-sdk*`) and 6-domain + `workbench` UI primitives (`src-web/src/lib/components/ui/`) imported from `avali-clock` and `culinary-tree`.
- **Working Theories and Hypotheses**:
  - `UNTANGLE-AW-01` Layer B retired `@deprecated` `FeedbackSignalType*` and `DownstreamFeedback*` exports, narrowed `ReportSubmissionRequestSchema` to an orthogonal 3-branch `z.discriminatedUnion("reportType", [...])`, and removed `z.coerce.number()` in `user.ts`, `moderator.ts`, and `app_candidate.ts`.
  - `src-worker/package.json:24` declares `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"`, so Sector 1 (`src-worker/`) must remove dead `reportKind: data.reportKind` in `src-worker/src/api/downstream_handler.ts:190-204` upon installing the next preview SDK (`HO-S3B-003`).
  - `src-package/README.md` contains owner lock headers (`<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->` at lines 1 and 80) and was left untouched pending owner unlock.
  - Current verified SDK and web state is documented in [`docs/source/specifications/consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md) and [`docs/source/schemas/wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) (Tier 3B demarcation in `wire_and_protocol_contracts.md:4,25-41` stays pending under `UNTANGLE-AW-05`).
  - Six concrete discrepancies for human-readable `docs/applications/` wiki pages are staged in [`docs/source/reliability/proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md) awaiting owner approval.
  - Note: `src-web-search/` is a Git submodule with its own commit tree (untouched in Wave 1 and Wave 2).

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| Q-API-REVIEW | blocked | `src-package/`, `docs/research/audits/api_contract_review.md` | Complete owner review of all 26 Worker handlers vs 23 SDK methods before `v0.1.0`. | Held by owner review gate |
| R47-C27-WEB | open | `src-web/`, `src-web-search/` | Implement Astro + Svelte 5 pages consuming `vrc-packages-api`, legal pages, and authenticated CORS/Firebase Auth architecture (scoped initially to `WEB-INIT-01`..`WEB-INIT-05` in `src-web/`). | UI primitives and skills imported; `WEB-INIT-01`..`05` queued |
| WEB-INIT-01 | open | `src-web/package.json`, `src-web/astro.config.mjs`, `src-web/tsconfig.json`, `src-web/src/app.css` | Wire Tailwind v4, `bits-ui`, `lucide-svelte`, `clsx`, `tailwind-merge`, bind `src/app.css` to `src/lib/components/ui/tokens.ts`, and run `bun run prepare:dev preview web` to install release-channel `vrc-packages-api`. | `tsconfig.json` `$lib/*` alias and 39 UI primitives imported; dependency install & `app.css` pending |
| WEB-INIT-02 | open | `src-web/src/lib/stores/admin-session.svelte.ts`, `src-web/src/lib/components/admin/AdminLoginView.svelte`, `src-web/src/pages/login.astro` | Build Svelte 5 rune session store (`$state`/`$derived`) validating operator 64-hex and moderator `vrcp_usr_` tokens via `vrc-packages-api/auth` (`isOperatorToken`, `isUserToken`) and initialize `/login`. | Pending `WEB-INIT-01` |
| WEB-INIT-03 | open | `src-web/src/layouts/AdminLayout.astro`, `src-web/src/lib/components/admin/AdminShell.svelte`, `src-web/src/pages/index.astro`, `src-web/src/pages/design.astro` | Build collapsible `w-16`/`w-64` `SidebarNav` shell with `VRCPEmblem`, role/coordinator badges, mobile drawer, `/` routing, and `/design` 6-domain component showcase. | Pending `WEB-INIT-01`..`02` |
| WEB-INIT-04 | open | `src-web/src/pages/operator.astro`, `src-web/src/lib/components/admin/operator/` | Initialize Operator Governance Dashboard (`/operator`) covering schema init, source profiles, auto-queue rules, leads, job enqueue, node credentials, takedowns, claims, and app delegation via `VRCPackageClient.operator`. | Pending `WEB-INIT-02`..`03` |
| WEB-INIT-05 | open | `src-web/src/pages/moderator.astro`, `src-web/src/lib/components/admin/moderator/`, `docs/scratch-api-web/handoff.md` | Initialize Moderator Review Dashboard (`/moderator`) covering content rating adjustments and app candidate review via `VRCPackageClient.moderator`, run `ui-sdk-unslop` + `ui-sdk-expert-review`, verify `bun run build`, and submit `PR-AW-WEB-001`. | Pending `WEB-INIT-02`..`03` |
| UNTANGLE-AW-01 | verified | `src-package/src/`, `src-package/tests/` | Completed Layer A and Layer B: deleted `@deprecated` `FeedbackSignalType*` and `DownstreamFeedback*` exports, narrowed `ReportSubmissionRequestSchema` to an orthogonal 3-branch `z.discriminatedUnion("reportType", [DemandSignalReportRequestSchema, IssueReportRequestSchema, RemovalReportRequestSchema])`, replaced `z.coerce.number()` with `z.number()` in `user.ts`, `moderator.ts`, and `app_candidate.ts` (removing `coerceLimit`), and added regression tests. | `bun run typecheck` (0 errors), `bun run test` (build + 80 pass, 0 fail, 1381 expects across 8 files), `bun run test:distribution` (`packed_sdk_distribution`: 39 files, native Miniflare pass) |
| UNTANGLE-AW-03 | in_progress | `src-package/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, and unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`. `src-web/` and `src-web-search/` remain open. | `bun run typecheck`, `bun run build` |
| UNTANGLE-AW-05 | in_progress | `docs/source/specifications/consumer_sdk_and_web.md`, `docs/source/schemas/wire_and_protocol_contracts.md` | Cleaned `consumer_sdk_and_web.md` in ASD-STE100 (stripped hardcoded version literals, linked `config*.versions.json`, `src-web-search/package.json`, `IMPLEMENTATION_PLAN.md`, and `SYSTEM_MAP.md`). `wire_and_protocol_contracts.md:4,25-41` Tier 3B demarcation stays open outside current write containment. | `ste-lint.py --strict` (`consumer_sdk_and_web.md`: 1.12/100w, 0 em-dash), `check_doc_links.ts` (486 docs, exit 0) |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-package/src/`, `src-package/tests/`, `docs/source/reliability/proposed_wiki_changes.md` | Cleaned `src-package/AGENTS.md` and `proposed_wiki_changes.md` (removed en-dash, aligned `WIKI-06` with `src-worker/src/worker_entry.ts:25-49` and `API_ROUTES.md`). `src-package/README.md` stays untouched (owner lock headers); `src-web*` `AGENTS.md` remain open. | `ste-lint.py --strict` (`proposed_wiki_changes.md`: 0.86/100w, 0 em-dash), `check_doc_links.ts` (486 docs, exit 0) |

---

## Next Steps

1. Sector 4 Pipeline reviews `PR-AW-SDK-002` in `handoff.md` for `vrc-packages-api-preview` publication, coordinating with Sector 1 (`src-worker/`) so `downstream_handler.ts:190-204` drops dead `data.reportKind` access (`HO-S3B-003`).
2. Complete Tier 3B demarcation in `docs/source/schemas/wire_and_protocol_contracts.md:4,25-41` to finish `UNTANGLE-AW-05`.
3. Execute `WEB-INIT-01`..`WEB-INIT-05` in `src-web/`, and await owner unlock on `src-package/README.md` and `Q-API-REVIEW` (`v0.1.0`).
