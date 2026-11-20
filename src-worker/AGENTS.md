# VRCP Sector 1: Coordinator (`src-worker/`)

**Truth Cascade:** Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00` to `T05`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md).

**Ledgers:** Active 3-file sector ledger is [`docs/scratch-crawler-network/`](../docs/scratch-crawler-network/IMPLEMENTATION_PLAN.md). Its [`handoff.md`](../docs/scratch-crawler-network/handoff.md) owns **Tier 2** Workers and Schemas plus **Tier 3A** `packages/network/`. Permitted upstream reads are [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1), [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md) (Tier 3B for `vrc-packages-api-preview`), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md).

**Owning Truth Docs:** [`coordinator_worker.md`](../docs/source/specifications/coordinator_worker.md), [`coordinator_d1.md`](../docs/source/schemas/coordinator_d1.md), and [`failure_and_recovery_matrix.md`](../docs/source/reliability/failure_and_recovery_matrix.md). Submit Publication Requests strictly in [`docs/scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md). Only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.

**Boundaries:** API-only Cloudflare Worker (`src/worker_entry.ts`, D1 binding `VRCP_D1`). Keep zero sibling-project imports. Consume `vrc-packages-api` (preview) and `vrc-packages-network` (tarball) as declared dependencies. Schema or `packages/network/` changes trigger the Rule 06 `edit-guard`.

**Skills and Routing:** [`cloudflare`](../.agents/skills/cloudflare/SKILL.md), [`workers-best-practices`](../.agents/skills/workers-best-practices/SKILL.md), [`wrangler`](../.agents/skills/wrangler/SKILL.md), and [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md).

**Verification:** `bun run check`, `bun run test`, `bun run test:workers`, `bun run build:preview`, and `bun run test:runtime`.
