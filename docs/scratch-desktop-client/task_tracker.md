# Task Tracker: Sector 2 (Crawler Desktop Client)

## Active Working Context

- **Sector Anchor**: `docs/scratch-desktop-client/` (branch `preview/desktop-client`)
- **Current Milestone**: `G9-CLIENT` (open; all Sector 2 rows migrated from legacy `docs/scratch/IMPLEMENTATION_PLAN.md` and `UNMERGED_IMPLEMENTATION_PLAN.md`)
- **Active Task Slice**: None actively executing
- **Working Theories and Hypotheses**:
  - Current verified state is documented in [`docs/source/specifications/desktop_client.md`](../source/specifications/desktop_client.md).
  - `src-crawler-client/package.json` declares `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"` (`vrc-packages-api-preview`), `shadcn-svelte`, Svelte 5, Tailwind v4, and Tauri 2; `src-tauri/src/lib.rs` still contains only starter `greet` + `tauri_plugin_opener`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R47-C27-CLIENT | open | `src-crawler-client/src-tauri/`, `src-crawler-client/src/` | Design and implement crawler node supervision, configuration UI, log console, and SDK integration. | Pending |
| R55-C55D-CLIENT | blocked | `src-crawler-client/src-tauri/tauri.conf.json` | Finalize preview vs release Windows identifier and data-directory coexistence strategy. | Blocked on channel identity plan |

---

## Next Steps

1. Await an explicit Sector 2 (`desktop-client`) user directive before starting `R47-C27-CLIENT`.
2. Run domain checks (`bun run check`, `bun run build:web`, and `bun run build:dev` for Rust/Tauri changes) at capability gate completion.
