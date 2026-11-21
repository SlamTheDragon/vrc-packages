# Integration Handoff Ledger: Sector 1 (Crawler Network)

## Department Scope and Hierarchy Position

- **Cascade Tiers Owned**:
  - **Tier 2 (Schemas, Workers, and Cloudflare)**: `src-worker/` (`worker_entry.ts`, Cloudflare D1/KV schemas, `docs/source/schemas/coordinator_d1.md`, `docs/source/specifications/coordinator_worker.md`)
  - **Tier 3A (API and Networking: Internal Network Protocol)**: `src-worker/packages/network/` (`vrc-packages-network`, `docs/source/schemas/wire_and_protocol_contracts.md`)
  - **Tier 4A (Headless Crawler Node)**: `src-crawler/` (`vrcp-crawler-node`, `docs/source/schemas/crawler_node_sqlite.md`, `docs/source/specifications/crawler_node.md`)
- **Sector Anchor**: `docs/scratch-crawler-network/` (branch `preview/crawler-network`)
- **Permitted Upstream Reads**:
  - Tier 1: [`docs/scratch-legal-research/handoff.md`](../scratch-legal-research/handoff.md)
  - Tier 3B (when propagating `vrc-packages-api-preview` SDK updates consumed by `src-worker/` and `src-crawler/`): [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md) (Section: Tier 3B)
  - Independent Oversight: [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Downstream Readers**:
  - Tier 3B (`src-package/`) and Tier 5 (`src-web/`, `src-web-search/`) via [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md)
  - Tier 4B (`src-crawler-client/`) via [`docs/scratch-desktop-client/handoff.md`](../scratch-desktop-client/handoff.md)
  - Independent Oversight: Sector 4 Pipeline via [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Write Containment and Ledger Clearing**:
  - Sector 1 agents edit strictly inside `src-worker/`, `src-worker/packages/network/`, `src-crawler/`, their owned `docs/source/` truth files, and `docs/scratch-crawler-network/`.
  - Sector 1 agents **must not** edit `docs/source/CHANGELOG.md`, **must not** run root `bun run publish:*` directly, and **must not** clear or delete `verified` rows from `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or this `handoff.md`.
  - Only Sector 4 (`pipeline`) agents transfer verified product notes into `docs/source/CHANGELOG.md`, clear transferred `verified` rows across ledgers, and execute root publication routines.

---

## Upstream Handoffs Consumed

| source_sector | handoff_id | status | summary | local_slice_id |
| :--- | :--- | :--- | :--- | :--- |
| `legal-research` | `HO-L1-001` | integrated | `publishClasses` filtering, `catalog_tombstones`, moderator/operator report partitioning, and `R13-C4` delist proof and rejection restoration are verified in Coordinator D1 planes. | `R13-C4` |
| `legal-research` | `HO-L1-002` | acknowledged | Storefront source profiles remain partitioned to operator review until `R13-C11` primary terms retrieval clears. | `FLEET-S2` |
| `pipeline` | `PN-002` | acknowledged | Crawler preview tag `2026.10.10-pre` requires Sector 4 `R50-C31-RECOVERY` before advancing live preview fleet telemetry (`R50-C31`). | `R50-C31` |
| `pipeline` | `PN-005` | acknowledged | Initializer packet queued from Goal Addendum and `HO-W5-002`: implement Worker authenticated browser CORS and `OPTIONS` preflight headers for `/v1/operator/*`, `/v1/moderator/*`, `/v1/user/*`, and `/v1/app/*`. | `R47-C27-CORS` |
| `pipeline` | `PN-006` | integrated | Aligned `DEFAULT_APPROVED_SOURCE_PROFILES[0]` (`vrchat-community.github.io/template-package/`) in `src-worker/src/storage/default_seeds.ts` to `retainClasses: ["normalized_facts", "creator_prose"]` while preserving `publishClasses: ["normalized_facts"]`. | `R13-C2 / FLEET-S2` |
| `pipeline` | `PN-007` | integrated | Bound provisioned preview KV namespace `0a8237b498334dd7b1f58fb7807a68c6` under `[[env.preview.kv_namespaces]]` in `src-worker/wrangler.toml` and removed the placeholder production `RATE_LIMIT_KV` block so production falls back to `InMemoryRateLimiter`. | `R54-C39C-RATE-LIMIT` |

---

## Tier 2: Outbound Handoffs (Schemas, Workers, and Cloudflare Coordinator)

Publish D1/KV schema changes, `/v1/` route additions or payload shifts, and Worker runtime boundary changes here for Tier 3 (`src-worker/packages/network/`, `src-package/`), Tier 4 (`src-crawler/`, `src-crawler-client/`), and Tier 5 (`src-web/`, `src-web-search/`).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-W2-001` | Tier 3B, Tier 5 | [`coordinator_d1.md`](../source/schemas/coordinator_d1.md), [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md), `src-worker/src/api/`, `src-worker/src/storage/d1/` | yes | active | Live Worker exposes 26 route handlers across 26 D1 tables, 10 views, and 46 indexes in five plane DDL modules under `src-worker/src/storage/d1/schema/` (aggregated by `utils.ts`). **Tier 3B SDK (`src-package/`) action items from Wave 2:** (1) `POST /v1/app/report` removed `DownstreamFeedbackRequestSchema`, `DownstreamFeedbackResponseSchema`, and `FeedbackSignalTypeSchema` fallback handling (`DownstreamReportRequestSchema` only). (2) All six `IssueReportKindSchema` values (including `broken_link` and `wrong_metadata`) in `reportType === "issue_report"` route to `catalog_tickets` instead of demand signals. (3) User and moderator list routes enforce integer query parsing (`parseIntegerQueryParam`) and reject non-integers with HTTP 400. (4) All Worker errors (including `/v1/operator/init` 401, global 404/500, and HTTP 415 invalid `Content-Type`) return `{ schemaVersion: 1, code, error }`, and rate-limited 2xx responses include rate-limit headers. (5) `operator_audit_log.entity_type` adds `'app'` for app delegation mutations. Tier 3B SDK `v0.1.0` review (`Q-API-REVIEW`) reconciles remaining 3 unmapped routes and staged wiki proposals (`WIKI-01`..`WIKI-06`). |

---

## Tier 3A: Outbound Handoffs (API and Networking: `vrc-packages-network`)

Publish internal wire protocol changes, lease/heartbeat bounds, and `vrc-packages-network` single-stream tarball updates here for Tier 2 (`src-worker/`) and Tier 4A (`src-crawler/`).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-N3A-001` | Tier 2, Tier 4A | `src-worker/packages/network/`, [`wire_and_protocol_contracts.md`](../source/schemas/wire_and_protocol_contracts.md) | no | active | Fixed 120s coordinator lease window, dynamic 5s to 30s heartbeat bounds, and delegated RFC 9309 robots preflight schemas are active. |
| `HO-N3A-002` | Tier 2, Tier 4A, Oversight (Pipeline) | `src-worker/packages/network/` (`./node`, `./robots`, `./ip-policy`, `./source-targets`) | no | active | **Wave 1 exports ready after preview tarball release (`PR-CN-NET-001`):** (1) `./robots` exports `RobotsOriginSchema`, `RobotsStatusCodeSchema`, `RobotsBodySchema` backing `OriginRobotsSnapshotSchema`. (2) `./node` exports `NodeRobotsClaimRequestSchema`, `NodeRobotsClaimResponseSchema`, `NodeRobotsResultRequestSchema` (`https:` origin, `statusCode` `200..599`, UTF-8 <= 512 KiB `body` defaulting to `""`), `NodeRobotsResultResponseSchema`, their TypeScript types, and `NODE_API_JSON_SCHEMAS.robots*` entries. (3) `./ip-policy` exports `isIp(hostname)` alongside `isPrivateOrReservedIp(ip)` using shared strict IPv4/IPv6 parsing. (4) `./source-targets` preserves all 8 existing exports and adds `ARCHIVE_BINARY_EXTENSIONS`, `hasArchiveBinaryExtension`, `isArchiveOrBinaryUrl`, `parseGitHubOwnerRepo`, `githubRepositoryIdentity`, `normalizeGitHubRepositoryUrl`, `normalizeGitHubApiUrl`, `isBoothProductTarget`, `isGumroadProductTarget`, `isJinxxyProductTarget`, `isItchProductTarget`, `isShopifyProductTarget`, `isStorefrontProductTarget`, `classifyOutboundLeadKind`, `resolveDiscoveryLeadTarget`, and `ResolvedDiscoveryLeadTarget` (mapping `*.itch.io` to `itch` and `payhip.com`/`ko-fi.com` to `custom_domain` with 2000ms pacing floor). **Wave 2 Worker Engineer (`src-worker/`)**: import `/v1/node/robots/*` schemas in `src-worker/src/api/handler.ts` and validate responses with `.parse()`; replace `isIp` in `src-worker/src/storage/d1/utils.ts` with `vrc-packages-network/ip-policy`; replace `classifyOutboundLeadKind`, GitHub URL normalization, and `approveVpmListingLead` mapping in `src-worker/src/storage/d1/coordinator.ts` with `vrc-packages-network/source-targets` (`approveDiscoveryLead`). **Wave 2 Crawler Node Engineer (`src-crawler/`)**: validate `/v1/node/robots/*` requests/responses in `src-crawler/src/client/node_client.ts` with `./node` schemas, remove `(this.client as any)` casts in `src-crawler/src/runner/daemon.ts`, update `node_daemon.test.ts` and `node_outbox_process.test.ts` mock `/v1/node/robots/*` responses to include `retryAfterMs` and `origin`, replace `PROHIBITED_BINARY_EXTENSIONS` in `public_metadata_fetch.ts` with `ARCHIVE_BINARY_EXTENSIONS` / `isArchiveOrBinaryUrl`, and replace inline storefront/GitHub checks in `observation_adapter.ts` with `isStorefrontProductTarget` / `parseGitHubOwnerRepo` / `normalizeGitHubRepositoryUrl`. **Deferred `UNTANGLE-CN-03` decoupling**: `src-worker/packages/network/package.json` intentionally keeps `peerDependencies["vrc-packages-api"]` and `devDependencies["vrc-packages-api"]`, and `node_protocol.ts` keeps `NodeIdSchema === IssueNodeCredentialSchema.shape.nodeId`, because `scripts/versioning.mjs`, `scripts/delivery.mjs`, `tests/preprod_layout.test.ts`, and `test/fixtures/check.mjs` require that peer contract until Pipeline coordinates cross-project removal. |

---

## Tier 4A: Outbound Handoffs (Headless Crawler Node: `src-crawler/`)

Publish CLI flags, `node.db` schema updates, `[ACTIVITY]` / `[FINDING]` log format changes, and binary distribution changes here for Tier 4B (`src-crawler-client/`) and Tier 5 (`src-web/`).

| handoff_id | target_tiers | contract_or_artifact | breaking_change | status | integration_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-C4A-001` | Tier 4B, Tier 5 | [`crawler_node.md`](../source/specifications/crawler_node.md), [`crawler_node_sqlite.md`](../source/schemas/crawler_node_sqlite.md), [`logging_and_telemetry.md`](../source/schemas/logging_and_telemetry.md) | no | active | Headless `vrcp-crawler-node` writes durable receipts to `node.db` (4 tables, 5 indexes) and broadcasts `[ACTIVITY]` / `[FINDING]` events to `latest.log`. Tier 4B desktop supervision binds to these runtime contracts. |
| `HO-C4A-002` | Tier 4B, Tier 5, Oversight (Pipeline) | `src-crawler/` (`vrcp-crawler-node`, `vrc-packages-network@2026.11.9`) | no | active | Consumed `HO-N3A-002`: `CoordinatorClient` validates `/v1/node/robots/claim` and `/v1/node/robots/result` with `NodeRobots*Schema`, `CrawlerNodeDaemon` drops `as any` casts, `fetchPublicMetadata` enforces `ARCHIVE_BINARY_EXTENSIONS` / `isArchiveOrBinaryUrl`, and `observation_adapter.ts` uses `isStorefrontProductTarget`, `parseGitHubOwnerRepo`, and `normalizeGitHubRepositoryUrl`. Removed dead pre-lease resilience, robots, IANA, SimHash, and `identity_config.ts` modules while preserving `--once`, env vars (`NODE_ID`, `NODE_TOKEN`, `COORDINATOR_URL`, `NODE_CAPABILITIES`, `NODE_DB_PATH`), `node.db`, and Linux/Windows binary builds (`dist/dev/vrcp-crawler-node-linux`). |

---

## Publication Requests (For Sector 4 Pipeline Oversight)

Write a request here only after the owning product gate passes all Sector 1 verification checks. Sector 4 Pipeline transfers `proposed_changelog_notes` into `docs/source/CHANGELOG.md`, clears transferred `verified` rows from Sector 1 ledgers, and executes root publication scripts.

| req_id | product | channel | producer_prereqs | source_slice_ids | proposed_changelog_notes | verification_proof | status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `PR-CN-WRK-001` | `worker` | `preview` | `vrc-packages-api-preview@2026.11.12-pre, vrc-packages-network@2026.11.9` | `R13-C4`, `R38-C23`, `UNTANGLE-CN-01`, `UNTANGLE-CN-02`, `UNTANGLE-CN-03` (Worker), `UNTANGLE-CN-04`, `UNTANGLE-CN-05`, `UNTANGLE-CN-06`, `UNTANGLE-CN-07`, `UNTANGLE-CN-09` (Worker docs), `UNTANGLE-CN-10` (Worker) | - **Control planes (Coordinator):** Split Coordinator storage and D1 schema into five plane adapters and five schema modules. Kept the Coordinator facade contract across all six store ports. - **Network adoption:** Adopted `vrc-packages-network` exports for IP checks, robots refresh schemas, and `approveDiscoveryLead` target routing. - **Report routing and audit:** Routed all `issue_report` kinds to `catalog_tickets`, unified app delegation permission toggles, and recorded `app` audit entries. - **HTTP and rate limits:** Normalized error JSON to `{ schemaVersion: 1, code, error }`, returned HTTP 415 on invalid media types, and sent rate-limit headers on rate-limited 2xx responses. - **Takedown and tests:** Enforced `unauthenticated_creator` proof checks, cleared rejected `delisted` tombstones on `verifyTakedown`, and migrated all D1 test suites off `LocalCoordinatorStore`. | Inside `src-worker/`: `bun run check` (0 errors), `bun run test` (310 pass, 0 fail, 3625 expects across 21 files), `bun run test:workers` (1 file, 3 pass), `bun run build:preview` (1134.98 KiB / gzip 189.60 KiB), `bun run test:runtime` (exit 0 in `workerd`). Root docs: `check_doc_links.ts` (486 docs, exit 0) and `ste-lint.py --strict` (< 1.5/100w, 0 em-dash). | `requested` |
| `PR-CN-CRAWL-001` | `crawler` (`vrcp-crawler-node`) | `preview` | `vrc-packages-api-preview@2026.11.12-pre, vrc-packages-network@2026.11.9` (standalone tag deferred behind `R50-C31-RECOVERY`; live Linux binary built in `cloudflare-worker.yml` deploy) | `UNTANGLE-CN-03` (Crawler), `UNTANGLE-CN-04` (Crawler), `UNTANGLE-CN-08`, `UNTANGLE-CN-10` (Crawler), `R15-C18` | - **Robots refresh wire validation:** Validate `/v1/node/robots/claim` and `/v1/node/robots/result` payloads in `CoordinatorClient` with `vrc-packages-network/node` schemas and typed daemon calls. - **Shared target and binary guards:** Enforce `ARCHIVE_BINARY_EXTENSIONS`, `isArchiveOrBinaryUrl`, `isStorefrontProductTarget`, `parseGitHubOwnerRepo`, and `normalizeGitHubRepositoryUrl` from `vrc-packages-network/source-targets`. - **Pre-lease surplus removal:** Delete unused pre-lease circuit breaker, adaptive limiter, local robots parser, SimHash, IANA registry, and token identity modules from `src-crawler/`. | Inside `src-crawler/`: `bun run typecheck` (0 errors), `bun test` (167 pass, 0 fail, 1625 expects across 23 files), `bun run build:dev` (`vrcp-crawler-node.exe`), `bun run build:node:linux` (`vrcp-crawler-node-linux`), `ste-lint.py --strict src-crawler/AGENTS.md` (0.00/100w, 0 em-dash), `check_doc_links.ts` (466+ docs, exit 0). | `deferred (awaiting R50-C31-RECOVERY on main; Linux binary used directly in Worker preview live crawl)` |
