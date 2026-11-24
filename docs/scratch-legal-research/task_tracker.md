# Task Tracker: Sector 5 (Legal Research and Truth Covenants)

## Active Working Context

- **Sector Anchor**: `docs/scratch-legal-research/`
- **Current Milestone**: `G-LEGAL-CLEARANCE` (`open`)
- **Active Task Slice**: `REORIENT-LR-01` (`verified`: Stage 1 online research, `2026-11-24` `REORIENT-BP-*` dispositions, and `HO-L1-003` complete; request non-product closure via `handoff.md`)
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
| REORIENT-LR-01 | verified | `docs/research/markets/platform_clearance_matrix.md`, `docs/research/decisions/owner_dispositions.md`, `docs/research/architecture/{entity_resolution_and_standards.md,infrastructure_and_quotas.md}` | Completed Stage 1 online primary checks, recorded `2026-11-24` `REORIENT-BP-*` dispositions, updated entity resolution and quota research, and published `HO-L1-003`. | `check_doc_links.ts` (482 docs, exit 0), `ste-lint.py --strict` (`owner_dispositions.md` 2.87, `entity_resolution_and_standards.md` 3.93, `infrastructure_and_quotas.md` 3.33, `platform_clearance_matrix.md` 3.02) |

---

## Next Steps

1. Await Sector 4 Pipeline non-product audit closure for `REORIENT-LR-01` (`HO-L1-003` active).
2. Await an explicit Sector 5 (`legal-research`) directive to execute `R13-C11` (pre-production permission outreach including Jinxxy) or `R56-C56D`.
3. Validate every Sector 5 edit with `bun .agents/scripts/check_doc_links.ts` and `python .agents/skills/ste-writing-skill/ste-lint.py <changed-doc>`.
