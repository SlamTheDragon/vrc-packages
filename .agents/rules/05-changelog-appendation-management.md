---
trigger: always_on
description: "Maintain pending multi-product changelog notes in docs/source/CHANGELOG.md and preserve generated root publication snapshots."
---

# 05: Changelog Appendation and Channel Management

1. **Pipeline-exclusive write stewardship and target file isolation**:
   - **Only Sector 4 (`pipeline`) agents** may edit `docs/source/CHANGELOG.md` and keep it tidy.
   - Product and legal sectors (`crawler-network`, `desktop-client`, `api-web`, `legal-research`) **must not** directly edit `docs/source/CHANGELOG.md` and **must not** clear or delete `verified` rows from their own `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or `handoff.md` ledgers.
   - Instead, product sectors submit a written **Publication Request** (with factual ASD-STE100 draft release notes, target product, channel, producer prerequisites, verification proof, and source slice IDs) strictly inside their own `docs/scratch-<sector>/handoff.md`.
   - Sector 4 (`pipeline`) agents sweep sector `handoff.md` Publication Requests, transfer verified product notes into `docs/source/CHANGELOG.md`, and **only then** clear the transferred `verified` rows from the originating sector's ledgers. For non-product sectors (such as Sector 5 `legal-research` or doc/governance-only slices), Pipeline clears verified rows without adding product changelog entries or bumping versions.
   - Root `CHANGELOG.md` is the last generated publication snapshot produced by `scripts/changelog.mjs`. Do not edit or clear root `CHANGELOG.md` manually.
   - Do not inspect or modify files in `docs/changelogs/` or product changelog archives; these paths are automated by root delivery tooling.
   - Stop changelog searches after locating the target source section.
2. **Locked structure preservation**:
   - Obey the locked header comment at the top of `docs/source/CHANGELOG.md`.
   - Do not modify top-level titles, Table of Contents entries, anchor targets, heading order, or navigation links.
   - Record changes as bullet points with bold feature prefixes under standard subsections (`### Added`, `### Bugs Fixed`, `### Changes`). Preserve empty category headings.
   - Update `<!-- MASTER_SUMMARY -->` and the matching `<!-- <component>-DESCRIPTION_SUMMARY -->` blocks strictly inside their existing comment delimiters.
3. **Channel and product scoping**:
   - Identify the target channel (`Release` or `Preview`) and exact component subsection before editing:
     - Applications: `vrcp-crawler-client`, `vrcp-crawler-node`, or `vrcp-packages-api`.
     - Internal services: `vrcp-web` or `vrcp-worker`.
     - Internal packages: `vrcp-packages-network`.
   - Do not record documentation-only, `.agents/` governance-only, or legal-research-only edits under product publication channels unless runtime or package behavior changed.
4. **Simplified Technical English (ASD-STE100) compliance**:
   - Apply `.agents/skills/ste-writing-skill/SKILL.md` and `.agents/skills/ste-recurring-errors/SKILL.md` when authoring changelog notes.
   - Use active voice, simple tenses, and short sentences (maximum 20 words for instructions, maximum 25 words for descriptions).
   - Do not use em-dashes in prose (use colons, parentheses, or periods). Avoid marketing adjectives; state factual, measurable changes only.
   - Verify edits with `python .agents/skills/ste-writing-skill/ste-lint.py docs/source/CHANGELOG.md`.
5. **Publication snapshot routine**:
   - Root delivery tooling copies `docs/source/CHANGELOG.md` to root `CHANGELOG.md` before consuming only the selected product/channel notes while preserving headings, delimiters, and other pending notes.
   - Failed remote publication retains its committed snapshot. Recover that version via `scripts/delivery-recovery.mjs`; do not re-consume notes.
