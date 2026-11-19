# Prototype Parity Audit (Commit `09e9dc8` vs Current Architecture)

> **Status:** Point-in-Time Capability Gap Audit (`R13-C8`)  
> **Owning Sector:** Sector 1 (`crawler-network`) / Sector 5 (`legal-research`)  
> **Related Specs:** [`coordinator_worker.md`](../../source/specifications/coordinator_worker.md), [`crawler_node.md`](../../source/specifications/crawler_node.md)

This audit inventories capabilities from the superseded local prototype (`09e9dc860290dac3ae977e560a0d693d99639646`) against the current decoupled Worker + Crawler Node architecture, recording explicit retain, redesign, or permanently-exclude dispositions.

## 1. Capability Comparison and Disposition Matrix

| Capability Domain | Prototype (`09e9dc8`) | Current Architecture Status | Disposition (`VISION.md` / `LEGAL.md`) |
| :--- | :--- | :--- | :--- |
| **Coordinator Runtime** | Local coordinator binary inside crawler repo + monitor CLIs (`stop`, `status`, `recrawl`, `project`). | API-only Cloudflare Worker (`src-worker/`) + headless node (`src-crawler/`) broadcasting `[ACTIVITY]`/`[FINDING]` to `latest.log`. | **Permanently retired** local coordinator binary and CLI tooling (`R16-C19`). |
| **Origin Pacing & Outbox** | Local Poisson scheduler (`ratelimit.ts`), direct SQLite writes. | Centralized D1 `origin_leases` + node-local SQLite WAL `node_outbox` (`1,000` quota, `24h` TTL) + dynamic `5s`–`30s` heartbeats. | **Superseded and improved**; complete live multi-process Linux fleet proof (`G12`, `R15-C17`). |
| **BOOTH Discovery** | Category/search/tag pagination reseeding loop. | Bounded browse leads + product metadata parser (`pending_review`). | **Redesign with clearance**: restore pagination depth only under reviewed `SourceAccessProfile` (`R13-C11`). |
| **Gumroad / Jinxxy / itch** | Discover queries, seller portfolios, browse tags, itch `/search` & 404 probes. | Metadata adapters + explicit leads; itch `/search` and 404 probes permanently removed. | **Never restore** robots-disallowed itch `/search` or unleased probes; clear origins first. |
| **GitHub Discovery** | Search pagination, creator repos, README/release probes, standalone canonical items. | Narrow public `/repos/{owner}/{repo}` REST adapter; standalone repos do not emit canonical packages without VPM links. | **Open decision (`R13-C8`)**: decide standalone GitHub tool canonicalization rule (including `vrchat-desktop-tool`). |
| **VPM Feed Generation** | Generated `1.0.0` VPM feeds (`/index.json`, `/v1/vpm/index.json`) and URL probing. | Manifest validation + explicit leads; no generated VPM feed endpoint. | **Never fabricate** synthetic `1.0.0` versions; design explicit release-history consumer contract if needed. |
| **Media & Image Proxy** | `image_proxy.ts` (Sharp/WebP/BlurHash/pHash/BLOB cache). | Removed completely under zero-binary policy. | **Permanently exclude** BLOB/image caches; evaluate rights-gated origin media pointers separately (`expansion_action_matrix.md`). |
| **Offline Export & Sync** | `exporter.ts` (SQLite + FTS5 + BLOBs) + rowid-checkpoint edge sync. | Replaced by `/v1/app/index/delta` with `catalog_tombstones`. | **Never restore** BLOB export or rowid-checkpoint sync (misses in-place updates); decide whether filtered metadata-only offline snapshot is needed. |
| **Search & Curation** | Local FTS5 + steering/curator override loop. | Online `LIKE` search + `/v1/app/report` demand signals + `/v1/moderator/ratings`. | **Open (`R14-C15`, `R40-C25`)**: evaluate FTS5/indexes and attributed per-field corrections without unsafe steering. |
| **Catalog Projection Fields** | Included author, descriptions, tags, dependencies, media pointers. | Compact `CatalogPackage` (enforcing `publishClasses` and accepted `identity_links`). | **Open (`R13-C8`)**: evaluate bounded truthful price/currency, descriptions, and tags after `R40-C25` and `R13-C11`. |

## 2. Historical Counterexamples Fixed vs Open

| Counterexample (Measured at `3b9d203`) | Current Disposition |
| :--- | :--- |
| Concurrent `claim` granted two live leases (`sameJob: true`) | **Fixed locally** via atomic D1 claim batching (`R13-C1`). |
| `publishClasses: []` leaked into public catalog projection | **Fixed locally** via `buildCatalogPackagesBatch` filtering and `catalog_tombstones` (`R13-C3`, `R13-C9-DELTA`). |
| Unverified `submitDelistRequest` immediately set `lifecycle = 'delisted'` | **Still open (`R13-C4`)**; trusted-app intake routes to pending `catalog_tickets` (`STAGE-18`), while direct notice helper audit remains queued. |
| Bootstrap invented 2099 profiles and fake robots bodies | **Fixed locally** (`R13-C2`, `FLEET-S2`); pre-existing database grants still need audit before live production runs. |
