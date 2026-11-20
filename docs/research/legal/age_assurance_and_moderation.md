# Age Assurance, Adult Content, and Moderation Architecture Research

> **Status:** Distilled Investigative Research (Replaces raw transcript `crawler_nsfw_age_assurance_conversation.md`)  
> **Owning Sector:** Sector 5 (`legal-research`)  
> **Related Current Source:** [`coordinator_d1.md`](../../source/schemas/coordinator_d1.md), [`coordinator_worker.md`](../../source/specifications/coordinator_worker.md)

This document distills the architectural, regulatory, privacy, and moderation findings governing adult-content classification, age assurance, and safety quarantine across VRCP and its downstream consumers.

## 1. Core Architectural Boundary and Three Trust Graphs

- **Discovery vs publication**: Discovering adult material does not grant permission to publish or expose previews to unverified callers.
- **Crawler vs downstream split**: The Coordinator and Crawler Node classify and transmit risk metadata; downstream applications enforce whether a specific user is eligible to view restricted entries.
- **Three separate trust graphs**:
  1. **Content Trust**: Who asserted the item's rating (`STOREFRONT`, `CREATOR`, `CRAWLER_RULE`, `MODERATOR`, `REPORT`)?
  2. **Identity and Age Trust**: Who verified that a user satisfies an 18+ threshold?
  3. **Downstream Trust**: Which registered application agreed to enforce access restrictions?
- **Non-equivalence invariants**: `authenticated != adult`; `adult != identified`; `age inference != age verification`. General catalog use must not require user accounts.

## 2. Classification Vocabulary, Deterministic Parsing, and Fail-Closed Quarantine

### Recommended Rating Model (Candidate Target)
Replace single-boolean `is_nsfw` models with structured provenance:
- **`content_rating`**: `GENERAL`, `MATURE`, `SEXUAL_SUGGESTIVE`, `ADULT_RESTRICTED`, `UNKNOWN_RESTRICTED`, `PROHIBITED`.
- **Supporting provenance fields**: `rating_source`, `rating_confidence`, `rating_reason`, `ratingEvidence[]` (for example `{ source: "booth", type: "source_label", value: "R-18" }`), `content_warning[]`, `access_restriction`, `required_age`.

### First-Party Storefront Signal Policy (`Retrieved`)
- **BOOTH** (`https://booth.pm/guidelines`, `https://booth.pixiv.help/`): Requires R-18 marking and can forcibly reclassify listings. Map `R-18` mechanically to `ADULT_RESTRICTED`. Note that BOOTH evaluates appearance, clothing, objects, and text (a fictional character claimed to be adult does not settle illegal-content status).
- **Jinxxy** (`https://support.jinxxy.com/hc/en-us/articles/16765872965517-Mature-Content-Policy`): Distinguishes General Mature Content, Violence/Horror, and Sexually Suggestive Content; prohibits explicit sexual content; requires user DOB + opt-in. Preserve `source_classification` without reinterpreting.
- **Gumroad** (`https://gumroad.com/help/article/79-gumroad-discover`, `https://gumroad.com/prohibited`): Provides an NSFW Discover opt-in toggle while prohibiting sexually oriented or pornographic products (revised Sept 16, 2026). Do not equate Gumroad NSFW with pornography, and do not assume Gumroad listings are automatically general-audience safe.

### Deterministic Parsing Only (Zero Neural Classifiers)
- **Permitted**: Deterministic token detection (`R18`, `R-18`, `18+`, `NSFW`, `adult`, `mature`, `sexually suggestive`), structured metadata, DOM/CSS labels, tags, and platform API fields.
- **Prohibited**: Home-grown ML or neural image/text classifiers. Neural classification conflicts with anti-AI dataset covenants, introduces copyrighted-thumbnail training provenance risk, creates child-safety false-negative exposure, and adds an unaudited legal policy surface.

### Fail-Closed Quarantine and `PROHIBITED` Path
- **`UNKNOWN_RESTRICTED` (Fail-Closed)**: When storefront signals are missing, conflicting, or suspicious, enforce restrictions at the **data-access/API layer** (never hide explicit images behind client-side CSS blur, which still transmits explicit media). Expose at most title, creator, storefront, and canonical URL while withholding previews, thumbnails, and descriptions.
- **`PROHIBITED` (Suspected CSAEM/CSAM or illegal content)**: Isolate strictly from crowdsourced moderation. In live D1 (`catalog_tickets`), `safety_quarantine` tickets are excluded from `/v1/moderator/ratings` and isolated to operators only (`R56-C56C`).

## 3. Data Minimization, Regulatory Benchmarks, and VRChat Age-Verification Nuances

### Data Minimization Invariants
- Never collect or store government IDs, dates of birth, legal names, facial biometrics, or Persona verification payloads.
- Store only minimal boolean flags (`registered_users.age_verified`) and abstract capability claims (`AGE_18_REQUIREMENT_SATISFIED`).
- Never infer age from email domains or account creation timestamps.

### Regulatory and Industry Benchmarks (`Retrieved` / `Historical`)
| Jurisdiction / Source | Key Finding | Operational Impact on VRCP |
| :--- | :--- | :--- |
| **PH RA 11930 §35** | Requires online providers of adult content to use anonymous age verification prior to access. | Applicability to a metadata search index is `UNRESOLVED`. |
| **PH RA 10173** | Classifies age and government IDs as sensitive personal information. | Never correlate VRChat user IDs with age status in a central crawler user table without lawful basis and minimization. |
| **EU Age Verification Blueprint** (`digital-strategy.ec.europa.eu/en/policies/eu-age-verification`) | Feature-ready April 2026; proves "over 18" without disclosing identity. | Matches VRCP's opaque credential model (`AgeClaim { threshold: 18, assurance }`). |
| **UK Ofcom 2026 Report** (`ofcom.org.uk/.../use-of-age-assurance-report-2026`) | Warns behavioral age inference may fail statutory thresholds because it requires longitudinal observation. | Reinforces keeping `AGE_UNKNOWN`, `AGE_SELF_DECLARED_18_PLUS`, `AGE_INFERRED_18_PLUS`, and `AGE_VERIFIED_18_PLUS` strictly distinct. |
| **Industry Precedents (X, Discord)** | Escalate at adult-content boundaries; block sensitive media when age is undetermined; separate age verdict from raw ID documents. | Confirms fail-closed default when age assurance is absent. |

### VRChat Unofficial API Age-Verification Constraints
- VRChat performs age verification via Persona (`https://wiki.vrchat.com/wiki/Age_Assurance/en`).
- **Critical boolean trap**: In VRChat user objects (`LimitedUserInstance`), `ageVerified === true` means only that verification occurred; **minors can have `ageVerified === true`**. Any VRChat check must require **`ageVerificationStatus === "18+"` AND `ageVerified === true`** (`Verified 18+`).
- **Hidden badge behavior**: Verified adults can hide their `Verified 18+` badge; badge absence means `AGE_UNKNOWN`, never "under 18".
- **Policy tension**: VRChat Creator Guidelines (`https://hello.vrchat.com/creator-guidelines`) permit unofficial API integrations while forbidding storing VRChat credentials/sessions and noting VRChat offers no OAuth; VRChat Terms (`https://hello.vrchat.com/legal`) broadly prohibit automated crawlers/scrapers. Keep any future lookup narrow, user-initiated, transient (optional temporary bio nonce discarded immediately after verification), and behind an adapter interface swappable for future official VRChat OAuth.
- **Upstream isolation**: Never transmit `AGE_ASSURED_BY_VRCHAT` upstream as `REAL_IDENTITY_VERIFIED`; pass only abstract `AGE_18_REQUIREMENT_SATISFIED`.

## 4. Visibility-Aware Moderation and Downstream Token Scopes

- **Human review**: Exception-only queue for disputed or ambiguous rules, not routine crawl ingestion.
- **Typed report scopes**: `METADATA`, `AVAILABILITY`, `OWNERSHIP`, `CONTENT_RATING`, `ILLEGAL_CONTENT`.
  - `GENERAL`: Public feedback allowed.
  - `MATURE` / `UNKNOWN_RESTRICTED`: Requires mature-content eligibility.
  - `ADULT_RESTRICTED`: `CONTENT_RATING` disputes limited to adult-assured reviewers or verified creators/owners; broken-link, metadata, and removal notices remain open.
  - `PROHIBITED`: Isolated operator-only incident path; zero crowdsourced voting.
- **Downstream token scopes (candidate model)**: Separate `catalog.read`, `catalog.restricted.read`, and `catalog.restricted.feedback`; restricted scopes require downstream agreement accepting local legal responsibility for age gating and prohibiting stripping or altering rating metadata.
- **Provenance over majority vote**: Preserve `SOURCE ASSERTION`, `DOWNSTREAM REPORT`, `CREATOR ASSERTION`, and `MODERATOR REVIEW` as non-destructive evidence rather than letting raw vote counts overwrite ratings.

## 5. Open Counsel and Policy Items (`UNRESOLVED`)

1. Whether a metadata-only package search engine qualifies as an "online provider of adult content" under PH RA 11930 §35.
2. Exact retention limits, moderator safety protocols, logging redaction, and mandatory reporting procedures for `PROHIBITED` / suspected CSAEM/CSAM reports.
3. Contractual boundary between VRChat Creator Guidelines and VRChat Terms of Service for transient user-initiated profile lookups pending official VRChat OAuth.
