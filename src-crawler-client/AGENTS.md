# VRCP Sector 2: Crawler Desktop Client (`src-crawler-client/`)

## Truth Cascade

1. Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00`–`T03`, `T05`, `T06`), and [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md).
2. Active 3-file sector ledger: [`docs/scratch-desktop-client/`](../docs/scratch-desktop-client/IMPLEMENTATION_PLAN.md) (`handoff.md` owns **Tier 4B** Crawler Desktop Client). Permitted upstream reads: [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1), [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md) (Tier 2 / 3A / 4A), [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md) (Tier 3B release SDK), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md). Submit Publication Requests strictly in [`docs/scratch-desktop-client/handoff.md`](../docs/scratch-desktop-client/handoff.md); only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.
3. Owning truth docs: [`desktop_client.md`](../docs/source/specifications/desktop_client.md), [`wire_and_protocol_contracts.md`](../docs/source/schemas/wire_and_protocol_contracts.md), and [`API_ROUTES.md`](../docs/applications/VRCP%20API/API_ROUTES.md) *(untouched wiki; stage updates in [`proposed_wiki_changes.md`](../docs/source/reliability/proposed_wiki_changes.md))*.

## Sector Boundaries and Invariants

- **Stack**: Tauri 2 + Svelte 5 + Tailwind CSS v4 + `shadcn-svelte`.
- **Responsibility**: Windows desktop GUI that installs and supervises the Crawler Node runtime and exposes consumer SDK actions (`vrc-packages-api` release channel).
- **UI and design system discipline**: Follow [`.agents/rules/09-frontend-design-system-invariants.md`](../.agents/rules/09-frontend-design-system-invariants.md). Compose views from `src/lib/components/ui/` (`shadcn-svelte` per-component folder barrels permitted) and `src/lib/components/ui-custom/`. Ask the owner via `ask_question` before inventing new custom UI primitives.
- **Cross-project isolation**: Never import sibling `src-crawler/`, `src-worker/`, or `src-package/` source files. Consume `vrc-packages-api` strictly as a declared release dependency.

## Local Diversified Skills (`.agents/skills/`)

- [`shadcn-svelte`](.agents/skills/shadcn-svelte/SKILL.md) (tracked in `skills-lock.json`)
- [`svelte5-best-practices`](.agents/skills/svelte5-best-practices/SKILL.md)
- [`svelte-code-writer`](.agents/skills/svelte-code-writer/SKILL.md)
- [`svelte-core-bestpractices`](.agents/skills/svelte-core-bestpractices/SKILL.md)

## Domain Verification

Run from `src-crawler-client/`:

```powershell
bun run check
bun run build:web
# When Rust / Tauri native files change:
bun run build:dev
```
