# Agent Workspace Guidance: VRC Packages (VRCP)

Antigravity discovers flat `.agents/rules/*.md` files, each `.agents/skills/<name>/SKILL.md`, and directory-scoped `AGENTS.md` files across the monorepo.

## Authoritative Truth Cascade

Follow the Level 0 to Level 4 cascade before editing any code or document:

1. **Level 0 (Owner Intent)**: [`AGENTS.md`](../AGENTS.md) and [`VISION.md`](../docs/research/decisions/VISION.md) (`T00` and task-relevant `Txx`).
2. **Level 1 (System Routing and Legal Boundaries)**: [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md) and [`LEGAL.md`](../LEGAL.md).
3. **Level 2 (Active Sector Control Ledger and Handoff Cascade)**: Anchored 3-file sector ledger (`docs/scratch-<sector>/IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`) plus permitted upstream `handoff.md` ledgers (`Tier 1 Legal/Vision` -> `Tier 2 Worker/Schemas` -> `Tier 3 API/Network` -> `Tier 4 Crawler/Desktop` -> `Tier 5 Web`, overseen by Sector 4 `pipeline`).
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

- [`rules/00-authority-and-truth.md`](rules/00-authority-and-truth.md): Truth-source cascade, read-only default, sector write containment, read-upstream `handoff.md` cascade, three-domain doc partition (`docs/source/` vs `docs/applications/` vs `docs/research/`), Version 0 restructuring, and contradiction deferral.
- [`rules/01-small-vertical-slices.md`](rules/01-small-vertical-slices.md): Iterative slice and gating lifecycle, 5-sector 3-file `docs/scratch-<sector>/` ledgers (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`), pull-only Publication Requests, local commits vs gate pushes, and Pipeline-exclusive changelog transfer and verified-row clearing.
- [`rules/02-boundary-and-review.md`](rules/02-boundary-and-review.md): Whole-effect review, leased-only ingestion, robots/profile gates, cross-project isolation, `handoff.md` cascade containment, and implicit state machine elimination.
- [`rules/03-stop-and-goal-integrity.md`](rules/03-stop-and-goal-integrity.md): Stop hooks never complete goals; zero agentic standby loops and mandatory clean control yield.
- [`rules/04-context-preservation-and-anti-bloat.md`](rules/04-context-preservation-and-anti-bloat.md): Context budgeting, sparse-attention tracing, RAG triangulation, Jevons anti-bloat, prompt-lineage anchoring, and Pipeline-only ledger clearing.
- [`rules/05-changelog-appendation-management.md`](rules/05-changelog-appendation-management.md): Pipeline-exclusive `docs/source/CHANGELOG.md` stewardship, transfer from sector `handoff.md` Publication Requests, post-transfer row clearing, and automated root `CHANGELOG.md` snapshots.
- [`rules/06-self-management-and-guard-edits.md`](rules/06-self-management-and-guard-edits.md): Resilience, thresholded edit-guard (10+ files or cross-project/legal/pipeline boundary), zero data invention, strict 5-value status parameters, Pipeline-only row clearing, and zero standby loops.
- [`rules/07-documentation-and-diagram-invariants.md`](rules/07-documentation-and-diagram-invariants.md): Three-domain doc separation, 3-file sector ledgers, GFM tables, quoted Mermaid labels, KaTeX math, and portable repo-relative links.
- [`rules/08-toolchains-and-pipeline-isolation.md`](rules/08-toolchains-and-pipeline-isolation.md): Bun/Node/Wrangler/Python toolchains, validation scripts, Sector 4 all-handoff oversight, Publication Request intake, and strict root distribution pipeline isolation.
- [`rules/09-frontend-design-system-invariants.md`](rules/09-frontend-design-system-invariants.md): UI component invariants, primary anti-reinvention tooling suite ([`05-recommended-tooling-and-ecosystem-suite.md`](../docs/research/UIUX/05-skills-assessment-and-synthesis/05-recommended-tooling-and-ecosystem-suite.md)), [`docs/research/UIUX/`](../docs/research/UIUX/README.md) UX doctrine, and mandatory pre-code action-path sketches for `src-crawler-client/`, `src-web/`, and `src-web-search/`.

## Master and Diversified Skills

See [`.agents/skills/README.md`](skills/README.md) for the complete catalog of master root governance skills, locked root Cloudflare skills, and diversified Svelte 5 / `shadcn-svelte` sector skills.
