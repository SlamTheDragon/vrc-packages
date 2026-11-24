# Consumer API SDK and Web Ecosystem Specification (Target Blueprint)

> **Target Blueprint Status (`[P18]` / `PN-009`):** Owner-approved Version 0 target contract (2026-11-24). Supersedes pre-rewrite live implementation until Stage 5-6 code slices verify 1:1 parity.  
> **Owned Directories:** `src-package/` (`vrc-packages-api` and `vrc-packages-api-preview`), `src-web/` (`vrcp-web`), `src-web-search/` (`vrc-packages-search` submodule)  
> **Owning Sector:** Sector 3 (`api-web`)  
> **Wire Reference:** [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

This specification defines the Version 0 target contract and integration boundaries for Sector 3 consumer SDK and Astro + Svelte web frontends.

## 1. Consumer SDK (`src-package/`)

- **Identity and license:** Public Apache-2.0 TypeScript package (`vrc-packages-api` release and `vrc-packages-api-preview` preview). Active versions live in [`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json).

- **Canonical exports:** `VRCPackageClient` (supporting `GET`, `POST`, `PATCH`, `DELETE`), `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (`64 KiB`), and `MAX_SDK_SUCCESS_BYTES` (`4 MiB`). Subpaths export `./auth` (with `NODE_TOKEN_REGEX` and `isNodeToken`), `./types` (`9`-platform `PlatformSchema`, extended `CatalogPackageSchema`), `./taxonomy`, and `./protocol`.

- **Target `VRCPackageClient` namespaces:**
  - `index`: `query()`, `search()`, `syncDeltas()` returning atomic rows with `ownerKey`, `ownerName`, `verificationStatus`, `qualityFlags`, `summary`, `tags`, `vpmLatestVersion`, `relations`, and `sources`.
  - `app`: `register()`.
  - `reports`: `submit()` (`demand_signal`, `relationship_feedback`, `issue_report`, and trusted-app `removal_request`).
  - `claims`: `submitIntake()` (trusted apps with `claims:delegate`).
  - `user.apps`: `list()`, `get()`.
  - `operator`: `status()`, `init()`, `systemPurge()`, `jobs.{list, enqueue, update, requeue, delete}()`, `leads.{list, approve, reject, bulkApprove, suppressDomain}()`, `steeringProfiles.{list, create, update, enable, disable, delete}()`, `suppressedTargets.{list, create, delete}()`, `nodes.{list, issue, revoke, prune}()` (validating `nodeId`, rejecting manual `capabilities` on `issue`), `catalog.list()`, `takedowns.{list, verify}()`, `claims.{list, verify}()`, `apps.{list, setDelegation, reviewCandidate}()`.
  - `moderator`: `ratings.{list, adjust}()`, `apps.{list, reviewCandidate}()`.

- **Release gate hold:** Agents can publish pre-0.1 releases (`v0.0.1+`) after full package verification. Version `v0.1.0` stays held until the owner finishes the [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review in [`IMPLEMENTATION_PLAN.md`](../../scratch-api-web/IMPLEMENTATION_PLAN.md).

## 2. Website (`src-web/`) and Web Search (`src-web-search/`)

| Project | Package Name and Version Authority | Stack | Live / Target State | Declared SDK Dependency |
| :--- | :--- | :--- | :--- | :--- |
| **`src-web/`** | `vrcp-web` ([`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json)) | Astro 7 + Svelte 5 | Operator and Moderator UI (`/`, `/login`, `/operator`, `/moderator`, `/design`) in Mist and Teal OKLCH dark mode. See Section 2.1 for Stage 5-6 UIUX targets. | `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"` |
| **`src-web-search/`** *(Git submodule)* | `vrc-packages-search` (`src-web-search/package.json`) | Astro 7 + Svelte 5 | Starter page (`src/pages/index.astro`: `<h1>Astro</h1>`). No search UI wired at this time. | `"vrc-packages-api": "^0.0.6"` |

### 2.1 Target Operator Workbench Architecture (`docs/research/UIUX/` Cardinal Rules 1-9)

- **Zero shim drift and shared UI hygiene:** Delete `VRCPAdminClient` (`admin-client.ts`) and expose `VRCPackageClient` directly from `admin-session.svelte.ts`. Replace raw checkboxes in `DataTable.svelte` with `Checkbox.svelte`. Delete invalid `py-0.2` and magic pixel styles. Share one platform list from `PlatformSchema.options`. Remove duplicate `Inspect` row buttons, add an explicit `AdminShell` pin toggle, keep `forced-colors` and horizontal scroll cues, and add `GovernancePanel.svelte` null guards.

- **Environment and Dev-Only System Purge (`OperatorDashboard`, `CatalogInitPanel`):** Show active Coordinator environment badge (`DEVELOPMENT`, `PREVIEW`, or `PRODUCTION`) and compact Fleet Queue Readiness counts. Show the `System Purge` `AlertDialog` (`PURGE_DEVELOPMENT_D1` typed confirmation and `Preserve active nodes` toggle) in `CatalogInitPanel.svelte` only when `environment === "development"` and `purgeEnabled === true`.

- **Coordinator-Only Fleet (`NodesPanel`):** Remove the manual 10-checkbox capability picker and `autoAllocateTop3` switch from node issuance so Coordinator auto-generates node capabilities without `NODE_CAPABILITIES=` overrides.

- **Unified Steering Profiles (`SteeringProfilesPanel`):** Replace split profile/rule forms and verbose help notices with one unified loose steering editor (`hostMatchMode`, `*.domain-name.root`, bounded pagination queries, `autoPromote`, `Edit`, `Enable`/`Disable` kill-switch, and `Prune`).

- **Triage & Lifecycle (`LeadsJobsPanel`, `GovernancePanel`):** Add per-job claimability blockers, priority-lane badges, multi-select bulk actions, `Edit`, `Run Now` (`requeue`), and `Prune` on jobs. Group pending custom-domain leads by `target_host` for bulk approval or domain-wide blocking. Limit `Verify` actions on `GovernancePanel` to pending items and surface trusted-app polling cues.

## 3. Integration and Security Boundaries

- **Zero sibling imports:** Neither `src-web/` nor `src-web-search/` can import `src-worker/` TypeScript, D1 schemas, or `src-package/` through relative paths. Both apps consume their declared SDK package over HTTP only.
- **No static secrets:** Never embed `OPERATOR_TOKEN`, `vrcp_app_` private keys, or HMAC signing secrets inside static site bundles or browser JavaScript.
- **Outbound storefront attribution:** Public search and catalog UI views must display direct outbound Source Storefront URLs per [`LEGAL.md`](../../../LEGAL.md) Section 4.
- **UI and performance skills:** Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md), local `.agents/skills/` Svelte 5 skills, and root `web-perf`.

## 4. Domain Verification

Run the Sector 3 verification commands listed in [`SYSTEM_MAP.md`](../SYSTEM_MAP.md).
