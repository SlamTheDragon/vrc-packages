# Current Source Reference

This directory describes current code capabilities. Candidate details still need comparison with executable source. Owner decisions and open work remain in [the canonical ledger](../scratch/IMPLEMENTATION_PLAN.md).

| Component | Current source | Reference |
| --- | --- | --- |
| API coordinator | `src-worker/src/`, entry `worker_entry.ts`, D1 storage | [Crawler network](SPECIFICATION_CRAWLER_NETWORK.md) |
| Headless node | `src-crawler/src/`, binary `vrcp-crawler-node` | [Node and desktop client](SPECIFICATION_CRAWLER_CLIENT.md) |
| Desktop starter | `src-crawler-client/`, Tauri/Svelte, no bundled node | [Node and desktop client](SPECIFICATION_CRAWLER_CLIENT.md) |
| Static website starter | `src-web/`, Astro/Svelte, no panel or SDK integration | [Website](SPECIFICATION_WEBSITE.md) |
| Consumer contracts | `src-package/`, package `vrc-packages-api` | [API routes](../applications/VRCP%20API/API_ROUTES.md) |
| Storage and logging | Worker D1, node-local `node.db`, structured logs | [Database schemas](DATABASE_SCHEMAS.md) |

API route status separates implemented and planned endpoints. Database tables and broader safeguards still need a field-by-field audit. A candidate specification does not prove deployment, ownership verification or complete recovery.

Public catalog and delta handlers return a fixed `internal_error` message for storage or output-schema failures. These responses and other catalog errors use `Cache-Control: no-store`. Successful pages retain `public, max-age=60`. Failure logs include the route, not the underlying exception or rejected rows.

## Worker verification

Run these commands from `src-worker/`:

- `bun run check`: regenerate binding declarations and typecheck production source, Cloudflare Vitest fixtures and Bun TypeScript tests/support.
- `bun run test`: execute Bun unit and protocol fixtures. Their SQLite adapter is not the native D1 runtime.
- `bun run test:workers`: exercise the configured Worker with isolated local D1 through Cloudflare Vitest.
- `bun run build:preview`, then `bun run test:runtime`: build the preview bundle and exercise isolated workerd/D1 HTTP fixtures.

The Bun type project excludes only the separately checked Vitest fixture. JavaScript harnesses and dependency declarations are not fully statically checked.
The SQLite adapter rejects unsupported sessions, raw queries, dumps and foreign batch statements. Its metadata does not measure D1 billing or performance.
These checks do not deploy, grant source access, prove ownership or establish complete fleet reliability.
