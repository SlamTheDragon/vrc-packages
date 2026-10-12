---
trigger: always_on
description: "Maintain source changelog notes and generated root publication snapshots."
---

# 05 — Changelog appendation and channel management

1. **Target file isolation**:
   - Edit only `docs/source/CHANGELOG.md` when you record project changes.
   - Root `CHANGELOG.md` is the last publication snapshot. Do not edit or clear it manually.
   - Do not inspect or modify files in `docs/changelogs/` or project subfolders. These paths are protected and automated by repository tooling.
   - Stop changelog searches after you locate the target source section. This does not restrict implementation audits.

2. **Locked structure preservation**:
   - Obey the source changelog locked header comment.
   - Do not modify top-level titles, Table of Contents entries, anchor targets, or navigation links.
   - Deliver changes as bullet points under category sub-headers.
   - Write compact summaries that stay strictly inside the designated summary comment blocks.
   - Keep the existing section order and heading hierarchy intact.

3. **Channel and product scoping**:
   - Identify the target release channel (`Release` or `Preview`) before you make edits.
   - Find the exact component subsection that matches your modified package or service:
     - Applications: `vrcp-crawler-client`, `vrcp-crawler-node`, or `vrcp-packages-api`.
     - Internal services: `vrcp-web` or `vrcp-worker`.
     - Internal packages: `vrcp-packages-network`.
   - Put change notes only into the section for the active channel.

4. **Standard category headings**:
   - Sort change notes into standard subsections: `### Added`, `### Bugs Fixed`, and `### Changes`.
   - Preserve existing category headings even when their notes are empty.
   - Use bullet points with bold feature prefixes for every entry.

5. **Summary comment blocks**:
   - Update the top `<!-- MASTER_SUMMARY -->` block with a short summary of changes across all modified products.
   - Update the component `<!-- <component>-DESCRIPTION_SUMMARY -->` block with a clear summary for that product.
   - Do not remove or rename summary comment delimiters.

6. **Simplified Technical English (ASD-STE100) style**:
   - Use active voice and simple tenses.
   - Write short sentences: maximum 20 words for instructions, maximum 25 words for descriptions.
   - Do not use em dashes in prose. Use colons, parentheses, or periods instead.
   - Avoid marketing adjectives. State only factual, measurable technical changes.

7. **Preview publication routine**:
   - If changes require schema or dependency synchronization, execute preview publication and synchronization procedures.
   - Publication tooling copies the complete source to root before it consumes the selected product/channel notes.
   - Preserve channel, product and category headings, comment delimiters and history links in the source.
   - Other products and channels keep their notes. Never clear the complete source or root snapshot.
   - Commit the source reset, root snapshot and version archive with the publication metadata.
   - Failed remote publication retains its committed snapshot. Recover that version; do not consume notes again.
