# VRCP Sector 1: Headless Crawler Node (`src-crawler/`)

## Owning Truth

1. Obey root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md).
2. Read the Sector 1 ledger in [`docs/scratch-crawler-network/`](../docs/scratch-crawler-network/IMPLEMENTATION_PLAN.md) (`handoff.md` Tier 4A Crawler Node).
3. Specifications: [`crawler_node.md`](../docs/source/specifications/crawler_node.md), [`crawler_node_sqlite.md`](../docs/source/schemas/crawler_node_sqlite.md), [`logging_and_telemetry.md`](../docs/source/schemas/logging_and_telemetry.md), [`failure_and_recovery_matrix.md`](../docs/source/reliability/failure_and_recovery_matrix.md), and [`DELEGATES.md`](../DELEGATES.md).

## Sector Boundaries and Invariants

- **Entry point**: Bun compiles `src/main.ts` into the headless binary `vrcp-crawler-node`. No coordinator binary exists in `src-crawler/`.
- **Leased ingestion**: Fetch only during unexpired 120s coordinator leases (`/v1/node/jobs/claim`) with local deadline timers. Stop fetching if the coordinator is offline.

- **Delegated robots and zero binaries**: Run leased RFC 9309 `robots.txt` checks with pinned DNS and SSRF guards. Never download binary archives (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`).
- **Durable outbox**: Save undelivered receipts in `node.db` for crash recovery without re-fetching settled jobs. Write `[ACTIVITY]` and `[FINDING]` lines to `latest.log`.

- **Cross-project isolation**: Never import from `../src-worker` or `../src-package`. Consume `vrc-packages-api` and `vrc-packages-network` only from `package.json` dependencies.
- **Container safety**: Keep `docker-compose.yml` free of host Docker socket mounts. Give each node an isolated data volume.

## Domain Verification

Run from `src-crawler/`:

```powershell
bun run typecheck
bun test
bun run build:dev
```
