# VRCP Sector 2: Crawler Desktop Client (`src-crawler-client/`)

## Truth Cascade

1. Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00` to `T03`, `T05`, `T06`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md).

2. Sector ledger: [`docs/scratch-desktop-client/`](../docs/scratch-desktop-client/IMPLEMENTATION_PLAN.md). The ledger file `handoff.md` owns Tier 4B Crawler Desktop Client.

3. Permitted upstream reads: [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1) and [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md) (Tier 2, 3A, 4A).

4. Also read [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md) (Tier 3B preview SDK) and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md).

5. Put Publication Requests in [`docs/scratch-desktop-client/handoff.md`](../docs/scratch-desktop-client/handoff.md). Only Sector 4 Pipeline edits [`docs/source/CHANGELOG.md`](../docs/source/CHANGELOG.md) and clears verified rows.

6. Owning specifications: [`desktop_client.md`](../docs/source/specifications/desktop_client.md) and [`wire_and_protocol_contracts.md`](../docs/source/schemas/wire_and_protocol_contracts.md).

7. Human wiki: [`API_ROUTES.md`](../docs/applications/VRCP%20API/API_ROUTES.md). Keep this file untouched. Stage wiki updates in [`proposed_wiki_changes.md`](../docs/source/reliability/proposed_wiki_changes.md).

## Sector Boundaries and Invariants

- **Stack**: Tauri 2, Svelte 5, Tailwind CSS v4, and `shadcn-svelte`.

- **Responsibility**: Desktop interface to manage the Crawler Node runtime and call consumer SDK functions with `vrc-packages-api-preview`.

- **Cross-project isolation**: Do not import sibling `src-crawler/`, `src-worker/`, or `src-package/` source files. Consume `vrc-packages-api` strictly as a declared preview SDK dependency.

## UI and UX Research Authority

- Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../.agents/rules/09-frontend-design-system-invariants.md).

- Read the UI/UX research corpus in [`docs/research/UIUX/README.md`](../docs/research/UIUX/README.md) and its chapters:
  - First principles: [`01-first-principles/`](../docs/research/UIUX/01-first-principles/01-cognitive-load-and-perception.md)
  - View architecture: [`02-view-architecture-and-density/`](../docs/research/UIUX/02-view-architecture-and-density/01-preventing-view-bloat.md)
  - Branching actions: [`03-branching-and-contextual-actions/`](../docs/research/UIUX/03-branching-and-contextual-actions/01-contextual-action-scoping.md)
  - Component action matrix: [`04-component-action-matrix/`](../docs/research/UIUX/04-component-action-matrix/01-component-selection-matrix.md)
  - Agent UX synthesis: [`05-skills-assessment-and-synthesis/`](../docs/research/UIUX/05-skills-assessment-and-synthesis/02-agent-ux-doctrine.md)

- Treat [`05-recommended-tooling-and-ecosystem-suite.md`](../docs/research/UIUX/05-skills-assessment-and-synthesis/05-recommended-tooling-and-ecosystem-suite.md) as the primary binding tooling authority.

- Obey the anti-reinvention mandate. Consume vetted headless primitives: `bits-ui`, `shadcn-svelte`, `@floating-ui/dom`, `@tanstack/virtual-core`, and `cn`.

- Never write custom focus traps. Never calculate popover coordinates manually. Never create custom roving tabindex loops.

## Action-Path Outlines ("Sketches")

- Draft a concise action-path outline ("sketch") before writing or refactoring any UI code.

- Record the approved outline in `docs/scratch-desktop-client/task_tracker.md`.

- Map user goals, entry routes, state transitions, action branches, progressive disclosure cues, and four-phase feedback loops.

## Design System Tokens and Primitives

- Maintain the shared OKLCH permanent dark `mira` + `mist` theme tokens aligned with Rule 09 and `src-web/`.

- Synchronize `src-crawler-client/src/routes/layout.css` to the shared dark tokens.

- Apply background `oklch(0.148 0.004 228.8)` and card and popover `oklch(0.218 0.008 223.9)`.

- Apply primary `oklch(0.437 0.078 188.216)`, sidebar-primary `oklch(0.704 0.14 182.503)`, destructive `oklch(0.704 0.191 22.216)`, and `--radius: 0.45rem`.

- Compose views from `src/lib/components/ui/` and `src/lib/components/ui-custom/`. Agents can use `shadcn-svelte` per-component folder barrels.

- Ask the owner through `ask_question` before creating new custom UI primitives.

## Local Diversified Skills (`.agents/skills/`)

- [`shadcn-svelte`](.agents/skills/shadcn-svelte/SKILL.md)
- [`svelte5-best-practices`](.agents/skills/svelte5-best-practices/SKILL.md)
- [`svelte-code-writer`](.agents/skills/svelte-code-writer/SKILL.md)
- [`svelte-core-bestpractices`](.agents/skills/svelte-core-bestpractices/SKILL.md)

## Domain Verification

Run from `src-crawler-client/`:

```powershell
bun run prepare:dev preview crawler-client
bun run check
bun run build:web
# When Rust or Tauri native files change:
bun run build:dev
```
