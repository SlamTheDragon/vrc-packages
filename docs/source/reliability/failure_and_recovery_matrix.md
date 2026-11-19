# System Reliability: Failure and Recovery Matrix

> **Scope:** Authoritative System Reliability Truth (Verified Local Controls vs Open Hosted/Fleet Risks)  
> **Owning Sector:** Sector 1 (`crawler-network`) / Cross-Sector Verification

This matrix separates **verified executable safeguards** from **unverified hosted or operational risks**. Never equate passing unit fixtures with production fleet qualification.

## 1. Failure, Boundary, and Recovery Matrix

| Failure Mode / Trust Boundary | Executable Control in Live Code | Verification Evidence | Remaining Unverified Gap |
| :--- | :--- | :--- | :--- |
| **Concurrent Job Claim Race** | Atomic D1 claim batching (`MAX_CLAIM_SCAN_PAGES = 3`, max 300 candidates/invocation) + `origin_leases` lock. | Native `workerd`/D1 race tests pass (1 winner per job). | Live multi-node D1 row/CPU consumption under 10 nodes (`R50-C31`). |
| **Coordinator Outage / Lease Expiry** | Fail-closed: node stops fetching without unexpired 120s lease; independent monotonic local deadline calibrated via `serverTime` `clockOffsetMs` aborts fetch/staging (`R13-C9-LEASE-DEADLINE`). | Crawler unit + loopback lease-runner tests pass. | Real WAN latency spikes and host clock jumps during active pulls. |
| **Crawler Crash / Restart / 522 Edge Timeout** | Outcomes and idempotency keys stage in SQLite WAL `node_outbox` (`1,000` quota, `24h` TTL) before submission; settled-row SQL guards block reopening `sent`/`dead` rows (`R15-C17`). | Child-termination replay and SQLite-full rollback tests pass locally. | Separate-process Linux/Docker container interruption and host power/I/O failures (`G12`). |
| **Origin Rate Amplification ("Bot-Net" Risk)** | Centralized `origin_leases.min_delay_ms` + `next_allowed_at`; adaptive idle backoff (`5s`–`60s`, `±20%` jitter); dynamic active heartbeats (`5s`–`30s`). | Unit, D1, and fleet simulation tests pass. | Account-wide Cloudflare Free/Paid quota proof under sustained 10-node + 1,000-user load (`R50-C31`). |
| **API Flood / Cloudflare Quota Exhaustion** | Distributed `KvRateLimiter` (`RATE_LIMIT_KV` / `VRCP_KV`) / `CloudflareBindingRateLimiter` across all route families (`rate_limiter.ts`); 256 KiB request body cap; 2 MiB node response ceiling. | Worker unit, Vitest, and native `workerd` smoke pass (`R54-C39C-RATE-LIMIT`). | Node payload JSON parsing before auth check on some paths; `LIKE`/`COUNT` scan cost under large catalogs (`R14-C15`). |
| **Unapproved Source / Stale `robots.txt` / SSRF** | `SourceAccessProfile` required at claim; delegated node robots preflight (`origin_robots`, 24h/1h TTL, 512 KiB cap); pinned DNS + `isPrivateOrReservedIp`, HTTPS 443 `GET` only, zero redirects, zero binary downloads. | Worker + crawler SSRF, redirect, robots, and binary-block tests pass. | Pre-existing bootstrap grants on older DBs (`R13-C2`); live storefront legal clearance (`R13-C11`). |
| **Receipt-vs-Lead Partial D1 Commit** | Discovery leads, source events, receipt, and lease updates commit in one chunked D1 batch (`executeBatchChunked(50)`). | Native D1 first/second-lead failure rollback tests pass (`R47-C26`). | Post-commit automatic lead promotion lacks durable retry (`R47-C26`). |
| **Restricted Publication / Rating Withdrawal Leak** | `buildCatalogPackagesBatch` filters `publishClasses: []` and provisional fronts; unverified apps clamp to `content_rating = 'general'`; `catalog_tombstones` stream `rating_withdrawn`/`deleted`/`delisted` in `/v1/app/index/delta`. | Public catalog protocol and native `workerd` delta tests pass (`R13-C3`, `R13-C9-DELTA`). | Full external age-verification provider integration (`Q-USER-AUTH-REGISTRATION`). |
| **Unsafe Direct Takedown / Report Conflation** | `catalog_tickets` partitions `rating_dispute` (moderators) vs `safety_quarantine` (operators only); trusted apps route `removal_request` into pending `removal_report` (`STAGE-18`). | Worker protocol tests pass (`R56-C56C`, `STAGE-18`). | Direct `submitDelistRequest` and `verifyTakedown` rejection restoration audit (`R13-C4`); cryptographic claim verification (`R54-C38`). |
| **Cross-Project Dependency Leakage** | Independent `src-*` manifests consuming published `vrc-packages-api` and `vrc-packages-network` tarball; zero relative sibling imports or `file:` links. | `tests/preprod_layout.test.ts` static checks pass. | Clean-checkout license/export conformance review (`R15-C18`). |
| **Delivery Crash / Partial Publication** | `rollbackPreparation` cleans unstaged writes before commit (`R60-C60C`); `diagnoseFailure` is read-only; `revertDeliveryTag` checks remote asset absence (`DELIVERY-RECOVERY-GUARDS`). | Root delivery/recovery tests pass locally (`STAGE-20`). | Local dev remote-asset predecessor checks (`STAGE-21` `in_progress`) and frozen crawler tag recovery (`R50-C31-RECOVERY`). |

## 2. Non-Negotiable Verification Rules

1. Run domain verification strictly inside the changed sector (`SYSTEM_MAP.md`).
2. Never treat dry-run `wrangler deploy --dry-run` or in-memory SQLite fixtures as proof of remote Cloudflare D1 deployment or live multi-node fleet behavior.
3. Never run root `bun test ./tests` unless Sector 4 root tooling (`scripts/`, `tests/`, `package.json`, root configs) changed.
