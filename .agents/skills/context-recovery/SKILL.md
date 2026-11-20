---
name: context-recovery
description: Strict 5-step recovery procedure to salvage agent context, purge poisoned memory, defeat RAG blind spots, and re-anchor to the VRCP Level 0-4 truth cascade. Use after context compaction, long turns, or detected confusion.
---

# Context Recovery Procedure

Execute this procedure whenever conversational context feels degraded, after a context compaction notice, when resuming after interruption, or when observing conflicting claims between docs, research, and code.

1. **Purge conversational assumptions and inspect physical state**:
   - Discard unverified conversational memory about code, branches, or test results.
   - Run `git status --short`, `git diff --stat`, and `git branch --show-current` to verify physical ground state on disk.
   - Confirm the active sector anchor (`docs/scratch-<sector>/`, or read-only if unanchored).
2. **Re-anchor from the Level 0 to Level 4 truth cascade**:
   - Read `T00` and the relevant `Txx` segment in [`docs/research/decisions/VISION.md`](../../../docs/research/decisions/VISION.md).
   - Read [`docs/source/SYSTEM_MAP.md`](../../../docs/source/SYSTEM_MAP.md) to verify single-owner contracts and keep **research corpus** (`docs/research/`, `LEGAL.md`), **current source truth** (`docs/source/`), and **untouched human wiki** (`docs/applications/`) strictly separate.
   - Read the active 3-file sector ledger (`docs/scratch-<sector>/IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`) plus permitted upstream `handoff.md` ledgers and `docs/scratch-pipeline/handoff.md` notices.
   - Refer back to the original user prompt lineage; never extrapolate beyond accepted owner intent.
3. **Triangulate boundaries (live AST/contracts over decoupled RAG)**:
   - Do not rely on isolated text snippets or summaries.
   - Trace the full chain inside the owning sector:
     - Sector 1 (`crawler-network`): `Entry Point` -> `Coordinator Lease / Profile / Robots` -> `Node Driver / Outbox` -> `D1 / SQLite Storage` -> `Projection`.
     - Sector 2 (`desktop-client`): `Tauri Command / Process` -> `Svelte 5 Store` -> `shadcn-svelte UI` -> `SDK Client`.
     - Sector 3 (`api-web`): `API Route / Worker Handler` -> `SDK Wire DTO` -> `Astro / Svelte Page`.
     - Sector 4 (`pipeline`): `Root package.json` -> `scripts/delivery*.mjs` -> `config*.versions.json` -> `.github/workflows/`.
     - Sector 5 (`legal-research`): `Primary Statute / Platform Policy` -> `docs/research/` -> `LEGAL.md` -> `Runtime Enforcement Gap`.
   - Verify both **inbound callers** and **outbound contracts** for every touched symbol.
4. **Execute an anti-bloat audit**:
   - Check whether a utility, schema, or legal explanation already exists in its single owning record.
   - Prefer simplification, cross-referencing, and deletion over wrappers or duplicated prose.
5. **Emit a ground-truth checkpoint**:
   - State in 5 compact bullets:
     - **Sector Anchor**: active `docs/scratch-<sector>/` (or read-only).
     - **Active Gate and Slice**: exact invariant or deliverable.
     - **Physical Baseline**: branch, modified files, and preserved uncommitted edits.
     - **Triangulated Contract**: verified caller/callee or citation boundary with file paths and line numbers.
     - **Immediate Next Step**: smallest falsifiable check or edit.
