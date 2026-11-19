# Consumer API SDK and Web Ecosystem Specification

> **Owned Directories:** `src-package/` (`vrc-packages-api` / `vrc-packages-api-preview`), `src-web/` (`vrcp-web`), `src-web-search/` (`vrc-packages-search` submodule)  
> **Owning Sector:** Sector 3 (`api-web`)  
> **Wire Reference:** [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

This specification defines the verified executable state and integration boundaries for Sector 3's consumer SDK and Astro/Svelte web frontends.

## 1. Consumer SDK (`src-package/`)

- **Identity and license**: Public Apache-2.0 TypeScript package (`vrc-packages-api` release / `vrc-packages-api-preview` preview, current preview `2026.10.11-pre`).
- **Canonical exports**: `VRCPackageClient`, `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (`64 KiB`), `MAX_SDK_SUCCESS_BYTES` (`4 MiB`), plus subpath exports `./auth`, `./types`, `./taxonomy`, and `./protocol`.
- **Implemented `VRCPackageClient` namespaces**:
  - `index`: `query()`, `search()`, `syncDeltas()`
  - `app`: `register()`
  - `reports`: `submit()`
  - `claims`: `submitIntake()`
  - `user.apps`: `list()`, `get()`
  - `operator`: `init()`, `jobs.enqueue()`, `leads.{list, approve, reject}()`, `sourceProfiles.{list, create, disable}()`, `autoQueueRules.{list, create, disable}()`, `nodes.{issue, revoke}()`, `catalog.list()`, `takedowns.{list, verify}()`, `claims.{list, verify}()`, `apps.{list, setDelegation, reviewCandidate}()`
  - `moderator`: `ratings.{list, adjust}()`, `apps.{list, reviewCandidate}()`
- **Release gate hold**: Pre-0.1 releases (`v0.0.1+`) are allowed after full package verification. **`v0.1.0` remains held** pending owner completion of the full [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review (`Q-API-REVIEW` / `G15`).

## 2. Website (`src-web/`) and Web Search (`src-web-search/`)

| Project | Package Name & Version | Stack | Live State | Declared SDK Dependency |
| :--- | :--- | :--- | :--- | :--- |
| **`src-web/`** | `vrcp-web@2026.10.0-pre` | Astro 7 + Svelte 5 | Starter page (`src/pages/index.astro`: `<h1>VRC Packages</h1>` + version meta tag). No dashboard, Firebase Auth, or legal pages wired yet. | `"vrc-packages-api": "latest"` |
| **`src-web-search/`** *(Git submodule)* | `vrc-packages-search@0.0.1` | Astro 7 + Svelte 5 | Starter page (`src/pages/index.astro`: `<h1>Astro</h1>`). No search UI wired yet. | `"vrc-packages-api": "^0.0.6"` |

## 3. Integration and Security Boundaries

- **Zero sibling imports**: Neither `src-web/` nor `src-web-search/` may import `src-worker/` TypeScript, D1 schemas, or `src-package/` via relative paths. Both consume `vrc-packages-api` strictly over HTTP.
- **No static secrets**: Never embed `OPERATOR_TOKEN`, `vrcp_app_` private keys, or HMAC signing secrets inside static site bundles or browser JavaScript.
- **Authenticated browser CORS**: Authenticated operator/user browser flows and `OPTIONS` preflight require a reviewed CORS and Firebase Auth design before deployment (`R47-C27-WEB`).
- **Outbound storefront attribution**: All public search and catalog UI views must display mandatory outbound Source Storefront URLs per [`LEGAL.md`](../../../LEGAL.md) Section 4.
- **UI and performance skills**: Follow [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md), local `.agents/skills/` Svelte 5 skills, and root `web-perf`.

## 4. Domain Verification Commands

```powershell
# Consumer SDK
cd src-package && bun run typecheck && bun test

# Web and Web Search
cd src-web && bun run build
cd src-web-search && bun run build
```
