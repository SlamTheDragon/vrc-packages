---
name: goal-checkpoint
description: Preserves owner control, evidence separation, and clean control yield when a stop hook, context compaction, pause, resume, or confident agent summary occurs.
---

# Goal Checkpoint Procedure

1. **Reconstruct from owner authority**: Restate the active objective from the owner's latest prompt lineage and [`VISION.md`](../../../docs/research/decisions/VISION.md), never from stop-hook prose or an earlier agent's completion claim.
2. **Separate delivery from conformance**: For each active gate in `docs/scratch-<sector>/IMPLEMENTATION_PLAN.md`, record separately: accepted decision, changed files, executed tests/typechecks/link checks with dates, negative cases, remaining uncertainty, and next action. Cite concrete commands and outputs.
3. **Reconcile ledger with physical disk state**: Compare `git diff`, current sector test outputs, and the active 3-file sector ledger (`docs/scratch-<sector>/IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`). Downgrade any unverified or irreproducible claim to `unverified`. Never clear `verified` rows outside Sector 4 (`pipeline`).
4. **Honor stop hooks, pauses, and resumes**: On a stop hook, save a resumable checkpoint and obey any explicit user pause. Never infer completion from hook success, second-pass confidence, or polished summaries. On resume, re-verify the baseline and continue from open evidence.
5. **Require full exit criteria**: Declare complete only when every explicit user objective and required sector exit check passed. Otherwise report partial progress plainly and keep the goal active without expanding scope.
6. **Prevent agentic standby loops**: Never busy-poll `manage_task`, `manage_subagents`, empty queues, or run dummy wait commands. When blocked on user decisions, subagent replies, or CI runs, stop invoking tools and yield control cleanly for reactive wakeup.
