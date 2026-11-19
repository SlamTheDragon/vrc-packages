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
   - **Minimal scratch footprint**:
     - Every sector-anchored `docs/scratch-<sector>/` directory (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, `legal-research`) must contain strictly two files: `IMPLEMENTATION_PLAN.md` and `task_tracker.md`.
     - Legacy root `docs/scratch/` remains intact strictly for `scripts/delivery.mjs` and `tests/preprod_layout.test.ts` until Sector 4 `PIPELINE-SCRATCH-RETIRE` completes.
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
6. **Publishing discipline at capability milestones (R57-C57B)**:
   - Record pending product release notes only in `docs/source/CHANGELOG.md`. Publication tooling snapshots the source to root `CHANGELOG.md` and consumes only the selected product/channel.
   - Publish only products whose delivered behavior or contracts changed. Check producer dependencies first (`src-package` -> `src-worker/packages/network` -> dependent services/apps).
   - Keep channels separate: Crawler Node and Coordinator consume preview SDK; Desktop Client and Web consume release SDK; `vrc-packages-network` uses one single-stream archive.
   - Do not publish a product for documentation-only, governance-only, or legal-research-only gates. Follow `docs/research/decisions/AGENT_PUBLISHING_PROCEDURE.md` (agent) and `docs/source/PUBLISHING.md` (human).
7. **Reconcile, offload, and compact**:
   - Once a slice or gate passes verification, record product-facing notes in `docs/source/CHANGELOG.md` and retire/delete verified rows from active sector scratchpads to prevent ledger bloat.
   - If the owner asks a question in `author comments`, treat it as clarification required, not approval.
