# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 1 SDK Layer A executed on `preview/crawler-network`)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: Wave 1 `src-package/` Backwards-Compatible Layer A (`PR-AW-SDK-001` published as `vrc-packages-api-preview@2026.11.12-pre` and cleared by Pipeline); `src-web/` Downstream Operator/Moderator Admin UI Initializer Packets (`WEB-INIT-01`..`WEB-INIT-05`) queued under `G9-WEB` with UI skills (`shadcn-svelte`, `ui-sdk*`) and 6-domain + `workbench` UI primitives (`src-web/src/lib/components/ui/`) imported from `avali-clock` and `culinary-tree`.
- **Working Theories and Hypotheses**:
  - Rule 06 `edit-guard` confirmed `DownstreamFeedback*` retirement, `ReportSubmissionRequestSchema` discriminated-union narrowing, and `z.coerce.number()` removal in `user.ts`/`moderator.ts` must wait until Wave 2 `src-worker` (`UNTANGLE-CN-04`/`05`) migrates (`UNTANGLE-AW-01` Layer B).
  - `src-package/README.md` contains owner lock headers (`<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->` at lines 1 and 80) and was left untouched pending owner unlock.
  - Current verified SDK and web state is documented in [`docs/source/specifications/consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md) and [`docs/source/schemas/wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md).
  - Six concrete discrepancies for human-readable `docs/applications/` wiki pages are staged in [`docs/source/reliability/proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md) awaiting owner approval.
  - Note: `src-web-search/` is a Git submodule with its own commit tree (untouched in Wave 1).

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
| UNTANGLE-AW-01 | in_progress | `src-package/src/` | Layer A verified (`rating` in search, `UmbrellaSchema`/`APP_TOKEN_REGEX`/`HttpsUrlSchema`/`AppCandidate*` dedup, strict `PackageFrontSchema`/`LeadRowSchema.kind`/`InitializeCoordinator*`, aligned `RuleOriginSchema`). Layer B (3 breaking cleanups) waits for Wave 2 `src-worker`. | `bun run typecheck`, `bun test` (80 pass), `bun run build`, `bun run test:distribution` |
| UNTANGLE-AW-03 | in_progress | `src-package/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, and unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`. `src-web/` and `src-web-search/` remain open. | `bun run typecheck`, `bun run build` |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-package/src/`, `src-package/tests/` | Cleaned `src-package/AGENTS.md` (linked `SYSTEM_MAP.md`, added `/v1/moderator/`, removed en-dash) and removed stale `API_ROUTES`/slice comments. `src-package/README.md` kept untouched (owner lock headers). `src-web*` and `proposed_wiki_changes.md` remain open. | `ste-lint.py --strict src-package/AGENTS.md`, `check_doc_links.ts` |

---

## Next Steps

1. Sector 4 Pipeline reviews `PR-AW-SDK-001` in `handoff.md` for `vrc-packages-api-preview` publication.
2. Wave 2 Sector 1 (`src-worker/`) integrates `UNTANGLE-CN-04` and `UNTANGLE-CN-05` using the Tier 3B -> Tier 2 handoff notes in `handoff.md`, unlocking `UNTANGLE-AW-01` Layer B cleanup.
3. Await owner unlock on `src-package/README.md`, `Q-API-REVIEW` (`v0.1.0`), and Sector 3 web implementation (`R47-C27-WEB`).
