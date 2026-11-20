# Entity Resolution, Asset Indexing Standards, and Evidence Discipline

> **Status:** Investigative Taxonomy, Standards, and Methodology Corpus  
> **Owning Sector:** Sector 5 (`legal-research`) / Sector 1 (`crawler-network`)  
> **Related Current Source:** [`coordinator_d1.md`](../../source/schemas/coordinator_d1.md)

This document consolidates the three-layer evidence model, non-equivalence rules, asset indexing standards, and the five-label research evidence discipline.

## 1. Three Separate Evidence Layers

Identity means a supported relationship between source records, never a similar title. Keep three evidence layers strictly separate:

| Layer | D1 Storage Owner | Meaning and Boundary |
| :--- | :--- | :--- |
| **1. Discovery Leads** | `source_leads` | Candidate URLs, outbound storefront links, or credited authors. Community directories never establish canonical product facts. |
| **2. First-Party Observations** | `source_items`, `source_versions` | What a reviewed publisher or storefront actually stated, bound to contributor node, lease, profile, digest, and version number. |
| **3. Accepted Identity Links** | `identity_links` (`review_state = 'accepted'`) | Verified cross-source relationships projecting into `canonical_packages` and `package_fronts`. Provisional candidates (`review_state = 'provisional'`) stay reversible and excluded from public fronts until reviewed or matched by approved high-confidence storefront leads (`R13-C9-IDENTITY`). |

### Core Non-Equivalence Rules
- Two products inside one GitHub repository are not automatically one package.
- Matching reverse-DNS package IDs across different VPM listings can conflict; preserve listing-plus-package provenance.
- Base avatars and cosmetic add-ons are related (`avatar_compatibilities`), never identical products.
- Reused thumbnails, author handles, or shared OSC terms are insufficient merge evidence.
- **SimHash / near-duplicate heuristics**: Candidate lead generator only, never proof of ownership, equivalence, or safe cross-category merges; zero universal Hamming-distance thresholds exist.
- **Field semantics**: Preserve source creation, modification, release, and observation timestamps separately; missing price means `unknown`, never `free`; currency and locale belong to the observed front.
- **Withdrawn tutorial claims**: Fixed similarity thresholds, asserted accuracy percentages, directory-size estimates, and blanket safe-harbor claims are permanently withdrawn.

## 2. Asset Indexing Standards

| Indexing Domain | Mandatory Standard | Hard Boundary |
| :--- | :--- | :--- |
| **Discovery** | Preserve explicit link chains (`source_leads`). | Never import third-party directory tags, prices, or ownership assertions as canonical facts. |
| **Metadata Requests** | Coordinator-leased, profile-scoped `GET` requests under RFC 9309 robots preflight and shared origin budgets. | Adding nodes must never increase per-origin request rate. Stop on auth walls, CAPTCHAs, or objections. |
| **Product Binaries** | Record release URLs strictly as metadata strings. | Zero executable, archive, mesh, or texture downloads across all adapters and redirects. |
| **Creator Prose** | Review exact retained and published fields per `SourceAccessProfile`. | Truncating descriptions reduces risk but does not create a statutory copyright safe harbor. |
| **Images and Video** | Require explicit rights review and `publishClasses` gating before exposing pointers. | Prototype BLOB/proxy (`image_proxy.ts`) is removed; hotlinking/thumbnails are not universally lawful. |
| **Attribution** | Direct consumers to verified publisher/front URLs (`LEGAL.md` Section 4). | Distinguish creator, merchant, reseller, and directory; never imply endorsement. |
| **Removal** | Separate intake from ownership verification and authorized delisting (`catalog_tombstones`). | Unrelated callers must never suppress another creator's listing without verification. |
| **Data Protection** | Inventory all stored fields, purposes, retention, and deletion paths. | Public creator data and free-text reports can identify individuals; anonymous auth does not guarantee anonymous data. |

**Operational posture**: Identify requests with `VRCPDiscoveryBot/{version}` and a contact route; never rotate identities or evade blocks; keep AI/ML model training permanently outside metadata-discovery scope.

## 3. Evidence Labels and Review Cycle

### Evidence Labels and Review Cycle
Every entry added to `docs/research/` must carry one exact evidence label plus publisher, canonical URL, title, language, version/effective date, retrieval date, conclusion, limitations, and next falsifiable check:
- **`Retrieved`**: Primary material obtained (not legal validation).
- **`Historical`**: Earlier observation or test (recheck mutable terms/code).
- **`Candidate`**: Investigative lead or proposal (not adopted behavior).
- **`Unavailable`**: Retrieval failed or translation missing (keep gap explicit).
- **`Measured`**: Recorded fixture, benchmark, or runtime output with explicit bounds.

### Seven-Step Investigative Review Cycle
1. State one concrete invariant and its owner authority anchor (`VISION.md`).
2. Trace callers end to end: policy -> adapter -> storage -> projection -> consumer.
3. Compare live executable code, historical capability, and proposed behavior separately.
4. Check maintained libraries and platform primitives before proposing custom code.
5. Reproduce defects with the smallest falsifiable counterexample inside one bounded slice.
6. Run owning-sector tests, typechecks, link audits, and diff reviews before claiming verification.
7. Reconcile owning documentation and record unresolved owner/legal decisions in the sector ledger.
