# Publication Pipeline Readiness Audit

> **Status:** Point-in-Time Delivery and Release Readiness Audit (Distills `PUBLICATION_PIPELINE_READINESS.md` and `2026-10-18_STATUS.md`)  
> **Owning Sector:** Sector 4 (`pipeline`)  
> **Operational Guides:** [`PUBLISHING.md`](../../source/PUBLISHING.md), [`AGENT_PUBLISHING_PROCEDURE.md`](../decisions/AGENT_PUBLISHING_PROCEDURE.md)

This audit consolidates verified delivery trial outcomes and remaining blockers separating preview readiness from production release readiness. Superseded point-in-time status snapshots (`2026-10-18_STATUS.md`) have been distilled here and purged.

## 1. Historical Delivery Trial Evidence (`Measured`)

### Attempt 1.1 (Preview Channel, +1 Minor Bump)
| Product | Channel | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| `package` (`vrc-packages-api-preview`) | Preview | Passed on rerun | Initial run (`37719073408`) timed out on 63s npm CDN readback polling even though `2026.10.9-pre` published cleanly; rerunning failed verification job passed green. |
| `crawler`, `crawler-client`, `worker`, `network` | Preview | Passed | All four paths completed cleanly. |

### Attempt 1.2 (Release Channel, +1 Minor Bump)
| Product | Channel | Outcome | Notes |
| :--- | :--- | :--- | :--- |
| `package`, `crawler`, `crawler-client` | Release | Passed | Integrated native desktop pre-delivery notification hook (`notifyNative`: PowerShell toast + terminal bell). Note: local pre-delivery hook has no Discord webhook attached. |
| `worker` (`web`) | Release | Skipped (intended) | Build-only boundary; no unreviewed automatic production Worker deployment. |

## 2. Distilled Preview vs Release Readiness Posture

| Subsystem | Preview Posture | Release Posture | Primary Open Blockers |
| :--- | :--- | :--- | :--- |
| **Coordinator (`src-worker/`)** | Near ready locally | Blocked | Hosted native `workerd` smoke proof on next normal preview delivery (`R49-C29`), live fleet quota measurement (`R50-C31`), `R13-C4` notice audit, and schema/model alignment. |
| **Crawler Node (`src-crawler/`)** | Blocked on preview tag recovery | Blocked | Frozen preview tag `crawler 2026.10.10-pre` failed Linux smoke on retired `--help` (`R50-C31-RECOVERY`); requires `scripts/delivery-recovery.mjs` recovery before advancing; live multi-process Linux fleet proof (`G12`). |
| **Network Package (`src-worker/packages/network/`)** | Operational | Conformance review open | Single-stream GitHub Release tarball declared cleanly with zero sibling imports; clean-consumer and license export conformance review remain (`R15-C18`). |
| **Consumer SDK (`src-package/`)** | Operational (pre-0.1) | Held (`v0.1.0`) | `v0.1.0` strictly held pending full owner [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review (`Q-API-REVIEW` / `G15`). |
| **Desktop & Web (`src-crawler-client/`, `src-web/`, `src-web-search/`)** | Starter builds pass | Blocked | Starter shells only; node supervision, Firebase Auth, authenticated CORS, and SDK UI integration remain open (`R47-C27`). |
| **Root Delivery Scripts (`scripts/`, `.github/workflows/`)** | Hardening in progress | Hardening in progress | `STAGE-21` (`R58-CONFIG-TAMPER`, `DELIVERY-PROOF-SEMANTICS`), `DELIVERY-CLI-CONTRACT`, and `PIPELINE-SCRATCH-RETIRE` queued in [`docs/scratch-pipeline/`](../../scratch-pipeline/IMPLEMENTATION_PLAN.md). |
