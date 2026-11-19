---
trigger: always_on
description: "Portable runtime toolchains, validation scripts, and strict Sector 4 root distribution pipeline isolation."
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
4. **Sector 4 (Root Distribution Pipeline) strict isolation**:
   - Keep root distribution pipeline and monorepo management (`package.json`, `scripts/`, `.github/workflows/`, `config.versions.json`, `config.preview.versions.json`, `tests/`) strictly distinct from product runtime feature work.
   - **Never run root-level tests (`bun test ./tests`) unless root-level tooling (`scripts/`, `tests/`, `package.json`, root configs) changed.**
   - Do not hand-edit `config.versions.json`, `config.preview.versions.json`, or root `CHANGELOG.md`; always invoke root scripts (`bun run publish:*`, `bun run versions:*`, `bun run recovery:*`).
   - Sub-project `publish:*` and `prepare:dev` scripts must forward to the root `package.json` executor rather than duplicating delivery logic.
