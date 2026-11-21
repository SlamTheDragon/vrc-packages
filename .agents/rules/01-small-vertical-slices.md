---
trigger: always_on
description: "Enforce the 5-sector slice and gating iterative lifecycle, ledger footprint limits, commit/push discipline, and publishing boundaries."
---

# 01: Sequence the Work (Iterative Slice and Gating Lifecycle)

1. **Verify sector anchor and understand the codebase**:
   - Confirm the active responsibility sector (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, or `legal-research`) before editing.
   - Read targeted contexts along the truth cascade (`VISION.md` -> `SYSTEM_MAP.md` -> `LEGAL.md` -> sector spec -> live source) and record working hypotheses in the active `task_tracker.md`.
2. **Clarify ambiguity with question hooks**:
   - Clarify underspecified requirements, architectural trade-offs, legal expansion boundaries, or UI primitive additions via `ask_question` before drafting implementation plans.
3. **Produce sequential gated iterations**:
   - Dissect work into bounded slices inside one capability gate and its dependency boundary.
   - Maintain the two-table ledger schema:
     - **Task slices**: `| status | ID | problem | related-code(s) | reason | solution | author comments |`
     - **Milestone gates**: `| ID | milestone | current results | author comments |`
     - Leave `author comments` blank for owner input unless populated via explicit `ask_question` decisions.
   - **Three-file scratch footprint (`handoff.md` integration ledger)**:
     - Every sector-anchored `docs/scratch-<sector>/` directory (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, `legal-research`) must contain strictly three files: `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, and `handoff.md`.
     - Express the 5-tier handoff cascade as labeled tier sections inside each `handoff.md`. Downstream sectors read upstream `handoff.md` files to propagate changes without editing upstream sectors.
4. **Pause policy and owner holds**:
   - Defer routine review pauses within granted lifecycle authority, but strictly preserve explicit owner holds (including SDK `v0.1.0` API review, protected release approvals, and unresolved legal/security contracts).
5. **Execute slices and gate checkpoints**:
   - **Slices mean local commit; completed capability gates mean push** (session-specific local-only rules override pushes).
   - Preserve unrelated owner edits. Commit only the active slice's files unless a combined checkpoint is explicitly requested.
   - Operate on designated sector branches:
     - `main`: production / releases (clean tree required)
     - `preview/crawler-network`: `src-worker/`, `src-crawler/`, `src-worker/packages/network/`
     - `preview/desktop-client`: `src-crawler-client/`
     - `preview/web`: `src-web/`, `src-web-search/`
     - `preview/workers-api`: `src-package/`
     - `release/patch/*` and `release/candidate/*`: short-lived release branches
   - Implement the capability gate or related gate group before running verification checks and checkpoint write-ups. Keep incomplete changes marked `unverified`.
   - Never disable branch protection, add bypasses, force-push `main`, or merge/approve PRs on the owner's behalf.
6. **Pull-only publication requests and Pipeline-exclusive changelog/publishing (R57-C57B)**:
   - Product and legal sectors (`crawler-network`, `desktop-client`, `api-web`, `legal-research`) **must not** directly edit `docs/source/CHANGELOG.md` and **must not** run root `bun run publish:*` scripts directly.
   - Instead, upon gate verification, product sectors submit a **written Publication Request** strictly inside their own `docs/scratch-<sector>/handoff.md` (target product, channel, producer prerequisites, factual ASD-STE100 draft release notes, verification proof, and source slice IDs).
   - **Sector 4 (`pipeline`) agents** sweep all sector `handoff.md` ledgers, transfer verified product notes into `docs/source/CHANGELOG.md`, keep `docs/source/CHANGELOG.md` tidy, and execute root publication routines. Publication tooling snapshots `docs/source/CHANGELOG.md` to root `CHANGELOG.md` and appends consumed notes into `docs/changelogs/`.
   - Publish only products whose delivered behavior or contracts changed, in strict producer-before-consumer order (`src-package` -> `src-worker/packages/network` -> dependent services/apps). Keep channels explicit: runtime downstream consumers (Crawler Node, Coordinator, Desktop Client, and Web) consume preview SDK (`vrc-packages-api-preview`) while pre-production contracts iterate; `vrc-packages-network` uses one single-stream archive.
   - Do not publish a product or add product changelog entries for documentation-only, governance-only, or legal-research-only gates. Follow `docs/research/decisions/AGENT_PUBLISHING_PROCEDURE.md` (agent) and `docs/source/PUBLISHING.md` (human).
7. **Reconcile and Pipeline-exclusive ledger row clearing**:
   - Product and legal sectors mark completed slices `verified` in `IMPLEMENTATION_PLAN.md` and `task_tracker.md` and log outbound handoffs or Publication Requests in `handoff.md`. **Product and legal sectors do not have the right to clear or delete rows in their ledgers.**
   - **Only Sector 4 (`pipeline`) agents** may clear or delete `verified` rows from any sector's `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or `handoff.md`, strictly after transferring verified product notes to `docs/source/CHANGELOG.md` (or auditing non-product closure without version bumps).
   - If the owner asks a question in `author comments`, treat it as clarification required, not approval.
