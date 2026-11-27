import { WORKFORCE_AND_LEASING_SCHEMA_SQL } from "./workforce_and_leasing.ts";
import { OPERATOR_GOVERNANCE_SCHEMA_SQL } from "./operator_governance.ts";
import { OBSERVATION_LAKE_SCHEMA_SQL } from "./observation_lake.ts";
import { CATALOG_GRAPH_SCHEMA_SQL } from "./catalog_graph.ts";
import { DOWNSTREAM_AND_TICKETS_SCHEMA_SQL } from "./downstream_and_tickets.ts";

export {
  WORKFORCE_AND_LEASING_SCHEMA_SQL,
  OPERATOR_GOVERNANCE_SCHEMA_SQL,
  OBSERVATION_LAKE_SCHEMA_SQL,
  CATALOG_GRAPH_SCHEMA_SQL,
  DOWNSTREAM_AND_TICKETS_SCHEMA_SQL
};

export const D1_SCHEMA_SQL = [
  WORKFORCE_AND_LEASING_SCHEMA_SQL.trim(),
  OPERATOR_GOVERNANCE_SCHEMA_SQL.trim(),
  OBSERVATION_LAKE_SCHEMA_SQL.trim(),
  CATALOG_GRAPH_SCHEMA_SQL.trim(),
  DOWNSTREAM_AND_TICKETS_SCHEMA_SQL.trim()
].join("\n");

export const EXPECTED_V0_TABLE_NAMES = [
  "nodes",
  "crawl_jobs",
  "origin_state",
  "job_results",
  "operator_audit_log",
  "suppressed_targets",
  "steering_profiles",
  "source_items",
  "source_leads",
  "canonical_packages",
  "listing_sources",
  "listing_relations",
  "coordinator_meta",
  "registered_users",
  "registered_apps",
  "downstream_signals",
  "catalog_tickets"
] as const;
