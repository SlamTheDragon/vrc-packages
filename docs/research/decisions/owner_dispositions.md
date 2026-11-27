# Consolidated Owner Comment Dispositions

This record preserves accepted owner decisions previously captured inside `docs/scratch/IMPLEMENTATION_PLAN.md` and subsequent governance reviews. Each entry states **accepted owner direction**, not proof of runtime implementation. Current executable state lives in [`docs/source/`](../../source/README.md).

## Dispositions: 2026-10-14

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `Q-PUBLICATION` | Profile expiry or revocation halts fetching only. Publication is a separate revocable state per item and field; withdrawals propagate via revisioned tombstones in the delta feed. Provisional cross-source fronts stay internal until reviewed. | Sector 1 (`crawler-network`) |
| `Q-USER-AUTH-REGISTRATION` | Map Firebase Auth UID to `registered_users.user_id`; consolidate multi-provider links (GitHub, Gumroad, Ko-fi, Jinxxy) and claims into one JSON column; map VRChat `/api/1/auth/user` (`ageVerificationStatus === '18+'` and `ageVerified === true`) to `registered_users.age_verified`. Full endpoint stays deferred to the user-auth milestone. | Sector 3 (`api-web`) |
| `R56-C56C` | Age-verified volunteer moderators review false-positive content ratings via `/v1/moderator/`; explicit-content false negatives route through a distinct report subcategory; suspected illegal content quarantines into an isolated operator-only queue. | Sector 1 (`crawler-network`) |
| `R56-C56D` | No legal counsel is available. Keep `LEGAL.md` strictly marked as draft with zero compliance claims, and limit personal data ingestion to anonymous IDs and boolean flags. | Sector 5 (`legal-research`) |
| `R54-C38R/A/B` | Decouple cryptographic delegation from immediate removal. Only trusted, operator-reviewed applications submit verified creator takedown requests into `catalog_tickets` (`removal_report`) for manual operator/moderator review. Shared-secret design stays candidate until reviewed. | Sector 1 (`crawler-network`) |
| `R54-C39A/B` | Measure after preview deployment. Budget target: 10 crawler nodes and 1,000 concurrent downstream users within Cloudflare monthly allowances. | Sector 1 (`crawler-network`) |
| `Q-API-REVIEW` | Publish pre-0.1 SDK versions starting at `v0.0.1` via root publication scripts. Hold `v0.1.0` until full `/v1/` route review completes. | Sector 3 (`api-web`) |
| `R57-DEPLOYMENT-LINKS` | Docs home for `docs/applications/` is `https://docs.vrcpackages.com/` (deferred post-v1). Keep established deployment card links unchanged (SDK to npm, crawler/client/network to tagged GitHub Releases, Worker deferred). | Sector 4 (`pipeline`) |
| `R58-ROOT-LOGS`, `R58-WORKFLOW-CLEANUP`, `R57-RETENTION` | Marked outdated and retired. Remote deletion and retention changes remain unauthorized. | Sector 4 (`pipeline`) |
| `R60-C60D` | Exempt immutable `docs/changelogs/` archives from strict local link checks while enforcing zero broken links across all active documentation. | Sector 4 (`pipeline`) |

## Dispositions: 2026-10-18

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `R13-C9-LEASE-DEADLINE` | Enforce an independent fixed local timer deadline in the crawler runner and abort work on lease expiry. | Sector 1 (`crawler-network`) |
| `R13-C9-IDENTITY` | Allow approved high-confidence storefront leads to auto-link with accepted review state (`confidence = 0.95`) without separate link review while isolating heuristic outbound links as provisional (`0.8`). | Sector 1 (`crawler-network`) |
| `R13-C9-TEST-TYPES` | Maintain full `tsconfig.bun.json` typecheck coverage across all Worker test fixtures. | Sector 1 (`crawler-network`) |
| `R13-C9-DELTA` | Record rating withdrawals, deletions, and delists in `catalog_tombstones` and stream them in delta feeds. | Sector 1 (`crawler-network`) |
| `R54-C39C-RATE-LIMIT` | Require distributed Cloudflare KV or native Rate Limiting bindings for coordinator rate limiting. | Sector 1 (`crawler-network`) |
| `R54-C39A/B` | Fix coordinator crawl leases at 120s and scale crawler heartbeat intervals dynamically between 5s and 30s based on origin fetch duration. | Sector 1 (`crawler-network`) |
| `FLEET-S2` | Pre-configure explicit source-access profiles strictly for approved open VPM community listings with robots preflight required; include storefront seeds (BOOTH, Gumroad, Jinxxy, Sellfy, Payhip, Ko-fi) partitioned into operator review with high-confidence autopass. | Sector 1 (`crawler-network`) |
| `FLEET-S4` | Run multi-platform fleet crawl simulations using loopback wire fixtures in CI, with preview Worker authorized for live verification. | Sector 1 (`crawler-network`) |
| `R58-PREVIEW-INIT` | Automate preview Worker deployments and preview D1 schema initialization with non-production test seeds. | Sector 4 (`pipeline`) |
| `R58-DIRTY-COMMIT` | Allow preview publication on ahead branches to auto-commit non-ignored pending changes as a pre-delivery checkpoint; keep production releases strictly on clean `main`. | Sector 4 (`pipeline`) |
| `R58-CONFIG-TAMPER` | Require remote GitHub assets verification in all environments including local development. | Sector 4 (`pipeline`) |
| `R60-C60C` | Add automatic rollback cleaning unstaged version and changelog writes if delivery preparation crashes before commit. | Sector 4 (`pipeline`) |
| `DELIVERY-RECOVERY-GUARDS` | Keep failure diagnosis strictly read-only and require verified absence of remote published assets before any tag deletion. | Sector 4 (`pipeline`) |
| `DELIVERY-PROOF-SEMANTICS` | Verify predecessor tag artifact existence and publication path without streaming full binaries. | Sector 4 (`pipeline`) |
| `DELIVERY-CLI-CONTRACT` | Unguarded automatic preview worker publishing is permitted only when the branch is identified as the lead branch; otherwise require merging from the latest lead branch. | Sector 4 (`pipeline`) |
| `DELIVERY-WORKFLOW-LEAN` | Keep the existing 14 separate GitHub Actions workflow files unchanged to prevent CI regression risk. | Sector 4 (`pipeline`) |
| `R50-C31-RECOVERY` | Use root deployment and publication tooling to recover failed distributions. | Sector 4 (`pipeline`) |
| `R55-C55D` | Keep separate legacy names per distribution channel while retaining `vrc-packages` for repositories and npm packages. | Sector 2 / 3 / 5 |

## Dispositions: 2026-11-20

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| Governance & Cascade | Extend `VISION.md` and truth sources into a Level 0 to Level 4 context cascade across five distinct sectors (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, `legal-research`). | All sectors |
| Rule 06 Edit-Guard | Disable edit-guard by default for localized edits; activate at 10+ files OR any cross-project contract, wire, schema, `LEGAL.md`, or root pipeline boundary change. | All sectors |
| Sector Ledgers & `docs/scratch/` | Adopt `culinary-tree`-style `docs/scratch-<sector>/` ledgers (3 files per folder under Departmental Handoff Cascade below); distribute all active tasks out of legacy `docs/scratch/`; execute `PIPELINE-SCRATCH-RETIRE` in Sector 4 to migrate `scripts/delivery.mjs` and root `tests/` and delete `docs/scratch/`. | Sector 4 (`pipeline`) |
| Documentation Separation | Keep `docs/source/` as truth for system reliability and agreed schemas, `docs/applications/` as untouched human-readable wiki (stage proposed changes in `docs/source/reliability/proposed_wiki_changes.md`; repair migrated links), and `docs/research/` as orthogonal investigative/legal corpus (purging raw transcripts and superseded snapshots). | Sector 5 / All sectors |
| Departmental Handoff Cascade & Pipeline-Only Clearing | Keep the 5 `docs/scratch-<sector>/` folders with strictly 3 files each (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`), expressing the 5-tier integration cascade (`Legal/Vision -> Schemas/Workers/Cloudflare -> API/Networking -> Crawler/Desktop -> Web`) as labeled sections inside each `handoff.md`. Product/legal sectors write Publication Requests strictly inside their own `handoff.md` and may not edit `docs/source/CHANGELOG.md` or clear `verified` ledger rows. Only Sector 4 (`pipeline`) agents oversee all handoffs, transfer verified product notes into `docs/source/CHANGELOG.md`, clear transferred `verified` rows across sector ledgers (without product version bumps for non-product sectors), and execute root publication scripts. | Sector 4 (`pipeline`) / All sectors |

## Dispositions: 2026-11-22

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `REORIENT-V0-SCOPE` | Ingest VRChat VPM packages and VRChat creator storefront items under `tools`, `avatars`, and `assets`. Keep skeleton, fork, or incomplete VPM packages servable as `unverified`. | Sector 1 / Sector 5 |
| `REORIENT-V0-CURATED-PURGE` | Purge `"curated"` from `PlatformSchema` as a catalog ingestion platform. Treat community registries strictly as discovery lead feeds, never as canonical truth. | Sector 1 / Sector 3 |
| `REORIENT-V0-PRIORITY-CAPABILITIES` | Schedule claims across four priority lanes. Coordinator auto-generates node capabilities on registration from claimable jobs and demand signals with no manual picking. | Sector 1 / Sector 3 |
| `REORIENT-V0-ATTESTATION` | Keep crawled catalog records `unverified` by default. Restrict creator verification and audited metadata corrections to trusted downstream apps (`candidate_status = 'trusted'`, `claims:delegate`). | Sector 1 / Sector 3 |
| `REORIENT-V0-STEERING-PROFILES` | Replace exact per-URL profiles and rules with loose domain-pool steering profiles (`*.domain-name.root`, bounded pagination, `autoPromote`, kill-switch). Park unproven custom domains in `source_leads` (`pending_review`) for bulk operator review or hard block. | Sector 1 / Sector 3 |
| `REORIENT-V0-7-LANES-PREVIEW` | Run preview discovery across `vpm` feeds, `booth`, `gumroad`, `jinxxy`, `itch` tags (no `/search`), `shopify` sitemaps, and `github` REST. Preview Jinxxy crawls honor RFC 9309 `robots.txt`. Formal Jinxxy outreach stays mandatory before production. | Sector 1 / Sector 5 |
| `REORIENT-V0-NODE-SANITIZE` | Offload HTML/JSON sanitization, VRChat relevance filtering, VPM quality checks, tag extraction, and `304` diffing onto Crawler Nodes. Keep Crawler Nodes active continuously via tiered recrawl cadences. | Sector 1 |
| `REORIENT-V0-6STAGE-BLUEPRINT` | Execute six cascading stages per sector: online research, review, `untangle-codebase`, authoritative `docs/source/` blueprints for `/grill-me`, plan, and execution. | All sectors |

## Dispositions: 2026-11-24

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `REORIENT-BP-D1-17` | Consolidate Coordinator D1 from 26 tables and 10 legacy views to 17 tables and 0 legacy views (`nodes`, `origin_state`, `crawl_jobs`, `job_results`, `steering_profiles`, `suppressed_targets`, `operator_audit_log`, `source_items`, `source_leads`, `canonical_packages`, `listing_sources`, `listing_relations`, `coordinator_meta`, `registered_users`, `registered_apps`, `downstream_signals`, `catalog_tickets`). Validate D1 query and write budgets against Cloudflare Free Tier limits during Stage 1 to 4 architecture review. | Sector 1 (`crawler-network`) |
| `REORIENT-BP-OWNER-FEEDBACK` | Minimize tables through semantic hierarchy while keeping finalized listings atomic in `canonical_packages` with indexed `owner_key` and `owner_name` attributes. Default `verification_status` to `'unverified'` (expecting roughly 90% unverified), record deterministic `quality_flags`, and restrict ownership verification and corrections to trusted downstream apps. Add `relationship_feedback` telemetry in `downstream_signals` feeding `listing_relations` so the platform reconsiders product relationships beyond hardcoded text rules. | Sector 1 / Sector 3 / Sector 5 |
| `REORIENT-BP-DISCOVERY` | Auto-promote discovered VPM `index.json` manifests across creator domains under RFC 9309 robots, strict VPM JSON validation, and `suppressed_targets`, alongside known platform pools. Park unknown non-VPM `custom_domain` hosts in `source_leads` (`pending_review`) for bulk review or domain-wide blocking. Prefer VRChat-filtered browse and tag pages on mixed storefronts (BOOTH, itch.io, Gumroad) and sitemaps on VRChat or merchant stores (Jinxxy, Shopify). Recrawl roots every 4h, VPM manifests every 6h, and leaf items every 24h. | Sector 1 (`crawler-network`) |
| `REORIENT-BP-CF-ENV` | Adopt Cloudflare three-target Wrangler isolation: top-level local `development` (`VRCP_ENV=development` with local D1 and KV), `[env.preview]` persistent preview (`vrc-package-crawler-preview`, `VRCP_ENV=development` during V0), and explicit `[env.production]` (`vrc-package-crawler`, `VRCP_ENV=production`). Expose System Purge in the Operator UI only when `VRCP_ENV` is `'development'` (fail-closed 403 otherwise, optional CLI for agentic access). Clean up Sector 4 Worker deployment workflows and CI scripts. | Sector 1 / Sector 3 / Sector 4 |

## Dispositions: 2026-11-24 to 2026-11-25 (`[P19]` Live Lifecycle, Containment, Assessment, Untangle & Open R&D)

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `REORIENT-LIVE-DEBUG` | Hold remote Worker and Crawler preview pushes until local ingestion, bulk survivor and attrition assessment, adversarial break-tests, first-principles optimization, and `/untangle-codebase` pass. | Sector 1 / Sector 4 |
| `NODE-CWD-CONTAINMENT` | Contain every node output (`node.db`, `-wal`/`-shm`, `logs/latest.log`, `logs/archive/`, `node.stop`, `node.config.json`, `.env`) inside `process.cwd()`. Purge `import.meta.dir`, `homedir()`, `%LOCALAPPDATA%`, and `~/.local/state` defaults. | Sector 1 / Sector 2 |
| `LIVE-LOCAL-ASSESS-01` | Draft a first-principles strategy first. Run local `wrangler dev` and isolated nodes against real sources. Bulk-check signal, noise, bloat, and funnel conservation (`survivors + accounted_attrition === total_attempted`). Inspect initial non-survivor attrition buckets and break-test suggestions (expandable dynamically per Rule 02.5). Break edge cases and distill abstract semantic patterns with zero crooked patch hacks. | Sector 1 / Sector 3 / Sector 5 |
| `R&D-OPEN-EXPANSION` | Treat initial debugging packets, attrition buckets, and chaos scenarios as starting suggestions, not exhaustive limits. Unpack the true R&D lifecycle dynamically when live debugging starts. Prevent tunnel vision per Rule 02 Section 5. | All sectors |
| `UNTANGLE-PRE-PREVIEW-01` | Run `/untangle-codebase` across all touched code and docs before final remote preview pushes. | All sectors |
| `LIVE-PREVIEW-ASSESS-01` | After `/untangle-codebase`, push Worker and Crawler previews and validate remote live ingestion quality across survivors and non-survivor attrition buckets. | Sector 1 / Sector 4 |

## Dispositions: 2026-11-25 (`[P20]` / `PN-011`)

| ID | Accepted Owner Direction | Owning Sector |
| :--- | :--- | :--- |
| `DEFER-KOFI-PATREON` | Defer Ko-fi and Patreon post-v1 while ToS, anti-bot, and API blockers stay active. Keep 9 runtime platforms (`0x01ff`), and park Payhip on `custom_domain`. | Sector 5 / Sector 1 |
| `REAL-STARTER-SEEDS-16` | Replace placeholder seeds in `default_seeds.ts` with 16 real opt-in starter profiles (`seedPreviewStarter: true`). Support UTF-8 and `%20` segments in `steeringPathMatches`. | Sector 1 (`crawler-network`) |
| `ZERO-PLACEHOLDER-RD` | Enforce the Zero-Placeholder R&D Rule once `LIVE-LOCAL-ASSESS-01` starts. Measure real public targets directly without placeholder URLs, synthetic fallbacks, or estimated counts. | Sector 1 / Sector 4 |
