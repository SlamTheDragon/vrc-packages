---
trigger: always_on
description: "Self-management, resilience, operational evidence, and pre-edit guard rules for this workspace."
---

# 06 — Self-management, resilience, and guard edits

1. **Task resilience and continuity**:
   - Intermediate leads, subagent outputs, or user observations are evidence, not automatic greenlights to abandon ongoing work or expand scope.
   - Maintain resilience: finish the active slice and verify its criteria before switching tasks, unless the user issues an explicit redirection.
   - Do not thrash between hypotheses. Anchor to the active goal in `docs/scratch/task_tracker.md`.

2. **Stale-source elimination and review before speaking**:
   - Stop quoting stale, superseded, or unverified documents. Re-anchor to live code, active tests, and verified ledgers (`codebase-orientation`).
   - Review statements before communicating: verify that numbers, parameters, routes, and citations represent the current verified state.
   - Write all prose, reports, and messages in ASD-STE100 Simplified Technical English (short sentences, simple tenses, active voice, zero marketing adjectives).

3. **Pre-edit guard verification**:
   - Before executing any file modification (`replace_file_content` or `write_to_file`), verify the proposed diff against authority, AST invariants, inbound callers, and schema contracts.
   - Guard against accidental deletions, unintended rewrites, and syntax errors. Abort any edit that violates architectural covenants, source access boundaries, or credential protection rules.

4. **Zero data invention and zero synthetic mockups**:
   - Never invent wire DTO fields, fake audit reasons, uncalibrated performance claims, or synthetic mock schemas.
   - "No fallbacks please, this invalidates protocol integrity." Every field, column, and contract must trace to primary schemas (`D1_SCHEMA_SQL`), RFCs (RFC 9309 robots), or verified wire payloads.
   - If an API contract or schema definition is missing or undecided, leave the gap explicitly marked as UNRESOLVED in the ledger. Never paper over uncertainty.

5. **No shortcuts, fast-forwards, or unearned claims**:
   - Compiling without errors or passing isolated mock tests is screening evidence, not full operational qualification.
   - Never claim verification without executed, passing operational evidence across affected domains (domain test suites, native `workerd` runtime smoke checks, and typechecks).
   - Stop hooks, timeouts, or turn counts are diagnostic data; they never authorize declaring a goal complete.

6. **Repository rules as internal cognitive functions**:
   - Rules 00 through 05 (and 06) are internal cognitive functions, not external rules to circumvent.
   - Obey Rule 00 (authority), Rule 01 (lean 2-table scratch, local slice commits), Rule 02 (whole-effect and failure matrix review), Rule 03 (stop hooks never complete goals), Rule 04 (anti-bloat and context preservation), and Rule 05 (STE changelog isolation) continuously.

7. **Mandatory ledger review and strict status parameters**:
   - The lifecycle explicitly requires reviewing the ledgers (`task_tracker.md` and `IMPLEMENTATION_PLAN.md`) before moving on to the next task.
   - Limit the `status` column to five allowed parameters to avoid inconsistent gating: `open`, `in_progress`, `unverified`, `verified`, `blocked`. Do not use informal or uncalibrated status labels.

8. **Lifecycle ledger compaction and internal scratchpad discipline**:
   - Compact active ledgers across cycles: merge overlapping slices, delete obsolete or verified items, prioritize critical paths, and move tasks across gates based on prerequisite readiness.
   - There is no deferring in internal scratchpads. Internal scratchpads must actively resolve, merge, execute, or close items without stagnant placeholders.
