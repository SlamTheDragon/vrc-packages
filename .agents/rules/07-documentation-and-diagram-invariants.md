---
trigger: always_on
description: "Documentation domain separation (research corpus vs current source truth), Markdown table, Mermaid diagram, KaTeX, and link invariants."
---

# 07: Documentation, Research Partition, Diagram, and Table Invariants

1. **Strict three-domain documentation separation**:
   - Partition documentation into orthogonal domains with single ownership:
     - **Current source truth (`docs/source/`)**: Verified system reliability truth and agreed schemas for usage (`schemas/`, `specifications/`, `reliability/`, `SYSTEM_MAP.md`, `PUBLISHING.md`, `CHANGELOG.md`).
     - **Human application wiki (`docs/applications/`)**: Human-readable end-user and API wiki. **Keep untouched** during engineering work; stage proposed updates in `docs/source/reliability/proposed_wiki_changes.md` until owner approval.
     - **Research corpus (`docs/research/` paired with `LEGAL.md`)**: Legal truth covenants (`legal/`), platform clearance studies (`markets/`), exploratory architecture (`architecture/`), audits (`audits/`), and retained owner decisions (`decisions/`).
     - **Sector control ledgers (`docs/scratch-<sector>/`)**: Strictly two files (`IMPLEMENTATION_PLAN.md` and `task_tracker.md`) per sector for active slice execution and milestone gating.
     - **Automated archives (`docs/changelogs/` and root `CHANGELOG.md`)**: Managed exclusively by root delivery scripts.
   - Never place speculative legal analyses, market clearance hypotheses, or expansion proposals inside `docs/source/` as current behavior.
   - Never duplicate explanatory prose across domains. Give each contract or legal analysis one owning file and cross-reference it with repository-relative Markdown links.
2. **Tabular formatting invariant (Markdown tables over raw ASCII blocks)**:
   - Render all structured matrices, route catalogs, sector tables, schema comparisons, and platform clearance tables as standard GitHub-Flavored Markdown tables with explicit alignment (`| :--- | :---: | ---: |`).
   - Do not embed tabular data inside raw monospaced ASCII code blocks when a GFM table or Mermaid diagram represents it cleanly.
3. **Mermaid diagram syntax invariants**:
   - Use only supported diagram types: `flowchart TD`/`LR`, `graph TD`/`LR`, `sequenceDiagram`, `stateDiagram-v2`/`stateDiagram`, `classDiagram`, `erDiagram`, `xychart-beta`.
   - **Mandatory quoted node labels**: Enclose any node label containing punctuation, parentheses, brackets, colons, slashes, or special characters in double quotes (for example `L0["Level 0: AGENTS.md (Owner Intent)"]`).
   - Do not place raw HTML tags (`<br>`, `<span>`, `<b>`) inside Mermaid labels.
4. **KaTeX mathematical notation invariants**:
   - Format multi-term equations and complexity expressions in KaTeX-compliant LaTeX (`$...$` inline, `$$...$$` display on its own line).
   - Escape literal currency dollar signs in prose as `\$`. Use backticks for shell variables (`$HOME`), file paths, flags, and identifiers.
5. **Portable repository-relative Markdown links**:
   - Use portable repository-relative Markdown links with forward slashes inside all repository documentation (for example `[SYSTEM_MAP.md](../../docs/source/SYSTEM_MAP.md)`).
   - Absolute machine-specific `file:///` URLs and Windows backslashes (`\`) are prohibited inside repository Markdown files.
   - Verify all links with `bun .agents/scripts/check_doc_links.ts` after documentation or governance edits.
