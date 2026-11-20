# Source Documentation Truth (System Reliability and Schemas)

This directory holds the authoritative truth for system reliability and agreed schemas across VRC Packages (VRCP). Each table, column, route, export, and bound matches live code.

Refer to [SYSTEM_MAP.md](SYSTEM_MAP.md) for three references: documentation partition rules, the sector map, and verification commands.

## Source Directory Map

| Folder | Scope | Documents |
| :--- | :--- | :--- |
| **Root** | Context cascade and publishing. | [SYSTEM_MAP.md](SYSTEM_MAP.md), [PUBLISHING.md](PUBLISHING.md), [CHANGELOG.md](CHANGELOG.md). |
| **`schemas/`** | Storage and wire contracts. | [coordinator_d1.md](schemas/coordinator_d1.md), [crawler_node_sqlite.md](schemas/crawler_node_sqlite.md), [logging_and_telemetry.md](schemas/logging_and_telemetry.md), [wire_and_protocol_contracts.md](schemas/wire_and_protocol_contracts.md). |
| **`specifications/`** | Sector component specifications. | [coordinator_worker.md](specifications/coordinator_worker.md), [crawler_node.md](specifications/crawler_node.md), [desktop_client.md](specifications/desktop_client.md), [consumer_sdk_and_web.md](specifications/consumer_sdk_and_web.md). |
| **`reliability/`** | Recovery bounds and wiki staging. | [failure_and_recovery_matrix.md](reliability/failure_and_recovery_matrix.md), [proposed_wiki_changes.md](reliability/proposed_wiki_changes.md). |

## Navigation

- [System Map and Context Cascade](SYSTEM_MAP.md).
- [Owner Truth and Vision](../research/decisions/VISION.md).
- [Research Corpus Index](../research/README.md).
- [Legal Notices and Operational Covenants](../../LEGAL.md).
- [Root Agent Entry Point](../../AGENTS.md).
- [Agent Workspace Guidance](../../.agents/README.md).
