# Implementation Plan: Sector 2 (Crawler Desktop Client)

## Canonical Architectural Covenants

1. **Owned Paths**: `src-crawler-client/` (Windows Tauri 2 + Svelte 5 + Tailwind CSS v4 + `shadcn-svelte` desktop GUI shell).
2. **Truth Cascade**: Follow [`AGENTS.md`](../../AGENTS.md) -> [`VISION.md`](../research/decisions/VISION.md) (`T00`–`T03`, `T05`, `T06`) -> [`SYSTEM_MAP.md`](../source/SYSTEM_MAP.md) -> [`src-crawler-client/AGENTS.md`](../../src-crawler-client/AGENTS.md).
3. **Design System and Svelte 5 Invariants**: Obey [`.agents/rules/09-frontend-design-system-invariants.md`](../../.agents/rules/09-frontend-design-system-invariants.md) and local skills in `src-crawler-client/.agents/skills/` (`shadcn-svelte`, `svelte5-best-practices`, `svelte-code-writer`, `svelte-core-bestpractices`). Permit `shadcn-svelte` per-component folder barrels; forbid cross-directory megabarrels and unapproved custom UI primitives (use `ask_question` first).
4. **Cross-Project Isolation**: Never import sibling `src-crawler/`, `src-worker/`, or `src-package/` source. Consume `vrc-packages-api` strictly as a declared release dependency.
5. **Three-File Scratch Footprint and Pipeline-Only Clearing**: Keep strictly three files here (`IMPLEMENTATION_PLAN.md`, `task_tracker.md`, `handoff.md`). Record Tier 4B outbound handoffs and written Publication Requests strictly in [`handoff.md`](handoff.md). Do not edit `docs/source/CHANGELOG.md` or clear `verified` rows directly (only Sector 4 Pipeline agents transfer notes to `docs/source/CHANGELOG.md` and clear verified rows).

---

## Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| open | R47-C27-CLIENT | Desktop client remains a Tauri/Svelte starter without node bundling, supervision, or SDK wiring | `src-crawler-client/src-tauri/src/lib.rs`, `src-crawler-client/src/routes/+page.svelte` | Current binary exposes only starter `greet` and `opener`; node runtime install, child-process supervision, log streaming, and consumer SDK views are not implemented. | Sequence native child-process supervision, `.env`/credential configuration UX, `latest.log` telemetry viewer, and `vrc-packages-api` client actions under Rule 09 UI invariants. | |
| unverified | R52-C36 | Native desktop artifact builds pass CI, but installer, supervision, and updater safety remain unverified | `src-crawler-client/src-tauri/tauri.conf.json`, `src-crawler-client/package.json` | Native release/preview bundles and MSI numeric mapping (`26.10.0`) passed CI, but real Windows install, node process lifecycle, and updater safety are untested. | Run Windows end-to-end installer, sidecar/process shutdown, and CSP/license metadata audit before desktop v1 readiness. | |
| blocked | R55-C55D-CLIENT | Desktop preview and release channels share product, upgrade, and local storage identity | `src-crawler-client/src-tauri/tauri.conf.json` | Shared app identifier risks preview builds colliding with stable release data and upgrade state on Windows. | Confirm side-by-side coexistence vs separate legacy channel names per owner R55-C55D disposition before changing Tauri bundle identifiers. | Owner disposition: keep separate legacy names per distribution channel while retaining `vrc-packages` for repositories and npm packages. |

---

## Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G9-CLIENT | Supervised Windows desktop crawler shell and SDK UI | Starter Tauri 2 + Svelte 5 + `shadcn-svelte` shell builds and declares `vrc-packages-api: latest`; node supervision, telemetry panels, and channel identity isolation remain open. | |
