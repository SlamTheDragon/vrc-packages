// D1 exec processes each line as one statement. Keep each command on a single line.
export const OBSERVATION_LAKE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS source_items ( source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL, latest_digest TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', observed_at TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1)), issues_json TEXT NOT NULL DEFAULT '[]', contributor_node_id TEXT, submission_lease_id TEXT, steering_profile_id TEXT, gone_at TEXT );
CREATE INDEX IF NOT EXISTS idx_source_items_url ON source_items(source_url);
CREATE INDEX IF NOT EXISTS idx_source_items_contributor ON source_items(contributor_node_id,observed_at DESC);
CREATE TABLE IF NOT EXISTS source_leads ( lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL, discovered_from_job_id TEXT, discovered_from_item_key TEXT, kind TEXT NOT NULL, target_url TEXT NOT NULL, target_host TEXT NOT NULL, claimed_package_id TEXT, status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected')), first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, first_seen_node_id TEXT, first_seen_lease_id TEXT, first_seen_profile_id TEXT, last_seen_node_id TEXT, last_seen_lease_id TEXT, last_seen_profile_id TEXT, FOREIGN KEY(discovered_from_job_id) REFERENCES crawl_jobs(job_id) ON DELETE SET NULL );
CREATE INDEX IF NOT EXISTS idx_source_leads_host ON source_leads(status,target_host,first_seen_at);
CREATE INDEX IF NOT EXISTS idx_source_leads_status ON source_leads(status,kind);
CREATE INDEX IF NOT EXISTS idx_source_leads_page ON source_leads(status,first_seen_at,lead_key);
CREATE INDEX IF NOT EXISTS idx_source_leads_target ON source_leads(target_url);
`;
