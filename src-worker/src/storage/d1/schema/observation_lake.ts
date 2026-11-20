// D1 exec processes each line as one statement. Keep each command on a single line.
export const OBSERVATION_LAKE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS source_items ( source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL, latest_digest TEXT NOT NULL, latest_version_no INTEGER NOT NULL, gone_at TEXT );
CREATE INDEX IF NOT EXISTS idx_source_items_url ON source_items(source_url);
CREATE TABLE IF NOT EXISTS source_versions ( version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL, digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1)), contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, UNIQUE(source_key,version_no), FOREIGN KEY(source_key) REFERENCES source_items(source_key) );
CREATE INDEX IF NOT EXISTS idx_source_versions_complete ON source_versions(source_key,complete,version_no DESC);
CREATE INDEX IF NOT EXISTS idx_source_versions_contributor ON source_versions(contributor_node_id,observed_at DESC,version_id DESC);
CREATE TABLE IF NOT EXISTS source_events ( event_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, source_key TEXT, kind TEXT NOT NULL, observed_at TEXT NOT NULL, version_id TEXT, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE INDEX IF NOT EXISTS idx_source_events_contributor ON source_events(contributor_node_id,event_id DESC);
CREATE TABLE IF NOT EXISTS source_issues ( issue_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, source_item_key TEXT NOT NULL, version_key TEXT, code TEXT NOT NULL, observed_at TEXT NOT NULL, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE INDEX IF NOT EXISTS idx_source_issues_contributor ON source_issues(contributor_node_id,issue_id DESC);
CREATE TABLE IF NOT EXISTS source_leads ( lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL, discovered_from_job_id TEXT NOT NULL, discovered_from_item_key TEXT, kind TEXT NOT NULL, target_url TEXT NOT NULL, claimed_package_id TEXT, status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected')), first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, first_seen_node_id TEXT, first_seen_lease_id TEXT, first_seen_profile_id TEXT, last_seen_node_id TEXT, last_seen_lease_id TEXT, last_seen_profile_id TEXT, FOREIGN KEY(discovered_from_job_id) REFERENCES crawl_jobs(job_id) );
CREATE INDEX IF NOT EXISTS idx_source_leads_status ON source_leads(status,kind);
CREATE INDEX IF NOT EXISTS idx_source_leads_page ON source_leads(status,first_seen_at,lead_key);
CREATE INDEX IF NOT EXISTS idx_source_leads_first_node ON source_leads(first_seen_node_id,first_seen_at DESC,lead_key DESC);
CREATE INDEX IF NOT EXISTS idx_source_leads_last_node ON source_leads(last_seen_node_id,last_seen_at DESC,lead_key DESC);
CREATE INDEX IF NOT EXISTS idx_source_leads_target ON source_leads(target_url);
CREATE INDEX IF NOT EXISTS idx_source_leads_discovered_url ON source_leads(discovered_from_url);
`;
