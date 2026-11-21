# Autonomous Agent UX Engineering Reference

Welcome to the **UX Engineering Reference for Autonomous Agents**.

This research corpus teaches software engineering agents how to design and construct human interfaces that prioritize cognitive clarity, natural ergonomic movement, and immediate situational understanding. 

Design systems provide colors, typography scales, and component tokens. UX engineering dictates **what is visible, what is deferred, what is inferred, and how the interface behaves in response to human intent**.

---

## 1. The Core Problem: The Agent UI Slop Trap

When artificial intelligence agents build interfaces without UX grounding, they routinely fall into characteristic failure modes:
1. **The Overpopulation Fallacy**: Exposing every conceivable data field, button, filter, and configuration toggle on a single view, paralyzing the human operator.
2. **Verbose Text Generation ("Explaining the UI")**: Writing multi-sentence paragraphs, instruction banners, and help cards to explain controls that should be self-evident through proper visual affordance and layout.
3. **Static Action Bloat**: Displaying every global action simultaneously, regardless of whether an item is selected, a task is active, or a state is valid.
4. **Broken Feedback Loops**: Executing state mutations without immediate visual or tactile acknowledgement, leaving the user unsure whether a click registered.
5. **Arbitrary Primitive Selection**: Using a disruptive modal dialog for trivial feedback, or a buried settings toggle for high-consequence destructive operations.
6. **Hyper-Adaptive Disorientation**: Shifting layouts, moving buttons, or collapsing menus dynamically, which destroys subconscious spatial and muscle memory.
7. **Monolithic Code Degradation**: Intertwining styles, accessibility, and state into rigid components plagued by boolean prop explosion and megabarrel bloat.

**The Golden UX Axiom for Agents**:  
> *A great interface communicates through spatial position, contrast, grouping, and subtle signifiers. If an interface requires explanatory prose to show how to use it, the interaction architecture has failed.*

---

## 2. Orthogonal Information Architecture

This repository is organized hierarchically and orthogonally. Each folder and file possesses strict single ownership over a specific cognitive or architectural domain:

```
docs/research/UIUX/
├── LEDGER.md                                 # Active milestone tracking and discovery lifecycle
├── README.md                                 # Core UX doctrine and architectural map
├── 01-first-principles/                      # Cognitive psychology and interaction physics
│   ├── 01-cognitive-load-and-perception.md   # CLT, working memory limits, Gestalt grouping
│   ├── 02-interaction-laws-and-signifiers.md # Affordance, Signifiers, Hick's, Fitts's, Norman Doors
│   └── 03-visual-salience-and-eye-tracking.md # Saccades, F/Z/Gutenberg scan patterns, 90/10 grayscale
├── 02-view-architecture-and-density/         # Preventing visual bloat and view budgeting
│   ├── 01-preventing-view-bloat.md           # View budgeting, whitespace structure, surface depth
│   ├── 02-progressive-disclosure.md          # Spatial vs temporal disclosure, peeking cues
│   └── 03-information-density-and-data-ink-ratio.md # Data-Ink Ratio, density tiers, numeric alignment
├── 03-branching-and-contextual-actions/      # Situational action scoping and branching
│   ├── 01-contextual-action-scoping.md       # State-driven toolbars, row micro-actions, selection bars
│   └── 02-branching-navigation-trees.md      # Dynamic decision trees, input pruning, state containment
├── 04-component-action-matrix/               # Deterministic component mapping and feedback loops
│   ├── 01-component-selection-matrix.md      # Intent-to-primitive mapping (Dialog, Sheet, Popover, Toast)
│   ├── 02-feedback-loops-and-state-orchestration.md # 4-phase loops, Doherty threshold, optimistic UI
│   └── 03-headless-primitives-and-compound-components.md # Compound Lego architecture, FSMs, roving tabindex
└── 05-skills-assessment-and-synthesis/       # Assessment of existing agent skills
    ├── 01-agent-skills-assessment.md         # Deep evaluation of 12 agent UI/UX skills
    ├── 02-agent-ux-doctrine.md               # Operational checklist for autonomous coding agents
    ├── 03-human-intuition-vs-agentic-patterns.md # Spatial memory vs adaptive shifting, direct manipulation
    └── 04-code-organization-maintainability-and-a11y.md # 3-tier cascade, state modules, direct imports
```

---

## 3. Reading Order by Task

| If You Are... | Read This First | Primary Focus |
| :--- | :--- | :--- |
| **Designing a new view or dashboard** | [02-view-architecture-and-density/01-preventing-view-bloat.md](02-view-architecture-and-density/01-preventing-view-bloat.md) | Surface hierarchy, density budgets, whitespace |
| **Calibrating high-density enterprise tables** | [02-view-architecture-and-density/03-information-density-and-data-ink-ratio.md](02-view-architecture-and-density/03-information-density-and-data-ink-ratio.md) | Data-Ink Ratio, right-aligned numbers, density tiers |
| **Structuring complex forms or workflows** | [02-view-architecture-and-density/02-progressive-disclosure.md](02-view-architecture-and-density/02-progressive-disclosure.md) | Staged disclosure, peeking cues, accordions |
| **Guiding human vision and attention flow** | [01-first-principles/03-visual-salience-and-eye-tracking.md](01-first-principles/03-visual-salience-and-eye-tracking.md) | F-pattern, Gutenberg diagram, 90/10 grayscale rule |
| **Adding contextual toolbars or tables** | [03-branching-and-contextual-actions/01-contextual-action-scoping.md](03-branching-and-contextual-actions/01-contextual-action-scoping.md) | Selection states, row-level actions, action pruning |
| **Choosing a component for an action** | [04-component-action-matrix/01-component-selection-matrix.md](04-component-action-matrix/01-component-selection-matrix.md) | Modal vs Sheet vs Popover vs Inline Banner |
| **Implementing animations and micro-interactions** | [04-component-action-matrix/02-feedback-loops-and-state-orchestration.md](04-component-action-matrix/02-feedback-loops-and-state-orchestration.md) | Scale on press, response thresholds, optimistic UI |
| **Building accessible compound components** | [04-component-action-matrix/03-headless-primitives-and-compound-components.md](04-component-action-matrix/03-headless-primitives-and-compound-components.md) | Compound pattern, FSMs, roving tabindex, focus traps |
| **Organizing UI code and state modules** | [05-skills-assessment-and-synthesis/04-code-organization-maintainability-and-a11y.md](05-skills-assessment-and-synthesis/04-code-organization-maintainability-and-a11y.md) | 3-tier cascade, state modules, direct imports, tokens |
| **Understanding human intuition boundaries** | [05-skills-assessment-and-synthesis/03-human-intuition-vs-agentic-patterns.md](05-skills-assessment-and-synthesis/03-human-intuition-vs-agentic-patterns.md) | Spatial memory, muscle memory, direct manipulation |
| **Reviewing or refactoring existing UI code** | [05-skills-assessment-and-synthesis/02-agent-ux-doctrine.md](05-skills-assessment-and-synthesis/02-agent-ux-doctrine.md) | Audit checklist, AI slop removal, verification pass |

---

## 4. The 6 Cardinal Rules of Implicit Agent UX

1. **Space Over Lines**: Group related controls with spatial proximity first ($8\text{px}$ intra-group to $16\text{px}+$ inter-group). Use separator lines only when space alone fails to carry hierarchy.
2. **Cues Over Words**: Indicate interactive possibilities using subtle affordances (cursor changes, $1\text{px}$ surface elevation, directional chevron signifiers, hover tint) instead of writing explanatory help text.
3. **Show Only Current Relevance**: Do not display actions that are invalid in the current state. Prune inactive branch fields dynamically.
4. **Predictability Trumps Optimization**: Never relocate controls dynamically to "optimize" for recent use. Preserve fixed spatial anchors so human operators develop subconscious muscle memory.
5. **Instant Tactile Acknowledgement**: Acknowledge every interaction within $100\text{ms}$ (using button depression `scale(0.96)`, tactile opacity shift, or immediate optimistic skeleton). Never leave the user wondering if a click was registered.
6. **Progressive Disclosure With Peeking**: When content is deferred, always leave a visible signifier (e.g. peeking $16\text{–}32\text{px}$ past the scroll edge or showing an item count badge). Content hidden without a cue does not exist to the user.
