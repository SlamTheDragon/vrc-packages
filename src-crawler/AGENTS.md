# VRCP Sector 1: Headless Crawler Node (`src-crawler/`)

## Truth Cascade

1. Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00`–`T05`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md).
2. Active 3-file sector ledger: [`docs/scratch-crawler-network/`](../docs/scratch-crawler-network/IMPLEMENTATION_PLAN.md) (`handoff.md` owns **Tier 4A** Crawler Node). Permitted upstream reads: [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1), own Tier 2 / 3A in [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md), [`scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md) (Tier 3B for `vrc-packages-api-preview`), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md). Submit Publication Requests strictly in [`docs/scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md); only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.
3. Owning truth docs: [`crawler_node.md`](../docs/source/specifications/crawler_node.md), [`crawler_node_sqlite.md`](../docs/source/schemas/crawler_node_sqlite.md), [`logging_and_telemetry.md`](../docs/source/schemas/logging_and_telemetry.md), [`failure_and_recovery_matrix.md`](../docs/source/reliability/failure_and_recovery_matrix.md), and [`DELEGATES.md`](../DELEGATES.md).

## Sector Boundaries and Invariants

- **Entry point**: `src/main.ts` compiled with Bun into headless binary `vrcp-crawler-node`. There is no coordinator binary inside `src-crawler/`.
- **Leased-only ingestion**: Fetch strictly under unexpired coordinator leases (`/v1/node/jobs/claim`) with independent fixed local deadline enforcement. Coordinator unavailability halts all fetching (fail closed).
- **Delegated robots and zero binaries**: Execute coordinator-leased RFC 9309 `robots.txt` preflight checks with pinned DNS / SSRF guards. Never download executables or binary archives (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`).
- **Durable outbox**: Persist undelivered receipts in node-local SQLite (`node.db`) for crash/restart recovery without re-fetching settled jobs. Broadcast `[ACTIVITY]` and `[FINDING]` events to `latest.log`.
- **Cross-project isolation**: Never import from `../src-worker` or `../src-package`. Consume `vrc-packages-api` (preview) and `vrc-packages-network` (GitHub Release tarball) strictly as declared dependencies.
- **No Watchtower / pinned Docker digests**: Keep `docker-compose.yml` free of host Docker socket mounts and require isolated data volumes per node.

## Domain Verification

Run from `src-crawler/`:

```powershell
bun run typecheck
bun test
bun run build:dev
```
