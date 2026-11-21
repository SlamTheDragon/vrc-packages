# Consumer API SDK and Web Ecosystem Specification

> **Owned Directories:** `src-package/` (`vrc-packages-api` and `vrc-packages-api-preview`), `src-web/` (`vrcp-web`), `src-web-search/` (`vrc-packages-search` submodule)  
> **Owning Sector:** Sector 3 (`api-web`)  
> **Wire Reference:** [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

This specification defines the live executable state and integration boundaries for Sector 3 consumer SDK and Astro/Svelte web frontends.

## 1. Consumer SDK (`src-package/`)

- **Identity and license**: Public Apache-2.0 TypeScript package (`vrc-packages-api` release and `vrc-packages-api-preview` preview). Active versions live in [`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json).
- **Canonical exports**: `VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (`64 KiB`), `MAX_SDK_SUCCESS_BYTES` (`4 MiB`), plus `./auth`, `./types`, `./taxonomy`, and `./protocol`.
- **Implemented `VRCPackageClient` namespaces**:
  - `index`: `query()`, `search()`, `syncDeltas()`
  - `app`: `register()`
  - `reports`: `submit()`
  - `claims`: `submitIntake()`
  - `user.apps`: `list()`, `get()`
  - `operator`: `init()`, `jobs.{list, enqueue}()`, `leads.{list, approve, reject}()`, `sourceProfiles.{list, create, disable}()`, `autoQueueRules.{list, create, disable}()`, `nodes.{list, issue, revoke}()`, `catalog.list()`, `takedowns.{list, verify}()`, `claims.{list, verify}()`, `apps.{list, setDelegation, reviewCandidate}()`
  - `moderator`: `ratings.{list, adjust}()`, `apps.{list, reviewCandidate}()`
- **Operator listing endpoints**: `operator.nodes.list()` queries `GET /v1/operator/nodes` with optional `status`, `limit`, and `cursor` parameters and omits token secrets. `operator.jobs.list()` queries `GET /v1/operator/jobs` with optional `state`, `platform`, `limit`, and `cursor` parameters and omits lease secrets.
- **Release gate hold**: Pre-0.1 releases (`v0.0.1+`) are permitted after full package verification. Version `v0.1.0` stays held until the owner completes the [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review in [`IMPLEMENTATION_PLAN.md`](../../scratch-api-web/IMPLEMENTATION_PLAN.md).

## 2. Website (`src-web/`) and Web Search (`src-web-search/`)

| Project | Package Name and Version Authority | Stack | Live State | Declared SDK Dependency |
| :--- | :--- | :--- | :--- | :--- |
| **`src-web/`** | `vrcp-web` ([`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json)) | Astro 7 + Svelte 5 | Operator and Moderator UI (`/`, `/login`, `/operator`, `/moderator`, `/design`) in dark mode. Public registry and legal pages live in [`IMPLEMENTATION_PLAN.md`](../../scratch-api-web/IMPLEMENTATION_PLAN.md). | `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"` |
| **`src-web-search/`** *(Git submodule)* | `vrc-packages-search` (`src-web-search/package.json`) | Astro 7 + Svelte 5 | Starter page (`src/pages/index.astro`: `<h1>Astro</h1>`). No search UI wired at this time. | `"vrc-packages-api": "^0.0.6"` |

`src-web/` (`vrcp-web`) consumes `vrc-packages-api-preview` (`npm:vrc-packages-api-preview@latest`) strictly over HTTP via `bun run prepare:dev preview web`. The `src-web-search/` submodule stays on `"vrc-packages-api": "^0.0.6"` until its next alignment. Visual layout formatting in `src-web/` stays held pending owner UX research, while Sector 3 encodes backend, SDK, and client functions.

## 3. Integration and Security Boundaries

- **Zero sibling imports**: Neither `src-web/` nor `src-web-search/` can import `src-worker/` TypeScript, D1 schemas, or `src-package/` through relative paths. Both apps consume their declared SDK package (`vrc-packages-api-preview` in `src-web/` and `vrc-packages-api` in `src-web-search/`) strictly over HTTP.
- **No static secrets**: Never embed `OPERATOR_TOKEN`, `vrcp_app_` private keys, or HMAC signing secrets inside static site bundles or browser JavaScript.
- **Authenticated browser CORS**: Authenticated browser flows and `OPTIONS` preflight require reviewed CORS and Firebase Auth support tracked in [`IMPLEMENTATION_PLAN.md`](../../scratch-api-web/IMPLEMENTATION_PLAN.md).
- **Outbound storefront attribution**: Public search and catalog UI views must display direct outbound Source Storefront URLs per [`LEGAL.md`](../../../LEGAL.md) Section 4.
- **UI and performance skills**: Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md), local `.agents/skills/` Svelte 5 skills, and root `web-perf`.

## 4. Domain Verification

Run the Sector 3 verification commands listed in [`SYSTEM_MAP.md`](../SYSTEM_MAP.md).
