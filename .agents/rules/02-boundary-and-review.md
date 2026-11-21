---
trigger: always_on
description: "Protect sector and crawler/coordinator boundaries, enforce whole-effect review, and eliminate implicit state machines."
---

# 02: Review the Whole Effect, Not Just the Edited Function

1. **Process, cross-project isolation, and departmental handoff containment**:
   - Keep Crawler Node (`src-crawler/`) and Coordinator (`src-worker/`) as separate runnable processes communicating only through versioned serialized HTTP payloads. Do not bypass leases with direct repository calls.
   - Treat every `src-*` folder as an independent project. Never import sibling source or tests via relative paths, aliases, or symlinks. Consume shared code only through declared distributed dependencies (`vrc-packages-api`, `vrc-packages-network`).
   - **Containment across the 5-tier cascade**: Keep every edit inside the active control sector. Propagate cross-sector contract, schema, or legal changes strictly by recording outbound entries in the owning sector's `docs/scratch-<sector>/handoff.md` and letting downstream sector agents read upstream `handoff.md` files to integrate into their own code.
2. **Source access, robots, and legal boundaries**:
   - Source-access profiles authorize only scoped fetching. RFC 9309 `robots.txt` is a second gate (delegated to nodes under leases). Neither grants retention, publication, canonical identity, or binary downloads. Fail closed when the coordinator is unavailable.
   - Keep legal research covenants (`LEGAL.md`, research corpus) strictly separate from executable claims in `docs/source/`.
3. **Whole-effect failure matrix review**:
   - For each behavioral change, examine: happy path, malformed input, unavailable service, retry/idempotency, concurrency/origin pacing, schema compatibility, persistence/restart, and downstream consumer observation. Mark inapplicable rows with a concrete reason, not an unchecked box.
   - Implement the capability gate before running its verification checkpoint (domain unit/integration/protocol tests, typechecks, `workerd` runtime/build checks, link checks, and final diff audit). Never run root `bun test ./tests` unless root tooling changes. A green suite is evidence for exercised cases, not proof of all paths.
4. **Find and fix implicit state machines (single-ownership discipline)**:
   - Apply `.agents/skills/untangle-codebase/SKILL.md` during structural review. Ask of every module or document: **should these pieces change together?** [MANDATORY IN EVERY ITERATIVE CYCLE]
   - Eliminate unnecessary wrappers, unwanted exports, duplicated constants, copied claims, conflicting summaries, and stale derived values across code, docs, and research corpus files.
   - Give every shared schema, constant, wire contract, or legal covenant **one owning record** (indexed in `docs/source/SYSTEM_MAP.md`) and make consumers reference it via distributed packages or repository-relative links. Migrate and link rather than copying or rephrasing.
   - Verify each structural defect against live files and evidence before changing it. Limit each iteration to one bounded subject; route cross-sector work through `.agents/skills/delegation/SKILL.md`.
