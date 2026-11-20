# VRC Packages (VRCP) Agent Skills Catalog

This catalog indexes all **master governance skills** (root `.agents/skills/`), **root platform skills** (tracked in root `skills-lock.json`), and **diversified sector skills** located inside their owning `src-*` folders. Each skill uses a standard `SKILL.md` manifest with YAML frontmatter.

## Master Governance Skills (Root `.agents/skills/`)

| Skill | Use It When | How to Run It | What It Does |
| :--- | :--- | :--- | :--- |
| [`codebase-orientation`](codebase-orientation/SKILL.md) | Starting a new sector gate, orienting after context loss, or mapping cross-sector dependencies. | `/codebase-orientation`, or ask to orient to a sector. | Follows the Level 0 to Level 4 truth cascade (`VISION.md` -> `SYSTEM_MAP.md` -> `LEGAL.md` -> 3-file `docs/scratch-<sector>/` + upstream `handoff.md`), inspects `git status`, maps live paths, and emits a ground-truth table. |
| [`context-recovery`](context-recovery/SKILL.md) | Context feels degraded, after compaction, or when docs and live code conflict. | `/context-recovery`, or ask to recover context. | 5-step recovery: checks physical git state, re-anchors to `VISION.md`, `SYSTEM_MAP.md`, and active `docs/scratch-<sector>/`, triangulates AST/contracts, audits bloat, and emits a checkpoint. |
| [`delegation`](delegation/SKILL.md) | Multi-sector refactors, parallel legal/code audits, or sandboxed drafting across responsibilities. | `/delegation`, or ask to delegate a multi-part task. | Runs a stratified Agent Coordinator -> Tier 1/2/3 subagent pipeline via `invoke_subagent` with `delegates/<GOAL_NAME>/` sandboxes, CSV ledgers, deletion receipts, and clean control yield. |
| [`goal-checkpoint`](goal-checkpoint/SKILL.md) | A stop hook, compaction, user pause, or resume occurs during a gate. | `/goal-checkpoint`, or ask to checkpoint the goal. | Separates delivery from conformance, reconciles `docs/scratch-<sector>/` ledgers with `git diff`, enforces anti-standby-loop yield, and preserves owner control. |
| [`incremental-delivery`](incremental-delivery/SKILL.md) | Executing any bounded slice or milestone gate in any of the five sectors. | `/incremental-delivery`, or ask to deliver incrementally. | 6-step lifecycle: verify sector anchor (3-file `docs/scratch-<sector>/`), clarify via `ask_question`, maintain 2-table plan, execute local slice commits, verify gates, log outbound handoffs and written Publication Requests in `handoff.md`, and defer changelog transfer/row clearing to Sector 4 Pipeline. |
| [`ste-recurring-errors`](ste-recurring-errors/SKILL.md) | Checking drafts, rules, or release notes for the 39 recurring ASD-STE100 vocabulary traps. | `/ste-recurring-errors`, or ask to audit recurring STE errors. | Scans prose against the 39 ASD-STE100 Issue 9 recurring errors and replaces unapproved words with approved equivalents. |
| [`ste-writing-skill`](ste-writing-skill/SKILL.md) | Authoring or rewriting technical documentation, READMEs, legal summaries, or changelog notes. | `/ste-writing`, or ask to rewrite in STE. | Enforces ASD-STE100 Simplified Technical English (short sentences, active voice, simple tenses, zero marketing adjectives) with `ste-lint.py`. |
| [`system-reliability-review`](system-reliability-review/SKILL.md) | Before claiming a capability gate, protocol change, or release milestone is complete. | `/system-reliability-review`, or ask for a reliability review. | Runs a cross-sector failure matrix audit (leases, robots, SSRF, schema compatibility, provenance, cross-project isolation, link checks, and diff audit). |
| [`untangle-codebase`](untangle-codebase/SKILL.md) | Restructuring coupled modules, eliminating implicit state machines, or removing duplicated truths. | `/untangle-codebase`, or ask to untangle a sector. | 5-step architectural pass to eliminate hidden links, needless links, surplus wrappers/prose, and ad-hoc special cases across code and docs. |

## Root Platform Skills (Root `.agents/skills/`, Tracked in `skills-lock.json`)

| Skill | Owning Sector(s) | Purpose |
| :--- | :--- | :--- |
| [`cloudflare`](cloudflare/SKILL.md) | Sector 1 (`src-worker/`), Sector 3 (`src-web/`) | Cloudflare platform product selection and architecture reference. |
| [`workers-best-practices`](workers-best-practices/SKILL.md) | Sector 1 (`src-worker/`) | Production Cloudflare Workers runtime patterns, configuration, and platform APIs. |
| [`wrangler`](wrangler/SKILL.md) | Sector 1 (`src-worker/`) | Wrangler CLI commands, local `workerd` development, D1 migrations, and dry-run builds. |
| [`web-perf`](web-perf/SKILL.md) | Sector 3 (`src-web/`, `src-web-search/`) | Loading/interaction performance auditing, Core Web Vitals, and Lighthouse optimization. |

## Diversified Sector Skills (Inside Owning `src-*` Folders)

| Source Folder | Sector | Local Skills |
| :--- | :--- | :--- |
| `src-crawler-client/.agents/skills/` | Sector 2 (`desktop-client`) | [`shadcn-svelte`](../../src-crawler-client/.agents/skills/shadcn-svelte/SKILL.md) (tracked in `src-crawler-client/skills-lock.json`), [`svelte5-best-practices`](../../src-crawler-client/.agents/skills/svelte5-best-practices/SKILL.md), [`svelte-code-writer`](../../src-crawler-client/.agents/skills/svelte-code-writer/SKILL.md), [`svelte-core-bestpractices`](../../src-crawler-client/.agents/skills/svelte-core-bestpractices/SKILL.md) |
| `src-web/.agents/skills/` | Sector 3 (`api-web`) | [`shadcn-svelte`](../../src-web/.agents/skills/shadcn-svelte/SKILL.md), [`svelte5-best-practices`](../../src-web/.agents/skills/svelte5-best-practices/SKILL.md), [`svelte-code-writer`](../../src-web/.agents/skills/svelte-code-writer/SKILL.md), [`svelte-core-bestpractices`](../../src-web/.agents/skills/svelte-core-bestpractices/SKILL.md), [`ui-sdk`](../../src-web/.agents/skills/ui-sdk/SKILL.md), [`ui-sdk-write-code`](../../src-web/.agents/skills/ui-sdk-write-code/SKILL.md), [`ui-sdk-write-docs`](../../src-web/.agents/skills/ui-sdk-write-docs/SKILL.md), [`ui-sdk-unslop`](../../src-web/.agents/skills/ui-sdk-unslop/SKILL.md), [`ui-sdk-expert-review`](../../src-web/.agents/skills/ui-sdk-expert-review/SKILL.md) |
| `src-web-search/.agents/skills/` | Sector 3 (`api-web`) | [`svelte5-best-practices`](../../src-web-search/.agents/skills/svelte5-best-practices/SKILL.md), [`svelte-code-writer`](../../src-web-search/.agents/skills/svelte-code-writer/SKILL.md), [`svelte-core-bestpractices`](../../src-web-search/.agents/skills/svelte-core-bestpractices/SKILL.md) |
