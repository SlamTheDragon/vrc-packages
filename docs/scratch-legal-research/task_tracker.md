# Task Tracker: Sector 5 (Legal Research and Truth Covenants)

## Active Working Context

- **Sector Anchor**: `docs/scratch-legal-research/`
- **Current Milestone**: `G-LEGAL-CLEARANCE` (`open`)
- **Active Task Slice**: `REORIENT-LR-01` (`open`, awaiting owner ledger review before Stage 1 online research)
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
| REORIENT-LR-01 | open | `docs/research/markets/platform_clearance_matrix.md`, `docs/research/markets/vpm_and_vrc_get_ecosystem.md`, `docs/research/markets/storefront_and_tool_discovery.md`, `docs/research/legal/expansion_action_matrix.md` | Run Stage 1 primary research across 7 preview pools and custom-domain rules, untangle, and publish `HO-L1-003`. | Pending |

---

## Next Steps

1. Await owner ledger review before executing `REORIENT-LR-01` Stage 1 online research across all 7 preview pools and custom-domain relevance gates.
2. Await an explicit Sector 5 (`legal-research`) directive to execute `R13-C11` or `R56-C56D`.
3. Validate every Sector 5 edit with `bun .agents/scripts/check_doc_links.ts` and `python .agents/skills/ste-writing-skill/ste-lint.py <changed-doc>`.
