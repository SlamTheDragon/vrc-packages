# VRC Packages (VRCP): Research Corpus and Legal Covenants

Welcome to `docs/research/`. This directory owns the **investigative research corpus**: legal jurisprudence, age-assurance analysis, platform clearance studies, ecosystem research, exploratory system architecture, security protocol analysis, point-in-time audits, and retained owner decisions.

> [!IMPORTANT]
> **Strict Research-vs-Source Boundary**:
> - This corpus informs owner decisions and flags required legal or engineering actions.
> - **It is not current executable source truth** (which lives strictly in [`docs/source/`](../source/README.md)) and **it is not legal advice or source-access authorization**.
> - Human-readable user wiki documentation lives strictly in [`docs/applications/`](../applications/README.md) and must not be edited from research notes without owner approval.

## Orthogonal Domain Hierarchy

Every research topic has one owning file. Cross-reference owners via repository-relative Markdown links instead of duplicating explanations.

| Domain Folder | Owning Scope | Documents |
| :--- | :--- | :--- |
| **`decisions/`** | Retained owner intent, publishing rules, and historical owner dispositions | [VISION.md](decisions/VISION.md), [AGENT_PUBLISHING_PROCEDURE.md](decisions/AGENT_PUBLISHING_PROCEDURE.md), [owner_dispositions.md](decisions/owner_dispositions.md) |
| **`legal/`** | Legal truth covenants, statutory/case citations, age assurance, moderation bounds, and expansion clearance gates | [jurisprudence_and_covenants.md](legal/jurisprudence_and_covenants.md), [age_assurance_and_moderation.md](legal/age_assurance_and_moderation.md), [expansion_action_matrix.md](legal/expansion_action_matrix.md) |
| **`markets/`** | Storefront clearance matrices, desktop tool discovery, VPM listing specs, and `vrc-get` ecosystem bounds | [platform_clearance_matrix.md](markets/platform_clearance_matrix.md), [storefront_and_tool_discovery.md](markets/storefront_and_tool_discovery.md), [vpm_and_vrc_get_ecosystem.md](markets/vpm_and_vrc_get_ecosystem.md) |
| **`architecture/`** | Investigative infrastructure, Cloudflare quota models, entity resolution standards, cryptographic delegation, and live ingestion strategy | [infrastructure_and_quotas.md](architecture/infrastructure_and_quotas.md), [entity_resolution_and_standards.md](architecture/entity_resolution_and_standards.md), [cryptographic_delegation.md](architecture/cryptographic_delegation.md), [live_ingestion_assessment_strategy.md](architecture/live_ingestion_assessment_strategy.md) |
| **`audits/`** | Point-in-time contract reviews, prototype parity gaps, and publication pipeline readiness | [api_contract_review.md](audits/api_contract_review.md), [prototype_parity.md](audits/prototype_parity.md), [publication_pipeline_readiness.md](audits/publication_pipeline_readiness.md) |

## Evidence Labeling Discipline

Every claim in this corpus must use one of five evidence labels (defined in [`entity_resolution_and_standards.md`](architecture/entity_resolution_and_standards.md#evidence-labels-and-review-cycle)):
- **`Retrieved`**: Primary legal text, RFC, or documentation obtained; retrieval is not legal validation.
- **`Historical`**: Earlier code or policy observation; recheck mutable terms and live code before acting.
- **`Candidate`**: Investigative lead or design proposal, not an accepted architecture or access grant.
- **`Unavailable`**: Retrieval failed or primary translation unavailable; keep the gap explicitly visible.
- **`Measured`**: Recorded fixture, benchmark, or runtime measurement with stated bounds.

## Navigation

- [Owner Truth and Vision](decisions/VISION.md)
- [Legal Notices and Operational Covenants](../../LEGAL.md)
- [System Map and Context Cascade](../source/SYSTEM_MAP.md)
- [Current Source Documentation Truth](../source/README.md)
- [Sector 5 Legal Research Ledger](../scratch-legal-research/IMPLEMENTATION_PLAN.md)
