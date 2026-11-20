// D1 exec processes each line as one statement. Keep each command on a single line.
export const CATALOG_GRAPH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS canonical_packages ( canonical_id TEXT PRIMARY KEY, umbrella TEXT NOT NULL CHECK(umbrella IN ('tools','assets','avatars')), category TEXT NOT NULL, lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','deprecated','quarantined','delisted')), display_name TEXT NOT NULL, vpm_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, timestamp_confidence TEXT, content_rating TEXT NOT NULL DEFAULT 'general' );
CREATE INDEX IF NOT EXISTS idx_canonical_packages_updated ON canonical_packages(updated_at ASC, canonical_id ASC);
CREATE INDEX IF NOT EXISTS idx_canonical_packages_created ON canonical_packages(created_at DESC, canonical_id DESC);
CREATE INDEX IF NOT EXISTS idx_canonical_packages_rating_updated ON canonical_packages(content_rating, updated_at DESC, canonical_id ASC);
CREATE INDEX IF NOT EXISTS idx_canonical_packages_category_rating ON canonical_packages(category, content_rating);
CREATE TABLE IF NOT EXISTS coordinator_meta ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS catalog_tombstones ( canonical_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('rating_withdrawn','deleted','delisted')), recorded_at TEXT NOT NULL, PRIMARY KEY(canonical_id, recorded_at) );
CREATE INDEX IF NOT EXISTS idx_catalog_tombstones_cursor ON catalog_tombstones(recorded_at ASC, canonical_id ASC);
CREATE TABLE IF NOT EXISTS identity_links ( link_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, canonical_id TEXT NOT NULL, evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('vpm_id','repository_match','cross_storefront_link','curator_verified','simhash_match')), confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0), review_state TEXT NOT NULL CHECK(review_state IN ('provisional','accepted','rejected')), created_at TEXT NOT NULL, reviewed_at TEXT, FOREIGN KEY(source_key) REFERENCES source_items(source_key), FOREIGN KEY(canonical_id) REFERENCES canonical_packages(canonical_id) );
CREATE INDEX IF NOT EXISTS idx_identity_links_source ON identity_links(source_key);
CREATE INDEX IF NOT EXISTS idx_identity_links_canonical ON identity_links(canonical_id);
CREATE TABLE IF NOT EXISTS package_fronts ( front_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, source_key TEXT NOT NULL, platform TEXT NOT NULL, storefront_url TEXT NOT NULL, price REAL, currency TEXT, availability TEXT NOT NULL DEFAULT 'available', observed_at TEXT NOT NULL, UNIQUE(canonical_id, source_key), FOREIGN KEY (canonical_id) REFERENCES canonical_packages(canonical_id) ON DELETE CASCADE, FOREIGN KEY (source_key) REFERENCES source_items(source_key) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_package_fronts_canonical ON package_fronts(canonical_id);
CREATE INDEX IF NOT EXISTS idx_package_fronts_source ON package_fronts(source_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_package_fronts_canonical_source ON package_fronts(canonical_id, source_key);
CREATE INDEX IF NOT EXISTS idx_package_fronts_storefront ON package_fronts(storefront_url);
CREATE TABLE IF NOT EXISTS avatar_compatibilities ( compatibility_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, target_avatar_base TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('named_base', 'universal', 'uncertain')), confidence TEXT NOT NULL CHECK(confidence IN ('creator_declared', 'keyword_inferred', 'unverified')), evidence_source TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (source_key) REFERENCES source_items(source_key) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_avatar_compat_source_key ON avatar_compatibilities(source_key);
CREATE INDEX IF NOT EXISTS idx_avatar_compat_target_base ON avatar_compatibilities(target_avatar_base);
CREATE TABLE IF NOT EXISTS desktop_tool_evidence ( canonical_id TEXT PRIMARY KEY, tool_subtype TEXT NOT NULL CHECK(tool_subtype IN ('companion_client','osc_control','tracking_bridge','streaming_accessibility','utility')), supported_os TEXT NOT NULL, particular_vrchat_target INTEGER NOT NULL CHECK(particular_vrchat_target IN (0, 1)), evidence_url TEXT NOT NULL, publisher_claim TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (canonical_id) REFERENCES canonical_packages(canonical_id) ON DELETE CASCADE );
`;
