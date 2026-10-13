# Crawler Network Specification (Candidate)

> **Document Status:** Current source reference with open capability gaps
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-worker/src/` and the independent package `src-worker/packages/network/`

---

## 1. Overview and Architectural Role

The **Crawler Network** (coordinator) orchestrates decentralized discovery, workforce distribution, and canonical catalog compilation for the VRChat package ecosystem:
1. **Local Worker:** `src-worker` runs the API entry through `bun run dev` (Wrangler local mode). It uses local D1. There is no coordinator binary.
2. **Worker Target:** `src-worker/src/worker_entry.ts` serves API routes. Wrangler uses the D1 binding `VRCP_D1`. The configuration declares no static assets or R2 binding. A dry-run build does not prove remote deployment.

`src-worker/test/support/` contains the SQLite comparator and prototype test helpers. They are not production Worker dependencies. Native runtime smoke uses isolated D1 and blocks external requests.

`POST /v1/operator/init` can queue candidate jobs through `autoSeed`. It does not create source-access profiles or robots snapshots. All drivers remain available. Reinitialization preserves existing grants, restrictions, active leases and suppressed targets. Earlier bootstrap-created grants require review before an existing-database live run. Placeholder candidate selection remains unresolved.

The coordinator currently supports these responsibilities:
- **Node Provisioning**: Operators issue capability-scoped credentials. User ownership and capacity evaluation remain open.
- **Workforce Distribution**: Claims select eligible jobs under capability and origin restrictions. Complete demand-driven coverage balancing remains unverified.
- **Capability-Encoded Tokens**: The coordinator-issued token contains/encodes the combination of permitted website capabilities that a node provides or is authorized to accept.
- **Anti-"Bot-Net" Job & Rate-Limit Management**: Centralized origin lease scheduler enforcing origin-wide politeness floors, preventing multi-node traffic amplification against third-party storefronts.
- **Report Ingestion**: Records demand and issue reports. Removal requests remain pending without catalog mutation. Removal review controls are not implemented.
- **Canonical Projection**: Derives catalog entries from source evidence. Publication rights, correction controls and some identity decisions remain open.
- **Downstream Consumer Services**:
  - *Registered Downstream Service*: Bounded search and reports. Random sampling is removed.
  - *Unauthenticated Downstream Service*: Bounded index pages and delta synchronization. The public handler does not accept text/filter query keys.

---

## 2. Protocol Boundaries and Endpoints

The route draft is [`API_ROUTES.md`](API_ROUTES.md). Internal node schemas live in the [network package](../../src-worker/packages/network/README.md). Worker and node consumers import its declared package exports from a distributed network archive. The consumer SDK contains operator/user/app contracts, not node job methods. The tracker records checked artifact identities separately from runtime conformance. Handlers define executable routes. [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) describes storage.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Requires `Authorization: Bearer <NODE_TOKEN>` (`vrcp_<64-hex><4-hex>`). The 4-hex suffix encodes the node's assigned capability bitmask.
- `POST /v1/node/jobs/claim`: Issues an origin lease and atomic crawl job if the node possesses the required platform capability, robots allow, and an active `SourceAccessProfile` covers the target.
- `POST /v1/node/heartbeat`: Checks active lease authority and records node liveness. It does not extend the lease deadline.
- `POST /v1/node/jobs/result`: Submits observation facts, discovered leads, or access failure diagnostics. Transitions job state and updates canonical catalog tables.

Discovery lead rows, source events, the receipt and job/lease updates commit in one D1 batch. Failed lead writes preserve the lease and origin reservation. Native D1 tests cover failures on the first and second lead, exact retry, and duplicate replay. Automatic lead promotion follows the commit. It does not yet have durable retry guarantees. The node stages result payloads and idempotency keys in its durable SQLite outbox before submission. Restart and lost-receipt replay have scoped process tests, not full-fleet proof.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Requires the `OPERATOR_TOKEN` bearer secret. Operators receive newly issued node tokens once, but credential listings do not expose stored plaintext.
- `GET /v1/operator/source-profiles` and `POST /v1/operator/source-profiles`: Audits and provisions scoped source-access profiles.
- `POST /v1/operator/source-profiles/{id}/disable`: Disables a profile and invalidates active leases.
- `GET /v1/operator/autoqueue-rules` and `POST /v1/operator/autoqueue-rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `POST /v1/operator/autoqueue-rules/{id}/disable`: Disables an active auto-queue rule.
- `GET /v1/operator/leads`: Inspects pending discovery leads with keyset pagination.
- `POST /v1/operator/leads/{key}/approve` and `POST /v1/operator/leads/{key}/reject`: Triage actions on pending leads.
- `GET /v1/operator/takedowns` and `POST /v1/operator/takedowns/{id}/verify`: Lists historical requests and records an operator verdict. The route does not implement DNS/bio challenge verification.

### 2.3 User & Registrant Protocol (`/v1/user/*`)
Requires a user bearer token (`vrcp_usr_<64-hex>`).
- `GET /v1/user/apps` and `GET /v1/user/apps/{appId}`: Reads owned app metadata without credentials.
- User node list/detail GETs remain pending because node provisioning has no ownership relation.
- User collection POSTs and user delisting are removed. Profile and user credential revocation routes remain planned, not implemented.

### 2.4 Downstream Application Protocol (`/v1/app/*`)
Public read for catalog index and delta streaming; `Authorization: Bearer <APP_TOKEN>` (`vrcp_app_<64-hex>`) for bounded search and reporting.
- `POST /v1/app/register`: Gated downstream app registration (requires registrant or operator auth).
- `GET /v1/app/index`: Bounded catalog pages with `limit` and `cursor`.
- `GET /v1/app/index/delta`: Pages current general-rated catalog rows. Emits `upsert` and `delist` envelopes; it is not an immutable change journal.
- `POST /v1/app/index/search`: Bounded search. The request accepts `queryOrigin: "user_authored" | "app_automated"`, but current storage does not use or record it.
- `POST /v1/app/report`: Records demand, issue reports and pending removal requests. A removal receipt is not verified ownership or approved delisting.

### 2.5 Pagination Contract

- Catalog, delta, search, operator and moderator routes use the distributed SDK cursor schemas and codecs.
- Copy each opaque cursor unchanged into its matching route. Cursors do not grant access or replace authentication.
- Canonical IDs retain their 500-character limit. Cursor tokens permit up to 8192 base64url characters; affected ISO timestamps permit 128 characters.
- ASCII JSON keeps its existing encoding. Non-ASCII JSON carries a `u1_` UTF-8 marker, avoiding ambiguous legacy Latin-1 decoding.
- Invalid UTF-8, noncanonical JSON, padding, oversized tokens and incorrect route payloads are rejected. Restart pagination for rejected legacy non-ASCII tokens.
- Catalog/search/moderator pages descend by timestamp and identifier; delta pages ascend by update timestamp and identifier.
- Worker and crawler consume the preview SDK and one distributed network archive. Desktop/web keep their separate release SDK channel.

Current delta limits:

- Stable equal-time rows paginate by `(updatedAt, canonicalId)`. A same-time mutation behind a consumed cursor can be missed.
- Delisted rows emit identifier-only envelopes while they remain general-rated. Hard deletion removes the row without a retained tombstone.
- Moving a row out of the public rating filter emits no withdrawal envelope. Neither mutation automatically changes the catalog epoch.
- `nextCursor: null` ends page traversal; it is not a durable synchronization checkpoint or snapshot boundary.
- Fresh databases initialize unique UUID epochs. Concurrent initializers return the stored winner. Existing epochs remain unchanged unless explicitly reset.
- R13-C9-DELTA retains the revision, withdrawal and resynchronization contract decision. Do not treat current paging as complete downstream synchronization.

### 2.6 Timestamp Evidence Boundary

- Observation `originUpdatedAt` records upstream modification only. Creation and publication fields must not populate it.
- Missing canonical publication evidence remains null. Metadata-only updates preserve existing publication dates and confidence.
- Catalog creation/update timestamps describe coordinator records, not upstream publication. Search can use catalog creation as a sorting fallback without claiming publication confidence.
- The current observation wire has no separate upstream creation or release-publication fields. That provenance contract remains pending; no timestamp enum changes occur here.

### 2.7 Observation Identity Boundary

- HTTP handlers enforce the distributed observation schema before ingestion. Whitespace-only catalog titles also fail semantic validation.
- Each storefront observation uses the assigned URL's exact host and path as its `sourceItemKey`, matching the shipped node parser.
- An optional `storefrontUrl` must match the assigned URL after existing tracking cleanup. Functional queries, credentials and fragments cannot substitute another target.
- Public fronts use the coordinator's assigned URL, not the node's optional URL. GitHub, VPM and curated leases cannot supply storefront fields.
- Rejected observations create no evidence, receipt or projection writes and preserve the current lease. A corrected submission can use it before expiry.
- Batch metadata conflicts remain nonterminal conflicts. They are not lease expiry merely because the error mentions release evidence.
- These checks do not prove truthful fetching, product ownership or cross-source identity. Previously ingested rows are not migrated or removed.
- Cross-source association remains unsafe: outbound matching can create provisional fronts that public responses expose without an accepted storefront link.
- Generic association matching also folds URL path case. R13-C9-IDENTITY retains these counterexamples and the authority decision before claiming false-link protection.

---

## 3. Core Safety and Governance Invariants

1. **Origin Lease System**:
   - Crawler nodes do not fetch without an active, unexpired lease from the coordinator.
   - The coordinator paces requests per origin. Extra nodes add breadth across domains, not higher frequency on one host.
2. **Fail-Closed Availability**:
   - A failed active authority check cancels source processing. Detection waits for periodic heartbeats and bounded retries, not an instantaneous network-loss signal.
   - Nodes do not generate local seeds. Stop requests do not cancel coordinator calls already in progress.
3. **Source-Access Profile Gate**:
   - Each candidate URL needs an explicit, active, scoped `SourceAccessProfile` before robots preflight and before lease claim.
   - Unknown domains, unvetted paths, and exploratory auto-queue leads stay in a `'pending'` state until operator approval.
4. **RFC 9309 Robots Compliance**:
   - The coordinator checks stored robots rules before node claim, active-fetch heartbeat and submission. Successful or missing-file snapshots expire after 24 hours. Error snapshots expire after one hour.
   - D1 refresh reservations share origin exclusion and pacing with node jobs. Completion requires current refresh ownership and an active scoped source profile. Production refresh transport and scheduling are not wired.
   - Node metadata transport pins a checked DNS answer. This does not prove Worker DNS pinning. The shared robots parser delegates safe transport to its caller.

---

## 4. Coordinator Storage Schema (`coordinator.db` / D1)

The Worker stores coordinator state through D1 in local workerd tests and the deployment target. The SQLite comparator is test-only. See [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) for the schema draft.
