# Wire, Package Export, Token, and Pagination Contracts (Target Blueprint)

> **Target Blueprint Status (`[P18]` / `PN-009`):** Owner-approved Version 0 target contract (2026-11-24). Supersedes pre-rewrite live implementation until Stage 5-6 code slices verify 1:1 parity.  
> **Executable Authorities:** `src-worker/packages/network/package.json`, `src-package/package.json`  
> **Owning Sectors:** Sector 1 (`crawler-network`, Tier 3A) and Sector 3 (`api-web`, Tier 3B)

This document defines the agreed contract reference for shared wire packages, authentication token formats, and keyset pagination encoding. Coordinator HTTP rate limits, error envelopes, and caching headers live in [`coordinator_worker.md`](../specifications/coordinator_worker.md).

## 1. Internal Network Package (`vrc-packages-network`, Sector 1 / Tier 3A)

Private single-stream package distributed via versioned GitHub Release tarballs (`src-worker/packages/network/`, `private: true`, no root `.` barrel). Only `src-worker/` and `src-crawler/` consume this package.

| Subpath Export | Target Exported Symbols and Constants |
| :--- | :--- |
| `./node` | `PROTOCOL_VERSION`, `PlatformSchema` (**9 atomic platforms**, `"curated"` purged), `STOREFRONT_PLATFORMS` (7 storefronts), `JobPurposeSchema` (`"discovery" \| "metadata"`, routing community VPM lists through `platform = 'vpm'` or `'custom_domain'` with `purpose = 'discovery'`), `NodeIdSchema`, `PriorityLaneSchema` (`1 \| 2 \| 3 \| 4`), `VpmQualityFlagSchema`, `MAX_JOB_URL_LENGTH` (2048), `MAX_ORIGIN_URL_LENGTH` (255), `MAX_ETAG_LENGTH` (256), `MAX_LAST_MODIFIED_LENGTH` (128), `MAX_COORDINATOR_RESPONSE_BYTES` (2 MiB), `MAX_CLAIM_JOBS` (10), `MAX_BATCH_RESULTS` (10), `ClaimRequestSchema`/`ClaimResponseSchema`, `CrawlJobSchema` (adds `priorityLane`, `paginationDepth`, `maxPaginationDepth`), `HeartbeatRequestSchema`/`HeartbeatResponseSchema`, `VpmListingIssueSchema`, `ObservationSchema` (adds node-offloaded `ownerKey`, `ownerName`, `qualityFlags`, `avatarCompatibilities`, `desktopToolEvidence`, `vrchatRelevance`, populated `price`, `currency`, `availability`, `storefrontUrl`, `platformTags`), `observationMatchesPlatform`, `DiscoveryLeadSchema`, `ResultOutcomeSchema` (adds bounded pagination `nextPageLead`), `ResultRequestSchema`/`ResultResponseSchema`, `BatchResult*Schema`, `NodeRobotsClaimRequestSchema`/`NodeRobotsClaimResponseSchema`, `NodeRobotsResultRequestSchema`/`NodeRobotsResultResponseSchema`, `ProtocolErrorSchema`, `NODE_API_JSON_SCHEMAS`. |
| `./evidence` | `EvidenceClassSchema`, `EvidenceClass`. |
| `./ip-policy` | `isIp`, `isPrivateOrReservedIp` (strict IPv4/IPv6 SSRF defense). |
| `./source-targets` | `ARCHIVE_BINARY_EXTENSIONS`, `hasArchiveBinaryExtension`, `isArchiveOrBinaryUrl`, `isValidPublicHttpsOrigin` (single-owner SSRF origin validator), `parseGitHubOwnerRepo`, `githubApiRepositoryIdentity`, `githubRepositoryIdentity`, `normalizeGitHubRepositoryUrl`, `normalizeGitHubApiUrl`, `isBoothBrowseTarget`, `boothItemIdentity`, `isBoothProductTarget`, `isGumroadBrowseTarget`, `isGumroadProductTarget`, `isJinxxyBrowseTarget`, `isJinxxyProductTarget`, `isItchTagTarget`, `isItchProductTarget`, `isShopifyProductSitemapTarget`, `shopifyProductLead`, `isShopifyProductTarget`, `isSellfyProductTarget`, `sellfyProductIdentity`, `isCustomDomainProductTarget`, `isStorefrontProductTarget`, `classifyOutboundLeadKind`, `resolveDiscoveryLeadTarget`, `ResolvedDiscoveryLeadTarget`. |
| `./source-paths` | `isItchSearchUrl` (permanent hard block), `buildItchSeedUrls` (VRChat tag browse roots). |
| `./vpm-version` | `isVpmVersion`, `compareVpmVersions`, `cleanVpmVersion`. |
| `./robots` | `MAX_ROBOTS_BYTES` (512 KiB), `ROBOTS_REFRESH_TIMEOUT_MS` (15,000 ms), `ROBOTS_REFRESH_LEASE_MS` (45,000 ms), `RobotsOriginSchema`, `RobotsStatusCodeSchema`, `RobotsBodySchema`, `OriginRobotsSnapshotSchema`, `robotsResultAllowsMissingFile`. |
| `./identity` | `CRAWLER_ROBOTS_TOKEN` (`"VRCPDiscoveryBot"`), `ROBOTS_RESTRICTION_TOKENS` (`["VRCPDiscoveryBot", "VRCDiscoveryBot"]`), `crawlerUserAgent`. |
| `./robots-retrieval` | `retrieveRobotsSnapshot`, `RobotsFetcher`, `RobotsRetrieval`. |
| `./catalog-hygiene` | `unescapeHtml` (decodes decimal/hex numeric and named HTML entities), `cleanTitle` (preserves bracketed compatibility text during extraction before display normalization), `cleanTrackingParams`. |

## 2. Consumer SDK Package (`vrc-packages-api` / `vrc-packages-api-preview`, Sector 3 / Tier 3B)

Public Apache-2.0 TypeScript SDK (`src-package/`). Node job leases never appear here.

| Subpath Export | Target Exported Symbols |
| :--- | :--- |
| `.` | Re-exports all subpaths plus `VRCPackageClient` (with `GET`, `POST`, `PATCH`, `DELETE` transport), `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (64 KiB), `MAX_SDK_SUCCESS_BYTES` (4 MiB), `CatalogSearchParams`, `SyncDeltasParams`. |
| `./auth` | `IDENTITY_PREFIX`, `NODE_TOKEN_REGEX`, `isNodeToken`, `APP_TOKEN_*`, `USER_TOKEN_*`, `OPERATOR_TOKEN_REGEX`, formatters and validators. |
| `./types` | `PlatformSchema` (**9 atomic platforms**, `"curated"` purged), `STOREFRONT_PLATFORMS`, `VerificationStatusSchema` (`"unverified" \| "verified"`), `CatalogRelationSchema`, `CatalogListingSourceSchema`, `PackageFrontSchema`, `TimestampConfidenceSchema`, `CatalogPackageSchema` (extended with `ownerKey`, `ownerName`, `verificationStatus`, `qualityFlags`, `summary`, `tags`, `vpmLatestVersion`, `vpmRepoUrl`, `relations`, `sources`), `CatalogCursorSchema`, `encodeCatalogCursor`, `decodeCatalogCursor`. |
| `./taxonomy` | `UmbrellaSchema` (`tools`, `assets`, `avatars`), `ContentRatingSchema`. |
| `./protocol` | Request/response Zod schemas and cursor codecs for `catalog`, `downstream` (adds `relationship_feedback` signal), `user`, `moderator`, and `operator` (adds `SteeringProfile*` replacing separate `SourceProfile`/`AutoQueueRule` types, removes manual `capabilities` from `IssueNodeCredentialSchema`, adds `UpdateJob*`/`RequeueJob*`/`DeleteJob*`, `BulkApproveLeads*`, `SuppressedTarget*`, `OperatorStatusResponseSchema` with `environment` and `purgeEnabled` plus `queueReadiness`, and `SystemPurge*`). |

### Strict Wire DTO Rules
- Preserve Worker snake-case lead fields without camelCase convenience aliases or synthetic defaults (`R13-C6`).
- Reject unknown properties on strict wire envelopes (`z.strictObject`).
- Operator lead approval, rejection, node revocation, node pruning, and system purge require explicit caller `reason` or typed confirmation tokens.

## 3. Authentication Token Grammar

All issued credentials persist strictly as SHA-256 hashes (except `OPERATOR_TOKEN`, verified via constant-time comparison against Worker secret `env.OPERATOR_TOKEN`):

| Principal | Format / Regex | Total Length | Storage / Authority |
| :--- | :--- | :---: | :--- |
| **Crawler Node** | `^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$` | 73 chars | `nodes.token_hash`. The 4-hex suffix encodes a compact **9-platform bitmask (`0x01ff`)** auto-generated by the Coordinator on registration. Empty capability sets and invalid entropy fail fast. |
| **Operator** | `^[a-fA-F0-9]{64}$` | 64 chars | `env.OPERATOR_TOKEN` secret. |
| **Registered User / Moderator** | `^vrcp_usr_[a-f0-9]{64}$` | 73 chars | `registered_users.token_hash`. Moderator endpoints require `is_moderator = 1` and `age_verified = 1`. |
| **Downstream Application** | `^vrcp_app_[a-f0-9]{64}$` | 73 chars | `registered_apps.token_hash` plus `permissions_json` and `candidate_status`. Only `candidate_status = 'trusted'` with `claims:delegate` attests listing verification. |

## 4. Keyset Pagination and Cursor Encoding

- **Opaque cursor contract:** Copy returned cursors unchanged to the same route. Cursors never grant access or bypass authentication.
- **Bounds:** Canonical IDs are at most 500 chars. Cursor tokens are at most 8,192 base64url chars. ISO timestamps are at most 128 chars.
- **UTF-8 encoding:** Pure ASCII JSON uses base64url directly. Non-ASCII JSON carries a `u1_` UTF-8 prefix. Invalid UTF-8, padding, noncanonical JSON, oversized tokens, and wrong route payloads fail closed (`400`).
- **Ordering:** Catalog, search, and moderator pages sort descending by timestamp and identifier. Delta pages (`/v1/app/index/delta`) sort ascending by update timestamp and identifier.
