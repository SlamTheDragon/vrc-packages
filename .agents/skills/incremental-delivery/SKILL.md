---
name: incremental-delivery
description: Step-by-step procedural lifecycle for gated, iterative delivery across VRCP's five responsibility sectors using 3-file docs/scratch-* control ledgers (including handoff.md), written Publication Requests, and Pipeline-exclusive changelog transfer and row clearing.
---

# Incremental Delivery Procedure

Execute this 6-step lifecycle on every development, pipeline, or legal-research iteration:

## Step 1: Sector Anchor Verification and Context Capture
1. **Verify sector anchor (read-only default)**: Without an explicit user task scope or sector anchor, remain strictly read-only. Anchor writes to one of the five sectors in [`docs/source/SYSTEM_MAP.md`](../../../docs/source/SYSTEM_MAP.md):
   - `docs/scratch-crawler-network/` (Sector 1: `src-worker/`, `src-worker/packages/network/`, `src-crawler/`)
   - `docs/scratch-desktop-client/` (Sector 2: `src-crawler-client/`)
   - `docs/scratch-api-web/` (Sector 3: `src-package/`, `src-web/`, `src-web-search/`)
   - `docs/scratch-pipeline/` (Sector 4: root `package.json`, `scripts/`, `.github/workflows/`, `tests/`)
   - `docs/scratch-legal-research/` (Sector 5: `LEGAL.md`, `docs/research/`)
2. Read targeted contexts along the Level 0 to Level 4 cascade (`VISION.md` -> `SYSTEM_MAP.md` -> `LEGAL.md` -> active 3-file sector ledger including `handoff.md` + permitted upstream `handoff.md` ledgers -> sector spec -> live source).
3. Keep `docs/applications/` untouched during engineering slices; stage proposed wiki edits in `docs/source/reliability/proposed_wiki_changes.md` for owner review.
4. Record working hypotheses literally in the active `docs/scratch-<sector>/task_tracker.md`.

## Step 2: Prompt Clarification via Question Hooks
1. Identify underspecified requirements, architectural trade-offs, legal expansion bounds, or new UI primitives.
2. Invoke `ask_question` with structured options before drafting the plan.

## Step 3: Sequential Gated Dissection and Sector Implementation Plan
1. Dissect the prompt into bounded slices inside one capability gate and its dependency boundary.
2. **Strict three-file ledger footprint**:
   - Every sector directory `docs/scratch-<sector>/` must contain **strictly three files**: `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, and `handoff.md` (no unmerged plans or auxiliary notes).
   - Preserve legacy root `docs/scratch/` (`IMPLEMENTATION_PLAN.md`, `UNMERGED_IMPLEMENTATION_PLAN.md`, `task_tracker.md`) intact for `tests/preprod_layout.test.ts` and `scripts/delivery.mjs` until Sector 4 `PIPELINE-SCRATCH-RETIRE` completes.
3. Maintain the exact two-table format in `docs/scratch-<sector>/IMPLEMENTATION_PLAN.md`:
   **Task Slices**:
   ```markdown
   | status | ID | problem | related-code(s) | reason | solution | author comments |
   | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
   | open | <slice-id> | <concise problem> | `path/to/file:line` | <root cause> | <concrete fix> | |
   ```
   **Milestone Gates**:
   ```markdown
   | ID | milestone | current results | author comments |
   | :--- | :--- | :--- | :--- |
   | <gate-id> | <milestone name> | <verified metrics / status> | |
   ```
   Allowed `status` values: `open`, `in_progress`, `unverified`, `verified`, `blocked`. Leave `author comments` empty for owner input.

## Step 4: Review Policy and Thresholded Edit-Guard
1. Respect explicit owner holds (SDK `v0.1.0` review, protected release approvals, unresolved legal clearances).
2. If the task edits/creates **10 or more files** OR modifies any **cross-project contract, wire protocol, schema, legal covenant (`LEGAL.md`), or root pipeline boundary (`scripts/`, `.github/workflows/`)**, submit the plan to `edit-guard` under Rule 06 and require `[PERMITTED]` before editing.
3. During review pauses or while awaiting subagents, yield control cleanly (zero standby loops).

## Step 5: Slice Execution, Local Commits, and Gate Verification
1. Extract one bounded slice from `docs/scratch-<sector>/IMPLEMENTATION_PLAN.md` and update `docs/scratch-<sector>/task_tracker.md`.
2. **Slices mean local commit; completed gates mean push** (local-only session rules override pushes). Preserve unrelated edits.
3. Run the owning sector's domain verification suite at the gate checkpoint (never run root `bun test ./tests` unless Sector 4 root tooling changed).
4. For product behavior or contract changes, record outbound tier contracts and a **written Publication Request** (including factual ASD-STE100 draft release notes, target product, channel, producer prerequisites, verification proof, and source slice IDs) strictly inside your own `docs/scratch-<sector>/handoff.md`. Do not edit `docs/source/CHANGELOG.md` directly and do not request product bumps for documentation-only, `.agents/`-only, or legal-research-only gates.

## Step 6: Handoff Recording and Pipeline-Exclusive Ledger Clearing
1. After a slice or gate passes verification, mark the slice `verified` in `docs/scratch-<sector>/IMPLEMENTATION_PLAN.md` and `task_tracker.md`, record outbound tier handoffs and any Publication / Ledger-Clearance Request in `docs/scratch-<sector>/handoff.md`, and keep all edits contained inside your own sector.
2. **Product and legal sectors do not have the right to clear or delete verified rows from their ledgers.** Only Sector 4 (`pipeline`) agents sweep sector `handoff.md` ledgers, transfer verified product release notes into `docs/source/CHANGELOG.md` (keeping it tidy in ASD-STE100), clear the transferred `verified` rows across sector ledgers (without version bumps for non-product sectors), and run root publication scripts.
3. Re-read any new `author comments`; treat owner questions as clarification required, not approval.
