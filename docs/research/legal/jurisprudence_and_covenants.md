# Legal Jurisprudence and Operational Covenants Research

> **Status:** Investigative Legal Research Corpus (Not Legal Advice; Not Access Authorization)  
> **Owning Sector:** Sector 5 (`legal-research`)  
> **Related Draft Covenant:** [`LEGAL.md`](../../../LEGAL.md)

This document organizes the primary statutes, judicial opinions, RFC standards, drafting controls, and open reconciliation gaps that govern VRC Packages (VRCP). Research prose never authorizes bypassing authentication, CAPTCHA challenges, rate blocks, private APIs, or product licenses.

## 1. Six Distinct Legal Regimes and Four Operational Decisions

Every source evaluation must separate **six legal regimes**:
1. **Computer access**: Statutory unauthorized-access laws (for example US CFAA).
2. **Contract**: Website terms of service, API terms, and merchant agreements.
3. **Copyright**: Unprotected factual metadata versus protected creative prose, thumbnails, and compilations.
4. **Privacy**: Personal data processing, public creator handles, user contact emails, search logs, and sensitive age flags.
5. **Platform policy**: Storefront guidelines, rate limits, and automated-access rules.
6. **Publication rights**: Permission to fetch does not grant permission to retain, transform, or syndicate publicly.

Every platform or feature review must record **four independent operational decisions**:
- **Fetch**: May a leased node request public bytes from this origin under a scoped profile?
- **Retain**: Which extracted fields may persist in D1, for how long, and with what provenance?
- **Publish**: Which fields may project into `/v1/app/index`, `/v1/app/index/delta`, or `/v1/app/index/search`?
- **Remove**: How are objections, takedowns, and suppressions verified and propagated downstream?

Do not infer statutory requirements from engineering preferences (for example, an internal 24 to 48 hour response goal is not a universal legal deadline). US DMCA designated-agent and safe-harbor conditions require section-specific applicability analysis; do not claim every indexing service must register.

## 2. Primary Statutory, Case-Law, and RFC Authority Table

| Authority | Primary Reference | Retrieval Status | Verified Scope and Limits |
| :--- | :--- | :--- | :--- |
| **PH RA 10173** (Data Privacy Act) | https://privacy.gov.ph/data-privacy-act/ | `Historical` (earlier retrieval; later focused fetch failed) | Sections 11, 12, 16 govern processing principles, lawful basis, and data-subject rights. Public handles can identify natural persons. Legitimate interest requires purpose, necessity, and balancing analysis. **Age and government IDs are sensitive personal information.** |
| **PH RA 11930 §35** | https://lawphil.net/statutes/repacts/ra2022/ra_11930_2022.html | `Retrieved` | Requires online providers of adult content to adopt an anonymous age-verification process before granting access. Applicability to a metadata search engine remains `UNRESOLVED`. |
| **PH RA 8293** (IP Code) | https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html | `Historical` (Lawphil reproduction; not verified consolidated edition) | Section 175 separates unprotected facts from protected expression; compilation rights do not clear underlying third-party works. Verify later amendments before relying on statutory text. |
| **PH RA 8792** (E-Commerce Act) | https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html | `Retrieved` | Section 30 intermediary-liability protections carry statutory conditions. Avoiding binary hosting does not confer automatic immunity. |
| **US Title 17, Ch. 1** (Copyright) | https://www.copyright.gov/title17/92chap1.html | `Retrieved` | Evaluate protected expression and §107 fair-use factors separately for factual fields, prose snippets, and images. A character limit is not copyright clearance. |
| **Van Buren v. United States** (U.S., 2021) | https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf | `Retrieved` | Addresses "exceeds authorized access" under the CFAA; does **not** establish universal web-scraping permission. |
| **hiQ Labs v. LinkedIn** (9th Cir., 2022) | https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf | `Retrieved` | Preliminary injunction on CFAA access to public profiles; does **not** settle contract, copyright, privacy, or non-US claims. |
| **Hunley v. Instagram** (9th Cir., 2023) | https://cdn.ca9.uscourts.gov/datastore/opinions/2023/07/17/22-15293.pdf | `Retrieved` | Applies the Ninth Circuit Server Test and notes district-court disagreement. Does not prove global immunity; check subsequent treatment before relying on inline embedding. |
| **Meta v. Bright Data** (N.D. Cal., 2024) | Justia reproduction (Jan 23, 2024, filing 181) | `Historical` | Fact-specific contract ruling on logged-out access; does **not** establish that website terms never bind crawlers. Inspect docket and subsequent history before applying. |
| **EU GDPR** | https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng | `Retrieved` | Assess Article 3 territorial scope, lawful basis, minimization, notices, deletion, and transfers. Free service or non-EU hosting alone does not exclude GDPR. |
| **Japanese Copyright Act** | https://www.japaneselawtranslation.go.jp/en/laws/view/4207 | `Unavailable` (retrieval failed) | Do **not** assert that Articles 30-4 or 47-5 clear VRCP from an unavailable translation. Retrieve authoritative current text before relying on Japanese law. |
| **IETF RFC 9309** | https://www.rfc-editor.org/rfc/rfc9309.html | `Retrieved` | Robots Exclusion Protocol is an operational preference signal, **not** access authorization, contract license, or reuse clearance. |

## 3. Seven-Step Legal Drafting and Verification Procedure

Follow this sequence before adding any operational covenant to [`LEGAL.md`](../../../LEGAL.md) or approving a new source profile:

1. **Trace full data flow**: Map URL discovery, HTTP fetch, parsing, retention, identity linking, public projection, downstream export, logging, and removal.
2. **Inventory fields and subjects**: Distinguish factual metadata, creative expression, image URLs, creator/contact data, and end-user queries or report text.
3. **Retrieve primary texts**: Record canonical URL, clause number, language, effective date, retrieval date, account applicability, and unavailable sources. Store minimal evidence without archiving third-party products.
4. **Separate text from interpretation**: State factual prerequisites, jurisdiction, procedural posture, and later history; mark material uncertainty `UNRESOLVED` for counsel review.
5. **Define independent permissions**: Set separate Fetch, Retain, and Publish bounds with expiry and revocation; translate into scoped D1 `source_access_profiles` and negative tests.
6. **Verify live enforcement**: Test lease claim, heartbeat, submission, projection, revocation, stale robots, unknown ownership, and denied publication. Never promise guarantees from an unused schema column.
7. **Publish accurate draft text**: Mark every unreviewed legal draft explicitly as draft with zero compliance claims. Keep source permissions, project terms, and privacy notices distinct.

## 4. `LEGAL.md` Reconciliation Queue (7 Verified Gaps)

| # | Draft `LEGAL.md` Claim | Observed Code / Evidence Gap | Required Reconciliation Action |
| :--- | :--- | :--- | :--- |
| 1 | Zero accounts or zero PII | `registered_users` stores `contact_email`; reports, search queries, and logs can hold identifying text. | Inventory exact fields, retention periods, and redaction rules; remove blanket "zero PII" claims. |
| 2 | Verified creator proof and delisting | `submitDelistRequest` historically mutated lifecycle before ownership proof; `verifyTakedown` lacked state-cause verification. | Keep intake strictly separate from ownership proof and authorized mutation; describe proof protocols only after implementation. |
| 3 | Publication-class restrictions | Earlier diagnostics exposed items with `publishClasses: []` (later fixed in `R13-C3` locally; keep regression tests active). | Verify live projection and delta tombstone tests before claiming rights-gated publication. |
| 4 | Media and thumbnail proxy services | Prototype BLOB/proxy (`image_proxy.ts`) is absent from current Worker/node code. | Remove promises of active media proxy routes and do not assert blanket Server Test protection. |
| 5 | Timestamps and description limits | Earlier paths mapped modification timestamps into publication fields; summary length limits differ from draft text. | Align documented field semantics with live code; state clearly that truncation is risk reduction, not copyright clearance. |
| 6 | Anonymous demand guarantees | Threshold aggregation is not differential privacy; free-text search/report fields can identify individuals. | Review collection and disclosure bounds separately; remove unsupported differential-privacy language. |
| 7 | Default platform clearance | Bootstrap fixtures previously invented allow snapshots and 2099 grants (removed in `R13-C2`). | Replace all assumed clearances with reviewed per-origin profiles tracked in [`platform_clearance_matrix.md`](../markets/platform_clearance_matrix.md) and [`expansion_action_matrix.md`](expansion_action_matrix.md). |
