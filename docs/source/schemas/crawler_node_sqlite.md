# Crawler Node Local SQLite Schema (`node.db`)

> **Target Blueprint Status (`[P18]` / `PN-009`):** Owner-approved Version 0 target confirmation (2026-11-24). Local `node.db` keeps its 4-table structure while Coordinator `CrawlJobSchema` supplies stateless `etag`, `lastModified`, `priorityLane`, and `paginationDepth` values.  
> **Executable Authority:** `src-crawler/src/storage/local_sqlite.ts`  
> **Default Database File:** `node.db` (configurable via `NODE_DB_PATH` or `node.config.json` `databaseFile`)  
> **Owning Sector:** Sector 1 (`crawler-network`)  
> **Schema Version:** `2`

Each headless Crawler Node maintains an isolated local SQLite database for run journals, task telemetry, and durable outbox replay. Nodes never access Coordinator D1 directly.

## 1. Connection Pragmas

- `PRAGMA journal_mode = WAL;`
- `PRAGMA foreign_keys = ON;`
- `PRAGMA busy_timeout = 10000;`

In Docker Compose deployments, mount one isolated persistent volume per node container (such as `node-data-1:/app/data`). Two processes must never share one `node.db`.

## 2. Exact SQLite Tables (4 Tables)

| Table | Primary Key | Columns and Constraints |
| :--- | :--- | :--- |
| `node_metadata` | `key` (`TEXT`) | `value` (`TEXT NOT NULL`). Persists `schema_version = '2'` and `last_node_id`. |
| `node_runs` | `run_id` (`TEXT`) | `started_at` (`TEXT NOT NULL`), `finished_at` (`TEXT`), `status` (`TEXT NOT NULL`), `tasks_completed` (`INTEGER NOT NULL DEFAULT 0`), `tasks_failed` (`INTEGER NOT NULL DEFAULT 0`). *(No SQL `CHECK` constraint on `status`.)* |
| `node_tasks` | `task_id` (`TEXT`) | `run_id` (`TEXT NOT NULL REFERENCES node_runs(run_id) ON DELETE CASCADE`), `job_id` (`TEXT NOT NULL`), `lease_id` (`TEXT NOT NULL`), `platform` (`TEXT NOT NULL`), `url` (`TEXT NOT NULL`), `claimed_at` (`TEXT NOT NULL`), `status` (`TEXT NOT NULL`), `http_status` (`INTEGER`), `duration_ms` (`INTEGER`), `bytes_fetched` (`INTEGER`), `outcome_kind` (`TEXT`), `submitted_at` (`TEXT`), `accepted` (`INTEGER`), `error_message` (`TEXT`). *(No SQL `CHECK` constraint on `status`.)* |
| `node_outbox` | `outbox_id` (`TEXT`) | `run_id` (`TEXT NOT NULL REFERENCES node_runs(run_id) ON DELETE CASCADE`), `task_id` (`TEXT NOT NULL REFERENCES node_tasks(task_id) ON DELETE CASCADE`), `job_id` (`TEXT NOT NULL`), `lease_id` (`TEXT NOT NULL`), `idempotency_key` (`TEXT NOT NULL`), `outcome_json` (`TEXT NOT NULL`), `created_at` (`TEXT NOT NULL`), `retry_count` (`INTEGER NOT NULL DEFAULT 0`), `next_retry_at` (`TEXT NOT NULL`), `status` (`TEXT NOT NULL DEFAULT 'pending'`), `last_error` (`TEXT`), `receipt_json` (`TEXT`). |

## 3. Exact Indexes (5 Indexes)

- `idx_node_tasks_job(job_id)` on `node_tasks`
- `idx_node_tasks_run(run_id)` on `node_tasks`
- `idx_node_outbox_status_retry(status, next_retry_at)` on `node_outbox`
- `idx_node_outbox_job(job_id)` on `node_outbox`
- `idx_node_outbox_task(task_id)` on `node_outbox`

## 4. Durable Outbox Bounds and Settlement Invariants

Verified against `src-crawler/src/runner/daemon.ts` and `local_sqlite.ts`:

- **Pending quota**: `maxPendingOutboxQuota = 1000` rows. Reaching quota pauses new `/v1/node/jobs/claim` calls until the outbox drains.
- **Retention TTL**: `outboxTtlMs = 86_400_000` (24 hours), pruned on `outboxPruneIntervalMs = 3_600_000` (1 hour). Expired rows lose replay eligibility.
- **Batch flush bounds**: `flushOutbox` reads up to `batchLimit = 50` due rows and submits in chunks of `MAX_BATCH_RESULTS = 10` (`POST /v1/node/jobs/results`).

- **Retry backoff**: Transient delivery failures schedule `next_retry_at = now + min(5_000 * 2^retryCount, 60_000)` ms.
- **Settled-row protection**: Active-state SQL guards prevent late failure updates from reopening `sent` or `dead` rows. Duplicate accepted receipts preserve the original receipt and counters atomically.
