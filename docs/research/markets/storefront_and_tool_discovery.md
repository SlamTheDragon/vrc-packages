# Storefront Leads and Desktop Tool Discovery Research

> **Status:** Investigative Market and Ecosystem Research (Lead-Only Candidates)  
> **Owning Sector:** Sector 5 (`legal-research`)  
> **Related Policies:** [`platform_clearance_matrix.md`](platform_clearance_matrix.md), [`vpm_and_vrc_get_ecosystem.md`](vpm_and_vrc_get_ecosystem.md)

This file consolidates investigative findings for additional VRChat storefront/aggregator leads and VRChat-targeted desktop tools. Discovery leads never establish canonical product ownership, equivalence, or crawl clearance.

## 1. Additional Storefront and Aggregator Leads

### Entity Separation Invariants
- Keep **discovery host**, **in-game avatar**, **credited author**, **publisher site**, **storefront**, and **canonical item** strictly distinct.
- Public in-game avatar author credits do not prove commercial ownership.
- Include Shopify merchants and custom-domain storefronts as distinct classes from resellers and third-party directories.
- **Permanent exclusion**: Do not reinstate VRCArena DOM crawling.
- Cross-storefront pairs (for example Payhip + Gumroad) require explicit equivalence evidence; a merchant's `vendor` field does not automatically identify the original creator.

### Evaluated Market Candidates (`Candidate` / `Historical`)

| Candidate | Reviewed URLs | Findings | Posture and Exclusions |
| :--- | :--- | :--- | :--- |
| **Nexyy** | `https://nexyy.com/`, `https://nexyy.com/-/tos` | Aggregates search across storefronts including Payhip and Sellfy with creator tools and user lists. | Discovery-only lead candidate. Obtain permitted interface, terms, explicit destination links, and attribution rules. **Never copy its catalog facts.** |
| **avtr.zip** | `https://avtr.zip/` | Public in-game avatar search without a verified stable data or outbound interface. | Conditional `avatar -> author -> publisher` lead only; record missing links as negative results. **Never harvest avatar IDs or infer product identity visually.** |
| **jellycube** (Shopify example) | `https://jellycube.co/collections/vrcft-addons`, `https://jellycube.co/products/rurune-vrcft-add-on`, `https://jellycube.co/pages/terms` | Named Shopify VRChat add-on storefront. Outbound BOOTH base-avatar link indicates a compatibility relationship, not same-product or same-author identity. Terms cover purchased licenses only; robots/sitemap retrieval failed during review. | No merchant profile or live smoke authorized until primary terms, robots, and sitemap checks succeed. |
| **Custom-Domain Storefronts** | Per merchant | Can be first-party merchant, reseller, headless shop, or unrelated directory. | Default to lead-only (`pending_review`) until publisher control and origin terms are verified. |

### Current Code vs Research Boundary
- Live code supports typed `creator_profile`, `publisher_site`, and `storefront_product` leads plus bounded Shopify product-sitemap parsing (leads only, not full traversal or verified publisher control).
- **Hard exclusions**: Zero binary downloads, zero private endpoint probing, zero wholesale community-catalog copying.
- **Required verification before expansion**: Label explicit `Nexyy -> front`, `seller -> product`, and `avatar -> author -> publisher` chains (including negative cases); test false links, cross-origin sitemap entries, pagination overflow, locale/currency handling, and unknown timestamps.

## 2. VRChat Desktop Tool Discovery

### Owner Scope Direction
- Add a category tag under the **`tools`** umbrella for desktop/runtime software specifically targeting VRChat (`particular_vrchat_target = 1` in D1 `desktop_tool_evidence`).
- Generic VR or OSC compatibility alone is insufficient.
- Proposed slug `vrchat-desktop-tool` is a **candidate**, not a finalized public SDK contract.
- VRChat OSC documentation (`https://docs.vrchat.com/docs/osc-overview`, `https://docs.vrchat.com/docs/osc-resources`) provides integration reference points, not endorsement or crawl clearance.

### Evaluated Desktop Tool Candidates (`Candidate`)

| Candidate | Reference Repository | Classification and Boundary Notes |
| :--- | :--- | :--- |
| **VRCX** | `https://github.com/vrcx-team/VRCX` | VRChat companion client (`tools` candidate). Catalog public publisher metadata only; never collect private app state or authenticate to VRChat. |
| **VRCFaceTracking** | `https://github.com/benaclejames/VRCFaceTracking` | Hardware-to-VRChat facial/eye tracking bridge. Keep core app, modules, hardware, and avatar setups distinct; verify first-party stewardship. |
| **VRCOSC** | `https://github.com/VolcanicArts/VRCOSC` | VRChat OSC toolkit and modules. Keep host app separate from add-on modules; shared OSC terminology is not product equivalence. |
| **ADVOSC** | `https://github.com/TheArmagan/advosc` | Windows VRChat OSC/chatbox utility. Verify canonical publisher, release channel, terms, and metadata interface; **zero installer downloads**. |
| **ALCOM / `vrc-get` GUI** | See [`vpm_and_vrc_get_ecosystem.md`](vpm_and_vrc_get_ecosystem.md) | Desktop package manager (`tools` candidate), not a repository registry. Never fabricate a VPM package release for the desktop app. |
| **Generic OSC / VR Utilities** | Various | Compatible workflow without dedicated VRChat targeting stays a lead or negative boundary fixture, not a tagged VRChat desktop tool. |

### Required Evidence and Exclusions
- Record separately: publisher-stated purpose, supported OS, release version, license, canonical front, and VRChat relationship.
- Repository `updated_at` is not a release date; a Git tag is not automatically an application version.
- Earlier Sept 27 prototype keyword probes misclassified VRCX, VRCFaceTracking, ADVOSC, and a generic SteamVR mount; keep unknown categories explicitly `unknown` until a small labeled test corpus validates heuristics.
- **Hard exclusions**: Zero local OSC probing, zero reading of VRChat client logs, zero unofficial/private API crawling, and zero executable/installer downloads.
