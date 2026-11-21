# VRCP Sector 3: Website (`src-web/`)

**Truth Cascade**: Obey root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00` to `T03`, `T05`, `T06`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md). Active 3-file sector ledger: [`docs/scratch-api-web/`](../docs/scratch-api-web/IMPLEMENTATION_PLAN.md) (`handoff.md` owns **Tier 5** Downstream Web Apps).

Read upstream handoffs in [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md), [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md), [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md), [`scratch-desktop-client/handoff.md`](../docs/scratch-desktop-client/handoff.md), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md). Owning spec: [`consumer_sdk_and_web.md`](../docs/source/specifications/consumer_sdk_and_web.md). Put Publication Requests in [`docs/scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md). Only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.

**Boundaries**: Astro 7 and Svelte 5 site for admin dashboards, ToS/legal pages, and registries. Consume `vrc-packages-api` strictly as a declared dependency without sibling imports. Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../.agents/rules/09-frontend-design-system-invariants.md).

**Skills**: Local [`.agents/skills/`](.agents/skills/README.md) (`shadcn-svelte`, `svelte5-best-practices`, `svelte-code-writer`, `svelte-core-bestpractices`, `ui-sdk`, `ui-sdk-write-code`, `ui-sdk-write-docs`, `ui-sdk-unslop`, `ui-sdk-expert-review`) and root `web-perf` / `cloudflare`.

**Verification**: `bun run check` and `bun run build`.
