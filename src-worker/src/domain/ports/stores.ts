import type {
  ClaimRequest,
  ClaimResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  ResultRequest,
  ResultResponse,
  BatchResultRequest,
  BatchResultResponse,
  Platform
} from "vrc-packages-network/node";
import type {
  RevokeNodeRequest,
  EnqueueJobRequest,
  IssueNodeCredential,
  AutoQueueRule,
  CreateAutoQueueRule,
  RuleCursor,
  CatalogCursor,
  CatalogPackage,
  LeadCursor,
  LeadRow,
  TakedownCursor,
  TakedownRecord,
  DelegatedClaimCursor,
  DelegatedClaimRecord,
  OperatorAppRecord,
  OperatorAppCursor,
  OperatorNodeStatus,
  OperatorNodeRecord,
  OperatorNodeCursor,
  OperatorJobState,
  OperatorJobRecord,
  OperatorJobCursor,
  CreateSourceAccessProfile,
  SourceAccessProfile,
  ProfileCursor,
  CatalogDeltaCursor,
  CatalogDelta,
  RegisterAppRequest,
  RegisterAppResponse,
  ReportSubmissionRequest,
  ReportSubmissionResponse,
  CatalogSearchRequest,
  CatalogSearchResponse,
  CreatorClaimIntakeRequest,
  CreatorClaimIntakeResponse,
  UserAppListResponse,
  ContentRating,
  ModeratorRatingRecord
} from "vrc-packages-api";

export interface NodePrincipal {
  nodeId: string;
  capabilities: Platform[];
  /** Opaque credential generation used to reject auth and lease races after rotation. */
  credentialVersion: string;
}

export class CoordinatorConflict extends Error {
  constructor(message: string, public readonly status: 400 | 403 | 404 | 409 = 409) {
    super(message);
  }
}

export class UnsupportedMediaTypeError extends Error {
  public readonly status = 415 as const;
  constructor(message = "Content-Type must be application/json") {
    super(message);
  }
}

export interface CoordinatorStore {
  authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> | NodePrincipal | null;
  claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> | ClaimResponse;
  heartbeat(request: HeartbeatRequest, principal: NodePrincipal): Promise<HeartbeatResponse> | HeartbeatResponse;
  submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> | ResultResponse;
  submitBatch(request: BatchResultRequest, principal: NodePrincipal): Promise<BatchResultResponse> | BatchResultResponse;
  claimDueRobotsRefresh?(): Promise<{ origin: string; leaseId: string } | null> | { origin: string; leaseId: string } | null;
  completeRobotsRefresh?(origin: string, leaseId: string, statusCode: number, body?: string): Promise<boolean> | boolean;
}

export interface OperatorStore {
  revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> | void;
  pruneNode(nodeId: string, actor: string, reason: string): Promise<void> | void;
  enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> | string;
  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> | string;
  listNodesPage(
    status?: OperatorNodeStatus,
    limit?: number,
    cursor?: OperatorNodeCursor | null
  ): Promise<{ nodes: OperatorNodeRecord[]; nextCursor: string | null }> | { nodes: OperatorNodeRecord[]; nextCursor: string | null };
  listJobsPage(
    filters?: { state?: OperatorJobState; platform?: Platform },
    limit?: number,
    cursor?: OperatorJobCursor | null
  ): Promise<{ jobs: OperatorJobRecord[]; nextCursor: string | null }> | { jobs: OperatorJobRecord[]; nextCursor: string | null };
  listLeadsPage(
    status: "pending_review" | "approved" | "rejected",
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> | { leads: LeadRow[]; nextCursor: string | null };
  approveDiscoveryLead?(leadKey: string, minDelayMs: number, actor: string, reason: string): Promise<string> | string;
  approveVpmListingLead(leadKey: string, minDelayMs: number, actor: string, reason: string): Promise<string> | string;
  rejectLead(leadKey: string, actor: string, reason: string): Promise<void> | void;
  listAutoQueueRulesPage(
    limit: number,
    cursor: RuleCursor | null
  ): Promise<{ rules: AutoQueueRule[]; nextCursor: string | null }> | { rules: AutoQueueRule[]; nextCursor: string | null };
  createAutoQueueRule(input: CreateAutoQueueRule, actor: string): Promise<unknown> | unknown;
  disableAutoQueueRule(ruleId: string, actor: string, reason: string): Promise<unknown> | unknown;
  listSourceAccessProfilesPage(
    limit: number,
    cursor: ProfileCursor | null
  ): Promise<{ profiles: SourceAccessProfile[]; nextCursor: string | null }> | { profiles: SourceAccessProfile[]; nextCursor: string | null };
  createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string): Promise<SourceAccessProfile> | SourceAccessProfile;
  disableSourceAccessProfile(profileId: string, actor: string, reason: string): Promise<SourceAccessProfile> | SourceAccessProfile;
  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options?: { includeAllRatings?: boolean }
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> | { packages: CatalogPackage[]; nextCursor: string | null };
  listTakedownsPage(
    requesterType?: string,
    limit?: number,
    cursor?: TakedownCursor | null
  ): Promise<{ records: TakedownRecord[]; nextCursor: string | null }> | { records: TakedownRecord[]; nextCursor: string | null };
  verifyTakedown(
    takedownId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ takedownId: string; status: "accepted" | "rejected"; updatedAt: string }> | { takedownId: string; status: "accepted" | "rejected"; updatedAt: string };
  listDelegatedClaimsPage(
    reviewStatus?: string,
    limit?: number,
    cursor?: DelegatedClaimCursor | null
  ): Promise<{ records: DelegatedClaimRecord[]; nextCursor: string | null }> | { records: DelegatedClaimRecord[]; nextCursor: string | null };
  verifyDelegatedClaim(
    claimId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ claimId: string; status: "accepted" | "rejected"; updatedAt: string }> | { claimId: string; status: "accepted" | "rejected"; updatedAt: string };
  listOperatorAppsPage(
    limit?: number,
    cursor?: OperatorAppCursor | null,
    candidateStatus?: string
  ): Promise<{ apps: OperatorAppRecord[]; nextCursor: string | null }> | { apps: OperatorAppRecord[]; nextCursor: string | null };
  setAppDelegation(
    appId: string,
    allowed: boolean,
    actor: string,
    reason?: string
  ): Promise<{ appId: string; delegationAllowed: boolean; permissions: string[]; updatedAt: string }> | { appId: string; delegationAllowed: boolean; permissions: string[]; updatedAt: string };
  reviewAppCandidate(
    appId: string,
    input: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string },
    actor: string
  ): Promise<{
    appId: string;
    candidateStatus: "none" | "review_pending" | "reviewed" | "trusted";
    candidateFlags: string[];
    delegationAllowed: boolean;
    permissions: string[];
    reviewedAt: string;
  }> | {
    appId: string;
    candidateStatus: "none" | "review_pending" | "reviewed" | "trusted";
    candidateFlags: string[];
    delegationAllowed: boolean;
    permissions: string[];
    reviewedAt: string;
  };
}

export interface PublicCatalogStore {
  getCatalogEpoch(): Promise<string> | string;
  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options?: { includeAllRatings?: boolean }
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> | { packages: CatalogPackage[]; nextCursor: string | null };
  listCatalogDeltasPage(
    limit: number,
    cursor: CatalogDeltaCursor | null
  ): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null }> | { epoch: string; deltas: CatalogDelta[]; nextCursor: string | null };
}

export interface DownstreamAppPrincipal {
  appId: string;
  appName: string;
  permissions: string[];
  candidateStatus?: "none" | "review_pending" | "reviewed" | "trusted";
  isTrusted?: boolean;
  isAgeVerified?: boolean;
}

export interface DemandFeedbackInput {
  signalType: "search_miss" | "refresh_demand" | "popularity_signal";
  query?: string;
  zeroHits?: boolean;
  requestedPlatform?: string;
  targetUrl?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface DemandFeedbackReceipt {
  schemaVersion: 1;
  status: "accepted";
  signalId: string;
  recordedAt: string;
}

export interface DownstreamStore {
  recordRemovalReport(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> | ReportSubmissionResponse;
  recordIssueReport(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> | ReportSubmissionResponse;
  recordCreatorClaimIntake(appId: string, input: CreatorClaimIntakeRequest): Promise<CreatorClaimIntakeResponse> | CreatorClaimIntakeResponse;
  registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> | RegisterAppResponse;
  authenticateUser(token: string): Promise<{ userId: string; userName: string; ageVerified?: boolean } | null> | { userId: string; userName: string; ageVerified?: boolean } | null;
  authenticateApp(appToken: string): Promise<DownstreamAppPrincipal | null> | DownstreamAppPrincipal | null;
  recordDownstreamFeedback(appId: string, input: DemandFeedbackInput): Promise<DemandFeedbackReceipt> | DemandFeedbackReceipt;
  searchCatalogPackages(input: CatalogSearchRequest, options?: { isAgeVerified?: boolean }): Promise<CatalogSearchResponse> | CatalogSearchResponse;
  recordAppActivity(appId: string): Promise<void> | void;
}

export interface UserPrincipal {
  userId: string;
  userName: string;
  ageVerified?: boolean;
  isModerator?: boolean;
}

export interface UserStore {
  authenticateUser(token: string): Promise<UserPrincipal | null> | UserPrincipal | null;
  listUserApps(userId: string, limit: number, cursor: string | null, appId?: string): Promise<UserAppListResponse> | UserAppListResponse;
}

export interface ModeratorStore {
  authenticateUser(token: string): Promise<UserPrincipal | null> | UserPrincipal | null;
  listModeratorRatingsPage(
    rating?: ContentRating,
    limit?: number,
    cursor?: { updatedAt: string; canonicalId: string } | null
  ): Promise<{
    ratings: ModeratorRatingRecord[];
    nextCursor: string | null;
  }> | {
    ratings: ModeratorRatingRecord[];
    nextCursor: string | null;
  };
  adjustPackageRating(
    canonicalId: string,
    newRating: ContentRating,
    adjustedBy: string,
    reason: string
  ): Promise<{
    canonicalId: string;
    previousRating: ContentRating;
    newRating: ContentRating;
    adjustedBy: string;
    updatedAt: string;
  } | null> | {
    canonicalId: string;
    previousRating: ContentRating;
    newRating: ContentRating;
    adjustedBy: string;
    updatedAt: string;
  } | null;
  listOperatorAppsPage?(
    limit?: number,
    cursor?: OperatorAppCursor | null,
    candidateStatus?: string
  ): Promise<{ apps: OperatorAppRecord[]; nextCursor: string | null }> | { apps: OperatorAppRecord[]; nextCursor: string | null };
  reviewAppCandidate?(
    appId: string,
    input: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string },
    actor: string
  ): Promise<{
    appId: string;
    candidateStatus: "none" | "review_pending" | "reviewed" | "trusted";
    candidateFlags: string[];
    delegationAllowed: boolean;
    permissions: string[];
    reviewedAt: string;
  }> | {
    appId: string;
    candidateStatus: "none" | "review_pending" | "reviewed" | "trusted";
    candidateFlags: string[];
    delegationAllowed: boolean;
    permissions: string[];
    reviewedAt: string;
  };
}
