# Active R13-C9-TEST-TYPES: Worker Bun fixture coverage (2026-10-13)

## Current working theory and verified checkpoint

- Theory confirmed: `test/tsconfig.json` checked only Vitest fixtures. Bun tests also exposed missing fetch.preconnect, incomplete D1 shapes, private clock mutation, unknown JSON/SQL values and runtime-global type mismatches.
- Added `test/tsconfig.bun.json` to the existing product `check`. Compiler inventory includes all 29 non-Vitest TypeScript test/support files. The separate Vitest project remains. No production type widening, API/wire/schema/dependency or root tooling change.
- SQLite mock now satisfies generated Worker bindings, uses typed execution bookkeeping, rejects unsupported raw/session/dump operations and rolls back foreign batch statements. Fixture metadata is synthetic, not billing evidence. Clocks use the existing constructor hook; other fixture assertions retain their runtime expectations.
- Final grouped gate: `bun run check`; 297 Bun tests/3456 assertions/23 files (12.50s); three Cloudflare Vitest tests (8.71s); preview dry-run bundle; full native HTTP/D1 harness. All pass. Type inventory has zero missing fixtures. Root tests did not run because root tooling is unchanged.
- Verification history: the initial expanded check exposed two additional mock shapes and the metadata index signature; these were corrected before the final pass. Vitest warned about an absent real OPERATOR_TOKEN, but its configured synthetic binding authenticated initialization successfully. No real credential was supplied or needed.
- JavaScript native harnesses and dependency declarations are not fully statically checked. Native output still confirms public provisional fronts; this typing gate does not resolve authority, budget or fleet risks. No ceremonial publication or version change accompanies this fixture-only checkpoint.
- Previous turn was progress: local 53a39e5 completed the URL comparison gate below. Routine commit stays local.

## Authority and prior URL gate (53a39e5)

- Branch: preview/crawler-network. Routine checkpoints remain local. Preview publication/dependency synchronization is authorized when needed; no production publication or SDK v0.1.0.
- Preserve owner README change d99b8f1. No sibling source imports, node_modules edits, source grants or external crawls accompany this gate.
- Working theory confirmed: three generic association queries lowercased URLs and removed trailing slashes, conflating path/query case and trailing query-value slashes. Compare serialized URLs exactly, serialize new lead targets/identities, and scope existing GitHub case matching to GitHub sources. This does not establish cross-source authority or repair old rows.
- Implemented: generic source-item, outbound-lead and assigned-job-lead comparisons preserve resource distinctions. New VPM/discovery lead aliases deduplicate host case/default HTTPS ports; retained observation links remain unchanged. No wire, dependency, schema, lease or access-policy change.
- Checkpoint reproduced: `bun test ./test` in src-worker: 296 pass, zero failures, 3452 assertions, 23 files (12.51s). `bunx tsc --noEmit`, `bunx tsc --noEmit -p test/tsconfig.json`, `bun run build:preview` and `node test/coordinator_runtime_smoke.mjs` pass. Root tooling is unchanged, so no root tests ran.
- Regression coverage: nine URL variants across each of three association routes; canonical lead deduplication; preserved raw observation links; explicit GitHub positive case; schema-valid public projection and exact replay without new writes. Native D1/HTTP checks cover six association cases, one serialized-alias lead, prior atomic rollback/retry, epoch races, revocation and pacing. External fetches: zero.
- Native output reports `provisionalFrontStillPublic: true` and `ownershipPolicyResolved: false`. Correct comparison is not protection against an untrusted exact-match claim. Conservative serialized equality also does not implement every RFC-equivalent spelling.

| Claim | Current code evidence | Exercised evidence | Remaining boundary |
| --- | --- | --- | --- |
| Generic URLs preserve resource distinctions | coordinator.ts:719,724,757,778 | d1_coordinator_store.test.ts:150; coordinator_runtime_smoke.mjs:165 | Existing raw aliases are not migrated; encoded aliases beyond URL serialization can stay unmatched. |
| New lead aliases share one identity | coordinator.ts:647,943 | d1_coordinator_store.test.ts:190,222; native aliasLeadCount=1 | Retained observation payloads remain original. No old lead-key rewrite. |
| GitHub case handling stays specialized | coordinator.ts:738 | d1_coordinator_store.test.ts:206 | No generic case-insensitive URL rule. |
| Public fronts require accepted identity | coordinator.ts:708 and buildCatalogPackagesBatch contradict this claim | Native public HTTP exposes an exact-match provisional front | R13-C9-IDENTITY and Q-PUBLICATION retain evidence/review, propagation, remediation and withdrawal decisions. |

## Open contracts and next independent work

- R13-C9-IDENTITY remains critical: source permission, truthful observation, identity and publication are separate. No automatic approval, deletion or graph remediation is selected.
- R13-C9-DELTA remains critical: current-row paging omits same-time mutations behind a consumed cursor; native hard deletion and rating withdrawal lack tombstones/epoch changes. Hard deletion has no production API caller; rating adjustment does. Revision/journal versus epoch/full-resync and retention/disclosure contracts stay deferred.
- R13-C9-TEST-TYPES inclusion and fixture errors are checked locally above; JavaScript harness and external declaration static coverage remain outside that claim.
- G12/R50-C31: account-wide requests, D1 rows/index writes, CPU, retained bytes, Linux/container interruption, host power loss and OS I/O remain unproven. No fleet-readiness conclusion follows from scoped checks.
- Next: independent R13-C9 failure cases or genuine changed Worker preview delivery through root tooling and predecessor proof. Epoch/metadata/URL changes justify runtime verification, but ownership/publication policy remains unresolved. No version, tag, push, deployment or live crawl ran for this gate.

## Earlier local capability checkpoints

- eacf8e0: assigned host/path storefront identity, optional URL binding, no price-based promotion, nonempty titles, nonterminal metadata batch conflicts. Worker 290/3256, standard types, preview build/native D1 passed. Seven storefronts cover rejected-write absence, corrected live leases and exact replay. Earlier native teardown FK failure was corrected in fixtures, not production.
- 816ced5: unique UUID first/reset catalog epochs, concurrent INSERT OR IGNORE winner readback and stored-value preservation. Worker 279/2925 plus native eight-reader/reset checks passed. Stored deployed epochs are not automatically invalidated. Delta counterexamples remain above.
- c7f88b5: sent/dead outbox rows resist late failure bookkeeping; first acknowledgments/metrics persist. Crawler 171/1441, types and development compilation/version passed. Three killed child processes replay unchanged keys over schema-valid loopback HTTP with zero source refetches. Actual SQLite-full staging/settlement rollback, restored-capacity retry and reopen passed; not host-power/fleet proof.
- 5f8ff8b: timestamp evidence preserved without inventing creation/publication fields. b802bcc: ahead preview planner aligned; behind/diverged histories stay blocked. Root full run was 252 pass/one stale expectation failure/3046 assertions; corrected affected group passed 14/128. No second full-root pass claimed.
- 8a05b19: idle jitter respects coordinator retry floors, including 300000ms waits. Crawler 160/1265, types and development binary passed before preview 10 allocation.

## Held crawler preview publication

- Root verified predecessor 2026.10.9-pre before allocating 2026.10.10-pre. Metadata commit: 66777f5888cda81bd7be2498ba01a99e6cb9cc46. Tag: vrcp-crawler/v2026.10.10-pre. Tag object: 03f910caaef6213da1ccd785ed8cb74cc93693e7.
- Run: https://github.com/SlamTheDragon/vrc-packages/actions/runs/38308127484 . Terminal failure: Linux job 115007199609 compiled, then obsolete --help invoked daemon startup without NODE_TOKEN. Windows job 115007199796 succeeded. Container/Release skipped. No image or Release publication claimed.
- Local repair 0791404 uses credential-free --version and network-disabled synthetic --once/SQLite persistence instead of retired --help/init. Affected root suites: 59 tests/1138 assertions; changed shell bodies passed Bash syntax checks. Two actual development-binary runs preserved one then two failed run records; missing-token rejection passed. Docker unavailable locally, so container execution unverified.
- R50-C31-RECOVERY defers exact-source preview recovery: current recovery accepts stable crawler versions/selected failures, not this preview/mixed result. Keep tag/version fixed. No deletion, rerun, dispatch or subsequent bump occurred.

## R49-C29 distributed checkpoints and hosted-native gap

- SDK preview 2026.10.11-pre, tag vrcp-api/v2026.10.11-pre, run 38302925036: original registry/CI bytes and five assets checked. SHA-256 bc0fbcd3693ae1e7a2a01c506be0d00842b99cd7fa187766cfcfb34020496f78. Transient readback recovered at the same version without republishing.
- Network 2026.10.8, tag vrcp-network/v2026.10.8, run 38304946219: four assets checked. Identical archive passed Node/Bun/types/Wrangler/workerd against SDK 0.0.8 and 2026.10.11-pre.
- Worker preview 2026.10.11-pre, tag cloudflare-worker/v2026.10.11-pre, run 38305836807: original bundle/config receipt checked. Hosted native smoke failed ENOENT before build; optional preview checks concealed the failure. Hosted native proof remains open.
- Repair e83f6c6 builds first and forwards the selected channel. Local preview build/native smoke passed. Earlier root run: 243 pass/one stale assertion failure/2968 assertions; corrected affected suites 58/1126. No second full-root pass claimed. Repair synchronized during authorized crawler publication; verify hosted native on next changed Worker delivery.
- Persistent preview-only D1: fbef6ce1-4145-45ae-ae91-5d617a1f2672. No production binding or resource was changed here.
- Four DELIVERY-* maintenance rows retain workflow, CLI, recovery-safety and proof-reporting findings. Interrupted preparation and documentation relinking remain R60-C60C/D. Root tooling changes are outside this source gate.
- Main delivery sign-off remains accepted. API v0.1 owner review, source/publication rights, ownership/age evidence and distributed abuse controls remain open. Website/desktop/release SDK unchanged.
