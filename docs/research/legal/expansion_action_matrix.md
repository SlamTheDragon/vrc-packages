# Legal and Platform Expansion Action Matrix

> **Status:** Sector 5 Gate Checklist (Research Corpus; Does Not Authorize Fetching or Publication)  
> **Owning Sector:** Sector 5 (`legal-research`)  
> **Tracker Anchor:** [`docs/scratch-legal-research/IMPLEMENTATION_PLAN.md`](../../scratch-legal-research/IMPLEMENTATION_PLAN.md)

Before any new storefront, discovery directory, media capability, user authentication flow, or offline export moves from investigative research (`docs/research/`) into executable code or current source truth (`docs/source/`), every blocking action below must be completed and recorded.

## 1. Pre-Expansion Legal and Technical Clearance Matrix

| Expansion Area | Current Research Owner | Current Posture | Mandatory Actions Before Moving to `docs/source/` or Code | Blocking Sector(s) |
| :--- | :--- | :--- | :--- | :--- |
| **Storefront Live Profiles** (BOOTH, Gumroad, Jinxxy, itch.io, Payhip, Sellfy, Ko-fi, Shopify) | [`platform_clearance_matrix.md`](../markets/platform_clearance_matrix.md) | `UNRESOLVED` (all storefront leads partitioned to `pending_review`) | 1. Retrieve current primary terms, API docs, and `robots.txt` per origin.<br>2. Record independent Fetch, Retain, Publish, and Remove decisions.<br>3. Provision scoped D1 `source_access_profiles` with real delegated robots preflight (zero bootstrap allow grants). | Sector 5 -> Sector 1 |
| **Third-Party Aggregators** (Nexyy, avtr.zip, custom-domain catalogs) | [`storefront_and_tool_discovery.md`](../markets/storefront_and_tool_discovery.md) | `Candidate` (lead-only; VRCArena DOM permanently excluded) | 1. Obtain permitted interface and attribution terms.<br>2. Prove explicit destination-front link chains without copying aggregator catalog facts.<br>3. Test cross-origin sitemap and false-link rejection. | Sector 5 -> Sector 1 |
| **Desktop Tools Tagging** (`vrchat-desktop-tool`, GitHub standalone repos) | [`storefront_and_tool_discovery.md`](../markets/storefront_and_tool_discovery.md) | `Candidate` (slug unfinalized) | 1. Build labeled positive/negative/ambiguous corpus (VRCX, VRCFaceTracking, VRCOSC, ADVOSC, generic OSC tools).<br>2. Confirm publisher-targeted VRChat evidence without installer downloads or local OSC probing.<br>3. Settle standalone GitHub canonical package rule (`R13-C8`). | Sector 5 -> Sector 1 / 3 |
| **Media Pointers and Thumbnails** | [`entity_resolution_and_standards.md`](../architecture/entity_resolution_and_standards.md) | `UNRESOLVED` (BLOB proxy removed; zero binary cache) | 1. Assess copyright/hotlinking rights per storefront (do not assume universal Server Test immunity).<br>2. Define explicit `publishClasses` gating for image URLs before exposing media fields in `/v1/app/*`. | Sector 5 -> Sector 1 / 3 |
| **Delegated Creator Takedown Proof** | [`cryptographic_delegation.md`](../architecture/cryptographic_delegation.md) | `Candidate` (manual operator/moderator queue active; crypto proof undecided) | 1. Select HMAC vs asymmetric JWS and benchmark under 10 ms Worker CPU limit.<br>2. Define verifier admission, key custody/rotation, front-to-creator scope, and wrongful-removal recovery.<br>3. Reconcile `LEGAL.md` §§9.4–9.5 vs §§10.4–10.5. | Sector 5 -> Sector 1 / 3 |
| **User Auth, Multi-Provider Linking, and Age Verification** | [`age_assurance_and_moderation.md`](age_assurance_and_moderation.md) | Deferred (`Q-USER-AUTH-REGISTRATION`) | 1. Confirm RA 10173 / GDPR minimization for `contact_email`, provider JSON column, and boolean `age_verified`.<br>2. Enforce VRChat `Verified 18+` (`ageVerificationStatus === "18+" && ageVerified === true`), never `ageVerified` alone.<br>3. Document `UNRESOLVED` RA 11930 §35 and VRChat ToS boundary. | Sector 5 -> Sector 1 / 3 |
| **`PROHIBITED` / Suspected Illegal Content Handling** | [`age_assurance_and_moderation.md`](age_assurance_and_moderation.md) | Isolated to operator-only `safety_quarantine` | 1. Define minimal evidence retention, log redaction, moderator shielding, and statutory escalation procedures.<br>2. Keep `LEGAL.md` marked draft with zero compliance claims until counsel review. | Sector 5 |
| **Japanese Copyright Act Citations** | [`jurisprudence_and_covenants.md`](jurisprudence_and_covenants.md) | `Unavailable` | Retrieve verified current translation/guidance for Articles 30-4 and 47-5 before asserting Japanese statutory coverage for BOOTH indexing. | Sector 5 |
| **Offline SQLite Catalog Export (`vrc_catalog.db`)** | [`prototype_parity.md`](../audits/prototype_parity.md) | Absent in live code | Decide whether offline export is required; if approved, enforce lifecycle/rating filtering, zero BLOBs, and updated `VRCP` naming (`R55-C55D`). | Sector 1 / 5 |

## 2. Five-Step Source Objection and Takedown Workflow

When any platform operator or rights holder objects to indexing, execute strictly in order:
1. Suspend affected fetch authority (`POST /v1/operator/source-profiles/{id}/disable` and origin suppression).
2. Preserve only the minimum evidence needed to document the objection.
3. Verify origin scope, sender authority, applicable terms, and requested remedy.
4. Record an auditable verdict (resumption, narrowed scope, or permanent exclusion).
5. Propagate approved suppression and downstream `catalog_tombstones` delistings, then test consumer visibility.
