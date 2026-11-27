import type {
  ContentRating,
  HostMatchMode,
  PriorityLane,
  QueryMode,
  SourcePurpose,
  SuppressedTargetScope,
  VerificationStatus,
  CatalogRelationScope,
  CatalogRelationType,
  Umbrella
} from "vrc-packages-api";
import type { Platform } from "vrc-packages-network/node";

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: object;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

export type JobRow = {
  job_id: string;
  platform: Platform;
  url: string;
  origin: string;
  state: "pending" | "leased" | "done" | "backoff" | "blocked";
  priority_lane: PriorityLane;
  recrawl_interval_ms: number;
  pagination_depth: number;
  next_fetch_at: string;
  claimed_by: string | null;
  lease_id: string | null;
  lease_expires_at: string | null;
  etag: string | null;
  last_modified: string | null;
  created_at: string;
  robots_deferred_until: string | null;
  steering_profile_id: string | null;
  job_purpose: SourcePurpose;
};

export type OriginStateRow = {
  origin: string;
  active_job_id: string | null;
  lease_expires_at: string | null;
  next_allowed_at: string;
  min_delay_ms: number;
  robots_snapshot_id: string | null;
  robots_status_code: number | null;
  robots_fetched_at: string | null;
  robots_expires_at: string | null;
  refresh_lease_id: string | null;
  refresh_lease_expires_at: string | null;
};

export type SteeringProfileRow = {
  profile_id: string;
  platform: Platform;
  host_match_mode: HostMatchMode;
  host_pattern: string;
  path_scope: string;
  query_mode: QueryMode;
  query_scope: string | null;
  method: "GET";
  purpose: SourcePurpose;
  auto_promote: number;
  recrawl_interval_ms: number;
  min_delay_ms: number;
  max_pagination_depth: number;
  expires_at: string;
  review_reference: string;
  reason: string;
  retain_classes_json: string;
  publish_classes_json: string;
  created_at: string;
  disabled_at: string | null;
};

export type SuppressedTargetRow = {
  target: string;
  scope: SuppressedTargetScope;
  reason: string;
  suppressed_at: string;
};

export type CanonicalUmbrella = Umbrella;
export type CanonicalLifecycle = "active" | "deprecated" | "quarantined" | "delisted" | "deleted";
export type TombstoneReason = "rating_withdrawn" | "deleted" | "delisted";
export type EvidenceKind =
  | "vpm_id"
  | "repository_match"
  | "cross_storefront_link"
  | "curator_verified"
  | "simhash_match";
export type LinkReviewState = "provisional" | "accepted" | "rejected";

export type CanonicalPackage = {
  canonicalId: string;
  umbrella: CanonicalUmbrella;
  category: string;
  lifecycle: CanonicalLifecycle;
  tombstoneReason?: TombstoneReason | null;
  displayName: string;
  ownerKey: string | null;
  ownerName: string | null;
  verificationStatus: VerificationStatus;
  verifiedByAppId: string | null;
  vpmId: string | null;
  vpmLatestVersion: string | null;
  vpmRepoUrl: string | null;
  summary: string | null;
  tags: string[];
  qualityFlags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
  contentRating?: ContentRating;
};

export type ListingSource = {
  sourceLinkId: string;
  canonicalId: string;
  sourceKey: string;
  platform: Platform;
  storefrontUrl: string;
  evidenceKind: EvidenceKind;
  confidence: number;
  reviewState: LinkReviewState;
  price: number | null;
  currency: string | null;
  availability: "available" | "delisted" | "unknown";
  observedAt: string;
  reviewedAt: string | null;
};

export type ListingRelation = {
  relationId: string;
  sourceKey: string;
  sourceCanonicalId: string;
  targetCanonicalId: string | null;
  targetAvatarBase: string | null;
  relationType: CatalogRelationType;
  scope: CatalogRelationScope;
  confidence: number;
  evidenceSource: string;
  feedbackUpCount: number;
  feedbackDownCount: number;
  createdAt: string;
  updatedAt: string;
};
