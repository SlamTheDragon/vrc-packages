# Task Tracker: Sector 3 (Consumer API and Web)

## Active Working Context

- **Sector Anchor**: `docs/scratch-api-web/` (branches `preview/workers-api`, `preview/web`)
- **Current Milestone**: `G15` (held on full `API_ROUTES.md` review) and `G9-WEB` (open)
- **Active Task Slice**: None actively executing (all Sector 3 rows migrated from legacy `docs/scratch/IMPLEMENTATION_PLAN.md` and `UNMERGED_IMPLEMENTATION_PLAN.md`)
- **Working Theories and Hypotheses**:
  - Current verified SDK and web state is documented in [`docs/source/specifications/consumer_sdk_and_web.md`](../source/specifications/consumer_sdk_and_web.md) and [`docs/source/schemas/wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md).
  - Six concrete discrepancies for human-readable `docs/applications/` wiki pages are staged in [`docs/source/reliability/proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md) awaiting owner approval.
  - Note: `src-web-search/` is a Git submodule with its own commit tree.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| Q-API-REVIEW | blocked | `src-package/`, `docs/research/audits/api_contract_review.md` | Complete owner review of all 26 Worker handlers vs 23 SDK methods before `v0.1.0`. | Held by owner review gate |
| R47-C27-WEB | open | `src-web/`, `src-web-search/` | Implement Astro + Svelte 5 pages consuming `vrc-packages-api`, legal pages, and authenticated CORS/Firebase Auth architecture. | Pending |

---

## Next Steps

1. Await owner direction for either SDK `v0.1.0` review (`Q-API-REVIEW`) or Sector 3 web implementation (`R47-C27-WEB`).
2. Run domain checks at capability gate completion (`src-package`: `bun run typecheck`, `bun test`; `src-web` and `src-web-search`: `bun run build`).
