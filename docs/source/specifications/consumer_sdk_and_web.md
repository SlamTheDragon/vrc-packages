# Consumer API SDK and Web Ecosystem Specification

> **Live Contract Status (`[P18]` / `[P19]`):** Version 0 live specification verified locally against `src-package/` and `src-web/` (`REORIENT-AW-02..04`, remote preview web push held under `REORIENT-LIVE-DEBUG`).  
> **Owned Directories:** `src-package/` (`vrc-packages-api` and `vrc-packages-api-preview`), `src-web/` (`vrcp-web`), `src-web-search/` (`vrc-packages-search` submodule)  
> **Owning Sector:** Sector 3 (`api-web`)  
> **Wire Reference:** [`wire_and_protocol_contracts.md`](../schemas/wire_and_protocol_contracts.md)

This specification defines the live Version 0 contract and integration boundaries for Sector 3 consumer SDK and Astro + Svelte web frontends.

## 1. Consumer SDK (`src-package/`)

- **Identity and license:** Public Apache-2.0 TypeScript package (`vrc-packages-api` release and `vrc-packages-api-preview` preview). Active versions live in [`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json).

- **Canonical exports:** `VRCPackageClient` (supporting `GET`, `POST`, `PATCH`, `DELETE`), `VRCPackageClientOptions`, `VRCPApiError`, `MAX_SDK_ERROR_BYTES` (`64 KiB`), and `MAX_SDK_SUCCESS_BYTES` (`4 MiB`). Subpaths export `./auth` (with `NODE_TOKEN_REGEX` and `isNodeToken`), `./types` (`9`-platform `PlatformSchema`, extended `CatalogPackageSchema`), `./taxonomy`, and `./protocol`.

- **Live `VRCPackageClient` namespaces:**
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
| **`src-web/`** | `vrcp-web` ([`config.versions.json`](../../../config.versions.json) and [`config.preview.versions.json`](../../../config.preview.versions.json)) | Astro 7 + Svelte 5 | Operator and Moderator UI (`/`, `/login`, `/operator`, `/moderator`, `/design`) in Mist and Teal OKLCH dark mode. See Section 2.1 for live workbench architecture. | `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"` |
| **`src-web-search/`** *(Git submodule)* | `vrc-packages-search` (`src-web-search/package.json`) | Astro 7 + Svelte 5 | Starter page (`src/pages/index.astro`: `<h1>Astro</h1>`). No search UI wired at this time. | `"vrc-packages-api": "^0.0.6"` |

### 2.1 Live Operator Workbench Architecture

- **Zero shim drift and shared UI primitives:** `admin-session.svelte.ts` uses `VRCPackageClient` directly with no local wrapper shim. `DataTable.svelte` uses `Checkbox.svelte` (`bits-ui`). `admin-constants.ts` defines `ATOMIC_PLATFORMS` and `PLATFORM_OPTIONS` across the 9 atomic platforms (`curated` excluded). `AdminShell` supports sidebar pin toggles, `AdminMasterDetail` provides `Inspect` actions alongside cursor pagination, and `GovernancePanel.svelte` guards nullable `targetUrl` and `proofKind` values.

- **Environment and Dev-Only System Purge (`OperatorDashboard`, `CatalogInitPanel`):** `OperatorDashboard.svelte` shows the Coordinator environment badge (`DEVELOPMENT`, `PREVIEW`, or `PRODUCTION`), D1 schema state, and compact queue readiness counts. `CatalogInitPanel.svelte` locks schema bootstrap to `init({ autoSeed: false })` and renders the `System Purge` `AlertDialog` (`PURGE_DEVELOPMENT_D1` confirmation and `Preserve active nodes` toggle) only when `environment === "development"` and `purgeEnabled === true`.

- **Coordinator-Only Fleet (`NodesPanel`):** `NodesPanel.svelte` creates nodes without manual capability checkboxes so Coordinator derives capabilities automatically, and provides single or bulk `Revoke` and `Prune` controls over active and revoked nodes.

- **Unified Steering Profiles (`PoliciesPanel`):** `PoliciesPanel.svelte` manages unified `SteeringProfile` entries (`hostMatchMode`, wildcard domain rules, pagination query scopes, `autoPromote`, `Enable`/`Disable` kill-switch, and `Delete`) and `SuppressedTarget` rules (`domain`, `origin`, `url`).

- **Triage & Lifecycle (`LeadsJobsPanel`, `GovernancePanel`):** `LeadsJobsPanel.svelte` renders per-job claimability blockers, priority-lane badges, multi-select bulk actions, `Edit`, `Run Now` (`requeue`), and `Delete` on unleased jobs (`Delete Job`), and groups pending leads by `target_host` for bulk approval or domain suppression. `GovernancePanel.svelte` restricts `Verify` actions to `pending` rows and highlights trusted-app review states.

## 3. Integration and Security Boundaries

- **Zero sibling imports:** Neither `src-web/` nor `src-web-search/` can import `src-worker/` TypeScript, D1 schemas, or `src-package/` through relative paths. Both apps consume their declared SDK package over HTTP only.
- **No static secrets:** Never embed `OPERATOR_TOKEN`, `vrcp_app_` private keys, or HMAC signing secrets inside static site bundles or browser JavaScript.
- **Outbound storefront attribution:** Public search and catalog UI views must display direct outbound Source Storefront URLs per [`LEGAL.md`](../../../LEGAL.md) Section 4.
- **UI and performance skills:** Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md), local `.agents/skills/` Svelte 5 skills, and root `web-perf`.

## 4. Domain Verification

Run the Sector 3 verification commands listed in [`SYSTEM_MAP.md`](../SYSTEM_MAP.md).
