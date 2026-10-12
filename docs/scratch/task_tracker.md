# Active R13-C7: timestamp provenance; R50 preview recovery deferred (2026-10-13)

## Authority and scope

- Branch: preview/crawler-network. Routine checkpoints remain local. Owner permits preview publication and batched publication/dependency synchronization. No production publication or SDK v0.1.0.
- Owner README change is preserved in d99b8f1. No sibling source imports, node_modules edits, source grants or live crawls accompany this work.

## Working theory and implementation

- Current timestamp slice theory: storefront creation fallback is mislabeled as originUpdatedAt; canonical upserts invent observed confidence and can downgrade existing publication evidence during metadata-only updates. Restrict modification extraction to modification fields and default absent publication evidence to null. Preserve explicit dates, current wire fields and search ordering.
- Checkpoint passed: crawler typecheck, 164 tests / 1273 assertions / 24 files, development binary build and --version 2026.10.10-pre. Worker source/test types, 274 tests / 2793 assertions / 23 files, preview bundle and isolated native D1 passed. Native checks covered unknown/preserved timestamp evidence, Unicode HTTP pagination, atomic rollback/replay, lease races and revocation with zero external fetches. Root tooling is unchanged, so root tests were not run.
- Boundary review: HTML creation/publication fields stay out of modification evidence, including malformed modification fallback. Direct D1 upserts preserve confirmed/inferred evidence during metadata updates; their current callers are tests, not a production HTTP mutation. Existing ingestion/projection regressions passed. Wire enums, sorting, fetch authorization and leases are unchanged. Separate upstream creation/release evidence needs an owner-approved provenance contract.
- Next: checkpoint locally, then publish only the changed Worker preview through root tooling to exercise repaired hosted native smoke. Crawler remains blocked at its exact failed preview version; do not advance it. Ahead-branch publication is accepted owner intent, not a documentation defect; its planner mismatch remains DELIVERY-CLI-CONTRACT.

- Confirmed before change: minimum jitter reduced retryAfterMs 5000 to 4000; the local cap reduced server maximum 300000 to 48000.
- Commit 8a05b19 clamps idle delay between max(server wait, local minimum) and max(that floor, local maximum). Exponential backoff and reset-on-lease remain. Heartbeat cadence, leases and retention are unchanged.
- Crawler checkpoint passed: typecheck; 160 tests / 1265 assertions / 24 files; development binary compilation and --version (then 2026.10.9-pre). Wire-backed cases cover repeated long waits, no jitter, both jitter bounds, cap saturation and lease reset.
- Source specification and pending crawler notes were updated. Root preparation consumed only the crawler preview section and generated its snapshot/archive.

## Current preview publication

- Root executor verified the original 2026.10.9-pre predecessor before allocation. Metadata commit: 66777f5888cda81bd7be2498ba01a99e6cb9cc46; tag: vrcp-crawler/v2026.10.10-pre; tag object: 03f910caaef6213da1ccd785ed8cb74cc93693e7.
- Exact run: https://github.com/SlamTheDragon/vrc-packages/actions/runs/38308127484 . Terminal failure: Linux job 115007199609 compiled successfully, then retired --help smoke launched without NODE_TOKEN. Windows job 115007199796 succeeded. Container/Release were skipped. No image or Release publication is claimed.
- Local CI alignment removes obsolete --help/init checks and uses version validation plus network-disabled one-shot startup and SQLite persistence. Both affected root suites passed 59 tests / 1138 assertions; both changed shell bodies passed Bash syntax validation. Two actual development-binary one-shot runs preserved one then two failed run records in the same isolated SQLite database; missing-token rejection passed. Docker is unavailable locally, so container execution stays unverified.
- Critical owner decision is deferred in R50-C31-RECOVERY: existing recovery rejects crawler previews and this mixed job shape. Keep the exact tag/version fixed. No tag deletion, rerun, recovery dispatch or subsequent bump occurred. Continue independent work without claiming this publication complete.

## R49-C29 pagination checkpoint and remaining CI gap

- SDK 2026.10.11-pre: run 38302925036. Original registry/CI bytes and five Release assets verified. Initial npm readback convergence failure recovered at the same version, without republishing.
- Network 2026.10.8: run 38304946219. Four Release assets verified; identical-byte Node/Bun/types/Wrangler/workerd checks passed against release SDK 0.0.8 and preview SDK 2026.10.11-pre.
- Worker 2026.10.11-pre: run 38305836807. Original bundle/config receipt verified. Types and 272 units passed; local native D1 proved four Unicode HTTP pages plus rollback, replay, races and revocation with zero external fetches.
- Hosted native smoke failed with ENOENT because CI tested before building. Optional preview checks concealed it in the green delivery. Hosted native proof stays open.
- Repair e83f6c6 builds first and forwards the selected channel into runtime smoke. Local preview build/native smoke passed. Full root suite: 243 passed, one stale setup assertion failed, 2968 assertions / 19 files. After correcting that assertion to approved single sync/help behavior, both affected suites passed 58 tests / 1126 assertions. No second full-root run is claimed.
- The repaired workflow was synchronized during authorized crawler publication. Verify its hosted native result on the next changed Worker delivery; no ceremonial Worker bump or frozen-run retry.

## Deferred work, not completion claims

- R50-C31 still needs measured fleet requests, D1 rows/index writes, CPU and retained bytes. Correct pacing bounds do not prove free-tier sufficiency.
- Four DELIVERY-* maintenance rows retain workflow cost, CLI, recovery safety and proof-reporting findings. Owner confirms ahead branches should publish previews; fix the planner, not the guide. Behind/diverged branches stay blocked.
- The human preview plan hid its ahead-branch blocker behind a completed label; --json exposed it. Include truthful human plan status in DELIVERY-CLI-CONTRACT.
- Main delivery sign-off remains accepted. Real fleet ingestion, distributed abuse limits, source/publication rights, ownership/age evidence, API v0.1 review, interrupted preparation and documentation relinking remain open. Website/desktop and release SDK are unchanged.
