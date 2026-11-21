# Crawler Desktop Client Specification (`src-crawler-client/`)

> **Executable Directory:** `src-crawler-client/` (`vrcp-crawler-client@26.10.8-pre`)  
> **Owning Sector:** Sector 2 (`desktop-client`)  
> **UI Rules:** [`.agents/rules/09-frontend-design-system-invariants.md`](../../../.agents/rules/09-frontend-design-system-invariants.md)

The Crawler Desktop Client is the Windows Tauri v2 + Svelte 5 GUI shell intended to install and supervise a headless `vrcp-crawler-node` runtime and expose consumer `vrc-packages-api` actions.

## 1. Current Verified Implementation vs Open Scope

| Capability | Current Live State (`src-crawler-client/`) | Open Scope (`docs/scratch-desktop-client/`) |
| :--- | :--- | :--- |
| **Desktop Runtime Shell** | Tauri v2 (`@tauri-apps/api`, `@tauri-apps/plugin-opener`); `src-tauri/src/lib.rs` exposes starter `greet` command only. | Child-process supervision of `vrcp-crawler-node`, clean shutdown handling, and crash recovery (`R47-C27-CLIENT`). |
| **Frontend Stack & UI System** | SvelteKit static adapter + Svelte 5 + Tailwind CSS v4 + `shadcn-svelte` (`alert`, `button`, `card`) + `ui-custom/` (`console`, `navigation`). | Full operator/node configuration panels, live `latest.log` viewer, and SDK catalog actions under Rule 09 UI invariants. |
| **SDK Dependency** | `package.json` declares `"vrc-packages-api": "npm:vrc-packages-api-preview@latest"` (`vrc-packages-api-preview` preview package). | Wire `VRCPackageClient` calls without importing sibling `src-*` source. |
| **Packaging & Channel Identity** | Release and preview native Windows builds pass CI with config-derived MSI numeric version (`26.10.0`). | Preview vs release side-by-side install and local storage isolation (`R55-C55D-CLIENT`) and end-to-end installer/updater verification (`R52-C36`). |

## 2. Hard Isolation Boundaries

- Never bundle a coordinator database or import code from `src-crawler/`, `src-worker/`, or `src-package/`.
- Communicate with the Coordinator strictly through the installed `vrc-packages-api-preview` preview package over HTTPS.
- Follow `src-crawler-client/.agents/skills/` (`shadcn-svelte`, `svelte5-best-practices`, `svelte-code-writer`, `svelte-core-bestpractices`) and request owner authorization via `ask_question` before adding new custom UI primitives.

## 3. Domain Verification Commands

```powershell
cd src-crawler-client
bun run check
bun run build:web
# When Rust / Tauri native files change:
bun run build:dev
```
