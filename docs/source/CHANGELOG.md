<!-- LOCKED DOCUMENTATION - DO NOT CHANGE HEADERS AND TOP-LEVEL DESCRIPTION & NAVIGATION. CHANGES MUST PRESERVE BULLET-POINT DELIVERY IN SUB-HEADERS. SUMMARIES MUST BE COMPACTED, AND ALWAYS FALL INSIDE THE SPECIFIED SUMMARY HEADER -->
<!-- CLEAR ENTRIES DURING PUBLISHING -->

# Changelog

Here are the latest changelogs of each package and applications. For a full history, please visit [docs/changelogs](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs)

## What Changed

<!-- MASTER_SUMMARY -->
Preserve evidence, settled outbox results and URL resource distinctions. Broadcast crawler activities and findings to the dedicated log file. Isolate provisional storefront fronts from public projection. Emit delist tombstones on package withdrawal. Verify coordinator failure paths and multi-node fleet allocation in native workerd runtime. Bound claim candidate scans with explicit invocation budgets to protect Cloudflare quotas. Remove Watchtower from crawler Docker configuration and require isolated fleet data volumes.
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
Remove Watchtower and host socket mounts from Docker compose. Require pinned image digests and isolate multi-node data volumes. Document environment variables.
<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->
### Added
- **Batch Claim Queueing**: Queue multiple claimed jobs from coordinator responses to prevent abandoned leases in daemon execution.
- **Clock Offset Calibration**: Calibrate local lease deadlines against coordinator serverTime received in heartbeats and date headers.
- **Activity and Finding Broadcast**: Broadcast operational activities and discovery findings with dedicated tags to the node log file.
- **Recovery Checks**: Exercise abrupt process termination over loopback HTTP and actual SQLite-full rollback without filling host disks.
### Bugs Fixed
- **Zero-Binary Ingestion**: Reject URL targets with binary extensions and responses with binary content types before socket or body processing.
- **Timestamp Provenance**: Removed the storefront creation-date fallback from modification evidence. Valid modification metadata remains available.
- **Outbox Settlement**: Ignore late failures for sent or terminal entries. Repeated acknowledgments preserve the first receipt and completion metrics.
- **Lease Deadline**: Abort source work when the lease expires, even if a heartbeat is pending. An expired lease starts no fetch.
### Changes
- **Docker Fleet Configuration**: Removed unverified Watchtower updater and host Docker socket bindings. Required pinned container image digests and documented multi-node volume isolation.
- **Environment Template**: Rewrote .env.example with documented configuration values for headless node and Docker fleet deployments.
- **Runbook Reconciliation**: Updated node and network specifications to reflect environment-variable configuration, activity logging, and delta tombstones.
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
Bound claim candidate scans by an explicit page budget. Verify coordinator failure paths and multi-node fleet allocation in native workerd runtime. Use unique catalog epochs, preserve evidence and URL distinctions, withhold provisional fronts, and emit delist tombstones.
<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->
### Added
- **Downstream Permission Enforcement**: Verify application permissions for catalog search and demand feedback, returning 403 on missing permissions.
- **D1 High-Frequency Indexes**: Add ten query indexes for canonical packages, crawl jobs, source leads, items, fronts, and apps.
- **Statement Batch Chunking**: Chunk large D1 batch executions into fifty statements to protect subrequest budgets.
- **Source Access Profile Memoization**: Cache active source profile lookups to remove duplicate D1 queries during claims.
- **Claim Invocation Budgets**: Bound candidate scans to three pages per claim invocation. Measured and asserted empty and leased claim D1 statement budgets in native workerd runtime.
- **Runtime Verification Harness**: Extended the native coordinator harness to test capability mismatch, lease expiry, cross-node lease isolation, and multi-node fleet concurrency.
### Bugs Fixed
- **Capability Token Authentication**: Fail closed when bearer tokens do not match the capability format.
- **Claim Loop Budget**: Prevented unbounded claim candidate pagination when deferred jobs occur.
- **Delta Feed Tombstones**: Record tombstones and emit delist deltas when packages leave the public general catalog via rating withdrawal or deletion.
- **Provisional Fronts**: Filter provisional cross-source storefront links from public catalog packages until explicit operator review.
- **Publication Confidence**: Stopped metadata-only canonical upserts from inventing observed confidence or downgrading confirmed publication evidence.
- **Catalog Epochs**: Give fresh databases unique epochs. Concurrent initialization returns the stored winner and preserves existing epochs.
- **Source Binding**: Reject substituted storefront IDs and URLs, empty catalog names and storefront fields from other source platforms.
- **Batch Conflicts**: Keep release-evidence conflicts distinct from terminal lease expiry. Rejected metadata preserves its live job for correction.
- **URL Associations**: Preserve generic path/query case and trailing slashes. Keep case-insensitive repository matching scoped to GitHub sources.
- **Lead Identities**: Deduplicate serialized host/default-port aliases for new leads without changing retained observation links.
### Changes
- **API Route Documentation**: Align AGENTS.md route reference path and document batched job results and operator app delegation endpoints.
- **Fixture Typechecks**: Include Bun TypeScript tests and support in Worker checks. Preserve separate Cloudflare Vitest typing and native runtime verification.
- **D1 Fixtures**: Check the SQLite adapter against generated bindings. Reject unsupported operations and foreign batch statements instead of reporting synthetic success.
- **Specification Reconciliation**: Reconciled API routes, network specifications, and database schemas with delivered claim scan budgets, operator app candidate review, and moderator protocol.
See full history at [docs/changelogs/vrcp-worker/preview](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-worker/preview)

---

# Internal - Packages

## VRC Packages Network `vrcp-packages-network`

<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
### Added
### Changes
See full history at [docs/changelogs/vrcp-packages-network/](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-network/)
