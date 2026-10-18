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

3. **Pre-edit subagent submission harness and edit-guard rules**:
   - **Pre-edit audit requirement**: Before executing any file modification (`replace_file_content` or `write_to_file`), submit the proposed diff, target file path, rationale, and evidence source to the `edit-guard` sub-agent.
   - **Relevant prompt context**: The submission payload to `edit-guard` must enumerate the original user prompt and only the relevant underlying prompts that followed since the original prompt. Do not include unrelated conversational exchanges. The edit guard evaluates the edit against this specific prompt lineage.
   - **Code safety enforcement**: The edit guard must practice strict code safety. It must verify that the proposed edit introduces no destructive file overwrites, accidental truncations, syntax defects, type regressions, broken contracts, or unhandled runtime hazards.
   - **Explicit data proof**: The parent agent must identify and supply explicit data proof to satisfy the edit (e.g., exact file line references, test outputs, compiler/typecheck diagnostics, schemas, or calculation results). The edit guard must reject edits backed only by unsupported prose assertions.
   - **Skeptical posture and zero implicit trust**: The edit guard must remain skeptical at all times. It must never trust the parent agent for its potentially reckless actions or claims. The edit guard must independently audit the raw diff against the live file and the relevant prompts.
   - **Strict verdict protocol**:
     - The edit guard must reply with `[PERMITTED]` only when the proposed change fully satisfies prompt requirements, code safety checks, explicit data proof, and repository rules.
     - If any violation, safety risk, missing data proof, reckless behavior, or prompt deviation is detected, the edit guard must reply with `[DENIED] <reason>`, explaining the exact failure.
     - The parent agent must abort the edit immediately if the response is `[DENIED] <reason>` or anything other than `[PERMITTED]`.

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
