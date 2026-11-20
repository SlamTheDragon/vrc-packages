<!-- LOCKED DOCUMENTATION - DO NOT CHANGE HEADERS AND TOP-LEVEL DESCRIPTION & NAVIGATION. CHANGES MUST PRESERVE BULLET-POINT DELIVERY IN SUB-HEADERS. SUMMARIES MUST BE COMPACTED, AND ALWAYS FALL INSIDE THE SPECIFIED SUMMARY HEADER -->
<!-- CLEAR ENTRIES DURING PUBLISHING -->

# Changelog

Here are the latest changelogs of each package and applications. For a full history, please visit [docs/changelogs](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs)

## What Changed

<!-- MASTER_SUMMARY -->
Consolidate D1 tables, bound SDK pagination, harden public errors and honor coordinator idle waits. Preview notes describe each changed product.
<!-- MASTER_SUMMARY -->

## Table of Contents

### Applications - Release

- [VRC Packages Crawler Client](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Added](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Bugs Fixed](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Changes](#vrc-packages-crawler-client---vrcp-crawler-client)
- [VRC Packages Crawler](#vrc-packages-crawler---vrcp-crawler-node)
  - [Added](#vrc-packages-crawler---vrcp-crawler-node)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-node)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-node)
- [VRC Packages API](#vrc-packages-api---vrcp-packages-api)
  - [Added](#vrc-packages-api---vrcp-packages-api)
  - [Bugs Fixed](#vrc-packages-api---vrcp-packages-api)
  - [Changes](#vrc-packages-api---vrcp-packages-api)

### Internal - Release

- [VRC Packages Web](#vrc-packages-web---vrcp-web)
  - [Added](#vrc-packages-web---vrcp-web)
  - [Bugs Fixed](#vrc-packages-web---vrcp-web)
  - [Changes](#vrc-packages-web---vrcp-web)
- [VRC Packages Cloudflare Workers](#vrc-packages-worker---vrcp-worker)
  - [Added](#vrc-packages-worker---vrcp-worker)
  - [Bugs Fixed](#vrc-packages-worker---vrcp-worker)
  - [Changes](#vrc-packages-worker---vrcp-worker)

### Applications - Preview

- [VRC Packages Crawler Client](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Added](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-client-preview)
- [VRC Packages Crawler](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Added](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-node-preview)
- [VRC Packages API](#vrc-packages-api---vrcp-packages-api-preview)
  - [Added](#vrc-packages-api---vrcp-packages-api-preview)
  - [Bugs Fixed](#vrc-packages-api---vrcp-packages-api-preview)
  - [Changes](#vrc-packages-api---vrcp-packages-api-preview)

### Internal - Preview

- [VRC Packages Web](#vrc-packages-web---vrcp-web-preview-preview)
  - [Added](#vrc-packages-web---vrcp-web-preview-preview)
  - [Bugs Fixed](#vrc-packages-web---vrcp-web-preview-preview)
  - [Changes](#vrc-packages-web---vrcp-web-preview-preview)
- [VRC Packages Cloudflare Workers](#vrc-packages-worker-preview)
  - [Added](#vrc-packages-worker-preview)
  - [Bugs Fixed](#vrc-packages-worker-preview)
  - [Changes](#vrc-packages-worker-preview)

### Internal - Packages

- [VRC Packages Networking](#vrc-packages-network-vrcp-packages-network)
  - [Added](#vrc-packages-network-vrcp-packages-network)
  - [Bugs Fixed](#vrc-packages-network-vrcp-packages-network)
  - [Changes](#vrc-packages-network-vrcp-packages-network)

---

# Applications - Release

## VRC Packages Crawler Client - `vrcp-crawler-client`

<!-- vrcp-crawler-client-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-crawler-client-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-crawler-client/release](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-crawler-client/release)

## VRC Packages Crawler - `vrcp-crawler-node`

<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-crawler-node/release](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-crawler-node/release)

## VRC Packages API - `vrcp-packages-api`

<!-- vrcp-packages-api-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-packages-api-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-packages-api/release](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-api/release)

---

# Internal - Release

## VRC Packages Web - `vrcp-web`

<!-- vrcp-web-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-web-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-web/release](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-web/release)

## VRC Packages Worker - `vrcp-worker`

<!-- vrcp-worker-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-worker-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-worker/release](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-worker/release)

---

# Applications - Preview

## VRC Packages Crawler - `vrcp-crawler-client-preview`

<!-- vrcp-crawler-client-preview-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-crawler-client-preview-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-crawler-client/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-crawler-client/preview)

## VRC Packages Crawler - `vrcp-crawler-node-preview`

<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->
Honor coordinator retry floors and bound idle jitter. Retain existing outbox and lease safeguards.
<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->

### Added
- **Outbox Quota Flow Control**: Paused job claims when pending outbox entries exceed configured limits to avoid memory and disk saturation.
- **Startup Crash Recovery**: Reset interrupted outbox submissions to pending status on daemon start to resume deliveries safely.
- **Periodic Storage Pruning**: Added background TTL maintenance intervals to remove old acknowledged entries during active runs.
- **Batched Outbox Flush**: Updated `flushOutbox` to submit up to 10 results in one request using `submitBatch`.
- **Per-Item Receipt Tracking**: Processed individual accepted and rejected receipts to isolate failures during batch flushes.
- **Batched Claim Support**: Added optional `maxJobs` parameter to `CoordinatorClient.claim` to request multiple jobs.
- **Durable Result Outbox**: Added SQLite WAL-backed `node_outbox` table in `LocalNodeStore` with automatic 24-hour TTL and 50MB disk quota pruning.
- **Crash Recovery & Replay**: Added startup and reconnection outbox flush in `CrawlerNodeDaemon` to replay unacknowledged results without data loss across process crashes or network interruptions.
- **Adaptive Idle Backoff Ladder**: Added exponential idle backoff with jitter. Coordinator wait floors override the local cap; leased jobs reset the ladder.
- **Envelope Wire Bounds**: Enforced 2MB streaming response limits in `CoordinatorClient` and strict length bounds on job URLs, origin URLs, ETags, and Last-Modified headers.

### Bugs Fixed
- **Coordinator Retry Floors**: Prevented idle jitter and local backoff caps from shortening coordinator-requested waits. Capped positive jitter at the effective maximum.
- **Fleet Claim Polling**: Fixed unbounded fleet claim polling by eliminating aggressive 1s spin loops on empty queues, mitigating Cloudflare request allowance exhaustion.

### Changes
- **Headless `.env` Execution**: Removed interactive CLI tooling (`init`, `help`, `printSetupGuide()`) and `node.config.json` setup wizard; daemon now starts directly from environment variables / `.env` (`NODE_ID`, `NODE_TOKEN`, and optional `COORDINATOR_URL`, `NODE_CAPABILITIES`, `NODE_DB_PATH`).
- **Fail-Fast Configuration Validation**: Updated runtime configuration error reporting to fail fast with concise guidance pointing to `.env` variables instead of CLI setup commands. Preserved `--version` and `--once` execution modes.

See full history at [docs/changelogs/vrcp-crawler-node/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-crawler-node/preview)

## VRC Packages API - `vrcp-packages-api-preview`

<!-- vrcp-packages-api-preview-DESCRIPTION_SUMMARY -->
<!-- vrcp-packages-api-preview-DESCRIPTION_SUMMARY -->
### Added
### Bugs Fixed
### Changes
See full history at [docs/changelogs/vrcp-packages-api/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-api/preview)

---

# Internal - Preview

## VRC Packages Web - `vrcp-web-preview-preview`

<!-- vrcp-web-preview-preview-DESCRIPTION_SUMMARY -->
none
<!-- vrcp-web-preview-preview-DESCRIPTION_SUMMARY -->

- none currently

See full history at [docs/changelogs/vrcp-web/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-web/preview)

## VRC Packages Worker - `vrcp-worker-preview`

<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->
<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->
### Added
### Bugs Fixed
### Changes
See full history at [docs/changelogs/vrcp-worker/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-worker/preview)

---

# Internal - Packages

## VRC Packages Network `vrcp-packages-network`

<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
### Added
### Changes
See full history at [docs/changelogs/vrcp-packages-network/](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-network/)
