# VRCP Vision and Owner Truth

Updated: 2026-11-25. This file owns **current owner intent, canonical terminology, responsibility sectors, and superseded directions** for VRC Packages (VRCP). Current executable source truth (system reliability and agreed schemas) lives in [`docs/source/`](../../source/README.md). Human-readable application wikis live in [`docs/applications/`](../../applications/README.md) and stay untouched until owner approval. Investigative research and legal expansion studies live in [`docs/research/`](../README.md). Direct instructions from the repository owner take precedence.

Use the Table of Contents to read only the required section. Stable `Txx` section IDs support targeted searches. `Pxx` anchors identify retained owner decisions in [T10](#t10-owner-decision-provenance-and-coverage).

## Table of Contents

- [T00: Authority and Version 0 Scope](#t00-authority-and-version-0-scope)
- [T01: Canonical Terminology and Brand Identity](#t01-canonical-terminology-and-brand-identity)
- [T02: Five Monorepo Responsibility Sectors](#t02-five-monorepo-responsibility-sectors)
- [T03: Component and Sector Responsibilities](#t03-component-and-sector-responsibilities)
- [T04: Safety, Lease, and Source-Access Boundaries](#t04-safety-lease-and-source-access-boundaries)
- [T05: Cross-Project Dependency Isolation](#t05-cross-project-dependency-isolation)
- [T06: SDK, Wire Contracts, and Frontend Invariants](#t06-sdk-wire-contracts-and-frontend-invariants)
- [T07: Publishing, Branching, and Root Pipeline Separation](#t07-publishing-branching-and-root-pipeline-separation)
- [T08: Directions Changed or Superseded](#t08-directions-changed-or-superseded)
- [T09: Targeted Context Retrieval](#t09-targeted-context-retrieval)
- [T10: Owner Decision Provenance and Coverage](#t10-owner-decision-provenance-and-coverage)

## T00: Authority and Version 0 Scope

This repository is in **version 0 pre-production**. Nothing is legacy. Purge superseded code and documents instead of wrapping them. Rename anything whose name does not match its function. [P01]

This file owns owner intent. [`owner_dispositions.md`](owner_dispositions.md) records consolidated dated owner decisions. [`docs/source/SYSTEM_MAP.md`](../../source/SYSTEM_MAP.md) owns the Level 0 to Level 4 context cascade and contract routing. [`LEGAL.md`](../../../LEGAL.md) owns draft legal notices and operational covenants. [`docs/research/`](../README.md) stays strictly partitioned away from current executable source truth in [`docs/source/`](../../source/README.md). Active task slices and gate checkpoints live in each sector's `docs/scratch-<sector>/` ledger. [P01, P13, P15, P16]

## T01: Canonical Terminology and Brand Identity

| Term | Source | Meaning |
| :--- | :--- | :--- |
| **Crawler Node** | `src-crawler/` | Compiled headless binary for a VPS (for example Linux). Configured with a coordinator-issued node ID and token. |
| **Coordinator** | `src-worker/` | API-only Cloudflare Worker + D1 orchestrator. Directs the network and serves all versioned HTTP APIs. |
| **Network Package** | `src-worker/packages/network/` | Private internal wire-protocol and pure policy package (`vrc-packages-network`) shared between Coordinator and Crawler Node as a versioned GitHub Release tarball. |
| **Crawler Client** | `src-crawler-client/` | Windows Tauri/Svelte desktop GUI shell. Installs and supervises a Crawler Node runtime, and exposes additional `vrc-packages-api` actions. |
| **SDK** | `src-package/` | Consumer TypeScript client (`vrc-packages-api` / `vrc-packages-api-preview`) for `/v1/operator/`, `/v1/app/`, and `/v1/user/`. |
| **Web** | `src-web/` | Astro/Svelte operator panel, landing page, legal/ToS pages, and registry dashboard. Uses Firebase Auth with Cloudflare. |
| **Web Search** | `src-web-search/` | Astro/Svelte search frontend submodule consuming `vrc-packages-api`. |
| **Legal and Research Corpus** | `LEGAL.md`, `docs/research/` | Legal truth covenants, jurisprudence, market clearance studies, architecture research, audits, and expansion actions kept strictly separate from `docs/source/`. |

**Canonical brand rules** [P02]:
- Canonical brand: **VRC Packages**, abbreviated **VRCP**. `P` stands for Packages.
- Project-owned names must use `VRCP*`, `vrcp-`, `vrcp_`, `vrc-packages*`, or `vrc_packages*`.
- Do not use bare `VRC` or `Vrc` component names. Preserve actual upstream names and repository URLs.
- Exact SDK identifiers: `VRCPackageClient`, `VRCPackageClientOptions`, and `VRCPApiError` (never doubled-P variants).
- Approved crawler bot target: `VRCPDiscoveryBot/{version}`.

## T02: Five Monorepo Responsibility Sectors

The monorepo partitions work into five distinct sectors. Agents must anchor work to one sector at a time, keep edits contained inside their active control sector, and keep product runtime edits, legal research corpus work, and root pipeline edits strictly separate. Each `docs/scratch-<sector>/` folder holds three files (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`), expressing the 5-tier integration cascade (`Tier 1: Truth/Covenants/Legal/Vision` -> `Tier 2: Schemas/Workers/Cloudflare` -> `Tier 3: API/Networking` -> `Tier 4: Crawler Node/Desktop Client` -> `Tier 5: Downstream Web Apps`) as labeled sections inside each `handoff.md`. Downstream sectors read upstream `handoff.md` ledgers to propagate changes; Sector 4 (`pipeline`) oversees all handoffs. [P13, P14, P15, P16, P17]

| Sector | Anchor ID | Owned Paths | Primary Branch(es) | Sector Scratch Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **1. Crawler Network** | `crawler-network` | `src-crawler/`, `src-worker/`, `src-worker/packages/network/` | `preview/crawler-network` | [`docs/scratch-crawler-network/`](../../scratch-crawler-network/IMPLEMENTATION_PLAN.md) |
| **2. Crawler Desktop Client** | `desktop-client` | `src-crawler-client/` | `preview/desktop-client` | [`docs/scratch-desktop-client/`](../../scratch-desktop-client/IMPLEMENTATION_PLAN.md) |
| **3. Consumer API and Web** | `api-web` | `src-package/`, `src-web/`, `src-web-search/` | `preview/workers-api`, `preview/web` | [`docs/scratch-api-web/`](../../scratch-api-web/IMPLEMENTATION_PLAN.md) |
| **4. Root Distribution Pipeline** | `pipeline` | Root `package.json`, `scripts/`, `.github/workflows/`, `config*.versions.json`, `tests/` | `main`, `release/*` | [`docs/scratch-pipeline/`](../../scratch-pipeline/IMPLEMENTATION_PLAN.md) |
| **5. Legal Research and Covenants** | `legal-research` | `LEGAL.md`, `docs/research/` | Feature / `main` | [`docs/scratch-legal-research/`](../../scratch-legal-research/IMPLEMENTATION_PLAN.md) |

There must be no build or test artifacts in the repository root. [P01]

## T03: Component and Sector Responsibilities

**Crawler Node (`src-crawler/`)** [P01, P18, P19]:
1. Poll the coordinator continuously for leased jobs (`/v1/node/jobs/claim`) using tiered recrawl cadences.
2. Accept leased jobs across `tools`, `avatars`, and `assets` under coordinator-assigned capabilities.
3. Crawl only leased jobs under fixed monotonic deadlines and RFC 9309 `robots.txt` preflight rules.
4. Execute discovery drivers across all seven preview pools: `vpm` lead feeds and manifests, `booth`, `gumroad`, `jinxxy`, `itch` tag pages (never `/search`), `shopify` sitemaps, and `github` REST.
5. Treat community `"curated"` lists strictly as discovery leads, never as canonical truth.
6. Run heavy HTML/JSON sanitization locally on the node to offload compute from Coordinator Workers Free limits.
7. Filter results for VRChat relevance, extract tags and avatar compatibility, and run deterministic VPM skeleton, fork, and completeness checks (`unverified` default).
8. Run conditional `304` diffing locally before reporting results as success, rate-limited, or failure via durable SQLite outbox.
9. Never shut down by itself. Survive interruption and coordinator loss (fetching stops whenever no valid lease exists).
10. Log every activity (`[ACTIVITY]`) and discovery finding (`[FINDING]`).
11. Contain all node outputs (`node.db`, `logs/`, `node.stop`, configs) strictly inside `process.cwd()`. [P19]

**Coordinator (`src-worker/`)** [P01, P18]:
1. Register nodes (`vrcp_<64-hex><4-hex>`) and auto-generate capabilities from claimable jobs and demand signals (zero manual capability picking at registration).
2. Schedule centralized origin leases across four priority lanes. Rank (1) fresh VPM manifests and demand signals, (2) discovery roots, (3) storefront metadata and recrawls, (4) custom-domain bulk review.
3. Enforce loose domain-pool steering profiles and origin rate limits with no botnet-like behavior.
4. Ingest reports, triage leads, and hold final verdict on canonical identities served to downstream clients.
5. Keep crawled observations `unverified` by default. Restrict creator-verified status and audited metadata corrections to trusted downstream application attestations (`candidate_status = 'trusted'`, `claims:delegate`).
6. Serve authenticated search, reports, moderation, and reduced unauthenticated index and delta sync feeds.

**Crawler Desktop Client (`src-crawler-client/`)** [P01]:
- Windows GUI installation and supervision of the node runtime, plus consumer SDK actions.

**Web and Web Search (`src-web/`, `src-web-search/`)** [P01]:
- ToS and legal pages, node binary distribution and registry, downstream application registry, database statistics, and public/authenticated search consuming system API endpoints.

**Root Distribution Pipeline (`scripts/`, `.github/workflows/`, root `package.json`)** [P08, P14]:
- Config-driven CalVer/SemVer allocation, changelog snapshotting, dependency synchronization, preview/release tag orchestration, artifact verification, and immutable-source recovery. Kept strictly distinct from product runtime logic.

**Legal Research and Covenants (`LEGAL.md`, `docs/research/`)** [P03, P15]:
- Maintain primary-source legal truth covenants, jurisprudence, age-assurance bounds, platform clearance matrices, and expansion action requirements.
- Keep the research corpus strictly partitioned away from current executable source truth (`docs/source/`) and untouched human wikis (`docs/applications/`).

## T04: Safety, Lease, and Source-Access Boundaries

1. **Leased-only ingestion**: Crawler nodes fetch strictly under unexpired 120s coordinator leases. Coordinator loss halts all fetching (fail closed). There is no coordinator binary inside `src-crawler/`. [P01, P03]
2. **Source access profiles and RFC 9309 robots**: A queued URL does not authorize fetching. Every crawl requires an active loose domain-pool steering profile plus node-delegated RFC 9309 `robots.txt` preflight. Steering profiles define `*.domain-name.root` scope, bounded pagination query patterns, built-in `autoPromote`, retain/publish bounds, origin pacing, and instant kill-switches. Unknown custom domains that fail to prove VRChat relevance park in `source_leads` (`pending_review`) for bulk operator approval or hard suppression. Preview Jinxxy crawling honors RFC 9309 `robots.txt`, polite pacing, and instant kill-switches. Formal Jinxxy permission outreach stays required in Sector 5 before public production launch, because preview testing is not formal clearance. Permanent hard exclusions block VRCArena DOM scraping, itch.io `/search`, binary downloads, auth/CAPTCHA bypasses, and private GitHub repos. [P03, P11, P18]
3. **Credential protection**: Node credentials use capability-encoded tokens stored strictly as SHA-256 hashes. GitHub tokens serve only scoped API requests. Never log or hardcode secrets. [P03]
4. **Provenance and zero binary downloads**: Third-party directories are discovery leads, not canonical authority. Zero executable or archive binary crawling (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`). [P03]
5. **Publication rights and report partitioning**: Enforce `publishClasses` strictly in catalog and delta projections (emit `catalog_tombstones` on withdrawal). Partition `rating_dispute` to `/v1/moderator` and `safety_quarantine` to operators only. [P11, P12]
6. **Three-domain documentation partition**: Keep `docs/source/` (system reliability truth and agreed schemas), `docs/applications/` (untouched human-readable wiki; stage proposals in [`docs/source/reliability/proposed_wiki_changes.md`](../../source/reliability/proposed_wiki_changes.md)), and `docs/research/` (investigative/legal corpus) strictly separate. [P15, P16]

## T05: Cross-Project Dependency Isolation

- Treat each `src-*` folder as an independent project. [P04]
- Never import sibling source or tests through relative paths, path aliases, or symlinks. [P04]
- Consume shared code only as declared distributed dependencies (`vrc-packages-api`, `vrc-packages-network`). A `file:../src-*` link does not prove isolation. [P04]
- Channel separation: Runtime downstream consumers (Crawler Node, Coordinator, Desktop Client, and Web) consume preview SDK (`vrc-packages-api-preview`) while pre-production contracts iterate. Submodule `src-web-search/` stays on release SDK until submodule alignment. Package `vrc-packages-network` uses one single-stream GitHub Release tarball. [P04, P08]

## T06: SDK, Wire Contracts, and Frontend Invariants

- **Strict wire DTOs**: Keep Worker snake-case lead fields without convenience aliases or invented audit reasons. Approval and rejection require explicit caller reasons. [P05]
- **SDK release hold**: Pre-0.1 releases (`v0.0.1+`) are permitted after full package verification. `v0.1.0` remains held for full owner [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review. [P06]
- **Frontend UI discipline**: Interactive UI surfaces in `src-crawler-client/`, `src-web/`, and `src-web-search/` follow [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md) and their local Svelte 5 / `shadcn-svelte` skills. Ask the owner via `ask_question` before inventing new custom UI primitives. [P14]

## T07: Publishing, Branching, and Root Pipeline Separation

- Slices mean local commit. Completed capability gates mean push (unless local-only mode applies). [P07, P08]
- Product sectors submit written Publication Requests strictly inside their own `docs/scratch-<sector>/handoff.md`. **Product and legal sectors must not edit `docs/source/CHANGELOG.md` and do not have the right to clear `verified` rows from their ledgers.** [P17]
- Only Sector 4 (`pipeline`) agents transfer verified product release notes into [`docs/source/CHANGELOG.md`](../../source/CHANGELOG.md), clear transferred `verified` rows across sector ledgers (without product version bumps for non-product sectors), and execute root publication scripts. Root `CHANGELOG.md` and `docs/changelogs/` are generated at publication preparation. Never edit or clear them manually. [P08, P09, P17]
- Hold remote Worker and Crawler preview pushes until local live ingestion, bulk assessment, adversarial tests, and `/untangle-codebase` pass. [P19]
- Preview publishing stays on its current ahead branch without a PR. Release preparation and finalization require clean `main`, an owner-reviewed metadata PR, and protected approvals. Never merge or approve for the owner. [P08, P10]
- Human steps: [`docs/source/PUBLISHING.md`](../../source/PUBLISHING.md). Agent rules: [`AGENT_PUBLISHING_PROCEDURE.md`](AGENT_PUBLISHING_PROCEDURE.md). [P08]
- Never run root-level tests (`bun test ./tests`) unless root tooling (`scripts/`, `tests/`, `package.json`, root configs) changed. [P07]

## T08: Directions Changed or Superseded

| Earlier Direction or Proposal | Current Resolution | Owner Anchor |
| :--- | :--- | :--- |
| Running coordinator inside `src-web/` or a crawler coordinator binary | API-only Cloudflare Worker coordinator lives exclusively in `src-worker/` (`VRCP_D1`); headless node lives exclusively in `src-crawler/`. | P01, P03 |
| Bare `VRC*` / `Vrc*` component names or `VRCPPackageClient` | Use `VRCP*`, `vrcp-`, `vrcp_`, `vrc-packages*`; exact SDK names are `VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`. | P02 |
| Per-slice full test runs and mandatory per-slice pauses | Implement a capability gate before running verification and checkpoints; run root tests only when root tooling changes. | P07 |
| Worker-side direct `robots.txt` fetching | Delegate `robots.txt` preflight fetching to crawler nodes under coordinator leases (`R24-C21`). | P11 |
| Always-on pre-edit guard for every file edit | Thresholded edit-guard: disabled by default; activates at 10+ files OR cross-project contract/wire/schema/legal/pipeline boundary changes. | P14 |
| Storing research inside `docs/scratch/research/` and monolithic `docs/source/` candidate docs | Standalone orthogonal `docs/research/` corpus (`legal/`, `markets/`, `architecture/`, `audits/`, `decisions/`), orthogonal `docs/source/` reliability/schema truth (`schemas/`, `specifications/`, `reliability/`), untouched `docs/applications/` wiki, and five 3-file `docs/scratch-<sector>/` ledgers (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`). | P13, P15, P16, P17 |
| `"curated"` as a catalog ingestion platform | Purge `"curated"` from `PlatformSchema`. Treat community registries strictly as discovery lead feeds. | P18 |
| Manual node capability selection on registration | Coordinator auto-generates node capabilities from claimable jobs and demand signals. Defer manual and dynamic overrides to later gates. | P18 |
| Strict per-URL exact profiles and Coordinator-heavy sanitization | Use loose domain-pool steering profiles (`*.domain-name.root`, pagination patterns, `autoPromote`, kill-switch). Offload parsing, sanitization, VPM quality checks, and `304` diffing to nodes. | P18 |
| Crawler-claimed catalog verification | Crawled observations stay `unverified` by default. Only trusted downstream apps (`claims:delegate`) attest creator verification. | P18 |

## T09: Targeted Context Retrieval

```powershell
# List all truth sections in VISION.md
Select-String -Path docs/research/decisions/VISION.md -Pattern '^## T[0-9]'

# Inspect one truth segment (for example T04 boundaries)
Select-String -Path docs/research/decisions/VISION.md -Pattern '^## T04 ' -Context 0,15

# Locate contract owners in SYSTEM_MAP.md
Select-String -Path docs/source/SYSTEM_MAP.md -Pattern '^## '
```

## T10: Owner Decision Provenance and Coverage

| ID | Provenance Source | Retained Direction |
| :--- | :--- | :--- |
| P01 | `VISION.md` (2026-10-06) | Version 0 purge-not-wrap policy, canonical component terms, responsibilities, and zero root build/test artifacts. |
| P02 | `AGENTS.md` / `R55-NAMING` | Canonical brand VRC Packages (VRCP), exact SDK identifiers, and `VRCPDiscoveryBot/{version}` bot target. |
| P03 | `AGENTS.md` / `LEGAL.md` / `COV-1..3` | Leased-only ingestion, fail-closed coordinator loss, source profiles + RFC 9309 robots, SHA-256 capability tokens, zero binary crawling. |
| P04 | `AGENTS.md` / `R15-C18` / `R28-C22` | Independent `src-*` projects, zero sibling imports or `file:` links, distributed SDK and single-stream network tarball channels. |
| P05 | `AGENTS.md` / `R13-C6` | Strict snake-case lead wire DTOs without convenience aliases or invented audit reasons. |
| P06 | `AGENTS.md` (2026-10-04) | Pre-0.1 SDK releases allowed after artifact verification; `v0.1.0` held for full owner `API_ROUTES.md` review. |
| P07 | `AGENTS.md` (2026-10-04, 2026-10-08) | Gate-level verification before checkpoints; never run root `bun test ./tests` unless root tooling changes. |
| P08 | `AGENTS.md` / `R57-C57A/B` / `R58` | Root delivery command chains, slices=local commit / gates=push, ahead-branch preview publishing, clean-main release PRs, protected approvals. |
| P09 | `AGENTS.md` / Rule 05 / `R60` | Pending notes in `docs/source/CHANGELOG.md`; generated root `CHANGELOG.md` snapshot; selective channel consumption. |
| P10 | `AGENT_PUBLISHING_PROCEDURE.md` | Designated product branches (`preview/crawler-network`, `preview/desktop-client`, `preview/web`, `preview/workers-api`, `release/*`). |
| P11 | `owner_dispositions.md` (`R24-C21`, `R13-C3`, `R13-C9-IDENTITY`) | Delegated robots preflight under leases, strict `publishClasses` enforcement with delist tombstones, high-confidence storefront auto-link. |
| P12 | `owner_dispositions.md` (`R56-C56C`, `R54-C38`) | Report partitioning (`rating_dispute` to moderators, `safety_quarantine` to operators); trusted-app takedown intake with manual review. |
| P13 | Owner Architecture Prompt (2026-11-20) | Extend `VISION.md` and truth sources into a Level 0 to Level 4 cascading context architecture across distinct responsibility sectors. |
| P14 | Owner Governance Prompt (2026-11-20) | Thresholded edit-guard (10+ files or contract/wire/schema/legal/pipeline boundary), master root rules/skills, diversified sector skills, and distinct root distribution pipeline management. |
| P15 | Owner Legal Research Addendum (2026-11-20) | Establish Sector 5 (`legal-research`) for legal truth covenants and expansion actions; strictly partition `docs/research/` away from `docs/source/`. |
| P16 | Owner Restructuring Directives (2026-11-20) | Five `docs/scratch-<sector>/` ledgers; orthogonal rewrite of `docs/research/` (purging raw transcripts and superseded status snapshots) and `docs/source/` (truth for reliability and agreed schemas); keep `docs/applications/` untouched (staging proposals in `docs/source/`) while migrating broken links; retire legacy `docs/scratch/` via Sector 4 pipeline gate (`PIPELINE-SCRATCH-RETIRE`). |
| P17 | Owner Handoff Cascade Directives (2026-11-20) | Add `handoff.md` to every `docs/scratch-<sector>/` folder (strictly 3 files per folder) with labeled 5-tier cascade sections (`Tier 1 Legal/Vision` -> `Tier 2 Worker/Schemas` -> `Tier 3 API/Network` -> `Tier 4 Crawler/Desktop` -> `Tier 5 Web`); enforce strict sector write containment with read-upstream handoff propagation; require written Publication Requests strictly inside each sector's `handoff.md`; grant Sector 4 Pipeline exclusive authority to oversee all handoffs, maintain `docs/source/CHANGELOG.md`, clear verified ledger rows post-transfer, and run root publication scripts. |
| P18 | Owner `/grill-me` Reorientation (2026-11-22) | Adopt VPM-first and VRChat storefront ingestion (`tools`, `avatars`, `assets`) and purge `"curated"` as a catalog platform. Run 7-lane preview discovery with Jinxxy preview robots and Sector 5 permission tracking. Enforce loose domain-pool steering, bulk custom-domain review, priority lanes, coordinator-only node capabilities, and node-offloaded sanitization. Restrict verification attestation to trusted apps, and execute the full 6-stage cascading blueprint workflow (`docs/source/` as next `/grill-me` gate). |
| P19 | Owner Live Lifecycle, Debug, and R&D Directives (2026-11-24 to 2026-11-25) | Enforce strict per-node CWD containment for all outputs, triangulate first-principles OOP/semantic optimizations, run local Coordinator + multi-node live ingestion with bulk data assessment, anti-survivorship-bias funnel attrition audits, and adversarial break-testing (treating initial debugging packets, attrition buckets, and chaos scenarios as non-exhaustive starting suggestions unpacked dynamically during live R&D per [`.agents/rules/02-boundary-and-review.md`](../../../.agents/rules/02-boundary-and-review.md) Section 5), and mandate `/untangle-codebase` before remote preview pushes. |
