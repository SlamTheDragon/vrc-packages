# Active R13-C9: catalog delta failure-boundary audit (2026-10-13)

## Authority and scope

- Branch: preview/crawler-network. Routine checkpoints remain local. Owner permits preview publication and batched publication/dependency synchronization. No production publication or SDK v0.1.0.
- Owner README change is preserved in d99b8f1. No sibling source imports, node_modules edits, source grants or live crawls accompany this work.

## Working theory and implementation

- Delta theory confirmed: production D1 pages current general-rated rows using (updated_at, canonical_id), not a mutation journal. Three stable same-time pages, including identifier-only delists, pass native HTTP checks. Native counterexamples: same-time updates behind the consumed cursor are absent; hard deletion and rating withdrawal produce no tombstone or epoch change. Mutations used isolated in-Worker D1 fixtures, not moderator authentication. Hard-delete helper has no production API caller; rating adjustment does. R13-C9-DELTA defers revision/withdrawal/resync policy with Q-PUBLICATION.
- Epoch correction: fresh databases no longer share epoch-d1-default. Full UUID first/reset values, rereading the INSERT OR IGNORE winner, stored-value preservation and storage-refusal recovery pass. Existing deployed epochs are not automatically invalidated. No wire, cursor, lease or access-policy change.
- Final Worker checkpoint: source/test types; 279 tests / 2925 assertions / 23 files (13.19s); preview bundle; existing native workerd/D1 harness. Native output explicitly proves eight-reader epoch convergence and reset persistence, plus Unicode HTTP pages, receipt schemas, atomic rollback/replay, origin races and revocation. External fetches: zero. Root tooling is unchanged, so no root tests ran.
- Verification history: initial 277-test run had three failures because the long-ID fixture created a display name above the existing 500-character bound. Corrected the fixture, not the schema. One standalone native host-proxy probe stalled after initialization and was explicitly stopped without a result. The bounded in-Worker mutation probe and the existing full native harness completed. Do not infer a product failure from the interrupted diagnostic.
- Publication: changed epoch initialization is a real Worker runtime correction, unlike the prior test-only upsert caller fix. Pending Worker preview notes are ready; no version/tag/push/deployment has run for this gate. Next publication must use root tooling, verify predecessor proof and confirm repaired hosted native smoke. Crawler recovery remains separate.
- Outbox theory confirmed: late failure bookkeeping changed sent to pending and modified completed task errors. Active-state guards now preserve sent/dead entries; repeated acknowledgments retain the first receipt and metrics. Staging still commits before HTTP submission, and settlement remains atomic with task/run counters. Existing TTL/quota/lease policy stays fixed.
- Outbox gate checked: crawler typecheck; 171 tests / 1441 assertions / 25 files (9.02s); development compilation and credential-free --version 2026.10.10-pre. Three actual child-process kills during pending HTTP acknowledgments replay unchanged keys with published schemas, including lost accepted receipt and terminal lease rejection. Replay makes zero source fetches. Test-only SQLite page caps cause real SQLITE_FULL during staging and receipt settlement; rollback, restored-capacity retry, integrity check and reopen pass. Mixed-batch failure preserves prior sent/dead entries. Existing quota/TTL/lease tests pass.
- Scope limits: actual daemon/client/SQLite processes use a loopback fixture coordinator and injected source responses, not Worker/D1 or external crawling. Host power loss, OS permission/I/O errors and Linux/container/fleet interruption remain open. No wire, dependency or policy change; no root/Worker tests needed for this node-only gate. Source spec and pending preview notes are aligned. Crawler publication stays held at exact failed preview 10; no version, tag, push or dispatch ran.
- Earlier local checkpoints: outbox c7f88b5; timestamps 5f8ff8b; ahead-branch planner b802bcc. Timestamp evidence rules and wire fields remain unchanged. Planner keeps behind/diverged histories blocked and strict release equality. Root full run was 252 pass / one outdated expectation failure / 3046 assertions; after correction, the affected group passed 14/128. No second full-root run is claimed.
- Next independent failure work: malformed metadata and false links in R13-C9. Broader DELIVERY-CLI-CONTRACT and upstream creation/release provenance remain queued. Keep critical delta and crawler-recovery decisions deferred rather than inventing contracts.

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
