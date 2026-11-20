// D1 exec processes each line as one statement. Keep each command on a single line.
export const OPERATOR_GOVERNANCE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS operator_audit_log ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL CHECK(entity_type IN ('node','lead','job','rule','profile','app')), entity_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_entity ON operator_audit_log(entity_type,entity_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_occurred ON operator_audit_log(occurred_at DESC,action_id DESC);
CREATE VIEW IF NOT EXISTS node_credential_actions AS SELECT action_id, entity_id AS node_id, actor, action, reason, occurred_at FROM operator_audit_log WHERE entity_type='node';
CREATE VIEW IF NOT EXISTS operator_actions AS SELECT action_id, actor, action, entity_id AS lead_key, reason, occurred_at FROM operator_audit_log WHERE entity_type='lead';
CREATE VIEW IF NOT EXISTS job_seed_actions AS SELECT cast(action_id as text) AS action_id, entity_id AS job_id, actor, reason, occurred_at FROM operator_audit_log WHERE entity_type='job';
CREATE VIEW IF NOT EXISTS operator_rule_actions AS SELECT action_id, entity_id AS rule_id, actor, action, reason, occurred_at FROM operator_audit_log WHERE entity_type='rule';
CREATE VIEW IF NOT EXISTS source_access_profile_actions AS SELECT action_id, entity_id AS profile_id, actor, action, reason, occurred_at FROM operator_audit_log WHERE entity_type='profile';
CREATE TABLE IF NOT EXISTS suppressed_urls ( url TEXT PRIMARY KEY, reason TEXT NOT NULL, suppressed_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS lead_autoqueue_rules ( rule_id TEXT PRIMARY KEY, lead_kind TEXT NOT NULL, origin TEXT NOT NULL, path_scope TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT );
CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_scope ON lead_autoqueue_rules(lead_kind,origin,disabled_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_page ON lead_autoqueue_rules(created_at DESC,rule_id DESC);
CREATE TABLE IF NOT EXISTS source_access_profiles ( profile_id TEXT PRIMARY KEY, platform TEXT NOT NULL, origin TEXT NOT NULL, path_scope TEXT NOT NULL, query_scope TEXT, method TEXT NOT NULL CHECK(method='GET'), purpose TEXT NOT NULL CHECK(purpose IN ('discovery','metadata')), min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL, retain_classes_json TEXT NOT NULL, publish_classes_json TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT );
CREATE INDEX IF NOT EXISTS idx_source_access_profiles_scope ON source_access_profiles(platform,origin,purpose,disabled_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_source_access_profiles_page ON source_access_profiles(created_at DESC,profile_id DESC);
`;
