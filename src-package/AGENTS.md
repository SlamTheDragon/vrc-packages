# VRCP Sector 3: Consumer API SDK (`src-package/`)

## Truth Cascade

1. Inherit root [`AGENTS.md`](../AGENTS.md), [`VISION.md`](../docs/research/decisions/VISION.md) (`T00`–`T02`, `T05`, `T06`), [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md), and [`LEGAL.md`](../LEGAL.md).
2. Active 3-file sector ledger: [`docs/scratch-api-web/`](../docs/scratch-api-web/IMPLEMENTATION_PLAN.md) (`handoff.md` owns **Tier 3B** Public Consumer API SDK). Permitted upstream reads: [`scratch-legal-research/handoff.md`](../docs/scratch-legal-research/handoff.md) (Tier 1), [`scratch-crawler-network/handoff.md`](../docs/scratch-crawler-network/handoff.md) (Tier 2 / 3A), and [`scratch-pipeline/handoff.md`](../docs/scratch-pipeline/handoff.md). Submit Publication Requests strictly in [`docs/scratch-api-web/handoff.md`](../docs/scratch-api-web/handoff.md); only Sector 4 Pipeline edits `docs/source/CHANGELOG.md` and clears `verified` rows.
3. Owning truth docs: [`consumer_sdk_and_web.md`](../docs/source/specifications/consumer_sdk_and_web.md), [`wire_and_protocol_contracts.md`](../docs/source/schemas/wire_and_protocol_contracts.md), and [`API_ROUTES.md`](../docs/applications/VRCP%20API/API_ROUTES.md) *(untouched wiki; stage updates in [`proposed_wiki_changes.md`](../docs/source/reliability/proposed_wiki_changes.md))*.

## Sector Boundaries and Invariants

- **Scope**: Strongly typed consumer SDK (`vrc-packages-api` / `vrc-packages-api-preview`) for `/v1/operator/`, `/v1/app/`, and `/v1/user/`. Internal crawler node job contracts belong exclusively in `src-worker/packages/network/`, never here.
- **Canonical identifiers**: Export exact brand names `VRCPackageClient`, `VRCPackageClientOptions`, and `VRCPApiError` (never doubled-P or bare `VRC*` variants).
- **Strict wire DTOs**: Preserve Worker snake-case lead fields without convenience aliases or invented audit reasons. Approval and rejection calls require explicit caller reasons.
- **Boundary edit-guard**: Any public wire DTO, pagination cursor, or schema export change triggers the Rule 06 `edit-guard` audit before editing.
- **Release hold**: Pre-0.1 releases (`v0.0.1+`) are permitted after full package verification. **`v0.1.0` remains held** until complete package verification and the owner's full `API_ROUTES.md` review pass.
- **Cross-project isolation**: Never import from `../src-worker` or other `src-*` projects.

## Domain Verification

Run from `src-package/`:

```powershell
bun run typecheck
bun test
```
