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
| Sector Ledgers & `docs/scratch/` | Adopt `culinary-tree`-style 2-file `docs/scratch-<sector>/` ledgers; distribute all active tasks out of `docs/scratch/`; keep `scripts/delivery.mjs` and legacy `docs/scratch/` retirement under Sector 4 (`PIPELINE-SCRATCH-RETIRE`). | Sector 4 (`pipeline`) |
| Documentation Separation | Keep `docs/source/` as truth for system reliability and agreed schemas, `docs/applications/` as untouched human-readable wiki (stage proposed changes in `docs/source/reliability/proposed_wiki_changes.md`; repair migrated links), and `docs/research/` as orthogonal investigative/legal corpus (purging raw transcripts and superseded snapshots). | Sector 5 / All sectors |
