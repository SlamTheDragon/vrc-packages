---
trigger: always_on
description: "Self-management, resilience, thresholded edit-guard policy, zero data invention, strict statuses, and standby-loop prevention."
---

# 06: Self-Management, Resilience, and Guard Edits

1. **Workspace anchoring and task resilience**:
   - Default to read-only exploration when no explicit sector anchor or task scope is active.
   - Intermediate leads, subagent outputs, or user observations are evidence, not automatic greenlights to abandon the active slice or expand scope.
   - Finish and verify the active slice before switching tasks unless the user explicitly redirects work.
2. **Stale-source elimination and review before speaking**:
   - Stop quoting stale, superseded, or unverified documents. Re-anchor to `VISION.md`, `SYSTEM_MAP.md`, live code, active tests, and primary citations (`codebase-orientation`).
   - Verify all numbers, routes, schema columns, package versions, and file links against disk before reporting.
   - Write all prose, reports, and messages in ASD-STE100 Simplified Technical English (short sentences, simple tenses, active voice, zero marketing adjectives, zero em-dashes).
3. **Thresholded edit-guard policy (disabled by default; boundary-activated)**:
   - **Disabled by default**: Direct edits are permitted for standard localized edits inside a single sector provided they obey prompt lineage, code safety, and explicit data proof.
   - **Activation triggers**: Summon the skeptical `edit-guard` subagent BEFORE editing whenever a task meets EITHER condition:
     1. **Volume threshold**: Editing, integrating, or creating **10 or more files** in a task.
     2. **Boundary threshold**: Modifying any **cross-project contract, wire protocol, schema, legal truth covenant, or root distribution pipeline boundary** (`src-worker/packages/network/`, `src-package/` public wire types, D1/SQLite schemas, `LEGAL.md`, `scripts/`, `.github/workflows/`, `config*.versions.json`).
   - **Triggered audit protocol**:
     - Supply the original user prompt plus relevant clarifying prompts (prompt lineage), proposed diffs/specs, rationale, and explicit data proof (file line numbers, test outputs, compiler diagnostics, or schema citations).
     - The `edit-guard` audits live files independently with zero implicit trust and replies strictly `[PERMITTED]` or `[DENIED] <reason>`.
     - Abort or revise immediately on `[DENIED]` or any response other than `[PERMITTED]`.
4. **Zero data invention and zero synthetic fallbacks**:
   - Never invent wire DTO fields, audit reasons, legal clearance claims, benchmark numbers, or synthetic fallback schemas.
   - Every column, route, and policy claim must trace to primary schemas (`D1_SCHEMA_SQL`), RFCs (RFC 9309), primary legal/platform texts, or verified wire payloads. Mark undecided contracts explicitly as `UNRESOLVED`.
5. **No shortcuts or unearned claims**:
   - Compiling cleanly or passing isolated mock tests is screening evidence, not operational qualification.
   - Claim verification only after executing the owning sector's required test, typecheck, and runtime/build checks.
   - Obey Rule 02 Section 5 during live debugging. Treat initial test packets as starting suggestions, unpack the real R&D lifecycle dynamically, and never certify from surviving outputs alone.
   - Production-readiness optimization gates require real-scale multi-thousand-entry integration R&D, adversarial `skeptical-companion` question-chain audits, and proactive security and exploitation-route checks across all touched sectors.
6. **Strict ledger status parameters, handoff containment, and Pipeline-only row clearing**:
   - Review active ledgers (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`) and permitted upstream `handoff.md` ledgers before advancing to the next task.
   - Limit the `status` column strictly to five values: `open`, `in_progress`, `unverified`, `verified`, `blocked`.
   - **Never clear or delete verified rows outside Sector 4 (`pipeline`)**: Product and legal sectors mark completed rows `verified` and record written Publication / Ledger-Clearance Requests strictly inside their own `docs/scratch-<sector>/handoff.md`. Only Sector 4 (`pipeline`) agents transfer verified product notes into `docs/source/CHANGELOG.md` and clear transferred `verified` rows across sector ledgers.
7. **Zero tolerance for agentic standby loops**:
   - Never busy-poll `manage_task`, `manage_subagents`, background commands, or empty queues, and never run dummy waits or shell sleeps.
   - When waiting for subagents, background tasks, or user feedback, stop invoking tools and yield cleanly so reactive notifications resume work.
