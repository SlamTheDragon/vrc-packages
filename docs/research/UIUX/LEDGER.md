# UI/UX Research & Discovery Ledger

**Location**: `docs/research/UIUX/`  
**Anchor Rule**: Strict write containment inside `docs/research/UIUX/` only. Attach nowhere else.  
**Lifecycle Flow**: Research $\rightarrow$ Understand $\rightarrow$ Plan $\rightarrow$ Write $\rightarrow$ Organize $\rightarrow$ Summarize $\rightarrow$ Repeat.  
**Information Hierarchy**: Folders $\rightarrow$ Files $\rightarrow$ Sections $\rightarrow$ Paragraphs $\rightarrow$ Sentences (ASD-STE100 compliant).

---

## 1. Objective & Mandate

Create an authoritative, first-principles UX engineering research repository to teach autonomous agents:
1. **Visual Hierarchy & Salience**: How to let users navigate and what needs to be "seen" implicitly with subtle visual signifiers rather than verbose text generation.
2. **Anti-Bloat & Density Budgeting**: How to prevent accidental overpopulation of single views.
3. **Information Density & The Data-Ink Ratio**: Edward Tufte's data-ink maximization, enterprise vs consumer density, density scaling tiers (compact, default, comfortable), and zone-based density.
4. **Eye-Tracking & Attention Flow**: Guiding human vision via F-patterns, Gutenberg reading gravity (the 4 optical quadrants), Z-patterns, bottom-up salience, and the monochromatic 90/10 discipline.
5. **Human Intuition vs. Agentic Patterns**: Spatial and muscle memory invariants (predictability trumps optimization), direct manipulation vs delegated surprise, avoiding the blank chat box fallacy, and 8pt/4pt Gestalt rules.
6. **Contextual Revelation & Progressive Disclosure**: Spatial and temporal mechanisms for staging information.
7. **Contextual Action Branching**: Dynamically surfacing actions and form fields relevant strictly to immediate user intent and situational context.
8. **Component-Action Selection Matrix**: Mapping user intent and action gravity to deterministic component primitives.
9. **Tight Feedback Loops**: Tactile, visual, and temporal response orchestration (<400ms Doherty threshold, optimistic updates, ambient cues).
10. **Agent Skills Assessment**: Synthesizing existing agent skills (`better-layout`, `better-ui`, `make-interfaces-feel-better`, `better-writing`, `better-accessibility`, `baseline-ui`, `ui-sdk`, `mobile-feed-experience`, `frontend-design`, `improve-ui`, `better-interface`, `fixing-motion-performance`) into actionable design doctrine.

---

## 2. Milestone Gates

| ID | Milestone | Current Results | Author Comments |
| :--- | :--- | :--- | :--- |
| **M1** | Research & Synthesis Plan | verified | Comprehensive ledger, architecture, and skill mapping established |
| **M2** | Core First Principles (Folder 01) | verified | Cognitive load, Gestalt, Affordance/Signifier, Hick's/Fitts's Laws, Visual Salience & Scan Patterns complete |
| **M3** | View Architecture & Density (Folder 02) | verified | View budgeting, progressive disclosure, Tufte Data-Ink Ratio, and density scaling tiers complete |
| **M4** | Contextual Action Branching (Folder 03) | verified | Situational action surfacing, floating selection bars, dynamic form pruning complete |
| **M5** | Component-Action Matrix & Loops (Folder 04) | verified | Intent-to-primitive matrix, 4-phase feedback loops, tactile physics complete |
| **M6** | Skills Assessment & Agent Doctrine (Folder 05) | verified | Exhaustive evaluation of 12 agent skills, operational checklist, and Human Intuition vs Agentic Patterns complete |
| **M7** | Final Review, Link Audit & Goal Checkpoint | verified | Cross-folder verification, link audit (476 docs, 0 errors), ASD-STE100 compliance verified |

---

## 3. Task Slices

| Status | ID | Problem | Related-Code(s) | Reason | Solution | Author Comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `verified` | S01 | Missing UX research repository structure | `docs/research/UIUX/` | Agents lack systematic guidance on visual hierarchy and progressive disclosure | Establish `LEDGER.md` and `README.md` defining scope, lifecycle, and reading hierarchy | |
| `verified` | S02 | Lack of formal first-principles grounding | `docs/research/UIUX/01-first-principles/` | Agents rely on styling templates rather than cognitive and ergonomic foundations | Author `01-cognitive-load-and-perception.md` and `02-interaction-laws-and-signifiers.md` | |
| `verified` | S03 | Accidental overpopulation of single views | `docs/research/UIUX/02-view-architecture-and-density/` | Agents generate cluttered screens with 50+ simultaneous controls | Author `01-preventing-view-bloat.md` and `02-progressive-disclosure.md` | |
| `verified` | S04 | Inflexible static action layouts | `docs/research/UIUX/03-branching-and-contextual-actions/` | Actions are displayed globally regardless of state or selection | Author `01-contextual-action-scoping.md` and `02-branching-navigation-trees.md` | |
| `verified` | S05 | Ambiguity in component selection & feedback | `docs/research/UIUX/04-component-action-matrix/` | Agents misuse modals, toolbars, and alerts; omit tactile feedback loops | Author `01-component-selection-matrix.md` and `02-feedback-loops-and-state-orchestration.md` | |
| `verified` | S06 | Disconnected agent skills corpus | `docs/research/UIUX/05-skills-assessment-and-synthesis/` | 12+ UI skills exist in isolation without a unified UX doctrine | Author `01-agent-skills-assessment.md` and `02-agent-ux-doctrine.md` | |
| `verified` | S07 | Broken internal links or non-orthogonal prose | `docs/research/UIUX/` | Documentation drift or broken references across research files | Execute link validation, cross-reference check, and goal checkpoint audit | |
| `verified` | S08 | Uncalibrated enterprise density & data-ink waste | `docs/research/UIUX/02-view-architecture-and-density/` | Agents vacillate between chaotic data dumping and excessive consumer whitespace | Author `03-information-density-and-data-ink-ratio.md` detailing Tufte's ratio, density tiers, and zone density | |
| `verified` | S09 | Unstructured visual scanning & visual noise | `docs/research/UIUX/01-first-principles/` | Agents scatter focal points without understanding human eye scan patterns | Author `03-visual-salience-and-eye-tracking.md` detailing F/Z/Gutenberg patterns and 90/10 grayscale rule | |
| `verified` | S10 | Agentic UI patterns violating human intuition | `docs/research/UIUX/05-skills-assessment-and-synthesis/` | Dynamic AI layout shifts destroy muscle memory; blank chat boxes force recall over recognition | Author `03-human-intuition-vs-agentic-patterns.md` formalizing spatial memory, direct manipulation, and boundaries | |
| `verified` | S11 | Final cross-document link and hierarchy audit | `docs/research/UIUX/` | Verify all 14 research documents link seamlessly and pass link audit | Execute `check_doc_links.ts` and verify clean directory tree | |
