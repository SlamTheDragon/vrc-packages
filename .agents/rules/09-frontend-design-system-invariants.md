---
trigger: model_decision
description: "Apply whenever creating, editing, styling, or reviewing UI components, layouts, or interactive views in src-crawler-client/, src-web/, or src-web-search/."
---

# 09: Frontend Design System, 3-Tier Component Hierarchy, and UI Invariants

This rule governs interactive UI surfaces in **Sector 2** (`src-crawler-client/`: Tauri 2 + Svelte 5 + `shadcn-svelte`) and **Sector 3** (`src-web/`, `src-web-search/`: Astro 7 + Svelte 5). It does not govern backend Worker, Crawler Node, SDK, or root pipeline code.

1. **Dedicated design system primitives**:
   - Compose each route, dashboard, modal, toolbar, and form from established UI primitives in `src-web/src/lib/components/ui/` or `src-crawler-client/src/lib/components/ui/`.
   - Do not use raw HTML controls (`<button class="control">`, raw `<select>`, raw `<input>`, inline color pills, or ad-hoc card shells).

2. **Centralized design token file (`tokens.ts` or `layout.css`)**:
   - Define colors, control heights (`CONTROL_HEIGHTS`), radii, typography, `EVIDENCE_TOKENS`, `COMPONENT_PRESETS`, and `PALETTE_SWATCHES` in `src-web/src/lib/components/ui/tokens.ts`. Put shared interfaces in `types.ts`.
   - Import styling presets from `tokens.ts` instead of repeating inline color or height strings.
   - Keep the modern light surface profile in `src-web/` (`#ffffff` panels, `#f8fafc` canvas, `#e2e8f0` borders, `#0f172a` ink, `#059669` emerald, `#d97706` amber). Keep `src-crawler-client/src/routes/layout.css` as the client token source.

3. **3-Tier component and route structure (`/ui-sdk` and `/design`)**:
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

4. **Import hygiene (direct imports in `src-web/`; no megabarrels)**:
   - Import `src-web/` primitives directly from each source file (`import Button from '$lib/components/ui/forms/Button.svelte'` and `import { COMPONENT_PRESETS } from '$lib/components/ui/tokens'`).
   - Official `shadcn-svelte` per-folder barrels (`$lib/components/ui/<component>/index.ts`) apply only inside `src-crawler-client/`.
   - Do not create cross-directory megabarrel files (`src/lib/components/index.ts`) or compatibility re-export wrappers.

5. **Ask before adding UI primitives (`ask_question` gate)**:
   - Compose layouts from existing primitives instead of building custom wrappers or local styling overrides.
   - If a requirement needs a new UI primitive absent from `src/lib/components/ui/`, stop and ask the owner through `ask_question`. List the primitive name, target domain directory, rationale, and proposed props interface.

6. **Dropdown and control height standards**:
   - Use `DropdownSelect` (`$lib/components/ui/forms/DropdownSelect.svelte`) for selection menus and grouped filter lists. Do not use raw `<select>` elements.
   - Bind interactive controls (`Button`, `Input`, `Select`, `DropdownSelect`, `ToggleGroup`, `Badge`, `EvidenceBadge`) to `CONTROL_HEIGHTS` (`xs`: `h-7`, `sm`: `h-8`, `md`: `h-10`, `lg`: `h-12`).
   - Apply `font-variant-numeric: tabular-nums` to counters and timestamps, and enable antialiased font smoothing on `body`.

7. **Collapsible sidebar navigation shell**:
   - On desktop viewports, render a collapsible left `SidebarNav` (`w-16` collapsed, `w-64` expanded) with `VRCPEmblem`, primary (`Operator`, `Moderator`) and secondary (`Design System`) links, collapse button, and skip-to-content link.
   - On mobile viewports (`< md`), render a compact header bar with a drawer toggle.

8. **Svelte 5 and UI SDK skill workflow**:
   - Obey local skills in `src-web/.agents/skills/` and `src-crawler-client/.agents/skills/` plus root `.agents/skills/web-perf/SKILL.md`.
   - Write UI code with `ui-sdk-write-code` and Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`). Clean diffs with `ui-sdk-unslop` and audit with `ui-sdk-expert-review`.

9. **Cross-pipeline integration and concurrent edits**:
   - Install `vrc-packages-api` strictly through root pipeline commands (`bun run prepare:dev preview web`) without sibling relative imports.
   - Keep static bundles free of `OPERATOR_TOKEN` and `vrcp_usr_` secrets; collect credentials at runtime on `/login`.
   - Re-read target UI files and active ledgers (`docs/scratch-desktop-client/` or `docs/scratch-api-web/`) before editing.
