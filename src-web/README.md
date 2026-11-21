# VRC Packages Web Console (`vrcp-web`)

`src-web/` is the Astro 7 and Svelte 5 Operator and Moderator Admin UI for VRC Packages (VRCP). It belongs to **Sector 3 (`api-web`, Tier 5)**.

## Routes

- `/`: Entry router that directs authenticated sessions to `/operator` or `/moderator` and guests to `/login`.
- `/login`: Runtime bearer token authentication gate and unauthenticated public catalog CORS probe.
- `/operator`: Operator Governance Dashboard for schema initialization, catalog inspection, source access profiles, auto-queue rules, discovery leads, crawl job enqueue, node credentials, takedowns, creator claims, and registered application delegation.
- `/moderator`: Moderator Review Dashboard for content rating queue adjustments and application candidate reviews.
- `/design`: Six-domain UI primitive showcase (`forms/`, `navigation/`, `overlays/`, `feedback/`, `display/`, `telemetry/`, and `workbench/`).

## Cross-Pipeline Integration

`src-web/` consumes the release SDK package (`vrc-packages-api`) strictly over HTTP without sibling relative imports. Static bundles do not store operator or user tokens.

Prepare the checked release SDK tarball from the repository root before building:

```powershell
bun run prepare:dev preview web
```

## Verification Commands

Run these commands inside `src-web/`:

```powershell
bun run check
bun run build
```
