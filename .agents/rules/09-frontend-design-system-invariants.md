---
trigger: model_decision
description: "Apply whenever creating, editing, styling, or reviewing UI components, layouts, or interactive views in src-crawler-client/, src-web/, or src-web-search/."
---

# 09: Frontend Design System, 3-Tier Component Hierarchy, and UI Invariants

This rule governs interactive UI surfaces in **Sector 2** (`src-crawler-client/`: Tauri 2 + Svelte 5 + `shadcn-svelte`) and **Sector 3** (`src-web/`, `src-web-search/`: Astro 7 + Svelte 5). It does not govern backend Worker, Crawler Node, SDK, or root pipeline code.

1. **Authoritative UX research corpus (`docs/research/UIUX/`)**:
   - Read [`docs/research/UIUX/README.md`](../../docs/research/UIUX/README.md) and its five chapters before designing, styling, or refactoring any interface:
     - [`01-first-principles/`](../../docs/research/UIUX/01-first-principles/01-cognitive-load-and-perception.md): cognitive load, Gestalt proximity, interaction laws, and visual salience (`03-visual-salience-and-eye-tracking.md`, F/Z/Gutenberg scan patterns, 90/10 grayscale rule).
     - [`02-view-architecture-and-density/`](../../docs/research/UIUX/02-view-architecture-and-density/01-preventing-view-bloat.md): view budgeting, progressive disclosure with peeking cues (`02-progressive-disclosure.md`), and Tufte Data-Ink Ratio (`03-information-density-and-data-ink-ratio.md`).
     - [`03-branching-and-contextual-actions/`](../../docs/research/UIUX/03-branching-and-contextual-actions/01-contextual-action-scoping.md): selection-scoped actions and dynamic field pruning (`02-branching-navigation-trees.md`).
     - [`04-component-action-matrix/`](../../docs/research/UIUX/04-component-action-matrix/01-component-selection-matrix.md): intent-to-primitive selection, 4-phase feedback loops (`02-feedback-loops-and-state-orchestration.md`), and compound primitives (`03-headless-primitives-and-compound-components.md`).
     - [`05-skills-assessment-and-synthesis/`](../../docs/research/UIUX/05-skills-assessment-and-synthesis/02-agent-ux-doctrine.md): agent UX checklist, spatial memory invariants (`03-human-intuition-vs-agentic-patterns.md`), and 3-tier maintainability (`04-code-organization-maintainability-and-a11y.md`).
   - Apply the six implicit UX rules on every surface: Space Over Lines, Cues Over Words, Show Only Current Relevance, Predictability Trumps Optimization, Instant Tactile Acknowledgement, and Progressive Disclosure With Peeking.

2. **Mandatory pre-code action-path outline ("sketch")**:
   - Draft a concise action-path outline ("sketch") before writing or refactoring any UI view, modal, toolbar, or workflow.
   - Map every user goal, entry route, state transition, primary vs contextual action branch, progressive disclosure trigger, component choice (per `04-component-action-matrix/01-component-selection-matrix.md`), and 4-phase feedback loop (acknowledgement, loading, success, error, and empty state).
   - Record the approved sketch in the active sector ledger (`docs/scratch-api-web/task_tracker.md`, `docs/scratch-desktop-client/task_tracker.md`, or delegate `micro_slice_ledger.md`) before writing UI code.

3. **Dedicated design system primitives**:
   - Compose each route, dashboard, modal, toolbar, and form from established UI primitives in `src-web/src/lib/components/ui/` or `src-crawler-client/src/lib/components/ui/`.
   - Do not use raw HTML controls (`<button class="control">`, raw `<select>`, raw `<input>`, inline color pills, or ad-hoc card shells).

4. **Centralized design token file (`tokens.ts` or `layout.css`)**:
   - Define colors, control heights (`CONTROL_HEIGHTS`), radii, typography, `EVIDENCE_TOKENS`, `COMPONENT_PRESETS`, and `PALETTE_SWATCHES` in `src-web/src/lib/components/ui/tokens.ts`. Put shared interfaces in `types.ts`.
   - Import styling presets from `tokens.ts` instead of repeating inline color or height strings.
   - Keep the permanent dark `shadcn-svelte` `mira` + `mist` OKLCH surface profile shared between `src-crawler-client/` and `src-web/` (`oklch(0.148 0.004 228.8)` background, `oklch(0.218 0.008 223.9)` card and sidebar, `oklch(0.437 0.078 188.216)` primary/accent, `oklch(0.704 0.14 182.503)` sidebar-primary, `oklch(0.704 0.191 22.216)` destructive, `--radius: 0.45rem`, `Figtree Variable` + `IBM Plex Sans Variable`), with `src-crawler-client/src/routes/layout.css` and `src-web/src/app.css` synchronized to the same tokens.

5. **3-Tier component and route structure (`/ui-sdk` and `/design`)**:
   - **Tier 1 (`src/lib/components/ui/<domain>/`)** owns accessible UI primitives across six orthogonal domains plus `workbench/`:
     - `forms/`: `Button`, `Input`, `Textarea`, `Select`, `DropdownSelect`, `Checkbox`, `Switch`, `Slider`, `RadioGroup`, `Field`
     - `navigation/`: `Tabs`, `ToggleGroup`, `Accordion`, `DropdownMenu`, `DropdownItem`, `SidebarNav`
     - `overlays/`: `Dialog`, `Sheet`, `Popover`, `Tooltip`
     - `feedback/`: `Badge`, `EvidenceBadge`, `Notice`, `Progress`, `Skeleton`, `EmptyState`
     - `display/`: `Card`, `StatCard`, `Codeblock`, `Separator`, `Avatar`, `Kbd`, `VRCPEmblem`
     - `telemetry/`: `DataTable`, `PropertyInspector`, `ObserverToolbar`, `RenderControls`, `AssetPlaceholder`
     - `workbench/`: `FloatingPanel`, `SplitPane`
   - **Tier 2 (`src/lib/components/admin/` and `src/lib/stores/`)** owns Operator and Moderator dashboard panels and Svelte 5 state modules (`*.svelte.ts`) calling `VRCPackageClient` over HTTP.
   - **Tier 3 (`src/pages/` in Astro 7)** owns top-level routes (`/login`, `/operator`, `/moderator`, `/design`) wrapping Tier 2 views inside the navigation shell.

6. **Import hygiene (direct imports in `src-web/`; no megabarrels)**:
   - Import `src-web/` primitives directly from each source file (`import Button from '$lib/components/ui/forms/Button.svelte'` and `import { COMPONENT_PRESETS } from '$lib/components/ui/tokens'`).
   - Official `shadcn-svelte` per-folder barrels (`$lib/components/ui/<component>/index.ts`) apply only inside `src-crawler-client/`.
   - Do not create cross-directory megabarrel files (`src/lib/components/index.ts`) or compatibility re-export wrappers.

7. **Ask before adding UI primitives (`ask_question` gate)**:
   - Compose layouts from existing primitives instead of building custom wrappers or local styling overrides.
   - If a requirement needs a new UI primitive absent from `src/lib/components/ui/`, stop and ask the owner through `ask_question`. List the primitive name, target domain directory, rationale, and proposed props interface.

8. **Dropdown and control height standards**:
   - Use `DropdownSelect` (`$lib/components/ui/forms/DropdownSelect.svelte`) for selection menus and grouped filter lists. Do not use raw `<select>` elements.
   - Bind interactive controls (`Button`, `Input`, `Select`, `DropdownSelect`, `ToggleGroup`, `Badge`, `EvidenceBadge`) to `CONTROL_HEIGHTS` (`xs`: `h-7`, `sm`: `h-8`, `md`: `h-10`, `lg`: `h-12`).
   - Apply `font-variant-numeric: tabular-nums` to counters and timestamps, and enable antialiased font smoothing on `body`.

9. **Collapsible sidebar navigation shell**:
   - On desktop viewports, render a collapsible left `SidebarNav` (`w-16` collapsed, `w-64` expanded) with `VRCPEmblem`, primary (`Operator`, `Moderator`) and secondary (`Design System`) links, collapse button, and skip-to-content link.
   - On mobile viewports (`< md`), render a compact header bar with a drawer toggle.

10. **Svelte 5 and UI SDK skill workflow**:
   - Obey local skills in `src-web/.agents/skills/` and `src-crawler-client/.agents/skills/` plus root `.agents/skills/web-perf/SKILL.md`.
   - Write UI code with `ui-sdk-write-code` and Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`). Clean diffs with `ui-sdk-unslop` and audit with `ui-sdk-expert-review`.

11. **Cross-pipeline integration and concurrent edits**:
   - Install `vrc-packages-api` strictly through root pipeline commands (`bun run prepare:dev preview web`) without sibling relative imports.
   - Keep static bundles free of `OPERATOR_TOKEN` and `vrcp_usr_` secrets; collect credentials at runtime on `/login`.
   - Re-read target UI files and active ledgers (`docs/scratch-desktop-client/` or `docs/scratch-api-web/`) before editing.
