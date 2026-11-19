# Current Source Documentation Truth (System Reliability and Agreed Schemas)

Welcome to `docs/source/`. This directory is the **authoritative source of truth for system reliability and agreed schemas for usage** across VRC Packages (VRCP). Every table, column, route, export, and operational bound documented here is verified directly against live executable code.

> [!IMPORTANT]
> **Three-Domain Documentation Partition**:
> - **`docs/source/` (this directory)**: System reliability truth, agreed storage/wire schemas, component specifications, system routing, publishing operations, and pending changelog (`CHANGELOG.md`).
> - **`docs/applications/`**: Human-readable user and API wiki documentation. **Keep `docs/applications/` untouched** during engineering work; stage proposed wiki updates in [`reliability/proposed_wiki_changes.md`](reliability/proposed_wiki_changes.md) until owner approval.
> - **`docs/research/`**: Investigative legal covenants, platform clearance matrices, exploratory architecture, audits, and retained owner decisions ([`docs/research/README.md`](../research/README.md)). Never present research findings as implemented runtime truth.

## Orthogonal Source Directory Map

| Folder / File | Owning Scope | Documents |
| :--- | :--- | :--- |
| **Root Routing & Operations** | Level 0–4 context cascade, publishing procedures, pending release notes | [SYSTEM_MAP.md](SYSTEM_MAP.md), [PUBLISHING.md](PUBLISHING.md), [CHANGELOG.md](CHANGELOG.md) *(locked)* |
| **`schemas/`** | Agreed D1, node SQLite, logging, and wire/SDK protocol contracts | [coordinator_d1.md](schemas/coordinator_d1.md), [crawler_node_sqlite.md](schemas/crawler_node_sqlite.md), [logging_and_telemetry.md](schemas/logging_and_telemetry.md), [wire_and_protocol_contracts.md](schemas/wire_and_protocol_contracts.md) |
| **`specifications/`** | Per-sector executable component specifications (1 owner per component) | [coordinator_worker.md](specifications/coordinator_worker.md), [crawler_node.md](specifications/crawler_node.md), [desktop_client.md](specifications/desktop_client.md), [consumer_sdk_and_web.md](specifications/consumer_sdk_and_web.md) |
| **`reliability/`** | System reliability failure/recovery bounds and staged wiki proposals | [failure_and_recovery_matrix.md](reliability/failure_and_recovery_matrix.md), [proposed_wiki_changes.md](reliability/proposed_wiki_changes.md) |

## Worker and Node Verification Quick Reference

Run domain verification strictly inside the owning project (never run root `bun test ./tests` unless Sector 4 root tooling changes):
- **`src-worker/`**: `bun run check`, `bun run test`, `bun run test:workers`, `bun run build:preview && bun run test:runtime`.
- **`src-crawler/`**: `bun run typecheck`, `bun test`, `bun run build:dev`.
- **`src-crawler-client/`**: `bun run check`, `bun run build:web` (`bun run build:dev` for Rust/Tauri changes).
- **`src-package/`**: `bun run typecheck`, `bun test`.
- **`src-web/`** and **`src-web-search/`**: `bun run build`.

## Navigation

- [System Map and Context Cascade](SYSTEM_MAP.md)
- [Owner Truth and Vision](../research/decisions/VISION.md)
- [Research Corpus Index](../research/README.md)
- [Legal Notices and Operational Covenants](../../LEGAL.md)
- [Root Agent Entry Point](../../AGENTS.md)
- [Agent Workspace Guidance](../../.agents/README.md)
