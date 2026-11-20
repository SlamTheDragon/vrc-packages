# VRC Packages (VRCP): Agent Entry Point (Version 0 Pre-Production)

This is the Level 0 entry point for agents working in the `vrc-packages` monorepo. [`DELEGATES.md`](DELEGATES.md) is the operational runbook for downstream developers and node operators.

## 1. Authoritative Truth Cascade (Read Before Changing Code)

Follow this cascade from top to bottom and read only the branch required for your active sector:

1. **Owner Intent and Terms**: Read `T00` and the task-relevant `Txx` section of [`docs/research/decisions/VISION.md`](docs/research/decisions/VISION.md).
2. **System Routing and Sector Map**: Read [`docs/source/SYSTEM_MAP.md`](docs/source/SYSTEM_MAP.md) to select the single owning sector, contract owner, and verification commands.
3. **Legal and Platform Boundaries**: Read [`LEGAL.md`](LEGAL.md) before modifying crawler access, provenance, retention, takedowns, or public API surfaces.
4. **Sector Control Ledgers and Handoff Cascade**: Read the active 3-file anchored ledger in `docs/scratch-<sector>/` (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`) plus permitted upstream `handoff.md` ledgers.
5. **Sector Rules and Local Context**: Follow [`.agents/README.md`](.agents/README.md) and `.agents/rules/` (`00` through `09`), then read the owning sector `AGENTS.md` and local `.agents/skills/` before editing code.

Treat summaries, filenames, and earlier success reports as leads until verified against live source, tests, or primary legal citations.

## 2. Five Monorepo Responsibility Sectors

| Sector | Owned Paths | Primary Branch(es) | Sector Scratch Anchor |
| :--- | :--- | :--- | :--- |
| **1. Crawler Network** | `src-worker/`, `src-worker/packages/network/`, `src-crawler/` | `preview/crawler-network` | [`docs/scratch-crawler-network/`](docs/scratch-crawler-network/IMPLEMENTATION_PLAN.md) |
| **2. Crawler Desktop Client** | `src-crawler-client/` | `preview/desktop-client` | [`docs/scratch-desktop-client/`](docs/scratch-desktop-client/IMPLEMENTATION_PLAN.md) |
| **3. Consumer API and Web** | `src-package/`, `src-web/`, `src-web-search/` | `preview/workers-api`, `preview/web` | [`docs/scratch-api-web/`](docs/scratch-api-web/IMPLEMENTATION_PLAN.md) |
| **4. Root Distribution Pipeline** | Root `package.json`, `scripts/`, `.github/workflows/`, `config*.versions.json`, `tests/` | `main`, `release/*` | [`docs/scratch-pipeline/`](docs/scratch-pipeline/IMPLEMENTATION_PLAN.md) |
| **5. Legal Research and Covenants** | `LEGAL.md`, `docs/research/` | Feature / `main` | [`docs/scratch-legal-research/`](docs/scratch-legal-research/IMPLEMENTATION_PLAN.md) |

Keep **Sector 4 (Root Distribution Pipeline)** and **Sector 5 (Legal Research and Covenants)** strictly distinct from product runtime slices:
- Never run root-level tests (`bun test ./tests`) unless root tooling (`scripts/`, `tests/`, `package.json`, root configs) changes. Product-scoped work runs only its own domain test and typecheck suite.
- Maintain the **Three-Domain Documentation Partition**:
  - **`docs/source/`**: Authoritative truth for system reliability and agreed schemas (`schemas/`, `specifications/`, `reliability/`, `SYSTEM_MAP.md`, `PUBLISHING.md`, `CHANGELOG.md`).
  - **`docs/applications/`**: Human-readable wiki documentation. **Keep `docs/applications/` untouched**; stage proposed updates in [`docs/source/reliability/proposed_wiki_changes.md`](docs/source/reliability/proposed_wiki_changes.md) until owner approval.
  - **`docs/research/`** + **`LEGAL.md`**: Investigative legal/market/architecture research corpus. Never present research findings as implemented runtime state or source-access clearance.

## 3. Workspace Anchoring, Departmental Handoff Cascade, and Read-Only Default

- **Read-only default**: Without an explicit task scope or sector anchor from the user, agents inspect, search, and answer questions only; do not create, edit, or delete files.
- **Strict three-file sector ledger footprint**: Each `docs/scratch-<sector>/` directory holds strictly `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, and `handoff.md`.
- **Cascading department hierarchy**: Integration flows strictly downward across labeled tier sections inside each `handoff.md`: `Tier 1 (Truth, Covenants, Legal, Vision)` -> `Tier 2 (Schemas, Workers, Cloudflare)` -> `Tier 3 (API and Networking: 3A Network / 3B SDK)` -> `Tier 4 (4A Crawler Node / 4B Desktop Client)` -> `Tier 5 (Downstream Web Apps)`.
- **Write containment and read-upstream**: Each sector agent edits strictly inside its own sector and may read upstream `handoff.md` ledgers (plus `docs/scratch-pipeline/handoff.md` notices) to propagate changes into its own system without editing upstream sectors.
- **Pipeline-exclusive changelog stewardship and ledger clearing**: Product and legal sectors submit written Publication / Ledger-Clearance Requests strictly inside their own `handoff.md`. **Product and legal sectors must not edit `docs/source/CHANGELOG.md` and do not have the right to clear `verified` rows from their ledgers.** Only Sector 4 (`pipeline`) agents oversee all `handoff.md` ledgers, transfer verified product notes into `docs/source/CHANGELOG.md`, clear transferred `verified` rows across sector ledgers (without product version bumps for non-product sectors), and execute root publication routines.

## 4. Non-Negotiable Architecture and Safety Boundaries

- **Topology**: The API-only Cloudflare Worker coordinator lives in `src-worker/src/` (`worker_entry.ts`, D1 binding `VRCP_D1`, DDL in `src-worker/src/storage/d1/utils.ts`). The headless crawler node lives in `src-crawler/src/` (`main.ts`). There is no coordinator binary. Nodes and apps communicate with the coordinator only via versioned HTTP payloads.
- **Cross-project isolation**: Treat every `src-*` folder as an independent project. Never import sibling source or tests through relative paths, aliases, or symlinks. Consume reused code only as declared distributed packages (`vrc-packages-api`, `vrc-packages-network`). A `file:../src-*` link does not prove isolation.
- **Leased-only ingestion**: Crawler nodes fetch strictly under unexpired 120s coordinator leases (`/v1/node/jobs/claim`). Coordinator loss halts all fetching (fail closed).
- **Source access profiles and RFC 9309 robots**: A queued URL does not authorize fetching. Every job requires an active scoped `SourceAccessProfile` and RFC 9309 `robots.txt` compliance (delegated to nodes under leases).
- **Credential protection**: Node tokens use `vrcp_<64-hex><4-hex>` stored strictly as SHA-256 hashes. GitHub tokens serve only scoped API requests. Never log or hardcode secrets.
- **Provenance and zero binary downloads**: Third-party directories are discovery leads, not canonical authority. Zero executable or archive binary crawling (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`).
- **Canonical brand**: **VRC Packages**, abbreviated **VRCP**. Use `VRCP*`, `vrcp-`, `vrcp_`, `vrc-packages*`, or `vrc_packages*`. Never use bare `VRC`/`Vrc` component names. Exact SDK names: `VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`. Approved bot target: `VRCPDiscoveryBot/{version}`.
- **Strict wire DTOs and SDK release hold**: Keep Worker snake-case lead fields without convenience aliases or invented audit reasons. Pre-0.1 SDK releases (`v0.0.1+`) are permitted after artifact verification; `v0.1.0` remains held for full owner [`API_ROUTES.md`](docs/applications/VRCP%20API/API_ROUTES.md) review.

## 5. Edit-Guard, Gate Verification, and Standby-Loop Prevention

- **Edit-guard policy (Rule 06)**: Disabled by default for localized edits. Activates when a task edits/creates **10 or more files** OR modifies any **cross-project contract, wire protocol, schema, legal covenant, or root pipeline boundary** (`src-worker/packages/network/`, `src-package/` public wire types, D1/SQLite schemas, `LEGAL.md`, `scripts/`, `.github/workflows/`).
- **Gate discipline**: Slices mean local commit. Completed capability gates mean push. Implement the capability gate or related gate group before running verification and checkpoints; mark incomplete work `unverified`.
- **Zero standby loops**: Never busy-poll `manage_task`, `manage_subagents`, empty queues, or dummy shell sleeps. When waiting for asynchronous subagents, background tasks, or user input, end your turn and yield cleanly for reactive wakeup.

## 6. Publishing Discipline

- Product sectors record verified Publication Requests strictly inside their own `docs/scratch-<sector>/handoff.md`. Only Sector 4 (`pipeline`) agents transfer verified product release notes into [`docs/source/CHANGELOG.md`](docs/source/CHANGELOG.md), clear transferred `verified` ledger rows, and run root publication scripts. Root `CHANGELOG.md` and `docs/changelogs/` are generated at publication preparation; never edit or clear them manually.
- Preview publishing stays on its current ahead branch without a PR. Release preparation and finalization require clean `main`, an owner-reviewed metadata PR, and protected approvals. Never disable protection, force-push `main`, or merge/approve for the owner.
- Reruns execute the frozen tagged commit (transient failures only). Code fixes require tag reversion (`bun run recovery:revert-tag <tag> --remote`) or a patch branch (`bun run recovery:patch <product> <version>`).
- Human operations: [`docs/source/PUBLISHING.md`](docs/source/PUBLISHING.md). Agent rules: [`docs/research/decisions/AGENT_PUBLISHING_PROCEDURE.md`](docs/research/decisions/AGENT_PUBLISHING_PROCEDURE.md).
