# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`; Wave 1 SDK Layer A executed on `preview/crawler-network`)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: Wave 1 `src-package/` Backwards-Compatible Layer A (`UNTANGLE-AW-01` Layer A, `UNTANGLE-AW-02`, `UNTANGLE-AW-03` SDK, `UNTANGLE-AW-06` SDK, `UNTANGLE-AW-07`) — verified and queued for Preview Publication Request `PR-AW-SDK-001`
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
| R47-C27-WEB | open | `src-web/`, `src-web-search/` | Implement Astro + Svelte 5 pages consuming `vrc-packages-api`, legal pages, and authenticated CORS/Firebase Auth architecture. | Pending |
| UNTANGLE-AW-01 | in_progress | `src-package/src/` | Layer A verified (`rating` in search, `UmbrellaSchema`/`APP_TOKEN_REGEX`/`HttpsUrlSchema`/`AppCandidate*` dedup, strict `PackageFrontSchema`/`LeadRowSchema.kind`/`InitializeCoordinator*`, aligned `RuleOriginSchema`). Layer B (3 breaking cleanups) waits for Wave 2 `src-worker`. | `bun run typecheck`, `bun test` (80 pass), `bun run build`, `bun run test:distribution` |
| UNTANGLE-AW-02 | verified | `src-package/src/client.ts` | Reject `"."`, `".."`, and blank-trimmed strings on `canonicalId` in `moderator.ratings.adjust`; validate `app.register` payload before checking both `userToken` and `operatorToken`; wrap `2xx` `JSON.parse` errors in `VRCPApiError`. | `bun test` (`client.test.ts`, `request_validation.test.ts`) |
| UNTANGLE-AW-03 | in_progress | `src-package/` | Deleted `src-package/index.ts`, `src-package/types/.gitkeep`, and unused `"jsx"`/`"allowJs"` in `src-package/tsconfig.json`. `src-web/` and `src-web-search/` remain open. | `bun run typecheck`, `bun run build` |
| UNTANGLE-AW-06 | in_progress | `src-package/AGENTS.md`, `src-package/src/`, `src-package/tests/` | Cleaned `src-package/AGENTS.md` (linked `SYSTEM_MAP.md`, added `/v1/moderator/`, removed en-dash) and removed stale `API_ROUTES`/slice comments. `src-package/README.md` kept untouched (owner lock headers). `src-web*` and `proposed_wiki_changes.md` remain open. | `ste-lint.py --strict src-package/AGENTS.md`, `check_doc_links.ts` |
| UNTANGLE-AW-07 | verified | `src-package/tests/` | Added `finally` temp dir cleanup to `distribution_smoke.mjs`, updated `request_validation.test.ts` (`CURSOR_TOKEN_MAX_LENGTH + 1` + all path methods), consolidated `client.test.ts` mock fetch/tokens/`capturedMethod`, split `protocol.test.ts` per protocol. | `bun test` (80 pass, 0 fail, 1261 assertions), `bun run test:distribution` (`cleanedUp: true`) |

---

## Next Steps

1. Sector 4 Pipeline reviews `PR-AW-SDK-001` in `handoff.md` for `vrc-packages-api-preview` publication.
2. Wave 2 Sector 1 (`src-worker/`) integrates `UNTANGLE-CN-04` and `UNTANGLE-CN-05` using the Tier 3B -> Tier 2 handoff notes in `handoff.md`, unlocking `UNTANGLE-AW-01` Layer B cleanup.
3. Await owner unlock on `src-package/README.md`, `Q-API-REVIEW` (`v0.1.0`), and Sector 3 web implementation (`R47-C27-WEB`).
