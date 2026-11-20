---
trigger: always_on
description: "Mitigate the 3 pillars of AI failure (quadratic context limits, sparse attention, decoupled RAG) and resist Jevons Paradox bloat."
---

# 04: Preserve Context Fidelity, Bridge Sparse Attention, and Resist Bloat

1. **Pillar 1: Context budgeting and bounded tool exposure ($O(n^2)$ scaling)**:
   - Do not dump entire large files or multi-page command outputs into the context window. Use bounded line ranges (`read_file` with `StartLine`/`EndLine`) and targeted symbol/pattern searches.
   - Indiscriminate context consumption accelerates quadratic token compaction, degrades attention density, and causes forgetting of early project constraints and owner directives.
2. **Pillar 2: Bridge sparse attention and verify cross-sector connections**:
   - Transformer attention weakens across long contexts. Do not assume implicit tracking of distant callers, shared wire types, D1 schema columns, or cross-sector contracts.
   - Trace cross-boundary invariants deterministically: verify inbound callers, outbound dependencies, and shared schema contracts explicitly before modifying shared symbols.
   - Enforce integration boundaries with executable cross-module tests and link audits (`bun .agents/scripts/check_doc_links.ts`) rather than assuming isolated edits keep the monorepo coherent.
3. **Pillar 3: Triangulate against decoupled RAG and indexing blind spots**:
   - Never treat an isolated search hit, doc summary, or embedding snippet as self-evident truth. A decoupled chunk lacks AST semantics, call hierarchies, and runtime wiring.
   - Triangulate retrieved snippets in both directions: caller <-> callee <-> live test fixture (or statutory citation <-> `LEGAL.md` <-> runtime enforcement). Runnable code and tests describe current behavior; `VISION.md` and direct user instructions govern intent.
4. **Economic trap: Resist Jevons Paradox and software/doc bloat**:
   - Cheap code and text generation must not produce bloated architectures or repetitious prose. Never add synthetic wrappers, duplicate helpers, speculative abstractions, or parallel files when an existing module or single-owner document suffices.
   - Actively prefer **simplification, refactoring, and deletion** over adding compensatory layers. Every new symbol or duplicated paragraph adds permanent context tax.
5. **Operational discipline: Externalize state, anchor to prompt lineage, and Pipeline-only ledger clearing**:
   - Never trust conversational memory across turns for critical decisions, wire schemas, active task ledgers, or dependency maps. Always refer to the original user prompt lineage and disk state.
   - Re-anchor from disk at the start of each slice (`VISION.md` -> `SYSTEM_MAP.md` -> active sector `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, and `handoff.md` + permitted upstream `handoff.md` files).
   - Product and legal sectors mark completed work `verified` and record written Publication / Ledger-Clearance Requests in their own `handoff.md`. **Only Sector 4 (`pipeline`) agents transfer verified product notes to `docs/source/CHANGELOG.md` and clear verified rows from sector ledgers** to prevent drift and ledger bloat.
