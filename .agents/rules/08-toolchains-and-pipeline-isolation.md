---
trigger: model_decision
description: "Apply whenever running builds, tests, lint scripts, or modifying Sector 4 root distribution pipeline files (package.json, scripts/, .github/workflows/, config*.versions.json, tests/)."
---

# 08: Toolchains, Validation Scripts, and Root Pipeline Isolation

1. **Primary runtimes and package manager**:
   - Use **Bun** (`bun@1.4.2`, declared in `packageManager`) as the primary JavaScript/TypeScript runtime, test runner, and crawler node compiler.
   - Use **Node.js** (`>= 22.12.0`) for root delivery/versioning scripts (`scripts/*.mjs`) and the native Worker runtime smoke harness (`src-worker/test/coordinator_runtime_smoke.mjs`).
   - Use **Wrangler / workerd** inside `src-worker/` for type generation (`bun run cf-typegen`), preview/release dry-run builds, and local D1 runtime verification.
   - Use **Python 3** for ASD-STE100 linting.
2. **Standard cross-repository validation commands**:
   - Markdown link and layout validation:
     ```powershell
     bun .agents/scripts/check_doc_links.ts
     ```
   - ASD-STE100 prose and changelog validation:
     ```powershell
     python .agents/skills/ste-writing-skill/ste-lint.py docs/source/CHANGELOG.md
     ```
3. **Sector-scoped domain verification**:
   - **Sector 1 (`crawler-network`)**:
     - `src-worker/`: `bun run check`, `bun run test`, `bun run test:workers`, `bun run build:preview`, `bun run test:runtime`
     - `src-crawler/`: `bun run typecheck`, `bun test`, `bun run build:dev`
   - **Sector 2 (`desktop-client`)**:
     - `src-crawler-client/`: `bun run check`, `bun run build:web` (and `bun run build:dev` for Rust/Tauri changes)
   - **Sector 3 (`api-web`)**:
     - `src-package/`: `bun run typecheck`, `bun test`
     - `src-web/` and `src-web-search/`: `bun run build`
   - **Sector 5 (`legal-research`)**:
     - `bun .agents/scripts/check_doc_links.ts` and `python .agents/skills/ste-writing-skill/ste-lint.py <changed-file>`
4. **Sector 4 (Root Distribution Pipeline) strict isolation, oversight, and ledger clearing**:
   - Keep root distribution pipeline and monorepo management (`package.json`, `scripts/`, `.github/workflows/`, `config.versions.json`, `config.preview.versions.json`, `tests/`) strictly distinct from product runtime feature work.
   - **All-sector handoff oversight**: Sector 4 (`pipeline`) agents read and oversee all sector `docs/scratch-<sector>/handoff.md` and `task_tracker.md` ledgers, while ensuring root pipeline scripts stay intact.
   - **Publication Request intake, changelog stewardship, and exclusive row clearing**: Product sectors submit written Publication Requests strictly inside their own `handoff.md`. Only Sector 4 (`pipeline`) agents pick up those requests, transfer verified product notes into `docs/source/CHANGELOG.md` (keeping it tidy in ASD-STE100), clear transferred `verified` rows from sector ledgers (including clearing non-product Sector 5 `legal-research` verified rows without product version bumps), and execute root publication commands (`bun run publish:*`, `bun run versions:*`, `bun run recovery:*`). Pipeline scripts then snapshot `docs/source/CHANGELOG.md` to root `CHANGELOG.md` and append consumed notes into `docs/changelogs/`.
   - **Never run root-level tests (`bun test ./tests`) unless root-level tooling (`scripts/`, `tests/`, `package.json`, root configs) changed.**
   - Do not hand-edit `config.versions.json`, `config.preview.versions.json`, or root `CHANGELOG.md`; always invoke root scripts (`bun run publish:*`, `bun run versions:*`, `bun run recovery:*`).
   - Sub-project `publish:*` and `prepare:dev` scripts must forward to the root `package.json` executor rather than duplicating delivery logic.
