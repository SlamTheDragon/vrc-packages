# Platform and Storefront Clearance Matrix

> **Status:** Investigative Legal and Market Research (Not Fetch Authorization)  
> **Owning Sector:** Sector 5 (`legal-research`)  
> **Related Policies:** [`LEGAL.md`](../../../LEGAL.md), [`jurisprudence_and_covenants.md`](../legal/jurisprudence_and_covenants.md), [`expansion_action_matrix.md`](../legal/expansion_action_matrix.md)

This matrix records primary terms, robots, and interface evidence across target platforms. Fixed historical pacing delays and old bootstrap expiry dates do **not** establish source clearance. Every origin requires separate **Fetch**, **Retain**, **Publish**, and **Remove** decisions plus active `source_access_profiles` and real delegated RFC 9309 `robots.txt` preflight before live crawling.

## 1. Platform Clearance Table

| Platform / Source Class | Primary URLs Reviewed | Evidence Status | Terms, Robots, and Interface Findings | Current Clearance Posture and Required Disposition |
| :--- | :--- | :--- | :--- | :--- |
| **VPM Community Listings** | `https://vcc.docs.vrchat.com/vpm/repos/` | `Retrieved` | Defines public JSON package listing schema. Format specification does not authorize every host or underlying package license. | Pre-configured approved profiles strictly for open community VPM listings with robots preflight (`FLEET-S2`); review each new host and license individually. Separate recipe (`source.json`), listing (`index.json`), and local project state. |
| **GitHub REST API** | `https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api` | `Retrieved` | Narrow public repository metadata adapter exists. Requires token-scoped budgets, conditional requests, and shared origin limits. | Scope-specific review required for auth, account terms, permitted data use, and shared rate budget. **No private repos or HTML scraping bypass.** |
| **BOOTH.pm** (`pixiv Inc.`) | `https://booth.pm/guidelines` | `Retrieved` (revised July 8, 2026) | Guidelines conditionally allow crawler collection of product info for information analysis benefiting user convenience or creative activity, subject to load, rights-harm, and damage restrictions. | **Neither blanket ban nor blanket approval** (corrects earlier blanket ban). Does not clear republication, images, or pixiv common/BOOTH terms. Remains `UNRESOLVED` pending scoped profile and Japanese law retrieval. |
| **Gumroad** | `https://gumroad.com/terms` (§14(e)) | `Retrieved` | Includes a conditional public-search-engine exception that excludes caches and archives. Record Sept 14, 2026 update, Jan 1, 2025 stated effective date, and Oct 14 existing-account transition separately. | Fetch, retention, and publication remain `UNRESOLVED`; must establish whether VRCP qualifies under the active terms version. |
| **Jinxxy** (`Jinxxy Technologies, LLC`) | `https://jinxxy.com/terms-of-service` (§8.2, §23) | `Retrieved` | Directs automated access to official APIs absent written permission; §23 language is broader than storefront editing. Creator API covers a creator's own store, not cross-creator public discovery. | **Unresolved Contractual Risk.** Seek documented public interface or written interpretation before sustained DOM ingestion. |
| **itch.io** (`itch corp.`) | `https://itch.io/docs/legal/terms`, `https://itch.io/docs/api/overview`, `https://itch.io/robots.txt` | `Historical` | `robots.txt` disallows `/search`; server API is account-scoped rather than an unauthenticated cross-publisher catalog API. | Default `/search` seeds and 404 probes removed (`source-paths`). Recheck RSS/product endpoints and terms per origin; do not restore search probes. |
| **Payhip** | `https://payhip.com/terms`, `https://payhip.com/api-reference` | `Retrieved` (intro) | Terms describe creator business relationship rather than visitor/index access; API is an account-scoped coupon/license API, not cross-seller discovery. | **Earlier "approved" label was unsupported.** Remains `UNRESOLVED`; review visitor/merchant terms, endpoint scope, and publication rights. |
| **Sellfy** | `https://sellfy.com/terms/` | `Retrieved` | Public visibility and merchant obligations do not grant crawler permission. | **Earlier "approved" label was unsupported.** Remains `UNRESOLVED`; review each front and applicable reuse terms. |
| **Shopify Merchant / Custom Domains** | `https://shopify.dev/docs/api/ajax/reference/product`, `https://help.shopify.com/en/manual/promoting-marketing/seo/editing-robots-txt` | `Historical` | Owner includes this source class; theme Ajax API assumptions do not extend to headless stores. | Review merchant identity, interface, terms, and robots per origin before live runs. Sitemap parsing emits leads only. |
| **Curated Lists and Community Directories** | [`storefront_and_tool_discovery.md`](storefront_and_tool_discovery.md), [`vpm_and_vrc_get_ecosystem.md`](vpm_and_vrc_get_ecosystem.md) | `Candidate` | Discovery leads only; directory inclusion never clears destination hosts or establishes canonical facts. | Lead-only. **Owner exclusion of VRCArena DOM crawling remains permanent.** |
| **Publisher-Controlled Custom Sites** | None universal | `Candidate` | Branding or matching title does not prove domain ownership or permission. | No broad custom-domain access rule; require explicit publisher/front control verification per origin. |

## 2. Per-Origin Clearance Record Requirements

Every approved `source_access_profiles` row provisioned in D1 must trace to a documented review recording:
1. Exact origin, path scope, query scope, and `GET`-only method constraint.
2. Primary terms URL, effective date, retrieval date, and applicable clause summary.
3. Live delegated RFC 9309 `robots.txt` verification result (never a fabricated allow body).
4. Configured `min_delay_ms`, `expires_at`, bot identity (`VRCPDiscoveryBot/{version}`), `retainClasses`, and `publishClasses`.
5. Objection and revocation contact path (see [`expansion_action_matrix.md`](../legal/expansion_action_matrix.md#2-five-step-source-objection-and-takedown-workflow)).
