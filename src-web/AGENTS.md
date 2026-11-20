# VRCP Sector 3: Website (`src-web/`)

> **Truth Cascade**: Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00`–`T03`, `T05`, `T06`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md). Active 3-file sector ledger: [`docs/scratch-api-web/`](../docs/scratch-api-web/IMPLEMENTATION_PLAN.md) (`handoff.md` owns **Tier 5** Downstream Web Apps). Permitted upstream reads: [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1), [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md) (Tier 2 / 3A / 4A), own Tier 3B in [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md), [`scratch-desktop-client/handoff.md`](../docs/scratch-desktop-client/handoff.md) (Tier 4B), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md). Owning truth doc: [`consumer_sdk_and_web.md`](../docs/source/specifications/consumer_sdk_and_web.md). Submit Publication Requests strictly in [`docs/scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md); only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.
>
> **Boundaries**: Astro 7 + Svelte 5 site (ToS/legal pages, node distribution/registry, app registry, dashboard). Consume `vrc-packages-api` (release) strictly as a declared dependency; zero sibling imports. Follow [`.agents/rules/09-frontend-design-system-invariants.md`](../.agents/rules/09-frontend-design-system-invariants.md).
>
> **Skills**: Local [`.agents/skills/`](.agents/skills/svelte5-best-practices/SKILL.md) (`svelte5-best-practices`, `svelte-code-writer`, `svelte-core-bestpractices`) and root `web-perf` / `cloudflare`.
>
> **Verification**: `bun run build`.

---

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
