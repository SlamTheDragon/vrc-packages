# Coordinator Worker Specification (`src-worker/`)

> **Executable Entry Point:** `src-worker/src/worker_entry.ts` (Cloudflare Worker, D1 binding `VRCP_D1`, storage planes in `src-worker/src/storage/d1/`)  
> **Owning Sector:** Sector 1 (`crawler-network`)  
> **Related Schemas:** [`coordinator_d1.md`](../schemas/coordinator_d1.md), [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

The Coordinator is an API-only Cloudflare Worker (`vrcp-worker`). It directs distributed crawler nodes, stores observations in D1 (`VRCP_D1`), enforces source-access profiles and publication rights, and serves consumer APIs. There is no coordinator binary and no static website assets bound to `src-worker/wrangler.toml`.

## 1. Implemented HTTP Route Inventory

Each route below matches `src-worker/src/worker_entry.ts` and `src-worker/src/api/*.ts`.

### 1.1 Crawler Node Protocol (`/v1/node/*`, `handler.ts`)

Requires `Authorization: Bearer vrcp_<64-hex><4-hex>`:

- `POST /v1/node/jobs/claim`: Runs a best-effort durable promotion sweep (`retryPendingAutoPromotions`) for `pending_review` leads matching active `lead_autoqueue_rules`, then claims 1 to 10 (`maxJobs`, default 1) eligible jobs matching node capabilities, active `SourceAccessProfile`, and valid robots snapshot. Scans up to `MAX_CLAIM_SCAN_PAGES = 3` pages (`LIMIT 100`, max 300 candidates). Empty claims return `retryAfterMs = 5000`.
- `POST /v1/node/heartbeat`: Verifies active lease authority and updates `node_heartbeats`. Does **not** extend the 120s lease deadline.
- `POST /v1/node/jobs/result`: Submits one observation, lead, or diagnostic outcome (also accepts batch arrays when `Array.isArray(payload.results)`). Commits leads, source events, receipt, and lease updates in one D1 batch, then attempts post-commit auto-queue promotion (logging `promotion_failed` in `operator_audit_log` on error for retry on subsequent node claims).
- `POST /v1/node/jobs/results`: Submits a batch of up to `MAX_BATCH_RESULTS = 10` results atomically per item.
- `POST /v1/node/robots/claim`: Claims a 45s lease (`ROBOTS_REFRESH_LEASE_MS`) to fetch missing or stale `robots.txt` for a target origin. Empty claims return `retryAfterMs = 60000`.
- `POST /v1/node/robots/result`: Stores the node-fetched `origin_robots` snapshot (24h TTL on 2xx, 404, or 410. 1h TTL on other statuses).

### 1.2 Operator Control Protocol (`/v1/operator/*`, `worker_entry.ts` and `operator_handler.ts`)

Requires `Authorization: Bearer <64-hex OPERATOR_TOKEN>`:

- `POST /v1/operator/init`: Initializes `D1_SCHEMA_SQL`. When `autoSeed: true`, calls `seedInitialJobs()` only and never creates default profiles or robots snapshots.
- `GET /v1/operator/jobs` and `POST /v1/operator/jobs`: Lists crawl jobs in descending creation order with `state`, `platform`, `limit`, and `cursor` filters (omitting `lease_id`, `etag`, and `last_modified`). The `POST` route queues an audited candidate job, which requires an active `SourceAccessProfile` before claim.
- `GET /v1/operator/nodes`, `POST /v1/operator/nodes` (`201`), and `POST /v1/operator/nodes/{nodeId}/revoke`: Lists registered nodes with heartbeat state and `status`, `limit`, and `cursor` filters (omitting `token_hash`). The `POST` routes issue capability-encoded credentials (selecting top 3 needed platforms via `evaluateWorkforceDistribution` when omitted) or revoke nodes.
- `GET /v1/operator/leads`, `POST /v1/operator/leads/{64-hex}/approve`, `POST /v1/operator/leads/{64-hex}/reject`: Keyset-paginated lead review. Approve and reject require an explicit caller `reason`.
- `GET /v1/operator/source-profiles`, `POST /v1/operator/source-profiles` (`201`), `POST /v1/operator/source-profiles/{id}/disable`: Manages scoped `GET`-only fetch, retain, and publish policies. Disabling invalidates active leases.
- `GET /v1/operator/autoqueue-rules`, `POST /v1/operator/autoqueue-rules` (`201`), `POST /v1/operator/autoqueue-rules/{id}/disable`: Manages expiring path-scoped lead promotion rules.
- `GET /v1/operator/catalog`: Lists canonical catalog entries.
- `GET /v1/operator/takedowns` and `POST /v1/operator/takedowns/{id}/verify`: Lists `creator_opt_outs` and records operator verdicts.
- `GET /v1/operator/claims` and `POST /v1/operator/claims/{id}/verify`: Lists `delegated_creator_claims` and records operator verdicts.
- `GET /v1/operator/apps`, `POST /v1/operator/apps/{appId}/delegation`, `POST /v1/operator/apps/{appId}/candidate-review`: Manages registered applications, delegation permissions (`takedowns:submit`, `claims:delegate`), and candidate status reviews.

### 1.3 User Protocol (`/v1/user/*`, `user_handler.ts`)

Requires `Authorization: Bearer vrcp_usr_<64-hex>`:

- `GET /v1/user/apps`: Lists registered applications owned by the authenticated user.
- `GET /v1/user/apps/{appId}`: Returns one owned application record without secrets.

### 1.4 Public Catalog Protocol (`/v1/app/*`, `public_handler.ts`)

Unauthenticated read routes (`Access-Control-Allow-Origin: *` on `GET` and `OPTIONS` preflight):

- `GET /v1/app/index`: Lists published general-rated catalog packages with keyset pagination.
- `GET /v1/app/index/delta`: Streams general-rated package upserts unioned with `catalog_tombstones`, ascending by timestamp and identifier.

### 1.5 Downstream Application Protocol (`/v1/app/*`, `downstream_handler.ts`)

Sets `Cache-Control: no-store` and applies origin-validated CORS via `cors.ts`:

- `POST /v1/app/register` (`201`): Requires `vrcp_usr_` or `OPERATOR_TOKEN`. Issues a scoped `vrcp_app_` credential.
- `POST /v1/app/index/search`: Requires `vrcp_app_` with `catalog:search`. Unverified apps clamp strictly to `content_rating = 'general'`. Verified apps can pass an optional `rating` filter.
- `POST /v1/app/report`: Requires `vrcp_app_`. Validates payloads with the strict three-branch `ReportSubmissionRequestSchema` discriminated union. `demand_signal` (`200`) requires `demand:feedback`. `issue_report` (`200`) writes `metadata_issue`, `rating_dispute`, or `safety_quarantine` tickets. `removal_request` (`202`) requires a trusted app (`candidate_status = 'trusted'`, `takedowns:submit`, or `claims:delegate`) and writes a pending `removal_report` ticket.
- `POST /v1/app/claims/intake` (`202`): Requires `vrcp_app_` with `claims:delegate`.

### 1.6 Moderator Protocol (`/v1/moderator/*`, `moderator_handler.ts`)

Requires `Authorization: Bearer vrcp_usr_<64-hex>` with `isModerator` and `ageVerified` enabled:

- `GET /v1/moderator/ratings`: Counts `rating_dispute` and `removal_report` tickets (excluding `safety_quarantine`).
- `POST /v1/moderator/ratings/{canonicalId}`: Updates package `content_rating` and records `catalog_tombstones` when withdrawing from `'general'`.
- `GET /v1/moderator/apps` and `POST /v1/moderator/apps/{appId}/candidate-review`: Lists and reviews candidate applications.

## 2. Distributed Rate-Limiting, Error Envelopes, and HTTP Headers

`createRateLimiter(env)` (`src-worker/src/api/rate_limiter.ts`) selects `KvRateLimiter(env.RATE_LIMIT_KV)` when `RATE_LIMIT_KV` is bound, and falls back to `InMemoryRateLimiter` locally. All rate-limit windows are 60 seconds:

| Policy Key | Requests / 60s | Applied Routes |
| :--- | :---: | :--- |
| `PUBLIC_CATALOG` | 60 | `GET /v1/app/index`, `GET /v1/app/index/delta` |
| `NODE_CLAIM` | 30 | `POST /v1/node/jobs/claim`, `POST /v1/node/robots/claim` |
| `NODE_HEARTBEAT` | 20 | `POST /v1/node/heartbeat` |
| `NODE_RESULT` | 60 | `POST /v1/node/jobs/result`, `/jobs/results`, `/robots/result` |
| `APP_SEARCH` | 120 | `POST /v1/app/index/search` |
| `APP_REPORT` | 30 | `POST /v1/app/report` |
| `APP_CLAIMS_INTAKE` | 30 | `POST /v1/app/claims/intake` |
| `APP_REGISTER` | 100 | `POST /v1/app/register` |
| `USER_ROUTES` | 120 | `/v1/user/*` |
| `MODERATOR_ROUTES` | 120 | `/v1/moderator/*` |
| `OPERATOR_ROUTES` | 1,200 | `/v1/operator/*` |

- **Standard API error envelope:** All routes (including `/v1/operator/init` and global 404 or 500 fallbacks in `worker_entry.ts`) emit `{ schemaVersion: 1, code, error }`.
- **Rate-limit headers:** Success responses attach `X-RateLimit-Limit` and `X-RateLimit-Remaining`. `429` responses emit `{ schemaVersion, code: "rate_limited", error }` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining: "0"`, `X-RateLimit-Reset`, and `Cache-Control: no-store`.
- **Origin-validated CORS (`src-worker/src/api/cors.ts`):**
  - **Public catalog routes** (`/v1/app/index`, `/v1/app/index/delta`): Emit `Access-Control-Allow-Origin: *` on all responses and respond to `OPTIONS` preflight with `204 No Content` (`Access-Control-Allow-Methods: GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 600`, `Cache-Control: public, max-age=60`).
  - **Authenticated browser and application routes** (`/v1/operator/*`, `/v1/moderator/*`, `/v1/user/*`, `/v1/app/register`, `/v1/app/report`, `/v1/app/index/search`, `/v1/app/claims/intake`): Validate `Origin` against `CORS_ALLOWED_ORIGINS` (comma-separated exact origins normalized with `new URL(o).origin`). Never emit wildcard `Access-Control-Allow-Origin: *`. Handle `OPTIONS` preflight in `worker_entry.ts` before authentication and rate limiting: allowlisted origins receive `204 No Content` with `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Max-Age: 600`, and `Cache-Control: no-store`. Missing or unlisted origins on `OPTIONS` receive `403` `{ schemaVersion: 1, code: "cors_origin_forbidden", error: "Origin not allowed" }` without `Access-Control-Allow-Origin`. Non-`OPTIONS` responses to allowlisted origins include `Access-Control-Allow-Origin: <origin>`, `Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After`, and `Vary: Origin`. Non-`OPTIONS` responses without a matching `Origin` omit `Access-Control-Allow-Origin`.
  - **Node lease routes** (`/v1/node/*`): Strictly non-CORS. Never emit `Access-Control-Allow-Origin`.
- **Caching:** `GET /v1/app/index` and `GET /v1/app/index/delta` set `Cache-Control: public, max-age=60` on `<400` and `Cache-Control: no-store` on errors. All other routes set `Cache-Control: no-store`.

## 3. Storage Plane Rules (`src-worker/src/storage/d1/planes/`)

### 3.1 Identity Auto-Linking and Evidence Thresholds (`observation_plane.ts`)

- **VPM (`complete`):** `evidence_kind = 'vpm_id'`, `confidence = 1.0`, `review_state = 'accepted'`.
- **GitHub (`complete`, matched to accepted VPM link):** `evidence_kind = 'repository_match'`, `confidence = 0.7`, `review_state = 'provisional'`.
- **Storefront standalone (`complete`, no prior link):** Creates canonical entry plus `cross_storefront_link`, `confidence = 1.0`, `review_state = 'accepted'`.
- **Storefront cross-link:** Approved `source_leads` matches (`status = 'approved'`) set or upgrade `confidence = 0.95` and `review_state = 'accepted'`. Unverified heuristic outbound links stay `confidence = 0.8` and `review_state = 'provisional'` and do not project public fronts.
- **Desktop tool evidence (`classifyDesktopTool`):** Recorded for linked or matching standalone canonical packages when `confidence >= 0.8`.

### 3.2 Catalog Delta Tombstones (`catalog_plane.ts` and `operator_plane.ts`)

`catalog_tombstones` records `(canonical_id, reason, recorded_at)` on general-to-non-general rating withdrawal (`rating_withdrawn`), general package hard deletion (`deleted`), and delist request (`delisted`). When `verifyTakedown` rejects an opt-out request, it restores prior non-delisted lifecycles and removes the rejected `'delisted'` tombstone unless another accepted opt-out exists.

### 3.3 Application Candidate Flagging (`downstream_and_moderation_plane.ts`)

At `request_count >= 50`, `recordAppActivity` transitions `candidate_status` from `'none'` to `'review_pending'` with flags `["intensive_usage", "high_frequency_api"]`.

### 3.4 Job Rescheduling Cadence (`observation_plane.ts`)

Normal `done` jobs reschedule at `+24h`. `rate_limited` adds `+retryAfterSeconds`. `temporary_failure` adds `+15m`. `blocked` adds `+3d`.
