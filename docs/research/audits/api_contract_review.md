# API Contract Review and Security Intake Audit

> **Status:** Point-in-Time Contract Audit Supporting Owner G15 (`v0.1.0`) Review  
> **Owning Sector:** Sector 3 (`api-web`) / Sector 1 (`crawler-network`)  
> **Live Route Source Truth:** [`coordinator_worker.md`](../../source/specifications/coordinator_worker.md), [`wire_and_protocol_contracts.md`](../../source/schemas/wire_and_protocol_contracts.md)

This audit summarizes the handler-to-SDK comparison, remaining cross-route blockers for SDK `v0.1.0`, the sanitized private security intake, and delegated creator-removal prerequisites. For current implemented routes and rate limits verified against live code, read [`coordinator_worker.md`](../../source/specifications/coordinator_worker.md).

## 1. Protocol Coverage Summary (`Historical` + Live Reconciliation)

| Protocol Family | Auth Principal | SDK Coverage | Key Contract Notes and Open Gaps |
| :--- | :--- | :--- | :--- |
| **Node (`/v1/node/*`)** | Node token (`vrcp_<64-hex><4-hex>`) | Intentionally excluded (`vrc-packages-network` owns node wire contracts) | Covers `/jobs/claim`, `/jobs/result`, `/jobs/results`, `/heartbeat`, `/robots/claim`, `/robots/result`. Note: payload validation runs before auth on some paths (`API4` review item). |
| **Operator (`/v1/operator/*`)** | `OPERATOR_TOKEN` (64-hex) | Covered in `client.operator.*` | Covers `init`, `jobs`, `nodes`, `leads`, `source-profiles`, `autoqueue-rules`, `catalog`, `takedowns`, `claims`, `apps` (`delegation`, `candidate-review`). `init` 401 still omits `schemaVersion`/`code`/`Cache-Control: no-store`. |
| **User (`/v1/user/*`)** | User token (`vrcp_usr_<64-hex>`) | `client.user.apps.{list, get}` | Owned app reads implemented; 5 draft user routes (`GET/DELETE /v1/user/nodes*`, `GET /v1/user`, `DELETE /v1/user/apps/{appId}`) remain unimplemented pending `R39-C24` and `Q-USER-AUTH-REGISTRATION`. |
| **App & Public (`/v1/app/*`)** | Public (index/delta), App token (`vrcp_app_<64-hex>`), User/Op (`register`) | `client.index.*`, `client.app.register`, `client.reports.submit`, `client.claims.submitIntake` | Search (`POST /v1/app/index/search`) now forwards cursor in SDK and rejects malformed cursors; `queryOrigin` is accepted but unused by storage; `LIKE` treats `%`/`_` as wildcards. |
| **Moderator (`/v1/moderator/*`)** | User token (`isModerator && ageVerified`) | `client.moderator.{ratings, apps}.*` | Rating calibration and app candidate review implemented; `safety_quarantine` tickets excluded from moderator views (`R56-C56C`). |

**Intentionally retired routes**: `GET /v1/node/jobs`, `POST /v1/user/apps`, `POST /v1/user/nodes`, `POST /v1/user/delist`, `POST /v1/app/reports`, `GET /v1/app/index/random`.

## 2. Remaining Cross-Route Blockers Holding SDK `v0.1.0` (`G15`)

Pre-0.1 SDK releases (`v0.0.1+` and preview) are permitted after artifact verification. **`v0.1.0` remains held** until the owner finishes full [`API_ROUTES.md`](../../applications/VRCP%20API/API_ROUTES.md) review and resolves these items:

1. **Search query fidelity and cost**: `queryOrigin` is accepted but ignored by storage; `LIKE` substring matching scans rows and treats `%`/`_` as wildcards (`R14-C15`).
2. **Unsafe legacy takedown helpers (`R13-C4`)**: `submitDelistRequest` mutates lifecycle before proof verification; `verifyTakedown` rejection can restore catalog rows and delete URL suppression without checking action cause, and drops `actor`.
3. **Browser CORS and `OPTIONS` preflight**: Public/app routes emit `Access-Control-Allow-Origin: *` without `OPTIONS` preflight or explicit `Authorization`/`Content-Type` allow headers; user and operator routes omit CORS entirely (`R47-C27-WEB`).
4. **Error and status-code uniformity**: `/v1/operator/init` 401 and global 404/500 fallbacks omit `schemaVersion`/`code`; unsupported HTTP methods return 404 instead of 405; some storage conflicts surface as 500.
5. **User-to-node ownership (`R39-C24`)**: `/v1/operator/nodes` has no `ownerUserId` relation, blocking `GET /v1/user/nodes`.
6. **Dynamic tags and facets (`R40-C25`)**: No Worker-owned tag vocabulary or facet endpoint exists yet.
7. **Lead DTO and strict wire parity**: Owner confirmed strict snake-case wire DTOs with zero camelCase aliases, strict unknown-field rejection, and explicit caller reasons (`R13-C6`).

## 3. Sanitized Private Security Intake (2026-10-06)

- **API availability and abuse (`OWASP API4`)**: Distributed Cloudflare KV rate limiting (`R54-C39C-RATE-LIMIT`) is now implemented across all route families (`rate_limiter.ts`), reducing earlier exposure; validate auth-before-JSON-body-parse order on node routes and bound `LIKE`/`COUNT` search scan cost.
- **Malicious authorized nodes**: Token hashes, capabilities, leases, profiles, robots, and idempotency keys do not prove observation truthfulness; queue-poisoning and provenance negative tests remain required under `G13`/`G15`.
- **Diagnostic redaction**: `worker_entry.ts` and `worker_logger.ts` must never emit secrets, raw exception details, or rejected row contents into public responses or unredacted error stacks.
- **Bot impersonation and forks**: User-Agent headers do not authenticate callers; the coordinator cannot restrain modified AGPL forks running independently.
- **Cloudflare API token scope**: Account ID and D1 UUID are not secrets, but CI/operator Cloudflare tokens must remain scoped by permission, resource, and expiry.

## 4. Delegated Creator Removal Prerequisites (`R54-C38`)

- Live code gates `POST /v1/app/report` (`removal_request`) on trusted app status (`takedowns:submit` / `claims:delegate`) and inserts pending `removal_report` rows into `catalog_tickets` (`STAGE-18`).
- Full cryptographic challenge verification (`POST /v1/app/claims/intake` signature validation, key custody, verifier admission, and front-to-creator scope) remains open in [`cryptographic_delegation.md`](../architecture/cryptographic_delegation.md).
