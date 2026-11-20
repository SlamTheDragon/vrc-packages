---
name: delegation
description: Execute safe, sequenced, and stratified delegation where an Agent Coordinator dispatches dedicated subagents via invoke_subagent to perform isolated research, sandboxed drafting, cross-sector review, and verified integration.
---

# Stratified Delegation Protocol

## 1. Architectural Stratification

> [!IMPORTANT]
> **Subagents Execute the Delegation Pipeline**:
> Delegation means invoking subagents via `invoke_subagent`. The invoking agent operates strictly as the **Agent Coordinator**. The coordinator writes role packets, maintains CSV tracking ledgers, dispatches subagents, receives handoffs, and records approvals. The coordinator must not execute delegated research, sandbox drafting, quality audits, or integration directly in the coordinator turn.

All coordination packets and delegate sandboxes live under `delegates/<GOAL_NAME>/` at the repository root. This preserves the strict three-file limit (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`) in every `docs/scratch-<sector>/` directory.

### Domain A: Instruction and Governance (`delegates/<GOAL_NAME>/coordinator/`)
- `coordinator.md`: Root coordinator prompt governing the active goal iteration and its anchored sector (`crawler-network`, `desktop-client`, `api-web`, `pipeline`, or `legal-research`).
- `roles/<ROLE_ID>.md`: Individual task packets expanded from assigned ledger slices.

### Domain B: Execution Sandbox (`delegates/<GOAL_NAME>/`)

```text
delegates/<GOAL_NAME>/
├── README.md                        # Final synthesis and completed task handoff
├── coordinator/
│   ├── coordinator.md               # Master coordinator prompt
│   ├── dispatch.csv                 # Active subagent dispatch tracking
│   ├── integration.csv              # Verified patch integration queue
│   └── roles/                       # Task packets (<ROLE_ID>.md)
└── outputs/
    └── <DELEGATE_ID>/
        ├── micro_slice_ledger.md    # Granular expansion of the assigned slice
        ├── handoff.md               # Completion report and verification proof
        └── work/                    # Isolated drafts, patches, or research outputs
```

## 2. Role Hierarchy and Stratification

Every role below represents a dedicated `invoke_subagent` invocation.

### Tier 1: Execution and Discovery Subagents
- **Domain Researcher Subagent**: Runs bounded external or internal research (Cloudflare docs, RFC 9309, legal/platform policy texts, ecosystem packages) without mutating live files.
- **Sector Reviewer Subagent**: Audits target modules inside one owning sector (`src-worker/`, `src-crawler/`, `src-crawler-client/`, `src-package/`, `src-web*`, `scripts/`, or `docs/research/`) to trace callers, schemas, and boundaries read-only.
- **Sandbox Worker Subagent**: Drafts assigned code patches, schemas, tests, or research notes strictly inside `delegates/<GOAL_NAME>/outputs/<DELEGATE_ID>/`.

### Tier 2: Quality Assurance and Cross-Sector Audit Subagents
- **Elevated Sub-Coordinator-Reviewer Subagent**: Reviews Tier 1 `handoff.md` and sandbox outputs against gate criteria, `VISION.md`, `LEGAL.md`, and cross-project isolation rules.
- **Cross-Boundary / Edit-Guard Auditor Subagent**: Checks proposed changes for sibling-import leaks, broken wire DTOs, schema drift, broken Markdown links, or Rule 06 boundary violations.

### Tier 3: Promotion and Integration Subagents
- **Workspace Integrator Subagent**: Promotes approved outputs from `integration.csv` into canonical sector paths **only** after Tier 2 issues `reviewer_decision=approved`, then runs the sector's verification suite.

## 3. Artifacts and Schema Contracts

### Role Prompt Packet (`delegates/<GOAL_NAME>/coordinator/roles/<ROLE_ID>.md`)
Each packet must define:
1. **Activation Lineage**: Active sector anchor (`docs/scratch-<sector>/`), relevant `VISION.md` `Txx` anchors, and original user prompt lineage.
2. **Execution Payload**:
   - **Input**: Exact file paths, contracts, and baseline assumptions.
   - **Task**: Bounded objective, forbidden paths (never cross sector boundaries or edit `README.md`/root `CHANGELOG.md`), and required deliverables under `outputs/<DELEGATE_ID>/`.

### Coordinator Tracking Ledgers (`delegates/<GOAL_NAME>/coordinator/`)
- **`dispatch.csv`**:
  ```csv
  role_id,assigned_agent,sector,slice,dispatch_state,packet_path,notes
  ```
- **`integration.csv`**:
  ```csv
  queue_id,status,role_source,target_files,patch_path,reviewer_decision,integration_order,notes
  ```

### Delegate Sandbox Deliverables (`delegates/<GOAL_NAME>/outputs/<DELEGATE_ID>/`)
1. `micro_slice_ledger.md`: Granular breakdown of the assigned slice.
2. `work/`: Isolated patches, fixtures, or research documents.
3. `handoff.md`: Summary of changes, executed checks, and remaining risks for Tier 2 review.

## 4. Operational Lifecycle and Constraints

1. **Workspace Anchor and Concurrency Bound**: Delegate only when an explicit sector anchor is active. Summon at most **2 to 3 concurrent subagents** per wave.
2. **Dispatch and Clean Yield**: Write the role packet, log it in `dispatch.csv`, invoke the Tier 1 subagent via `invoke_subagent`, and immediately yield control without polling.
3. **Gate Review**: At each slice boundary, invoke Tier 2 reviewers to audit `handoff.md` and sandbox outputs. Re-summon the responsible Tier 1 subagent on defects.
4. **Integration Queueing and Promotion**: Record approved outputs in `integration.csv` with `reviewer_decision=approved` and an explicit `integration_order`. Invoke Tier 3 to promote verified patches and run sector checks.
5. **Safe Integration and Sandbox Deletion Receipt**:
   Before deleting `delegates/<GOAL_NAME>/`, verify four invariants:
   1. **Promotion Proof**: Every row in `integration.csv` is `promoted` or `integrated` in its canonical destination.
   2. **Link Decoupling**: Zero canonical files in `docs/` or `src-*` link into `delegates/<GOAL_NAME>/` (verify with `bun .agents/scripts/check_doc_links.ts`).
   3. **Artifact Migration**: All retained research or schema artifacts live in their permanent sector paths.
   4. **Handoff and Ledger Record**: Outbound contracts and written Publication / Ledger-Clearance Requests are recorded in the owning sector's `docs/scratch-<sector>/handoff.md` and active sector ledgers are updated (only Sector 4 Pipeline agents edit `docs/source/CHANGELOG.md` and clear `verified` ledger rows).
   Once verified, delete `delegates/<GOAL_NAME>/` so ephemeral sandboxes do not bloat the working tree.
6. **Anti-Standby-Loop Protocol**:
   Never busy-poll `manage_subagents`, loop over empty queues, or execute dummy wait commands. Stop calling tools and yield cleanly so reactive notifications wake execution when subagents reply.
