<!-- LOCKED DOCUMENTATION - DO NOT CHANGE HEADERS AND TOP-LEVEL DESCRIPTION & NAVIGATION. CHANGES MUST PRESERVE BULLET-POINT DELIVERY IN SUB-HEADERS. SUMMARIES MUST BE COMPACTED, AND ALWAYS FALL INSIDE THE SPECIFIED SUMMARY HEADER -->
<!-- CLEAR ENTRIES DURING PUBLISHING -->

# Changelog

Here are the latest changelogs of each package and applications. For a full history, please visit [docs/changelogs](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs)

## What Changed

<!-- MASTER_SUMMARY -->
Delegate robots.txt preflight fetching to crawler nodes under coordinator leases. Preserve evidence, settled outbox results and URL resource distinctions. Broadcast crawler activities and findings to the dedicated log file. Auto-link approved high-confidence storefront leads into accepted identity links while isolating heuristic outbound links for operator review. Support distributed Cloudflare KV rate limiting for coordinator endpoints. Calibrate fixed coordinator crawl job leases to 120 seconds. Scale crawler heartbeat pulse intervals dynamically between 5 and 30 seconds based on origin duration. Gate creator takedown submissions on trusted registered application status and route requests into moderator review queues. Emit delist tombstones on package withdrawal. Enforce source access profile publication rights in public catalog and delta feeds. Configure initial approved VPM community seeds and classify Ko-fi storefront leads into operator review. Verify multi-platform crawler fleet ingestion across VPM, GitHub, Booth, and Ko-fi drivers under lease isolation and crash recovery. Verify coordinator failure paths and multi-node fleet allocation in native workerd runtime. Bound claim candidate scans with explicit invocation budgets to protect Cloudflare quotas. Remove Watchtower from crawler Docker configuration and require isolated fleet data volumes. Automate preview D1 schema verification and non-production seed population in Cloudflare Worker preview delivery. Add atomic preparation rollback and enforce publication preconditions before tag deletion in delivery recovery tooling. Support catalog search rating filters and strict credential and path validation in the TypeScript SDK. Consolidate internal SDK protocol schemas and test fixture hygiene. Export shared node robots protocol schemas and unified IP validation in `vrc-packages-network`. Centralize source-target policies, binary URL guards, and storefront lead classification. Partition Worker D1 storage into five control planes, normalize error and rate-limit responses, enforce takedown proofs and app delegation audits, and verify live VPM crawling against preview deployments. Bind provisioned preview KV namespace `0a8237b498334dd7b1f58fb7807a68c6` for `RATE_LIMIT_KV` in `src-worker/wrangler.toml`. Add operator node and crawl job listing schemas, keyset cursors, and SDK client methods.
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
Adopt shared network robots validation and target guards, remove obsolete pre-lease modules, and verify multi-process fleet exclusion and outbox replay.
<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->
### Added
- **Multi-process fleet and outbox replay verification:** Verify concurrent multi-process origin-lease mutual exclusion and crash-restart SQLite outbox batch replay across isolated node processes.
### Bugs Fixed
### Changes
- **Robots refresh wire validation:** Validate `/v1/node/robots/claim` and `/v1/node/robots/result` payloads in `CoordinatorClient` with `vrc-packages-network/node` schemas and typed daemon calls.
- **Shared target and binary guards:** Enforce `ARCHIVE_BINARY_EXTENSIONS`, `isArchiveOrBinaryUrl`, `isStorefrontProductTarget`, `parseGitHubOwnerRepo`, and `normalizeGitHubRepositoryUrl` from `vrc-packages-network/source-targets`.
- **Pre-lease surplus removal:** Delete unused pre-lease circuit breaker, adaptive limiter, local robots parser, SimHash, IANA registry, and token identity modules from `src-crawler/`.
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
Synchronize internal peer compatibility with vrc-packages-api-preview 2026.11.3-pre.
<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
### Added
### Changes
- **Preview SDK peer synchronization:** Update `peerDependencies["vrc-packages-api"]` to accept `vrc-packages-api-preview` `2026.11.3-pre`.
See full history at [docs/changelogs/vrcp-packages-network/](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-network/)
