// D1 exec processes each line as one statement. Keep each command on a single line.
export const DOWNSTREAM_AND_TICKETS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS registered_users ( user_id TEXT PRIMARY KEY, user_name TEXT NOT NULL, token_hash TEXT NOT NULL, contact_email TEXT, created_at TEXT NOT NULL, revoked_at TEXT, age_verified INTEGER NOT NULL DEFAULT 0, is_moderator INTEGER NOT NULL DEFAULT 0 );
CREATE INDEX IF NOT EXISTS idx_registered_users_token ON registered_users(token_hash);
CREATE TABLE IF NOT EXISTS registered_apps ( app_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, token_hash TEXT NOT NULL, contact_email TEXT, permissions_json TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT, request_count INTEGER NOT NULL DEFAULT 0, last_active_at TEXT, candidate_status TEXT NOT NULL DEFAULT 'none' CHECK(candidate_status IN ('none','review_pending','reviewed','trusted')), candidate_flags_json TEXT NOT NULL DEFAULT '[]', owner_user_id TEXT REFERENCES registered_users(user_id) );
CREATE INDEX IF NOT EXISTS idx_registered_apps_token_hash ON registered_apps(token_hash);
CREATE INDEX IF NOT EXISTS idx_registered_apps_candidate ON registered_apps(candidate_status,request_count);
CREATE INDEX IF NOT EXISTS idx_registered_apps_owner ON registered_apps(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_registered_apps_page ON registered_apps(created_at DESC,app_id DESC);
CREATE TABLE IF NOT EXISTS downstream_signals ( signal_id TEXT PRIMARY KEY, app_id TEXT NOT NULL, signal_type TEXT NOT NULL CHECK(signal_type IN ('search_miss','refresh_demand','popularity_signal','relationship_feedback')), query TEXT, zero_hits INTEGER NOT NULL DEFAULT 0, requested_platform TEXT, target_url TEXT, target_canonical_id TEXT, related_canonical_id TEXT, category TEXT, metadata_json TEXT, recorded_at TEXT NOT NULL, resolved_at TEXT, FOREIGN KEY(app_id) REFERENCES registered_apps(app_id) );
CREATE INDEX IF NOT EXISTS idx_downstream_signals_platform ON downstream_signals(requested_platform,resolved_at);
CREATE INDEX IF NOT EXISTS idx_downstream_signals_relation ON downstream_signals(signal_type,target_canonical_id);
CREATE TABLE IF NOT EXISTS catalog_tickets ( ticket_id TEXT PRIMARY KEY, ticket_type TEXT NOT NULL CHECK(ticket_type IN ('opt_out','delegated_claim','removal_report','rating_dispute','safety_quarantine','metadata_issue')), app_id TEXT REFERENCES registered_apps(app_id), target_url TEXT, canonical_id TEXT, requester_type TEXT CHECK(requester_type IN ('unauthenticated_creator','user','admin_operator','app')), requester_id TEXT, creator_id TEXT, reason TEXT, proof_kind TEXT CHECK(proof_kind IN ('storefront_bio_token','dns_txt','manual_notice','delegated_signature')), proof_value TEXT, contact_email TEXT, challenge_token TEXT, expires_at INTEGER, nonce TEXT, signature TEXT, payload_json TEXT, review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')), review_notes TEXT, recorded_at TEXT NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_tickets_nonce ON catalog_tickets(app_id,nonce) WHERE nonce IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_tickets_review ON catalog_tickets(ticket_type,review_status,recorded_at,ticket_id);
CREATE INDEX IF NOT EXISTS idx_catalog_tickets_canonical ON catalog_tickets(canonical_id);
CREATE INDEX IF NOT EXISTS idx_catalog_tickets_target_url ON catalog_tickets(target_url);
`;
