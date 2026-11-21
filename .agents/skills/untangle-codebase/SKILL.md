---
name: untangle-codebase
description: Untangle coupled code, implicit state machines, duplicated contracts, or tangled documentation in one structured pass across a VRCP monorepo sector so agents read less, break less, and navigate faster.
disable-model-invocation: true
argument-hint: "[sector or concern to focus on]"
---

# Untangle Codebase and Monorepo Contracts

Run a systematic structural refactor inside a single bounded sector (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, or `legal-research`) and complete it end to end.

**Why do this?**
- **Fewer silent breaks**: Shared wire contracts, D1 schemas, and legal covenants stay consistent when each has one owning record.
- **Lower context cost**: Agents read focused, single-purpose modules instead of tracing scattered helpers and duplicated prose.
- **Strict sector isolation**: Removes implicit coupling across `src-*` projects, research corpus files, and root delivery scripts.

## 1. Ask Before Optional Cleanup

Before editing, clarify optional maintenance scope with the user via `ask_question`:

| Addition | What It Does |
| :--- | :--- |
| **Comments and Prose Slop** | Remove redundant commentary or filler prose that only restates symbols, headings, or schemas. |
| **Verification and Fixture Cleanup** | Remove dead helper scripts or obsolete test mocks, and repair brittle checks without weakening assertions. |

Execute only the additions the owner approves.

## 2. List Every Structural Problem (Read-Only Pass)

Do not edit files yet. Inspect the target sector asking one question: **should these pieces change together?** Record every instance of four defect classes:

### Hidden Links
Pieces that must change together where the layout hides the dependency:
- **Duplicated constants or schemas**: Wire fields, capability token regexes, or D1 table definitions copied across `src-worker/`, `src-crawler/`, `src-package/`, or `docs/source/schemas/coordinator_d1.md`.
- **Implicit state machines**: Multi-field boolean or string flags representing job lease states, outbox settlement states, or publication stages without explicit typed state transitions.
- **Duplicated legal/platform claims**: Clearance rules or statutory thresholds copied across `LEGAL.md`, `docs/research/markets/`, and `docs/source/` without linking to one owning record.

### Needless Links
Pieces coupled together that change for different reasons:
- **Cross-project sibling imports**: Any relative import, alias, or `file:../src-*` link bypassing `vrc-packages-api` or `vrc-packages-network`.
- **Research mixed into current source truth**: Speculative legal or market expansion notes embedded inside `docs/source/` instead of the research corpus.
- **Pipeline mixed into product runtime**: Root publishing or versioning logic duplicated inside a `src-*` package instead of forwarding to root `package.json`.

### Surplus
Pieces with no independent reason to exist:
- Synthetic forwarding wrappers or compatibility shims (Version 0 purges superseded code instead of wrapping it).
- Cross-directory megabarrels (note: `shadcn-svelte` per-component folder barrels in `src-crawler-client/src/lib/components/ui/<component>/index.ts` are intentional and must be preserved).
- Dead files, stale drafts, or restated summaries.

### Special Cases
Ad-hoc workarounds or unverified fallbacks added instead of fixing the governing invariant (for example silent timestamp substitutions or swallowed preview test failures).

## 3. Redesign From First Principles

**IMPORTANT**
Research first principles of applicable system architecture types and designs (OOP, functional, etc.). Plan semantic abstractable areas and control areas before executing a refactor.

Design the fix as if the sector had known today's requirements from the start:
- Do pieces that change together live in the same owning module or document?
- Are independent sectors decoupled along package and HTTP boundaries?
- Does every consumer depend on a more stable owning contract (`docs/source/SYSTEM_MAP.md`)?

Write a compact decision log mapping each proposed fix to the exact defects it eliminates. If the refactor touches 10 or more files OR crosses a contract/wire/schema/legal/pipeline boundary, submit the plan to `edit-guard` under Rule 06 before editing.

## 4. Apply Fixes Cleanly

- Purge superseded wrappers and consolidate duplicated truths into their single owning record.
- Replace copied prose with portable repository-relative Markdown links (`[SYSTEM_MAP.md](../../../docs/source/SYSTEM_MAP.md)`).
- Keep Sector 4 (`pipeline`) and Sector 5 (`legal-research`) cleanly isolated from runtime sectors.

## 5. Verify and Audit

1. Run the owning sector's domain verification suite (`docs/source/SYSTEM_MAP.md` table). Run root `bun test ./tests` ONLY if Sector 4 root tooling changed.
2. Run link validation:
   ```powershell
   bun .agents/scripts/check_doc_links.ts
   ```
3. Confirm every constant, schema, wire contract, and legal covenant has **one owning record** with zero broken links.
4. For large cross-sector refactors, invoke a dedicated Tier 2 reviewer subagent via `.agents/skills/delegation/SKILL.md` to audit the final diff independently.
