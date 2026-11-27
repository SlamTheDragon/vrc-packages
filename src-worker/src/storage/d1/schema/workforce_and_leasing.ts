// D1 exec processes each line as one statement. Keep each command on a single line.
export const WORKFORCE_AND_LEASING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes ( node_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, capabilities_json TEXT NOT NULL, revoked_at TEXT, last_seen_at TEXT, state TEXT CHECK(state IN ('idle','fetching')), active_job_id TEXT );
CREATE INDEX IF NOT EXISTS idx_nodes_active ON nodes(revoked_at,state,last_seen_at);
CREATE TABLE IF NOT EXISTS crawl_jobs ( job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','leased','done','backoff','blocked')), priority_lane INTEGER NOT NULL DEFAULT 3 CHECK(priority_lane IN (1,2,3,4)), recrawl_interval_ms INTEGER NOT NULL DEFAULT 86400000, pagination_depth INTEGER NOT NULL DEFAULT 0, next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT, lease_expires_at TEXT, etag TEXT, last_modified TEXT, created_at TEXT NOT NULL, robots_deferred_until TEXT, steering_profile_id TEXT, job_purpose TEXT NOT NULL DEFAULT 'metadata' CHECK(job_purpose IN ('discovery','metadata')), FOREIGN KEY(claimed_by) REFERENCES nodes(node_id) ON DELETE SET NULL );
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_priority ON crawl_jobs(state,priority_lane,next_fetch_at,platform);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_origin_due ON crawl_jobs(origin,next_fetch_at,state);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_profile ON crawl_jobs(steering_profile_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_claimed_state ON crawl_jobs(claimed_by,state);
CREATE TABLE IF NOT EXISTS origin_state ( origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT, next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, robots_snapshot_id TEXT, robots_status_code INTEGER, robots_body TEXT, robots_fetched_at TEXT, robots_expires_at TEXT, refresh_lease_id TEXT, refresh_lease_expires_at TEXT, FOREIGN KEY(active_job_id) REFERENCES crawl_jobs(job_id) ON DELETE SET NULL );
CREATE INDEX IF NOT EXISTS idx_origin_state_refresh ON origin_state(origin,refresh_lease_expires_at);
CREATE TABLE IF NOT EXISTS job_results ( lease_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, node_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, response_json TEXT NOT NULL, submitted_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_job_results_submitted ON job_results(submitted_at);
`;
