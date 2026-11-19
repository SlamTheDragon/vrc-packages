# Implementation Plan: Sector 3 (Consumer API and Web)

## Canonical Architectural Covenants

1. **Owned Paths**: `src-package/` (consumer SDK `vrc-packages-api`), `src-web/` (Astro 7 + Svelte 5 website and operator panel), and `src-web-search/` (Astro 7 + Svelte 5 search frontend submodule).
2. **Truth Cascade**: Follow [`AGENTS.md`](../../AGENTS.md) -> [`VISION.md`](../research/decisions/VISION.md) (`T00`–`T03`, `T05`, `T06`) -> [`SYSTEM_MAP.md`](../source/SYSTEM_MAP.md) -> [`LEGAL.md`](../../LEGAL.md) -> [`src-package/AGENTS.md`](../../src-package/AGENTS.md), [`src-web/AGENTS.md`](../../src-web/AGENTS.md), and [`src-web-search/AGENTS.md`](../../src-web-search/AGENTS.md).
3. **SDK Contract and Release Hold**: Export exact canonical names (`VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`). Preserve strict Worker snake-case lead DTOs without aliases or invented reasons. Public wire DTO changes trigger the Rule 06 `edit-guard`. Pre-0.1 releases (`v0.0.1+`) are permitted after verification; **`v0.1.0` stays held** for full owner [`API_ROUTES.md`](../applications/VRCP%20API/API_ROUTES.md) review.
4. **Web UI and Legal Routing**: Follow [`.agents/rules/09-frontend-design-system-invariants.md`](../../.agents/rules/09-frontend-design-system-invariants.md), local Svelte 5 skills, and root `web-perf`. Preserve mandatory outbound storefront deep-routing per [`LEGAL.md`](../../LEGAL.md) Section 4. Keep `docs/applications/` untouched and stage proposed wiki updates in [`docs/source/reliability/proposed_wiki_changes.md`](../source/reliability/proposed_wiki_changes.md).
5. **Minimal Scratch Footprint and Offloading**: Keep strictly two files here (`IMPLEMENTATION_PLAN.md` and `task_tracker.md`). Offload verified product notes to [`docs/source/CHANGELOG.md`](../source/CHANGELOG.md) and delete verified rows upon closure.

---

## Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| blocked | Q-API-REVIEW | Full route and missing-functionality review holds SDK `v0.1.0` | `src-package/`, [`api_contract_review.md`](../research/audits/api_contract_review.md) | Permissions, report review, search attribution, CORS preflight, and ownership gaps remain open before locking `v0.1.0`. | Continue verified pre-0.1 releases via root publication tooling while completing the full owner `API_ROUTES.md` review before `v0.1.0`. | Owner disposition: use root publication procedure for preview/pre-0.1 paths; hold `v0.1.0` for full route review. |
| unverified | R13-C6 | SDK source, packed artifact, and Worker parity checks need full re-verification before production adoption | `src-package/src/client.ts`, `src-package/package.json` | Strict snake-case lead DTOs and pagination cursor codecs are implemented; full clean-consumer production release parity remains open. | Run full `src-package` typecheck, unit tests, packed tarball consumer tests, and wire parity checks before next release bump. | |
| unverified | R38-C23 | Report receipt schema parity review pending on latest Worker/SDK artifacts | `src-package/src/protocol/downstream.ts`, `src-worker/src/api/downstream_handler.ts` | Worker `reportId` receipt matches SDK (issue/demand 200, removal 202), but installed/native parity checks predate recent changes. | Re-verify installed SDK against native `workerd` report responses at the next SDK/Worker gate. | |
| open | R47-C27-WEB | Astro web and search frontends remain starters without SDK wiring, auth, or CORS preflight | `src-web/src/pages/index.astro`, `src-web-search/src/pages/index.astro` | Both manifests declare `vrc-packages-api`, but no UI routes, Firebase Auth flows, authenticated CORS/OPTIONS preflight, or legal/registry pages exist yet. | Sequence authenticated CORS design, Firebase Auth backend/frontend boundary, operator panel, legal pages, and search UI with outbound storefront deep-routing. | |
| open | Q-USER-AUTH-REGISTRATION | Multi-provider user registration and VRChat age-verification integration remain deferred | `src-worker/src/storage/d1/utils.ts`, `src-web/`, `src-package/` | Firebase Auth UID + multi-provider linking (GitHub, Gumroad, Ko-fi, Jinxxy) and VRChat `Verified 18+` age flag are specified by owner but deferred to the user-auth milestone. | Store Firebase Auth UID in `registered_users.user_id`, consolidate provider links/claims in one JSON column, and map VRChat `ageVerificationStatus === '18+' && ageVerified === true` to `age_verified` when the auth gate opens. | Owner disposition recorded in `owner_dispositions.md` (deferred to dedicated user-auth milestone). |

---

## Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G9-WEB | Operator panel, website, and web search portal | `src-web` and `src-web-search` build as Astro 7 + Svelte 5 starters with declared `vrc-packages-api` dependencies; SDK integration, Firebase Auth, CORS preflight, and UI pages remain open. | |
| G15 | SDK `v0.1.0` release approval | Pre-0.1 SDK releases (`v0.0.1+` / preview) pass verified builds; `v0.1.0` remains held for full owner `API_ROUTES.md` review and cross-route blocker resolution. | |
