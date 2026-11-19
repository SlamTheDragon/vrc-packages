# Crawler Infrastructure, Cloudflare Quotas, and Dependency Research

> **Status:** Investigative Infrastructure Research (Not Deployed Capacity Proof)  
> **Owning Sector:** Sector 5 (`legal-research`) / Sector 1 (`crawler-network`)  
> **Related Current Source:** [`coordinator_worker.md`](../../source/specifications/coordinator_worker.md), [`failure_and_recovery_matrix.md`](../../source/reliability/failure_and_recovery_matrix.md)

This document consolidates Cloudflare D1/KV/Workers/Queues capacity limits, four-clock fleet scheduling arithmetic, GitHub CI storage bounds, third-party dependency adoption rules, the Cloudflare panel setup checklist, and historical spike diagnostics.

## 1. Cloudflare D1, KV, Workers, and Queues Limits (`Retrieved`)

Owner planning scenario (unmeasured): 10 crawler nodes, 1,000 concurrent users, and potential separate registry/user databases in production and preview (4 D1 databases total). Live code currently binds one `VRCP_D1` database per environment without Firebase verification (`R50-C30`).

| Service / Metric | Cloudflare Free Tier | Cloudflare Paid Tier | Critical Design Constraint |
| :--- | :--- | :--- | :--- |
| **D1 Reads** | 5,000,000 rows/day (account-wide) | 25B rows/month included (overage billed) | Multiple D1 DBs share one account quota; resets 00:00 UTC; exhaustion blocks queries. |
| **D1 Writes** | 100,000 rows/day (account-wide) | 50M rows/month included (overage billed) | Indexes reduce reads but increase write amplification and storage. |
| **D1 Queries per Invocation** | 50 queries / invocation | 1,000 queries / invocation | Live coordinator enforces `MAX_CLAIM_SCAN_PAGES = 3` and `executeBatchChunked(50)`. |
| **D1 Storage / Count** | 10 DBs, 500 MB/DB, 5 GB account | 50,000 DBs, 10 GB/DB, 5 GB included (1 TB cap) | Paid plan includes 5 GB storage, not 1 TB free. |
| **Workers Requests & CPU** | 100,000 req/day; 10 ms CPU/req | 10M req + 30M CPU ms/month (\$5/mo); 30s HTTP CPU default (up to 5m) | Network/DB I/O wait does not count as CPU; exceeding CPU triggers Error 1102. |
| **Workers KV** | 100,000 reads/day; 1,000 writes/day | Metered | **Eventually consistent (60s+)**; never use KV as immediate credential revocation authority. |
| **Cloudflare Queues** | 10,000 ops/day; 24h retention | Metered (write+read+delete = 3 ops/msg) | Pull leases do not enforce source profiles, robots, or origin pacing; never put CF tokens on nodes. |

### Four Separate Fleet Clocks (Not One Sync Interval)
1. **Source revisit clock**: `+24h` normal, `+15m` temporary failure, `Retry-After` on rate-limit, `+3d` blocked. Fleet windows must never override `Retry-After`.
2. **Assignment and idle liveness clock**: Idle claims at `1s` across 10 nodes equal $10 \times 86{,}400 = 864{,}000$ requests/day (exceeding Free limits). Live code replaces fixed `1s` polling with an adaptive idle backoff ladder (`5s` to `60s`, `1.5x`, `±20%` jitter) and `30s` idle heartbeats (`R50-C31`).
3. **Active lease authority clock**: Live code fixes leases at `120s` and scales active heartbeats dynamically (`5s`–`30s`) while enforcing a monotonic local deadline (`R54-C39A/B`).
4. **Result upload and catalog sync clock**: Per-result or batched outbox delivery under idempotency keys (`MAX_BATCH_RESULTS = 10`). Never restore prototype `09e9dc8` rowid-checkpoint sync (misses in-place mutations).

### D1 Capacity and Authentication Research
- Splitting into 4 databases changes foreign keys, joins, and atomic transaction boundaries (`R50-C30`). Measure actual `rows_read`, `rows_written`, CPU ms, and storage per endpoint on preview before splitting databases.
- Firebase public signing keys can be cached per `Cache-Control: max-age`, but signature verification still requires claim checks and separate session revocation. Never treat KV cache as primary revocation authority.
- Use Wrangler numbered SQL migrations for future production schema evolution rather than HTTP DDL auto-migration (`R14-C14`).

## 2. GitHub CI Storage and Cross-Channel Package Distribution (`Historical`, 2026-10-05)

- **GitHub Actions cache/artifact limits**: Public repos get 10 GB cache storage with 7-day unused eviction. Snapshot measured 63 caches (1.30 GB, including 23 Bun executable caches at 847 MB) and 55 Actions artifacts (787 MB).
- **Retention formula**: $(\text{daily uploaded bytes} \times \text{retention days}) + \text{pending staging inputs} + \text{retained data}$. Never delete published GitHub Release assets or immutable npm/GHCR versions during cache cleanup.
- **Single-stream `vrc-packages-network` across two SDK channels (`R57-NETWORK-SINGLE`)**:
  - Accepted design: `vrc-packages-network` declares `vrc-packages-api` as a `peerDependencies` union (`<release> || <preview>`) without bundling SDK code or copying `nodeId` schemas into two mutable authorities.
  - Installers must never use `--force` or `--legacy-peer-deps`; verify packed tarballs in clean consumers.
  - Keep versioned immutable product tags distinct from any moving development tags.

## 3. Third-Party Dependency Adoption Matrix

| Dependency | Decision | Rationale and Adoption Constraints |
| :--- | :--- | :--- |
| `cheerio`, `zod`, `semver`, `@trybyte/robotstxt-parser` | **Keep** | Narrow pure primitives; enforce canonical SemVer and RFC 9309 mode tests. |
| `Crawlee`, `Supercrawler` | **Research only** | Adopt only if a narrow module removes custom code without adding competing queues, auto-traversal, or local schedulers. |
| `node-crawler` | **Reject** | Local pacing cannot enforce fleet-wide origin budgets; HTML parsing duplicates Cheerio. |
| Native Workers/D1 + runtime HTTP | **Prefer** | Eliminates custom coordinator binaries and lock-in. |

**Mandatory adoption test**: Mock transport + bounded fixture proving zero unleased requests, zero auto-traversal, redirect blocking, body size caps, cancellation on authority loss, coordinator-owned pacing, unchanged DTOs, and disabled archive/evasion features.

## 4. Cloudflare Panel Setup Checklist

*(Operational reference linked from [`DELEGATES.md`](../../../DELEGATES.md). Recommendations only; verify directly in the Cloudflare dashboard before deploying.)*

### Build and Dependency Settings (Workers & Pages -> API Worker -> Settings > Build)
- **Repository and branch control**: Keep connected repo; disconnect automatic `main`-push production builds (`R52-C34`) so tagged GitHub Actions workflows own deployments.
- **Root directory**: `src-worker` (`src/worker_entry.ts`; `src-web` is a separate static site).
- **Build command**: `bun run check` followed by `bun run build:preview` (or `build:release` dry-run).
- **Deploy command**: `npx wrangler deploy --autoconfig=false` with project-local Wrangler.
- **Build variables**: Pin matching `BUN_VERSION` (`1.4.2`) and `NODE_VERSION` (`>= 22.12.0`).
- **Registry authentication**: Supply a read-only npm token as a build secret only if private registry access is ever required; never expose publish tokens or `OPERATOR_TOKEN` in build logs or source.

### Runtime and Environment Settings
- Set `OPERATOR_TOKEN` in runtime **Variables & Secrets** (build secrets never become runtime secrets).
- Keep D1 binding `VRCP_D1` consistent across default and preview configs while preserving distinct production and preview database IDs (`remote = false` is local development only).
- Bind distributed rate-limiting KV (`RATE_LIMIT_KV`) per environment.
- Keep staging/preview and production Workers, D1 databases, and secrets strictly separate (Wrangler bindings and secrets do not inherit across environments).
- Run production schema migrations as a separate reviewed step (never auto-seed production D1 on `main` pushes).

## 5. Historical Spike Counterexamples (`Historical`, 2026-09-27 to 2026-10-03)

These early counterexamples shaped live regression tests and must never regress:
1. **Browser-target bundle**: Portable compilation does not prove `workerd` or D1 runtime compatibility.
2. **Non-atomic D1 claim race**: Separate eligibility read before unconditional write granted two live leases for one job; fixed with atomic CAS batching (`R13-C1`).
3. **Invented bootstrap robots**: Fabricated allow snapshots hid missing preflight; replaced by node-delegated RFC 9309 preflight (`R13-C2`, `R24-C21`).
4. **Empty `publishClasses` exposure**: Items with `publishClasses: []` previously leaked into public catalog projection; fixed and tested (`R13-C3`).
5. **Unverified delist mutation**: Unverified notice immediately set canonical lifecycle to `delisted`; remains tracked under `R13-C4`.
6. **Withdrawn tutorial estimates**: All earlier unmeasured RPS, memory, deduplication accuracy, and cloud-cost figures are permanently withdrawn.
