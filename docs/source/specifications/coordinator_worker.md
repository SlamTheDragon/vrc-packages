# Coordinator Worker Specification (`src-worker/`)

> **Live Contract Status (`[P18]` / `[P19]` / `[P20]`):** Version 0 live specification verified locally against unit suites, `workerd` runtime tests, and live `wrangler dev` multi-node ingestion (`NODE_HEARTBEAT` = `60` req/60s, remote preview push held under `REORIENT-LIVE-DEBUG`).  
> **Executable Entry Point:** `src-worker/src/worker_entry.ts` (Cloudflare Worker, D1 binding `VRCP_D1`, storage planes in `src-worker/src/storage/d1/`)  
> **Owning Sector:** Sector 1 (`crawler-network`)  
> **Related Schemas:** [`coordinator_d1.md`](../schemas/coordinator_d1.md), [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

The Coordinator is an API-only Cloudflare Worker (`vrcp-worker`). It directs distributed crawler nodes, stores observations in the 17-table D1 database (`VRCP_D1`), enforces loose steering profiles and publication rights, and serves consumer APIs. There is no coordinator binary and no static website assets bound to `src-worker/wrangler.toml`.

## 1. Implemented HTTP Route Inventory

Each route below defines the Version 0 Coordinator contract in `src-worker/src/worker_entry.ts` and `src-worker/src/api/*.ts`.

### 1.1 Crawler Node Protocol (`/v1/node/*`, `handler.ts`)

Requires `Authorization: Bearer vrcp_<64-hex><4-hex>` (compact 9-platform bitmask `0x01ff`):

- `POST /v1/node/jobs/claim`: Runs bounded auto-promotion retry (`retryPendingAutoPromotions`) for `pending_review` leads matching active `steering_profiles` (`auto_promote = 1`). Claims 1 to 10 (`maxJobs`, default 1) due jobs ordered by `priority_lane ASC, next_fetch_at ASC` across `MAX_CLAIM_SCAN_PAGES = 3` (`LIMIT 100`). Uses per-origin fair skipping so one origin never starves other origins. Empty claims return `retryAfterMs = 5000`.
- `POST /v1/node/heartbeat`: Checks active lease authority and updates `nodes` heartbeat columns where `revoked_at IS NULL`. Leaves the 120s lease deadline unchanged.
- `POST /v1/node/jobs/result` and `/v1/node/jobs/results`: Accepts one or up to `MAX_BATCH_RESULTS = 10` pre-sanitized node payloads. Commits `source_items`, `source_leads`, canonical graph rows, `job_results` receipts, pagination leads, and recrawl deadlines in atomic `db.batch()` calls. Runs auto-promotion matching after commit.
- `POST /v1/node/robots/claim`: Claims a 45s lease (`ROBOTS_REFRESH_LEASE_MS`) over `origin_state` constrained by node capabilities and round-robin origin order. Prevents contended head-of-line origin blocking. Empty claims return `retryAfterMs = 60000`.
- `POST /v1/node/robots/result`: Stores `origin_state` robots data (24h TTL on 2xx, 404, or 410, 1h TTL on other codes). Clears `crawl_jobs.robots_deferred_until` in Statement 1 before clearing `refresh_lease_id` in Statement 2 so deferred jobs unblock cleanly.

### 1.2 Operator Control Protocol (`/v1/operator/*`, `worker_entry.ts` and `operator_handler.ts`)

Requires `Authorization: Bearer <64-hex OPERATOR_TOKEN>`:

- `GET /v1/operator/status`: Returns `environment` (`development`, `preview`, or `production`), `purgeEnabled` (`env.VRCP_ENV === "development"`), and `queueReadiness` (claimable vs blocked counts and demand signals).
- `POST /v1/operator/init`: Initializes the 17-table `D1_SCHEMA_SQL`. Never fabricates unauthorized source profiles, grants, or fake placeholder jobs.
- `POST /v1/operator/system/purge`: Development-only purge endpoint gated strictly by `env.VRCP_ENV === "development"` (fails closed with HTTP `403` otherwise). Requires `confirm: "PURGE_DEVELOPMENT_D1"`. Supports `preserveNodes` (default `true`) and opt-in `seedPreviewStarter` (default `false`), then rebuilds the 17-table schema. Opt-in `seedPreviewStarter: true` inserts 16 real starter profiles across the 8 concrete V0 platforms (`vpm`, `github`, `booth`, `gumroad`, `jinxxy`, `itch`, `shopify`, `sellfy`). It excludes `template-package` and `/sample-*` placeholders.
- `GET /v1/operator/jobs`, `POST /v1/operator/jobs`, `PATCH /v1/operator/jobs/{jobId}`, `POST /v1/operator/jobs/{jobId}/requeue`, and `DELETE /v1/operator/jobs/{jobId}`: Lists crawl jobs with claimability blockers and `priorityLane` values (omitting secrets). `POST /v1/operator/jobs` preserves `state = 'done'` unless `POST .../requeue` explicitly re-arms the job. `PATCH` updates `priorityLane` and schedule fields. `DELETE` prunes unleased jobs.
- `GET /v1/operator/nodes`, `POST /v1/operator/nodes` (`201`), `POST /v1/operator/nodes/{nodeId}/revoke`, and `DELETE /v1/operator/nodes/{nodeId}`: Lists registered nodes without `token_hash`. `POST /v1/operator/nodes` auto-generates capabilities inside Coordinator from claimable jobs and demand signals (no `+1` empty floor). Rejects manual `capabilities` input and counts pending non-revoked nodes before first heartbeat.
- `GET /v1/operator/leads`, `POST /v1/operator/leads/{64-hex}/approve`, `POST /v1/operator/leads/{64-hex}/reject`, `POST /v1/operator/leads/bulk-approve`, and `POST /v1/operator/leads/suppress-domain`: Keyset-paginated lead review grouped by `target_host`, with single or bulk custom-domain approval, suppression, and explicit caller reasons.
- `GET /v1/operator/steering-profiles`, `POST /v1/operator/steering-profiles` (`201`), `PATCH /v1/operator/steering-profiles/{id}`, `POST /v1/operator/steering-profiles/{id}/enable`, `POST /v1/operator/steering-profiles/{id}/disable`, and `DELETE /v1/operator/steering-profiles/{id}`: Unified CRUD lifecycle replacing source profiles and auto-queue rules. Supports `exact`, `wildcard_subdomain` (`*.domain-name.root`), and `any_vpm_https` rules, bounded pagination queries, `autoPromote`, and instant kill-switches. Evaluates remaining active profiles after updating `disabled_at`.
- `GET /v1/operator/suppressed-targets`, `POST /v1/operator/suppressed-targets`, and `DELETE /v1/operator/suppressed-targets`: Manages exact URL, origin, and whole-domain hard blocks in `suppressed_targets`.
- `GET /v1/operator/catalog`, `GET /v1/operator/takedowns`, `POST /v1/operator/takedowns/{id}/verify`, `GET /v1/operator/claims`, `POST /v1/operator/claims/{id}/verify`, `GET /v1/operator/apps`, `POST /v1/operator/apps/{appId}/delegation`, and `POST /v1/operator/apps/{appId}/candidate-review`: Inspects catalog entries and runs takedown, claim, and app trust governance.

### 1.3 User Protocol (`/v1/user/*`, `user_handler.ts`)

Requires `Authorization: Bearer vrcp_usr_<64-hex>`:

- `GET /v1/user/apps` and `GET /v1/user/apps/{appId}`: Lists or returns application records owned by the authenticated user without secrets.

### 1.4 Public Catalog Protocol (`/v1/app/*`, `public_handler.ts`)

Unauthenticated read routes (`Access-Control-Allow-Origin: *` on `GET` and `OPTIONS` preflight):

- `GET /v1/app/index`: Lists published general-rated atomic `canonical_packages` rows with `ownerKey`, `ownerName`, `verificationStatus`, `qualityFlags`, `summary`, `tags`, `vpmLatestVersion`, `relations`, and `sources`.
- `GET /v1/app/index/delta`: Streams general-rated package upserts and inline deleted/delisted/withdrawn `canonical_packages` tombstones ascending by `updated_at` and `canonical_id`.

### 1.5 Downstream Application Protocol (`/v1/app/*`, `downstream_handler.ts`)

Sets `Cache-Control: no-store` and applies origin-validated CORS via `cors.ts`:

- `POST /v1/app/register` (`201`): Requires `vrcp_usr_` or `OPERATOR_TOKEN`. Issues a scoped `vrcp_app_` credential.
- `POST /v1/app/index/search`: Requires `vrcp_app_` with `catalog:search`. Unverified apps clamp strictly to `content_rating = 'general'`. Verified apps can pass an optional `rating` filter.
- `POST /v1/app/report`: Requires `vrcp_app_`. Validates payloads with strict discriminated `ReportSubmissionRequestSchema`: `demand_signal` (`200`), `relationship_feedback` (`200`, writing `downstream_signals` and updating `listing_relations` counters), `issue_report` (`200`), and trusted-app `removal_request` (`202`).
- `POST /v1/app/claims/intake` (`202`): Requires `vrcp_app_` with `candidate_status = 'trusted'` and `claims:delegate`. Accepts delegated creator verification attestations and audited metadata/relationship corrections.

### 1.6 Moderator Protocol (`/v1/moderator/*`, `moderator_handler.ts`)

Requires `Authorization: Bearer vrcp_usr_<64-hex>` with `isModerator` and `ageVerified` enabled:

- `GET /v1/moderator/ratings` and `POST /v1/moderator/ratings/{canonicalId}`: Reviews `rating_dispute` and `removal_report` tickets, updates `content_rating`, and marks withdrawn `'general'` rows with `tombstone_reason = 'rating_withdrawn'`.
- `GET /v1/moderator/apps` and `POST /v1/moderator/apps/{appId}/candidate-review`: Lists and reviews candidate applications.

## 2. Cloudflare Environments, Rate-Limiting, and CORS

### 2.1 Three-Target Wrangler Configuration (`src-worker/wrangler.toml`)

Obeys Cloudflare Workers multi-environment isolation rules (bindings and `vars` never inherit across `[env.*]` blocks, and production `database_id` never lives at top level):

| Wrangler Target | Deployed Worker Name | `VRCP_ENV` | Bound Resources & Purpose |
| :--- | :--- | :---: | :--- |
| **Top-level (local default)** | Local `wrangler dev` | `development` | Local emulated D1 (`VRCP_D1`) and KV. System Purge UI enabled locally. |
| **`[env.preview]`** | `vrc-package-crawler-preview` | `development` (V0) | Preview D1 (`fbef6ce1-4145-45ae-ae91-5d617a1f2672`), preview `RATE_LIMIT_KV`, and preview CORS origins. Switchable to `"preview"` post-V0. |
| **`[env.production]`** | `vrc-package-crawler` | `production` | Production D1 (`722bdd0d-92ca-445b-9319-da0b27adf7b2`) and dedicated production `RATE_LIMIT_KV`. System Purge returns HTTP `403`. |

Generate Worker binding types strictly via `wrangler types` and declare `worker_entry.ts` with `satisfies ExportedHandler<Env>`. Never hand-patch `Cloudflare.Env`.

### 2.2 Distributed Rate-Limiting and Error Envelopes (`rate_limiter.ts`)

`createRateLimiter(env)` selects `KvRateLimiter(env.RATE_LIMIT_KV)` when `RATE_LIMIT_KV` is bound, and falls back to `InMemoryRateLimiter` locally. All rate-limit windows are 60 seconds:

| Policy Key | Requests / 60s | Applied Routes |
| :--- | :---: | :--- |
| `PUBLIC_CATALOG` | 60 | `GET /v1/app/index`, `GET /v1/app/index/delta` |
| `NODE_CLAIM` | 30 | `POST /v1/node/jobs/claim`, `POST /v1/node/robots/claim` |
| `NODE_HEARTBEAT` | 60 | `POST /v1/node/heartbeat` |
| `NODE_RESULT` | 60 | `POST /v1/node/jobs/result`, `/jobs/results`, `/robots/result` |
| `APP_SEARCH` | 120 | `POST /v1/app/index/search` |
| `APP_REPORT` | 30 | `POST /v1/app/report` |
| `APP_CLAIMS_INTAKE` | 30 | `POST /v1/app/claims/intake` |
| `APP_REGISTER` | 100 | `POST /v1/app/register` |
| `USER_ROUTES` | 120 | `/v1/user/*` |
| `MODERATOR_ROUTES` | 120 | `/v1/moderator/*` |
| `OPERATOR_ROUTES` | 1,200 | `/v1/operator/*` |

- **Standard API error envelope:** All routes and global fallbacks in `worker_entry.ts` emit `{ schemaVersion: 1, code, error }`.
- **Rate-limit headers:** Success responses attach `X-RateLimit-Limit` and `X-RateLimit-Remaining`. `429` responses emit `Retry-After`, `X-RateLimit-*`, and `Cache-Control: no-store`.
- **Origin-validated CORS (`src-worker/src/api/cors.ts`):** Public catalog routes emit `Access-Control-Allow-Origin: *` with `Cache-Control: public, max-age=60`. Authenticated routes validate `Origin` against `CORS_ALLOWED_ORIGINS`, answer allowlisted `OPTIONS` preflight with `204 No Content` (`Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`), and return `403 cors_origin_forbidden` otherwise. `/v1/node/*` never emits CORS headers.

## 3. Storage Plane Rules and Free Tier Offloading

### 3.1 Verification Authority and Auto-Linking (`observation_plane.ts`)

- **Crawled default status:** All crawler-ingested items project to `canonical_packages` with `verification_status = 'unverified'` and deterministic `quality_flags_json` (`skeleton`, `fork_suspected`, `missing_release`, `incomplete_metadata`, `missing_zip_sha256`).
- **Trusted attestation:** Only trusted downstream apps (`candidate_status = 'trusted'`, `claims:delegate`) submit ownership attestations or corrections promoting `verification_status` to `'verified'`.
- **Auto-linking confidence:** Complete VPM `vpm_id` links at `confidence = 1.0` (`accepted`), GitHub repository match at `0.7` (`provisional`), standalone storefronts at `1.0` (`accepted`), approved leads at `0.95` (`accepted`), and unverified outbound links at `0.8` (`provisional`, excluded from public `fronts`).

### 3.2 Worker CPU Offload and Isolate Caching

- **Node-side classification:** Remove avatar compatibility regexes, duplicate `classifyDesktopTool` passes, duplicate URL/title cleaning, and HTML/JSON parsing from `src-worker/`. `observation_plane.ts` consumes pre-sanitized fields on `ObservationSchema` and stores `db.batch()` updates within Cloudflare's 10 ms CPU and 50 query limits.
- **Profile matcher single source:** Call `isValidPublicHttpsOrigin` from `vrc-packages-network/source-targets` across all origin validation. Remove SQL-vs-JS percent-encoding divergence across `workforce_plane.ts`, `shared_context.ts`, and `steering_profile.ts` (and retire legacy `source_access_profile.ts`). Note that `steeringPathMatches` accepts canonical UTF-8 (`>= 0x80`) and `%20` path segments under directory scopes while strictly rejecting `//`, dot segments, malformed UTF-8, uncanonical escapes, and `%2e`, `%2f`, `%5c`, or `%00`.
- **Isolate robots cache:** Move the `robotsMatchers` LRU cache to module scope keyed by `(origin, snapshot_id)` to avoid recompiling 512 KiB bodies per request.

### 3.3 Priority Claim Lanes and Tiered Recrawl Cadences

- **Priority Lanes (`crawl_jobs.priority_lane`):** Lane `1` handles fresh VPM manifests and unresolved `downstream_signals`. Lane `2` handles approved discovery roots and VPM lead feeds. Lane `3` handles storefront metadata and regular recrawls. Lane `4` handles approved bulk custom-domain reviews.
- **Auto-Promotion Boundary:** Discoveries of VPM `index.json` manifests across creator domains auto-promote when matching active `any_vpm_https` steering profiles and passing RFC 9309 robots, strict VPM JSON validation, and `suppressed_targets`. Unknown non-VPM `custom_domain` hosts park in `source_leads` (`pending_review`) with `target_host` grouping.
- **Opt-In Preview Starter Profiles (`default_seeds.ts`):** `initializeDatabase({ autoSeed: false })` creates zero profiles and zero fake jobs. Calling `POST /v1/operator/system/purge` with `seedPreviewStarter: true` in `development` inserts `16` real starter profiles across `8` concrete V0 platforms. Runtime contracts keep `9` platforms (`0x01ff`) and leave Ko-fi and Patreon deferred post-v1.
- **Tiered Rescheduling:** Healthy discovery roots (`purpose = 'discovery'`) reschedule at `+4h`, VPM manifests at `+6h`, and leaf metadata items at `+24h`. `rate_limited` honors `Retry-After`, `temporary_failure` retries at `+15m`, and `blocked` defers `+3d`. Conditional `304 unchanged` results update only `crawl_jobs` and `origin_state`.
