---
name: codebase-orientation
description: Maps the five VRCP monorepo sectors, truth-source cascade, active docs/scratch-* control ledgers, conflicting docs, and live source paths before design, legal research, or code work. Use at the start of a gate or after context loss.
---

# Codebase and Sector Orientation Procedure

1. **Verify workspace anchor (read-only default)**:
   - Without an explicit task scope or sector anchor from the user, remain in read-only mode. Do not create, edit, or delete files.
   - Select the single owning responsibility sector from [`docs/source/SYSTEM_MAP.md`](../../../docs/source/SYSTEM_MAP.md):
     - `crawler-network` (`docs/scratch-crawler-network/`, `src-worker/`, `src-worker/packages/network/`, `src-crawler/`)
     - `desktop-client` (`docs/scratch-desktop-client/`, `src-crawler-client/`)
     - `api-web` (`docs/scratch-api-web/`, `src-package/`, `src-web/`, `src-web-search/`)
     - `pipeline` (`docs/scratch-pipeline/`, root `package.json`, `scripts/`, `.github/workflows/`, `tests/`)
     - `legal-research` (`docs/scratch-legal-research/`, `LEGAL.md`, `docs/research/`)
2. **Follow the Level 0 to Level 4 truth cascade**:
   - Read `T00` and the relevant `Txx` segment in [`docs/research/decisions/VISION.md`](../../../docs/research/decisions/VISION.md).
   - Read [`docs/source/SYSTEM_MAP.md`](../../../docs/source/SYSTEM_MAP.md) and [`LEGAL.md`](../../../LEGAL.md) (when touching crawling, platforms, data, or APIs).
   - Read the active anchored ledger (`docs/scratch-<sector>/IMPLEMENTATION_PLAN.md` and `task_tracker.md`).
   - Separate **owner intent** (`VISION.md`), **research corpus** (`docs/research/` + `LEGAL.md`), **current source truth** (`docs/source/` for reliability & agreed schemas), **untouched human wiki** (`docs/applications/`), and **measured conformance** (executable code and tests).
3. **Inspect physical repository state**:
   - Run `git status --short` and `git branch --show-current`. Assume uncommitted changes belong to the owner or earlier work. Do not overwrite them.
4. **Build a live bounded path map**:
   - Inspect the owning sector `AGENTS.md` and local `.agents/skills/`.
   - Use targeted file listings and symbol searches (`Select-String` / `rg`) to read entry points, schemas, adapters, storage, and tests for the active slice. Check both callers and downstream consumers.
5. **Capture hypotheses and emit a truth table**:
   - Record working hypotheses in the active `docs/scratch-<sector>/task_tracker.md` (when anchored for writes).
   - Emit a compact truth table: claimed behavior or legal rule, code/citation evidence, test evidence, contradiction/open question, and next smallest check. Cite exact file paths and line numbers.
6. **Bound the slice**:
   - Stop discovery once the slice's dependency boundary is clear. Queue unrelated findings in the owning sector's `IMPLEMENTATION_PLAN.md` instead of expanding scope.
