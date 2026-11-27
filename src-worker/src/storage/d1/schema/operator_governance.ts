// D1 exec processes each line as one statement. Keep each command on a single line.
export const OPERATOR_GOVERNANCE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS operator_audit_log ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL CHECK(entity_type IN ('node','lead','job','profile','suppressed_target','app','system')), entity_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_entity ON operator_audit_log(entity_type,entity_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_operator_audit_log_occurred ON operator_audit_log(occurred_at DESC,action_id DESC);
CREATE TABLE IF NOT EXISTS suppressed_targets ( target TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('url','origin','domain')), reason TEXT NOT NULL, suppressed_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_suppressed_targets_scope ON suppressed_targets(scope,target);
CREATE TABLE IF NOT EXISTS steering_profiles ( profile_id TEXT PRIMARY KEY, platform TEXT NOT NULL, host_match_mode TEXT NOT NULL CHECK(host_match_mode IN ('exact','wildcard_subdomain','any_vpm_https')), host_pattern TEXT NOT NULL, path_scope TEXT NOT NULL, query_mode TEXT NOT NULL CHECK(query_mode IN ('none','exact','pagination')), query_scope TEXT, method TEXT NOT NULL CHECK(method='GET'), purpose TEXT NOT NULL CHECK(purpose IN ('discovery','metadata')), auto_promote INTEGER NOT NULL DEFAULT 0 CHECK(auto_promote IN (0,1)), recrawl_interval_ms INTEGER NOT NULL, min_delay_ms INTEGER NOT NULL, max_pagination_depth INTEGER NOT NULL, expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL, retain_classes_json TEXT NOT NULL, publish_classes_json TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT );
CREATE INDEX IF NOT EXISTS idx_steering_profiles_scope ON steering_profiles(platform,host_match_mode,purpose,disabled_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_steering_profiles_page ON steering_profiles(created_at DESC,profile_id DESC);
`;
