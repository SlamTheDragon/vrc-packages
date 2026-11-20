---
trigger: model_decision
description: "Apply whenever creating, editing, styling, or reviewing UI components, layouts, or interactive views in src-crawler-client/, src-web/, or src-web-search/."
---

# 09: Frontend Design System and Component Invariants

This rule applies strictly to interactive UI surfaces in **Sector 2** (`src-crawler-client/`: Tauri 2 + Svelte 5 + `shadcn-svelte`) and **Sector 3** (`src-web/`, `src-web-search/`: Astro 7 + Svelte 5). It does not govern backend Worker, Crawler Node, SDK, or root pipeline code.

1. **Use dedicated design system primitives**:
   - Compose routes, panels, dialogs, forms, and views from the project's established UI primitives (for example `src-crawler-client/src/lib/components/ui/` and `ui-custom/`).
   - Avoid ad-hoc raw HTML controls (`<button class="control">`, unstyled `<select>`, unstyled `<input>`, inline color pills, one-off card shells) when established primitives satisfy the requirement.
2. **Centralize styling tokens and presets**:
   - Keep colors, spacing, typography, and control height presets centralized in the app's styling tokens (`layout.css`, Tailwind theme tokens, or a single design token module) instead of scattering hardcoded inline values across views.
   - Standardize interactive control heights across adjacent controls (`h-7` / `h-8` / `h-10` / `h-12` or equivalent design-system size variants) to prevent perceptual misalignment.
3. **Import hygiene (component barrels allowed; megabarrels forbidden)**:
   - Follow `src-crawler-client/.agents/skills/shadcn-svelte/SKILL.md` for `shadcn-svelte` primitives: official per-component folder barrels (`$lib/components/ui/<component>/index.ts`, such as `import { Button } from "$lib/components/ui/button"` or `import * as Dialog from "$lib/components/ui/dialog"`) are permitted and expected.
   - Do not create cross-directory megabarrel files (`src/lib/components/index.ts`) or synthetic legacy compatibility re-export wrappers. Import non-shadcn modules directly from their canonical source files.
4. **No unilateral invention of new UI primitives**:
   - Do not invent bespoke wrapper widgets or duplicate UI primitives when existing components or `shadcn-svelte` CLI primitives suffice.
   - If a task genuinely requires a new custom UI primitive that cannot be composed from existing components, halt and ask the owner via `ask_question` with the missing primitive name, target path, rationale, and proposed props/accessibility interface.
5. **Svelte 5 and framework skill alignment**:
   - Consult the local diversified skills in `src-crawler-client/.agents/skills/`, `src-web/.agents/skills/`, and `src-web-search/.agents/skills/` (`shadcn-svelte`, `svelte5-best-practices`, `svelte-code-writer`, `svelte-core-bestpractices`) and root `.agents/skills/web-perf/SKILL.md` before writing components.
   - Use Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`) and preserve Astro island boundaries in `src-web/` and `src-web-search/`.
6. **Concurrent agent resilience**:
   - Re-read target UI files and active sector scratch ledgers (`docs/scratch-desktop-client/` or `docs/scratch-api-web/`) before editing so parallel UI changes are never overwritten.
