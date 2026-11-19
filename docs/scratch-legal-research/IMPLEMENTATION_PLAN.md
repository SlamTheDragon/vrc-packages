# Implementation Plan: Sector 5 (Legal Research and Truth Covenants)

## Canonical Architectural Covenants

1. **Owned Paths**: [`LEGAL.md`](../../LEGAL.md) and the standalone research corpus in [`docs/research/`](../research/README.md) (`decisions/`, `legal/`, `markets/`, `architecture/`, `audits/`).
2. **Truth Cascade**: Follow [`AGENTS.md`](../../AGENTS.md) -> [`VISION.md`](../research/decisions/VISION.md) (`T00`, `T02`, `T03`, `T04`) -> [`SYSTEM_MAP.md`](../source/SYSTEM_MAP.md) -> [`LEGAL.md`](../../LEGAL.md).
3. **Strict Research Corpus vs Current Source Truth Partition**: Keep legal research, jurisprudence (`docs/research/legal/`), platform clearance studies (`docs/research/markets/`), investigative architecture (`docs/research/architecture/`), and audits (`docs/research/audits/`) strictly separate from current executable source truth in [`docs/source/`](../source/README.md) and untouched human wiki docs in [`docs/applications/`](../applications/README.md). Never present research findings or legal drafts as implemented runtime state or source-access authorization.
4. **Primary-Source Legal Discipline**: Cite primary statutes, court opinions, RFC 9309, and exact platform terms. Mark unavailable translations or undecided counsel questions explicitly as `UNRESOLVED`. Changes to `LEGAL.md` trigger the Rule 06 `edit-guard`.
5. **Minimal Scratch Footprint and Non-Publication**: Keep strictly two files here (`IMPLEMENTATION_PLAN.md` and `task_tracker.md`). Do not publish or bump software products for legal-research-only gates. Delete verified rows once integrated into `docs/research/` or `LEGAL.md`.

---

## Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| open | R13-C11 | Platform source-access clearance and `LEGAL.md` operational promises exceed verified primary evidence | [`LEGAL.md`](../../LEGAL.md), [`platform_clearance_matrix.md`](../research/markets/platform_clearance_matrix.md), [`expansion_action_matrix.md`](../research/legal/expansion_action_matrix.md) | Public visibility on BOOTH, Gumroad, Jinxxy, itch.io, Payhip, Sellfy, Shopify, Nexyy, and avtr.zip does not establish fetch, retain, or publish permission; earlier Payhip/Sellfy "approved" labels were unsupported. | Execute the per-origin Fetch/Retain/Publish/Remove review in `expansion_action_matrix.md` and obtain primary terms/robots/API evidence before activating live source profiles. | Owner note: investigate VRChat market ecosystem indexing norms strictly with primary evidence. |
| open | R56-C56D | `LEGAL.md` contains draft clauses that diverge from live implementation and unresolved statutory citations | [`LEGAL.md`](../../LEGAL.md), [`jurisprudence_and_covenants.md`](../research/legal/jurisprudence_and_covenants.md) | `LEGAL.md` references absent media/export/DNS-probe paths and relies on an unretrieved Japanese Copyright Act translation (Art. 30-4 / 47-5) plus unresolved RA 11930 §35 applicability. | Retrieve primary consolidated texts (RA 8293, RA 10173, Japanese Copyright Act), reconcile the 7 `LEGAL.md` gaps against live `docs/source/`, and keep all draft clauses explicitly marked draft with zero compliance claims. | Owner disposition: no counsel available; keep `LEGAL.md` marked draft without compliance claims and limit personal data to anonymous IDs and boolean flags. |
| open | R56-C56C-COUNSEL | `PROHIBITED` / suspected illegal content handling, retention, and reporting procedures lack legal review | [`age_assurance_and_moderation.md`](../research/legal/age_assurance_and_moderation.md), [`LEGAL.md`](../../LEGAL.md) | `safety_quarantine` tickets are isolated from moderators in D1, but statutory retention, moderator safety exposure, escalation, and reporting duties remain unresolved. | Document exact operational bounds, minimal retention, and escalation criteria in `age_assurance_and_moderation.md` and flag counsel-dependent obligations explicitly as `UNRESOLVED`. | |
| blocked | R55-C55D-LEGAL | Draft `LEGAL.md` export, opt-out, and MIME examples (`vrc_catalog.db`, `vrc-opt-out`, `vnd.vrc-crawler`) lack live implementations | [`LEGAL.md`](../../LEGAL.md) | Naming and draft protocol artifacts in `LEGAL.md` predate the `VRCP` brand rule and current Worker/SDK contracts. | Reconcile external identifiers and draft contract examples when their corresponding API/export gates open without claiming unimplemented features exist. | Owner disposition: keep separate legacy names per channel where established while retaining `vrc-packages` for repos/npm. |

---

## Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G-LEGAL-CLEARANCE | Primary-source legal covenant reconciliation and platform expansion clearance | Research corpus reorganized cleanly under `docs/research/` (`legal/`, `markets/`, `architecture/`, `audits/`, `decisions/`); live platform clearance reviews, statutory text retrieval, and `LEGAL.md` draft reconciliation remain open. | |
