// D1 exec processes each line as one statement. Keep each command on a single line.
export const WORKFORCE_AND_LEASING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS node_credentials ( node_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, capabilities_json TEXT NOT NULL, revoked_at TEXT );
CREATE TABLE IF NOT EXISTS node_heartbeats ( node_id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('idle','fetching')), active_job_id TEXT, FOREIGN KEY(node_id) REFERENCES node_credentials(node_id) );
CREATE TABLE IF NOT EXISTS crawl_jobs ( job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','leased','done','backoff','blocked')), next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT, lease_expires_at TEXT, etag TEXT, last_modified TEXT, created_at TEXT NOT NULL, robots_deferred_until TEXT, source_rule_id TEXT, job_purpose TEXT NOT NULL DEFAULT 'metadata' CHECK(job_purpose IN ('discovery','metadata')), lease_profile_id TEXT, FOREIGN KEY(claimed_by) REFERENCES node_credentials(node_id) );
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_ready ON crawl_jobs(state,next_fetch_at,platform);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_origin_due ON crawl_jobs(origin,next_fetch_at,state);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_lease_profile ON crawl_jobs(lease_profile_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_source_rule ON crawl_jobs(source_rule_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_claimed_state ON crawl_jobs(claimed_by, state);
CREATE TABLE IF NOT EXISTS origin_leases ( origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT, next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, FOREIGN KEY(active_job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS origin_robots ( origin TEXT PRIMARY KEY, snapshot_id TEXT, status_code INTEGER, body TEXT, fetched_at TEXT, expires_at TEXT, refresh_lease_id TEXT, refresh_lease_expires_at TEXT );
CREATE INDEX IF NOT EXISTS idx_origin_robots_refresh ON origin_robots(origin,refresh_lease_expires_at);
CREATE VIEW IF NOT EXISTS origin_robots_refresh_leases AS SELECT origin, refresh_lease_id AS lease_id, refresh_lease_expires_at AS lease_expires_at FROM origin_robots WHERE refresh_lease_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS job_results ( lease_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, node_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, response_json TEXT NOT NULL, submitted_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
`;
