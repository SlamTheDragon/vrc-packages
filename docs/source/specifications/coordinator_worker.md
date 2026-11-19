# Coordinator Worker Specification (`src-worker/`)

> **Executable Entry Point:** `src-worker/src/worker_entry.ts` (Cloudflare Worker + D1 `VRCP_D1`)  
> **Owning Sector:** Sector 1 (`crawler-network`)  
> **Related Schemas:** [`coordinator_d1.md`](../schemas/coordinator_d1.md), [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

The Coordinator is an API-only Cloudflare Worker (`vrcp-worker`) directing distributed crawler nodes, storing observations in D1 (`VRCP_D1`), enforcing source-access profiles and publication rights, and serving consumer APIs. There is no coordinator binary and no static website assets bound to `src-worker/wrangler.toml`.

## 1. Implemented HTTP Route Inventory

Every route below is verified directly against `src-worker/src/worker_entry.ts` and `src-worker/src/api/*.ts`.

### 1.1 Crawler Node Protocol (`/v1/node/*`, `handler.ts`)
Requires `Authorization: Bearer vrcp_<64-hex><4-hex>` (`Cache-Control: no-store`, `X-RateLimit-*` on 2xx):
- `POST /v1/node/jobs/claim`: Claims 1 to 10 (`maxJobs`, default 1) eligible jobs matching node capabilities, active `SourceAccessProfile`, and valid robots snapshot. Scans up to `MAX_CLAIM_SCAN_PAGES = 3` pages (`LIMIT 100`, max 300 candidates). Empty claims return `retryAfterMs = 5000`.
- `POST /v1/node/heartbeat`: Verifies active lease authority and updates `node_heartbeats`. Does **not** extend the 120s lease deadline.
- `POST /v1/node/jobs/result`: Submits one observation/lead/diagnostic outcome (also accepts batch arrays when `Array.isArray(payload.results)`). Commits leads, source events, receipt, and lease updates in one D1 batch.
- `POST /v1/node/jobs/results`: Submits a batch of up to `MAX_BATCH_RESULTS = 10` results atomically per item.
- `POST /v1/node/robots/claim`: Claims a 45s lease (`ROBOTS_REFRESH_LEASE_MS`) to fetch stale/missing `robots.txt` for a target origin. Empty claims return `retryAfterMs = 60000`.
- `POST /v1/node/robots/result`: Stores the node-fetched `origin_robots` snapshot (24h TTL on 2xx/404/410; 1h TTL on other statuses).

### 1.2 Operator Control Protocol (`/v1/operator/*`, `worker_entry.ts` & `operator_handler.ts`)
Requires `Authorization: Bearer <64-hex OPERATOR_TOKEN>` (`Cache-Control: no-store`):
- `POST /v1/operator/init`: Initializes `D1_SCHEMA_SQL`; when `autoSeed: true`, calls `seedInitialJobs()` only (never invents `source_access_profiles` or fake robots bodies).
- `POST /v1/operator/jobs`: Enqueues an audited manual candidate job (does not grant fetch permission without a matching profile).
- `POST /v1/operator/nodes` (`201`) and `POST /v1/operator/nodes/{nodeId}/revoke`: Issues one-time capability-encoded node credentials (auto-selecting top 3 needed platforms via `evaluateWorkforceDistribution` when omitted) and revokes nodes.
- `GET /v1/operator/leads`, `POST /v1/operator/leads/{64-hex}/approve`, `POST /v1/operator/leads/{64-hex}/reject`: Keyset-paginated lead review; approve/reject require an explicit caller `reason`.
- `GET /v1/operator/source-profiles`, `POST /v1/operator/source-profiles` (`201`), `POST /v1/operator/source-profiles/{id}/disable`: Manages scoped `GET`-only fetch/retain/publish policies; disabling invalidates active leases.
- `GET /v1/operator/autoqueue-rules`, `POST /v1/operator/autoqueue-rules` (`201`), `POST /v1/operator/autoqueue-rules/{id}/disable`: Manages expiring path-scoped lead promotion rules.
- `GET /v1/operator/catalog`: Lists canonical catalog entries.
- `GET /v1/operator/takedowns` and `POST /v1/operator/takedowns/{id}/verify`: Lists `creator_opt_outs` and records operator verdicts.
- `GET /v1/operator/claims` and `POST /v1/operator/claims/{id}/verify`: Lists `delegated_creator_claims` and records operator verdicts.
- `GET /v1/operator/apps`, `POST /v1/operator/apps/{appId}/delegation`, `POST /v1/operator/apps/{appId}/candidate-review`: Manages registered applications, delegation permissions (`takedowns:submit`, `claims:delegate`), and candidate status reviews.

### 1.3 User, Downstream App, Public, and Moderator Protocols
- **User (`/v1/user/*`, `user_handler.ts`, Auth `vrcp_usr_`)**: `GET /v1/user/apps`, `GET /v1/user/apps/{appId}`.
- **Public Catalog (`/v1/app/*`, `public_handler.ts`, unauthenticated, `Access-Control-Allow-Origin: *`)**:
  - `GET /v1/app/index` (`Cache-Control: public, max-age=60` on `<400`, `no-store` on error)
  - `GET /v1/app/index/delta` (streams general-rated upserts unioned with `catalog_tombstones`, ascending by timestamp/ID)
- **Downstream App (`/v1/app/*`, `downstream_handler.ts`, `Access-Control-Allow-Origin: *`, `no-store`)**:
  - `POST /v1/app/register` (`201`, Auth `vrcp_usr_` or `OPERATOR_TOKEN`)
  - `POST /v1/app/index/search` (Auth `vrcp_app_` + `catalog:search`; unverified apps clamp strictly to `content_rating = 'general'`; accepts optional `rating` for verified apps)
  - `POST /v1/app/report` (Auth `vrcp_app_`; demand/issue returns `200`, requiring `demand:feedback` for demand; `removal_request` returns `202` and requires trusted app + `takedowns:submit`/`claims:delegate`, routing into `catalog_tickets` as `'removal_report'`)
  - `POST /v1/app/claims/intake` (`202`, Auth `vrcp_app_` + `claims:delegate`)
- **Moderator (`/v1/moderator/*`, `moderator_handler.ts`, Auth `vrcp_usr_` with `isModerator && ageVerified`)**:
  - `GET /v1/moderator/ratings` (counts `rating_dispute` and `removal_report`, excluding `safety_quarantine`), `POST /v1/moderator/ratings/{canonicalId}`
  - `GET /v1/moderator/apps`, `POST /v1/moderator/apps/{appId}/candidate-review`

## 2. Distributed Rate-Limiting Policies (`rate_limiter.ts`)

`createRateLimiter(env)` selects the active backend in strict precedence: `RATE_LIMIT_KV` (`KvRateLimiter`) -> `VRCP_KV` (`KvRateLimiter`) -> `RATE_LIMITER` (`CloudflareBindingRateLimiter`) -> `InMemoryRateLimiter` (local fallback). All windows are 60 seconds:

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

## 3. Identity Auto-Linking, Tombstones, and Candidate Flagging (`coordinator.ts`)

- **Auto-linking confidence and `review_state`**:
  - VPM (`complete`): `evidence_kind = 'vpm_id'`, `confidence = 1.0`, `review_state = 'accepted'`.
  - GitHub (`complete`, matched to accepted VPM link): `evidence_kind = 'repository_match'`, `confidence = 0.7`, `review_state = 'provisional'`.
  - Storefront standalone (`complete`, no prior link): creates canonical entry + `cross_storefront_link`, `confidence = 1.0`, `review_state = 'accepted'`.
  - Storefront cross-link: approved `source_leads` match (`status = 'approved'`) sets/upgrades `confidence = 0.95`, `review_state = 'accepted'` (`R13-C9-IDENTITY`); unverified heuristic outbound links stay `confidence = 0.8`, `review_state = 'provisional'` and do not project public fronts.
  - Desktop tool evidence (`classifyDesktopTool`): recorded when `confidence >= 0.8`.
- **Delta tombstones (`catalog_tombstones`)**: Recorded on general-to-non-general rating withdrawal (`rating_withdrawn`), general package hard deletion (`deleted`), and delist request (`delisted`).
- **High-intensity app flagging (`recordAppActivity`)**: At `request_count >= 50`, transitions `candidate_status` from `'none'` to `'review_pending'` with flags `["intensive_usage", "high_frequency_api"]`.
- **Next-fetch rescheduling**: Normal `done` = `+24h`; `rate_limited` = `+retryAfterSeconds`; `temporary_failure` = `+15m`; `blocked` = `+3d`.
