# Wire, Package Export, Token, and Pagination Contracts

> **Executable Authorities:** `src-worker/packages/network/package.json` (`v2026.10.8`), `src-package/package.json` (`v2026.10.11-pre`), `src-worker/src/api/rate_limiter.ts`  
> **Owning Sectors:** Sector 1 (`crawler-network`) and Sector 3 (`api-web`)

This document is the agreed contract reference for shared wire packages, authentication token formats, pagination cursor encoding, and HTTP response headers.

## 1. Internal Network Package (`vrc-packages-network`)

Private single-stream package distributed via versioned GitHub Release tarballs (`src-worker/packages/network/`, `private: true`, no root `.` barrel). Consumed strictly by `src-worker/` and `src-crawler/`.

| Subpath Export | Primary Exported Symbols and Constants |
| :--- | :--- |
| `./node` | `PROTOCOL_VERSION`, `PlatformSchema` (10 platforms), `STOREFRONT_PLATFORMS`, `JobPurposeSchema`, `NodeIdSchema`, `MAX_JOB_URL_LENGTH` (2048), `MAX_ORIGIN_URL_LENGTH` (255), `MAX_ETAG_LENGTH` (256), `MAX_LAST_MODIFIED_LENGTH` (128), `MAX_COORDINATOR_RESPONSE_BYTES` (2 MiB), `MAX_CLAIM_JOBS` (10), `MAX_BATCH_RESULTS` (10), `ClaimRequestSchema`/`ClaimResponseSchema`, `CrawlJobSchema`, `HeartbeatRequestSchema`/`HeartbeatResponseSchema`, `VpmListingIssueSchema`, `ObservationSchema`, `observationMatchesPlatform`, `DiscoveryLeadSchema`, `ResultOutcomeSchema`, `ResultRequestSchema`/`ResultResponseSchema`, `BatchResult*Schema`, `ProtocolErrorSchema`, `NODE_API_JSON_SCHEMAS`. |
| `./evidence` | `EvidenceClassSchema`, `EvidenceClass`. |
| `./ip-policy` | `isPrivateOrReservedIp` (SSRF defense). |
| `./source-targets` | `githubApiRepositoryIdentity`, `isBoothBrowseTarget`, `boothItemIdentity`, `isShopifyProductSitemapTarget`, `shopifyProductLead`, `isSellfyProductTarget`, `sellfyProductIdentity`, `isCustomDomainProductTarget`. |
| `./source-paths` | `isItchSearchUrl`, `buildItchSeedUrls`. |
| `./vpm-version` | `isVpmVersion`, `compareVpmVersions`, `cleanVpmVersion`. |
| `./robots` | `MAX_ROBOTS_BYTES` (512 KiB), `ROBOTS_REFRESH_TIMEOUT_MS` (15,000 ms), `ROBOTS_REFRESH_LEASE_MS` (45,000 ms), `OriginRobotsSnapshotSchema`, `robotsResultAllowsMissingFile`. |
| `./identity` | `CRAWLER_ROBOTS_TOKEN` (`"VRCPDiscoveryBot"`), `ROBOTS_RESTRICTION_TOKENS` (`["VRCPDiscoveryBot", "VRCDiscoveryBot"]`), `crawlerUserAgent`. |
| `./robots-retrieval` | `retrieveRobotsSnapshot`, `RobotsFetcher`, `RobotsRetrieval`. |
| `./catalog-hygiene` | `unescapeHtml`, `MARKETING_BRACKETS`, `cleanTitle`, `cleanTrackingParams`. |

## 2. Consumer SDK Package (`vrc-packages-api` / `vrc-packages-api-preview`)

Public Apache-2.0 TypeScript SDK (`src-package/`). Node job contracts never appear here.

| Subpath Export | Primary Exported Symbols |
| :--- | :--- |
| `.` | Re-exports all subpaths plus `VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (64 KiB), `MAX_SDK_SUCCESS_BYTES` (4 MiB), `CatalogSearchParams`, `SyncDeltasParams`. |
| `./auth` | `IDENTITY_PREFIX`, `APP_TOKEN_*`, `USER_TOKEN_*`, `OPERATOR_TOKEN_REGEX`, formatters and validators. |
| `./types` | `PlatformSchema`, `STOREFRONT_PLATFORMS`, `CatalogIdentityLinkSchema`, `PackageFrontSchema`, `TimestampConfidenceSchema`, `CatalogPackageSchema`, `CatalogCursorSchema`, `encodeCatalogCursor`, `decodeCatalogCursor`. |
| `./taxonomy` | `UmbrellaSchema` (`tools`, `assets`, `avatars`), `ContentRatingSchema`. |
| `./protocol` | Request/response Zod schemas and cursor codecs for `catalog`, `downstream`, `user`, `operator`, and `moderator`. |

### Strict Wire DTO Rules
- Preserve Worker snake-case lead fields without camelCase convenience aliases or synthetic defaults (`R13-C6`).
- Reject unknown properties on strict wire envelopes.
- Operator lead approval and rejection require an explicit caller `reason`.

## 3. Authentication Token Grammar

All issued credentials persist strictly as SHA-256 hashes (except `OPERATOR_TOKEN`, verified via constant-time comparison against Worker secret `env.OPERATOR_TOKEN`):

| Principal | Format / Regex | Total Length | Storage / Authority |
| :--- | :--- | :---: | :--- |
| **Crawler Node** | `^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$` | 73 chars | `node_credentials.token_hash`; 4-hex suffix encodes 10-platform bitmask (`0x03ff`). |
| **Operator** | `^[a-fA-F0-9]{64}$` | 64 chars | `env.OPERATOR_TOKEN` secret. |
| **Registered User / Moderator** | `^vrcp_usr_[a-f0-9]{64}$` | 73 chars | `registered_users.token_hash`; moderator endpoints require `is_moderator = 1` AND `age_verified = 1`. |
| **Downstream Application** | `^vrcp_app_[a-f0-9]{64}$` | 73 chars | `registered_apps.token_hash` + `permissions_json` + `candidate_status`. |

## 4. Keyset Pagination and Cursor Encoding

- **Opaque cursor contract**: Copy returned cursors unchanged to the same route. Cursors never grant access or bypass authentication.
- **Bounds**: Canonical IDs <= 500 chars; cursor tokens <= 8,192 base64url chars; ISO timestamps <= 128 chars.
- **UTF-8 encoding (`R49-C29`)**: Pure ASCII JSON uses base64url directly; non-ASCII JSON carries a `u1_` UTF-8 prefix. Invalid UTF-8, padding, noncanonical JSON, oversized tokens, and wrong route payloads fail closed (`400`).
- **Ordering**: Catalog, search, and moderator pages sort descending by timestamp and identifier; delta pages (`/v1/app/index/delta`) sort ascending by update/tombstone timestamp and identifier.

## 5. Standard Error, Cache, and Rate-Limit Headers

- **Standard API error envelope**: `{ schemaVersion: 1, code, error }` (note: `/v1/operator/init` 401 and global 404/500 fallbacks currently emit `{ error }` without `schemaVersion`/`code`).
- **Rate-limit 429 response (`rateLimitResponse`)**: `{ schemaVersion, code: "rate_limited", error }` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining: "0"`, `X-RateLimit-Reset`, `Cache-Control: no-store`, and `Access-Control-Allow-Origin: *`.
- **Caching**:
  - `GET /v1/app/index` and `GET /v1/app/index/delta`: `Cache-Control: public, max-age=60` on `<400`; `Cache-Control: no-store` on all errors.
  - All authenticated/mutation routes (`/v1/node/*`, `/v1/operator/*`, `/v1/user/*`, `/v1/moderator/*`, `/v1/app/register`, `/v1/app/index/search`, `/v1/app/report`, `/v1/app/claims/intake`): `Cache-Control: no-store`.
