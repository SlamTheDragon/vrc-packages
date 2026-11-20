# System Reliability: Failure and Recovery Matrix

> **Scope:** Authoritative System Reliability Truth (Verified Local Controls vs Open Operational Gaps)  
> **Owning Sector:** Sector 1 (`crawler-network`) / Cross-Sector Verification

This matrix separates **verified executable safeguards** from **unverified hosted or operational risks**. Never equate passing unit fixtures with production fleet qualification. Active sector tasks and verification status live in [`docs/scratch-crawler-network/IMPLEMENTATION_PLAN.md`](../../scratch-crawler-network/IMPLEMENTATION_PLAN.md) and [`docs/scratch-legal-research/IMPLEMENTATION_PLAN.md`](../../scratch-legal-research/IMPLEMENTATION_PLAN.md).

## 1. Failure, Boundary, and Recovery Matrix

| Failure Mode / Trust Boundary | Executable Control in Live Code | Verification Evidence | Remaining Unverified Gap |
| :--- | :--- | :--- | :--- |
| **Concurrent Job Claim Race** | Atomic D1 batching (`MAX_CLAIM_SCAN_PAGES = 3`, max 300 candidates). Locks `origin_leases`. | Native `workerd`/D1 tests pass. | Live D1 quota under 10 nodes. |
| **Coordinator Outage / Lease Expiry** | Node stops without 120s lease. Monotonic `clockOffsetMs` deadline aborts fetch. | Crawler unit and lease tests pass. | Real WAN latency and clock jumps. |
| **Crawler Crash / Restart / 522 Timeout** | Outcomes stage in WAL `node_outbox` (`1,000` quota, `24h` TTL). Guards lock settled rows. | Crash replay and rollback tests pass. | Linux/Docker power and I/O loss. |
| **Origin Rate Amplification** | Shared `origin_leases` pacing. Adaptive idle backoff (`5s` to `60s`). Active heartbeats (`5s` to `30s`). | Unit, D1, and fleet tests pass. | Sustained 10-node and 1,000-user load. |
| **API Flood / Quota Exhaustion** | Distributed `KvRateLimiter` (`RATE_LIMIT_KV`). Request limit 256 KiB. Response limit 2 MiB. | Worker, Vitest, and `workerd` tests pass. | Pre-auth JSON parse on node paths. |
| **Unapproved Source / Robots / SSRF** | `SourceAccessProfile` gates claims. Node robots TTL (`24h`/`1h`). Pinned DNS, HTTPS 443, zero binaries. | SSRF, redirect, and binary tests pass. | Legacy bootstrap grants and legal clearance. |
| **Receipt-vs-Lead Partial Commit** | Leads, events, receipt, and lease commit in `executeBatchChunked(50)`. | Native D1 rollback tests pass. | Auto-queue rule retry after commit. |
| **Restricted Publication / Withdrawal** | Filters `publishClasses: []`. Unverified apps clamp to `'general'`. Tombstones stream in delta feed. | Catalog and `workerd` delta tests pass. | Full external age-assurance checks. |
| **Unsafe Takedown / Report Conflation** | `catalog_tickets` separates disputes, quarantine, and `removal_report`. Rejection restores prior lifecycles, causes, and tombstones. | Takedown and ticket tests pass. | Delegated claim signature check (`R54-C38`). |
| **Cross-Project Leakage** | Manifests consume `vrc-packages-api` and `vrc-packages-network` tarballs with zero sibling imports. | Layout static checks pass. | Clean-checkout license review. |

## 2. Verification and Release References

Run sector verification strictly from [`SYSTEM_MAP.md`](../SYSTEM_MAP.md). Release recovery and delivery gate checks live in [`PUBLISHING.md`](../PUBLISHING.md).
