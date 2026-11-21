# Recommended Tooling, Headless Packages & Ecosystem Suites

When autonomous software engineering agents are tasked with building user interfaces without a curated catalog of vetted tools, they frequently **reinvent the wheel**:
- Writing fragile, hand-rolled popover positioning scripts that clip outside viewport bounds.
- Building custom keyboard focus loops that trap screen readers in endless DOM cycles.
- Constructing bespoke drag-and-drop or swipe gesture physics that trigger layout thrashing.
- Hand-crafting animation engines that cause frame drops on high-refresh displays.

This document establishes an authoritative **Recommended Tooling Suite** to keep coding agents grounded. It provides a standardized stack of headless primitives, positioning engines, virtualization tools, and accessibility linters to eliminate redundant boilerplate.

---

## 1. The Anti-Reinvention Principle for Agents

```mermaid
flowchart TD
    Task["Agent UI Implementation Task"] --> Evaluation{"Does a vetted, accessible, headless primitive exist?"}
    
    Evaluation -->|Yes| Adopt["ADOPT VETTED PRIMITIVE\n• Inherit battle-tested WAI-ARIA compliance\n• Guarantee keyboard loops (Home/End/Arrows)\n• Focus strictly on design tokens & layout\n• Maintainability score: HIGH"]
    
    Evaluation -->|No (Extreme Exception)| Build["BUILD FROM SCRATCH\n• Requires ask_question approval\n• Mandatory manual focus trap & APG audit\n• Maintainability score: LOW"]
    
    style Adopt fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style Build fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```

### The Agent Golden Rule of Tooling:
> *Never write custom JavaScript for positioning floating elements, managing keyboard focus traps, calculating virtualized rows, or arbitrating touch gesture physics. Consume established headless libraries that handle the physics and accessibility out of the box.*

---

## 2. Recommended Package Matrix by Functional Domain

| Domain | Recommended Package(s) | Target Ecosystem | Why Agents Must Use It |
| :--- | :--- | :--- | :--- |
| **Headless Primitives (Foundation)** | **`bits-ui`** / **`melt-ui`**<br>**`ark-ui`** / **`zag-js`**<br>**`radix-ui`** | Svelte 5 (`bits-ui`)<br>Cross-framework (`zag-js`)<br>React (`radix-ui`) | Encapsulates complete WAI-ARIA Authoring Practices Guide (APG), roving `tabindex`, keyboard event loops, and compound slot architecture. |
| **Floating Positioning & Collisions** | **`@floating-ui/dom`**<br>`@floating-ui/svelte` | Framework-agnostic | Solves popover, dropdown, and tooltip positioning with auto-flip, viewport shift, collision detection, and arrow offsets. |
| **Virtualization & High-Density Feeds** | **`@tanstack/virtual-core`**<br>`@tanstack/svelte-virtual` | Framework-agnostic | Renders 100,000+ table rows, logs, or feed cards at 60–120fps by virtualizing the DOM, eliminating memory leaks. |
| **Accessible Drag-and-Drop** | **`@dnd-kit/core`**<br>`@dnd-kit/sortable` | React / Web standards | Provides accessible drag handles, keyboard sorting (WCAG 2.5.7 compliant), pointer sensors, and smooth layout animations. |
| **Gesture Arbitration & Physics** | **`@use-gesture/vanilla`** | Framework-agnostic | Captures pointer, drag, pinch, and scroll gestures with axis-locking (`pan-y`), velocity tracking, and dampening physics. |
| **State Machines & Complex UI Logic** | **`xstate`** / **`zag-js`** | Framework-agnostic | Finite State Machines (FSMs) that make impossible UI states impossible, eliminating spaghetti boolean flags. |
| **Class Logic & Variant Matrices** | **`clsx`** + **`tailwind-merge`** (`cn`)<br>**`tailwind-variants`** (`cva`) | Tailwind CSS / Svelte / React | Guarantees conflict-free Tailwind utility merging and type-safe component variant states (`size`, `variant`, `intent`). |
| **Accessibility Auditing & Testing** | **`axe-core`**<br>`@axe-core/playwright` | CI / End-to-End | Automated accessibility scanning catching contrast failures, missing ARIA labels, and broken focus loops in CI. |

---

## 3. Deep-Dive: Core Tooling Specifications

### 3.1. Headless Primitives: `bits-ui` & `zag-js`
When building Tier 1 accessible controls in this monorepo (Svelte 5 in `src-crawler-client/` and `src-web/`):
- **`bits-ui`** (the engine behind `shadcn-svelte`):
  - Provides unstyled, accessible primitives: `Dialog`, `DropdownMenu`, `Accordion`, `Popover`, `Tooltip`, `Select`, `Tabs`.
  - Automatically handles focus traps, click-outside dismissal, `aria-expanded`, and `aria-controls`.
  - Agents style the primitive using Tailwind utility classes without writing state boilerplate.
- **`zag-js`** (State-Machine Driven UI):
  - Powered by XState. Exposes pure state machines for complex controls (Color Picker, Date Picker, Splitter, Pin Input).
  - Can be hooked into Svelte 5 runes with zero overhead.

### 3.2. Floating Element Physics: `@floating-ui/dom`
Never use ad-hoc CSS (`top: 100%; left: 0;`) or manual `getBoundingClientRect()` loops for dropdowns, popovers, or tooltips.
- **`computePosition()`** from `@floating-ui/dom` automatically calculates coordinates while accounting for:
  1. **`flip()`**: Flips the popover from bottom to top if it hits the bottom viewport edge.
  2. **`shift()`**: Slides the popover along the axis to prevent horizontal clipping.
  3. **`offset()`**: Applies consistent spatial margins ($8\text{px}$).
  4. **`arrow()`**: Coordinates the positioning of the small triangle indicator pointing to the trigger.

```typescript
// Standard Floating-UI Anchor Pattern
import { computePosition, flip, shift, offset, arrow } from '@floating-ui/dom';

async function updatePosition(referenceEl, floatingEl, arrowEl) {
  const { x, y, placement, middlewareData } = await computePosition(referenceEl, floatingEl, {
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 12 }),
      arrow({ element: arrowEl })
    ],
  });

  Object.assign(floatingEl.style, {
    left: `${x}px`,
    top: `${y}px`,
  });
}
```

### 3.3. Virtualization for High-Density Telemetry: `@tanstack/virtual`
When an agent renders live crawler leases, database audit logs, or network packet traces:
- Rendering 1,000 DOM rows simultaneously causes memory bloat, high garbage collection pauses, and sluggish scrolling.
- **`@tanstack/virtual-core`** tracks scroll position and mounts **strictly the visible window** (e.g. 25 rows) plus a 5-row overscan buffer.
- Maintains accurate scrollbar geometry while rendering 100,000 items in $<2\text{MB}$ of DOM memory.

### 3.4. Conflict-Free Tailwind Merging: `cn()` Utility
In component libraries, props often override default utility classes:
```svelte
<!-- Consumer passes: class="p-8 bg-zinc-900" -->
<!-- Component default: class="p-4 bg-zinc-950 text-white" -->
```
If concatenated with simple string templates (`${defaultClass} ${propClass}`), Tailwind's CSS cascade creates non-deterministic styling bugs because both `p-4` and `p-8` exist in the `class` attribute.
- **The Grounded Solution**: Always use the `cn()` utility (`clsx` + `tailwind-merge`):
  ```typescript
  import { clsx, type ClassValue } from 'clsx';
  import { twMerge } from 'tailwind-merge';

  export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
  }
  ```
  `twMerge` intelligently resolves conflicts, removing `p-4` and keeping `p-8`.

---

## 4. Design System Invariant Catalog for Autonomous Agents

Autonomous agents working in this monorepo must adhere to this standardized toolset across sectors:

```
[ Monorepo Tooling Allocation ]

┌───────────────────────────┬─────────────────────────────────────────────────┐
│ Layer                     │ Approved Tooling & Packages                     │
├───────────────────────────┼─────────────────────────────────────────────────┤
│ Component Primitives      │ bits-ui / shadcn-svelte / Radix primitives      │
│ Floating Overlay Engine   │ @floating-ui/dom (with offset, flip, shift)     │
│ Class Merge & Variants    │ clsx + tailwind-merge (cn) / tailwind-variants  │
│ Virtualized Tables        │ @tanstack/virtual-core                          │
│ Color Tokens              │ OKLCH surface profiles (tokens.ts / layout.css) │
│ Accessibility Audit       │ axe-core / Playwright a11y tests                │
│ Animation Mechanics       │ tw-animate-css / CSS compositor properties      │
└───────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 5. Agent Operational Boundaries: What NEVER to Reinvent

Before writing a custom utility or component feature, verify against this restriction list:

1. **NEVER write custom focus trap code**: Consume `bits-ui` dialogs or `@floating-ui/dom` focus management.
2. **NEVER write manual popover coordinate math**: Use `@floating-ui/dom`.
3. **NEVER implement custom keyboard roving tabindex loops**: Use `bits-ui` menu/tab primitives or `zag-js`.
4. **NEVER render 500+ items without a virtualizer**: Use `@tanstack/virtual`.
5. **NEVER animate layout properties (`width`, `height`, `top`, `left`)**: Use compositor properties (`transform`, `opacity`) with `active:scale-[0.96]` tactile feedback.
6. **NEVER concatenate Tailwind classes with raw template strings**: Use `cn()`.
