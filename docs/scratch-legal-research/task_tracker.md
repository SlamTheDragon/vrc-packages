# Task Tracker: Sector 5 (Legal Research and Truth Covenants)

## Active Working Context

- **Sector Anchor**: `docs/scratch-legal-research/`
- **Current Milestone**: `G-LEGAL-CLEARANCE` (`open`)
- **Active Task Slice**: None active (`REORIENT-LR-01` / `CLR-LR-001` cleared by Sector 4 Pipeline without version bump; `HO-L1-003` remains active upstream for Stage 5-6 consumers).
- **Working Theories and Hypotheses**:
  - Legal jurisprudence, age assurance, and expansion actions now have orthogonal single-owner records under [`docs/research/legal/`](../research/README.md).
  - Platform clearance posture lives in [`docs/research/markets/platform_clearance_matrix.md`](../research/markets/platform_clearance_matrix.md) and separates Fetch, Retain, Publish, and Remove decisions.
  - No research note in `docs/research/` grants fetch clearance or certifies runtime compliance in `docs/source/`.

---

## Active Slice Execution Ledger

| slice_id | status | file_target | action_summary | verification_evidence |
| :--- | :--- | :--- | :--- | :--- |
| R13-C11 | open | `docs/research/markets/platform_clearance_matrix.md`, `docs/research/legal/expansion_action_matrix.md` | Complete primary terms/robots/API retrieval for BOOTH, Gumroad, Jinxxy, itch.io, Payhip, Sellfy, and Shopify merchants before live profile approval. | Pending |
| R56-C56D | open | `LEGAL.md`, `docs/research/legal/jurisprudence_and_covenants.md` | Retrieve Japanese Copyright Act (Art. 30-4 / 47-5) and consolidated RA 8293/RA 10173 texts and reconcile the 7 `LEGAL.md` draft-vs-code gaps. | Pending |

---

## Next Steps

1. Maintain active Tier 1 outbound covenant handoffs (`HO-L1-001`, `HO-L1-003`) while downstream product sectors execute Stages 5 and 6.
2. Await an explicit Sector 5 (`legal-research`) directive to execute `R13-C11` (pre-production permission outreach including Jinxxy), `R56-C56D`, or `UNTANGLE-LR-01..06`.
3. Validate every Sector 5 edit with `bun .agents/scripts/check_doc_links.ts` and `python .agents/skills/ste-writing-skill/ste-lint.py <changed-doc>`.
