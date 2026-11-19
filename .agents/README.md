# Agent Workspace Guidance: VRC Packages (VRCP)

Antigravity discovers flat `.agents/rules/*.md` files, each `.agents/skills/<name>/SKILL.md`, and directory-scoped `AGENTS.md` files across the monorepo.

## Authoritative Truth Cascade

Follow the Level 0 to Level 4 cascade before editing any code or document:

1. **Level 0 (Owner Intent)**: [`AGENTS.md`](../AGENTS.md) and [`VISION.md`](../docs/research/decisions/VISION.md) (`T00` and task-relevant `Txx`).
2. **Level 1 (System Routing and Legal Boundaries)**: [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md) and [`LEGAL.md`](../LEGAL.md).
3. **Level 2 (Active Sector Control Ledger)**: Anchored 2-file sector ledger (`docs/scratch-<sector>/IMPLEMENTATION_PLAN.md` and `task_tracker.md`).
4. **Level 3 (Three-Domain Documentation Partition)**:
   - **Current Source Truth**: [`docs/source/`](../docs/source/README.md) (`schemas/`, `specifications/`, `reliability/`) and the owning sector `AGENTS.md` (truth for system reliability and agreed schemas).
   - **Human Application Wiki**: [`docs/applications/`](../docs/applications/README.md) (**keep untouched**; stage proposed changes in [`docs/source/reliability/proposed_wiki_changes.md`](../docs/source/reliability/proposed_wiki_changes.md) until owner approval).
   - **Research Corpus**: [`docs/research/`](../docs/research/README.md) (`decisions/`, `legal/`, `markets/`, `architecture/`, `audits/`), strictly separated from `docs/source/`.
5. **Level 4 (Live Verification)**: Executable source and domain test fixtures inside the owning `src-*` folder (or primary statutory/policy citations for Sector 5).

## Five Monorepo Responsibility Sectors

| Sector | Anchor | Paths | Branch(es) |
| :--- | :--- | :--- | :--- |
| **1. Crawler Network** | `crawler-network` | `src-worker/`, `src-worker/packages/network/`, `src-crawler/` | `preview/crawler-network` |
| **2. Crawler Desktop Client** | `desktop-client` | `src-crawler-client/` | `preview/desktop-client` |
| **3. Consumer API and Web** | `api-web` | `src-package/`, `src-web/`, `src-web-search/` | `preview/workers-api`, `preview/web` |
| **4. Root Distribution Pipeline** | `pipeline` | Root `package.json`, `scripts/`, `.github/workflows/`, `config*.versions.json`, `tests/` | `main`, `release/*` |
| **5. Legal Research and Covenants** | `legal-research` | `LEGAL.md`, `docs/research/` | Feature / `main` |

## The Three Pillars of AI Failure and Anti-Bloat Discipline

1. **Pillar 1 ($O(n^2)$ quadratic context limits)**: Bound tool reads with line ranges and targeted symbol searches instead of dumping whole files.
2. **Pillar 2 (Sparse attention across long contexts)**: Trace inbound callers, outbound dependencies, wire schemas, and cross-sector contracts deterministically.
3. **Pillar 3 (Decoupled RAG and indexing blind spots)**: Triangulate search hits against live code, tests, schemas, and primary citations. Never treat a search snippet as ground truth.
4. **Economic Trap (Jevons Paradox and bloat)**: Prefer simplification, consolidation, and code deletion over adding wrappers, duplicated helpers, or redundant notes.

## Master Rules (`.agents/rules/`)

Rules `00` through `08` use `trigger: always_on`. Rule `09` uses `trigger: model_decision` for frontend UI surfaces:

- [`rules/00-authority-and-truth.md`](rules/00-authority-and-truth.md): Truth-source cascade, read-only default, three-domain doc partition (`docs/source/` vs `docs/applications/` vs `docs/research/`), Version 0 restructuring, and contradiction deferral.
- [`rules/01-small-vertical-slices.md`](rules/01-small-vertical-slices.md): Iterative slice and gating lifecycle, 5-sector `docs/scratch-<sector>/` anchoring, anti-bloat offloading, local commits vs gate pushes, and publishing discipline.
- [`rules/02-boundary-and-review.md`](rules/02-boundary-and-review.md): Whole-effect review, leased-only ingestion, robots/profile gates, cross-project isolation, and implicit state machine elimination.
- [`rules/03-stop-and-goal-integrity.md`](rules/03-stop-and-goal-integrity.md): Stop hooks never complete goals; zero agentic standby loops and mandatory clean control yield.
- [`rules/04-context-preservation-and-anti-bloat.md`](rules/04-context-preservation-and-anti-bloat.md): Context budgeting, sparse-attention tracing, RAG triangulation, Jevons anti-bloat, and prompt-lineage anchoring.
- [`rules/05-changelog-appendation-management.md`](rules/05-changelog-appendation-management.md): Multi-product pending notes in `docs/source/CHANGELOG.md` and automated root `CHANGELOG.md` publication snapshots.
- [`rules/06-self-management-and-guard-edits.md`](rules/06-self-management-and-guard-edits.md): Resilience, thresholded edit-guard (10+ files or cross-project/legal/pipeline boundary), zero data invention, strict 5-value status parameters, and zero standby loops.
- [`rules/07-documentation-and-diagram-invariants.md`](rules/07-documentation-and-diagram-invariants.md): Three-domain doc separation, GFM tables, quoted Mermaid labels, KaTeX math, and portable repo-relative links.
- [`rules/08-toolchains-and-pipeline-isolation.md`](rules/08-toolchains-and-pipeline-isolation.md): Bun/Node/Wrangler/Python toolchains, validation scripts, and strict Sector 4 root distribution pipeline isolation.
- [`rules/09-frontend-design-system-invariants.md`](rules/09-frontend-design-system-invariants.md): UI component invariants for `src-crawler-client/`, `src-web/`, and `src-web-search/`.

## Master and Diversified Skills

See [`.agents/skills/README.md`](skills/README.md) for the complete catalog of master root governance skills, locked root Cloudflare skills, and diversified Svelte 5 / `shadcn-svelte` sector skills.
