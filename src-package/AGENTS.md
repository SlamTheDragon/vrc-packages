# VRCP Sector 3: Consumer API SDK (`src-package/`)

## Truth Cascade

1. Obey [`SYSTEM_MAP.md`](../docs/source/SYSTEM_MAP.md) for the monorepo truth cascade, sector boundaries, and handoff rules.

2. Read the active Sector 3 ledger in [`docs/scratch-api-web/`](../docs/scratch-api-web/IMPLEMENTATION_PLAN.md) and [`handoff.md`](../docs/scratch-api-web/handoff.md) (Tier 3B).

3. Keep [`consumer_sdk_and_web.md`](../docs/source/specifications/consumer_sdk_and_web.md) and [`wire_and_protocol_contracts.md`](../docs/source/schemas/wire_and_protocol_contracts.md) aligned with live source.

4. Keep [`docs/applications/`](../docs/applications/VRCP%20API/API_ROUTES.md) untouched. Stage wiki proposals in [`proposed_wiki_changes.md`](../docs/source/reliability/proposed_wiki_changes.md).

## Sector Boundaries and Invariants

- **Scope**: Strongly typed consumer SDK (`vrc-packages-api` and `vrc-packages-api-preview`) for `/v1/operator/`, `/v1/moderator/`, `/v1/app/`, and `/v1/user/`. Internal crawler node job contracts belong exclusively in `src-worker/packages/network/`, never here.

- **Canonical identifiers**: Export exact brand names `VRCPackageClient`, `VRCPackageClientOptions`, and `VRCPApiError`. Never use doubled-P or bare `VRC*` variants.

- **Strict wire DTOs**: Preserve Worker snake-case lead fields without convenience aliases or invented audit reasons. Approval and rejection calls require explicit caller reasons.

- **Boundary edit-guard**: Any public wire DTO, pagination cursor, or schema export change triggers the Rule 06 `edit-guard` audit before edits start.

- **Release hold**: Maintainers can publish pre-0.1 releases (`v0.0.1+`) after full package verification. **`v0.1.0` stays held** until complete package verification and full owner `API_ROUTES.md` review pass.

- **Cross-project isolation**: Never import from `../src-worker` or other `src-*` projects.

## Domain Verification

Run from `src-package/`:

```powershell
bun run typecheck
bun test
bun run build
bun run test:distribution
```
