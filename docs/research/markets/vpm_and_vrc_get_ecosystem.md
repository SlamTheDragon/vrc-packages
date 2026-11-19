# VPM Listing Template and `vrc-get` Ecosystem Research

> **Status:** Investigative Ecosystem and Format Research  
> **Owning Sector:** Sector 5 (`legal-research`) / Sector 1 (`crawler-network`)  
> **Related Specs:** [`wire_and_protocol_contracts.md`](../../source/schemas/wire_and_protocol_contracts.md)

This document consolidates format semantics, discovery leads, and non-equivalence boundaries for VRChat Package Manager (VPM) listings, `kurotu/vpm-catalog`, and the `vrc-get` / ALCOM ecosystem.

## 1. VPM Listing Format and Builder Semantics (`Retrieved`)

Primary references: `vrchat-community/template-package-listing` (`source.json`, `.github/workflows/build-listing.yml`), `vrchat-community/package-list-action` (`ListingSource.cs`, `Build.cs`), VCC documentation (`https://vcc.docs.vrchat.com/guides/create-listing/`, `.../vpm/repos/`, `.../vpm/packages/`), and `https://vrchat-community.github.io/template-package/index.json`.

### Key Format Invariants
- **`source.json` vs `index.json`**: `source.json` is a build recipe (repository and release pointers), whereas `index.json` is the emitted VPM listing manifest. Parse `source.json` strictly as discovery leads, never as canonical package/version facts.
- **Zero ZIP reproduction**: Upstream listing builders read `package.json` inside release ZIPs to compute hashes. VRCP must never download or extract ZIPs; ingest explicit listing manifests only.
- **Map and manifest agreement**: `packages` maps package IDs to version maps and embedded manifests. Validate ID/version agreement, preserve valid entries alongside partial diagnostics (`VpmListingIssueSchema`), and never treat missing entries in an incomplete response as deletions.
- **Version ordering and strict syntax**: JSON key order does not establish version ranking. Preserve exact accepted SemVer strings via `vrc-packages-network/vpm-version` (rejecting malformed or padded forms instead of silently normalizing); test prerelease and `yanked` semantics before computing any `latest` projection.
- **Non-global package IDs**: Different listings can publish colliding package IDs with conflicting releases or metadata. Preserve listing-plus-package provenance, conflicts, mirrors, and reversible `identity_links`.
- **Recipe vs website fields**: Template `name` and builder `id` can diverge; website banners/descriptions differ from listing manifests and must not transfer by assumption.
- **Observed bounds (`Historical`, 2026-09-28)**: Local smoke of two template examples yielded `com.vrchat.demo-template` (`0.0.7`) plus 4 pending leads with zero ZIP bytes fetched. Historical parser ceilings noted 100 packages, 100 versions/package, 100 diagnostics, and 240 KB serialized payloads (recheck schemas before treating as API guarantees; larger listings need chunking/overflow handling).

## 2. `kurotu/vpm-catalog` Discovery Lead Analysis (`Historical`, 2026-10-03)

Inspected at pinned commit `2f6e49561432caa706725751f7e202cecd655c6b` as a research lead only (not crawl authorization).

| Upstream Stage | Upstream Behavior Observed | VRCP Reuse vs Hard Exclusion |
| :--- | :--- | :--- |
| **Discovery** (`discover.yml`, `vpm-discovery/SKILL.md`) | Runs weekly search across GitHub, Yahoo Japan, Google, and publisher links; probes `index.json`/`vpm.json`; guesses GitHub handles from BOOTH shop names; rejects curated catalogs. | **Reuse**: Separation between candidate proposals and accepted seeds.<br>**Exclude**: Unrestricted agent runs, search-provider scraping without review, unleased probing/redirects, and treating BOOTH-to-GitHub guesses as canonical links. |
| **Refresh and Build** (`download-repos.sh`, `download-packages.sh`, `vpm.ts`, `index.json.ts`) | Repairs malformed JSON via HJSON; downloads and caches ZIPs; hides yanked/deprecated entries; inspects `legacyPackages`; resolves collisions by picking the longer serialized manifest; maintains `repositories-ignore.txt`. | **Exclude**: ZIP downloads/extraction, silent HJSON repair, longer-manifest collision merging, title-based deletion, wholesale `repositories-ignore.txt` import, and unchecked repo-ID paths. |

**Current code gap**: `src-crawler/src/adapters/observation_adapter.ts` validates listing manifests and emits explicit outbound leads; it does not implement search-provider discovery, `yanked` filtering, or `legacyPackages` tracking (`FLEET-S2`).

## 3. `vrc-get` and ALCOM Ecosystem Boundaries (`Retrieved` / `Historical`)

Primary references: `https://github.com/vrc-get/vrc-get`, `vrc-get-gui` (ALCOM), `vrc-get-vpm/src/repository/remote.rs`, VCC `community-repositories/` and `vpm/resolver/` docs, and `vrc-get` issue `#1696`.

- **Discovery vs project resolution**: `vrc-get` CLI subscription/search is distinct from Unity project dependency resolution (`vpm-manifest.json`, local `Packages/`). Never crawl private repositories, local Unity projects, or user client settings.
- **ALCOM classification**: ALCOM is a desktop VCC alternative (`tools` candidate), not a package registry.
- **Client fallback IDs and resolver quirks**: `remote.rs` skipped malformed versions and applied local fallback repository IDs; a client fallback ID is not a publisher assertion. Issue `#1696` demonstrates OR-range resolver divergence across clients, proving no single client defines the universal specification.
- **Listing claims vs binary proof**: Download URLs, dependency ranges, and checksums in `index.json` are publisher claims, not proof that binaries are reachable, safe, or licensed.
- **Open test cases**: Repository ID/URL collisions, `yanked` status, prerelease ranking, redirects, listings exceeding 100 versions, generator quirks, and delegating any future compatibility advice to maintained resolver libraries rather than custom algorithms.
