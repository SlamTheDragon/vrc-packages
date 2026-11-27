# Integration Handoff Ledger: Sector 5 (Legal Research and Truth Covenants)

## Department Scope and Hierarchy Position

- **Cascade Tier**: **Tier 1 (Truth, Covenants, Legal, and Vision)**
- **Sector Anchor**: `docs/scratch-legal-research/`
- **Owned Paths**: `LEGAL.md`, `docs/research/` (`decisions/`, `legal/`, `markets/`, `architecture/`, `audits/`)
- **Permitted Upstream Reads**: [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md) (Pipeline notices only; Tier 1 sits at the top of the departmental cascade)
- **Downstream Readers**:
  - Tier 2 (`src-worker/`) and Tier 3A / 4A (`src-worker/packages/network/`, `src-crawler/`) via [`docs/scratch-crawler-network/handoff.md`](../scratch-crawler-network/handoff.md)
  - Tier 3B (`src-package/`) and Tier 5 (`src-web/`, `src-web-search/`) via [`docs/scratch-api-web/handoff.md`](../scratch-api-web/handoff.md)
  - Tier 4B (`src-crawler-client/`) via [`docs/scratch-desktop-client/handoff.md`](../scratch-desktop-client/handoff.md)
  - Independent Oversight: Sector 4 Pipeline via [`docs/scratch-pipeline/handoff.md`](../scratch-pipeline/handoff.md)
- **Write Containment and Ledger Clearing**:
  - Sector 5 agents edit strictly inside `LEGAL.md`, `docs/research/`, and `docs/scratch-legal-research/`.
  - Sector 5 agents **must not** edit `docs/source/CHANGELOG.md` and **must not** clear or delete `verified` rows from `IMPLEMENTATION_PLAN.md`, `task_tracker.md`, or this `handoff.md`.
  - Only Sector 4 (`pipeline`) agents clear `verified` ledger rows after auditing closure. Non-product legal-research gates never trigger software version bumps or product changelog entries.

---

## Tier 1: Outbound Integration Handoffs (Truth, Covenants, Legal, and Vision)

Record accepted legal covenants, owner dispositions, platform clearance verdicts, and policy constraints that downstream tiers must adopt. Research findings remain non-binding until accepted by the owner or enacted in `LEGAL.md` / `VISION.md`.

| handoff_id | target_tiers | source_record | breaking_change | status | integration_directive |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `HO-L1-001` | Tier 2, Tier 3B, Tier 5 | [`owner_dispositions.md`](../research/decisions/owner_dispositions.md), [`LEGAL.md`](../../LEGAL.md) | no | active | Enforce `publishClasses` projection filtering with `catalog_tombstones`, route `rating_dispute` to `/v1/moderator/` and `safety_quarantine` to operators only, and preserve mandatory outbound storefront deep-routing on web surfaces. |
| `HO-L1-002` | Tier 2, Tier 4A | [`platform_clearance_matrix.md`](../research/markets/platform_clearance_matrix.md), [`expansion_action_matrix.md`](../research/legal/expansion_action_matrix.md) | no | blocked | Hold live source-access profile activation for BOOTH, Gumroad, Jinxxy, itch.io, Payhip, Sellfy, and Shopify merchants until `R13-C11` primary terms/robots/API retrieval completes and owner approves. |
| `HO-L1-003` | Tier 2, Tier 3A, Tier 3B, Tier 4A, Tier 5, Oversight (`pipeline`) | [`owner_dispositions.md`](../research/decisions/owner_dispositions.md), [`platform_clearance_matrix.md`](../research/markets/platform_clearance_matrix.md), [`entity_resolution_and_standards.md`](../research/architecture/entity_resolution_and_standards.md), [`infrastructure_and_quotas.md`](../research/architecture/infrastructure_and_quotas.md) | yes | active | **Stage 1-4 Blueprint Dispositions (`2026-11-24`):** Adopt 17-table D1 consolidation (0 legacy views) within Free Tier budgets, keep atomic `canonical_packages` with `verification_status` defaulting to `'unverified'` and crowdsourced `relationship_feedback` in `downstream_signals`, auto-promote VPM `index.json` manifests under RFC 9309 while parking non-VPM `custom_domain` hosts in `pending_review`, prefer VRChat-filtered browse/tag routes on BOOTH/Gumroad/itch and sitemaps on Jinxxy/Shopify (`4h`/`6h`/`24h`), enforce 3-target Cloudflare Wrangler isolation (`VRCP_ENV=production` on `[env.production]`), and retain mandatory Sector 5 permission outreach for Jinxxy before production launch (`R13-C11`). |
| `HO-L1-004` | Tier 2, Tier 3A, Tier 4A, Oversight (`pipeline`) | [`platform_clearance_matrix.md`](../research/markets/platform_clearance_matrix.md), [`owner_dispositions.md`](../research/decisions/owner_dispositions.md) | no | active | **Ko-fi and Patreon Deferred Post-v1 (`[P20]` / `2026-11-25`):** Mark Ko-fi and Patreon **Deferred Post-v1** behind ToS, anti-bot, and API blockers. Keep `9` platforms (`0x01ff`), and route Payhip to `custom_domain` (`pending_review`). |

---

## Upstream Notices Consumed (From Sector 4 Pipeline)

| source_sector | notice_id | status | summary | local_slice_id |
| :--- | :--- | :--- | :--- | :--- |
| `pipeline` | `PN-001` | acknowledged | Departmental Handoff Cascade active: Sector 5 owns Tier 1 outbound handoffs and defers all verified ledger row clearing to Sector 4 Pipeline without product version bumps. | `G-LEGAL-CLEARANCE` |
| `pipeline` | [`PN-010`](../scratch-pipeline/handoff.md) | acknowledged | Owner Live Lifecycle & Debug Directives (`2026-11-24 to 2026-11-25`, `[P19]`): indexed [`live_ingestion_assessment_strategy.md`](../research/architecture/live_ingestion_assessment_strategy.md) in `docs/research/architecture/` and scheduled Sector 5 read-only provenance (`unverified` default, custom-domain quarantine, zero creative-prose/binary leaks), initial plus R&D-discovered non-survivor attrition review (`source_leads`, `origin_state`/`crawl_jobs`, excluded `canonical_packages`, per [`Rule 02.5`](../../.agents/rules/02-boundary-and-review.md)), and RFC 9309 boundary audits during `LIVE-LOCAL-ASSESS-01` and `LIVE-PREVIEW-ASSESS-01`, plus `UNTANGLE-PRE-PREVIEW-01` before preview pushes. | `R13-C11` |
| `pipeline` | [`PN-011`](../scratch-pipeline/handoff.md) | acknowledged | Owner `[P20]` directives (`2026-11-25`): Ko-fi and Patreon deferred post-v1, `9` platforms kept (`0x01ff`), `16` real starter profiles documented, Zero-Placeholder R&D Rule added. | `R13-C11` |

---

## Publication / Ledger-Clearance Requests (For Sector 4 Pipeline Oversight)

Sector 5 submits written ledger-clearance requests here when non-product slices reach `verified`. Do not request product publication or version bumps unless a downstream runtime sector changes behavior.

| req_id | request_type | source_slice_ids | verification_proof | status | pipeline_notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| *(none pending)* | | | | | |
