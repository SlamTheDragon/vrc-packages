import type {
  BatchResultRequest,
  BatchResultResponse,
  ClaimRequest,
  ClaimResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  Platform,
  ResultRequest,
  ResultResponse
} from "vrc-packages-network/node";
import type {
  BulkApproveLeadsRequest,
  BulkApproveLeadsResponse,
  CatalogCursor,
  CatalogDelta,
  CatalogDeltaCursor,
  CatalogPackage,
  CatalogSearchRequest,
  CatalogSearchResponse,
  ContentRating,
  CreateSteeringProfile,
  CreateSuppressedTarget,
  CreatorClaimIntakeRequest,
  CreatorClaimIntakeResponse,
  DelegatedClaimCursor,
  DelegatedClaimRecord,
  EnqueueJobRequest,
  IssueNodeCredential,
  LeadCursor,
  LeadRow,
  LeadStatus,
  ModeratorRatingRecord,
  OperatorAppCursor,
  OperatorAppRecord,
  OperatorEnvironment,
  OperatorJobCursor,
  OperatorJobRecord,
  OperatorJobState,
  OperatorNodeCursor,
  OperatorNodeRecord,
  OperatorNodeStatus,
  OperatorStatusResponse,
  PriorityLane,
  RegisterAppRequest,
  RegisterAppResponse,
  ReportSubmissionRequest,
  ReportSubmissionResponse,
  RequeueJobRequest,
  RevokeNodeRequest,
  SteeringProfile,
  SteeringProfileCursor,
  SuppressLeadDomainRequest,
  SuppressLeadDomainResponse,
  SuppressedTarget,
  SuppressedTargetCursor,
  SystemPurgeRequest,
  SystemPurgeResponse,
  TakedownCursor,
  TakedownRecord,
  UpdateJobRequest,
  UpdateSteeringProfile,
  UserAppListResponse
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
  claimDueRobotsRefresh?(
    capabilities?: readonly Platform[]
  ): Promise<{ origin: string; leaseId: string } | null> | { origin: string; leaseId: string } | null;
  completeRobotsRefresh?(origin: string, leaseId: string, statusCode: number, body?: string): Promise<boolean> | boolean;
}

export interface NodeCredentialIssued {
  token: string;
  capabilities: Platform[];
}

export interface OperatorStore {
  initSchema?(options?: { autoSeed?: false }): Promise<void> | void;
  getOperatorStatus(
    environment: OperatorEnvironment,
    purgeEnabled: boolean
  ): Promise<OperatorStatusResponse> | OperatorStatusResponse;
  purgeDevelopmentDatabase(
    input: SystemPurgeRequest,
    actor: string
  ): Promise<SystemPurgeResponse> | SystemPurgeResponse;
  revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> | void;
  pruneNode(nodeId: string, actor: string, reason: string): Promise<void> | void;
  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<NodeCredentialIssued> | NodeCredentialIssued;
  listNodesPage(
    status?: OperatorNodeStatus,
    limit?: number,
    cursor?: OperatorNodeCursor | null
  ): Promise<{ nodes: OperatorNodeRecord[]; nextCursor: string | null }> | { nodes: OperatorNodeRecord[]; nextCursor: string | null };
  enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> | string;
  listJobsPage(
    filters?: { state?: OperatorJobState; platform?: Platform; priorityLane?: PriorityLane },
    limit?: number,
    cursor?: OperatorJobCursor | null
  ): Promise<{ jobs: OperatorJobRecord[]; nextCursor: string | null }> | { jobs: OperatorJobRecord[]; nextCursor: string | null };
  updateJob(jobId: string, input: UpdateJobRequest, actor: string): Promise<OperatorJobRecord> | OperatorJobRecord;
  requeueJob(jobId: string, input: RequeueJobRequest, actor: string): Promise<OperatorJobRecord> | OperatorJobRecord;
  deleteJob(jobId: string, actor: string, reason: string): Promise<{ jobId: string; status: "deleted" }> | { jobId: string; status: "deleted" };
  listLeadsPage(
    status: LeadStatus,
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> | { leads: LeadRow[]; nextCursor: string | null };
  approveLead(
    leadKey: string,
    minDelayMs: number | undefined,
    actor: string,
    reason: string
  ): Promise<string> | string;
  bulkApproveLeads(
    input: BulkApproveLeadsRequest,
    actor: string
  ): Promise<BulkApproveLeadsResponse> | BulkApproveLeadsResponse;
  rejectLead(leadKey: string, actor: string, reason: string): Promise<void> | void;
  suppressLeadDomain(
    input: SuppressLeadDomainRequest,
    actor: string
  ): Promise<SuppressLeadDomainResponse> | SuppressLeadDomainResponse;
  listSteeringProfilesPage(
    limit: number,
    cursor: SteeringProfileCursor | null
  ): Promise<{ profiles: SteeringProfile[]; nextCursor: string | null }> | { profiles: SteeringProfile[]; nextCursor: string | null };
  createSteeringProfile(input: CreateSteeringProfile, actor: string): Promise<SteeringProfile> | SteeringProfile;
  updateSteeringProfile(
    profileId: string,
    input: UpdateSteeringProfile,
    actor: string
  ): Promise<SteeringProfile> | SteeringProfile;
  enableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> | SteeringProfile;
  disableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> | SteeringProfile;
  deleteSteeringProfile(
    profileId: string,
    actor: string,
    reason: string
  ): Promise<{ profileId: string; status: "deleted" }> | { profileId: string; status: "deleted" };
  listSuppressedTargetsPage(
    limit: number,
    cursor: SuppressedTargetCursor | null
  ): Promise<{ targets: SuppressedTarget[]; nextCursor: string | null }> | { targets: SuppressedTarget[]; nextCursor: string | null };
  createSuppressedTarget(input: CreateSuppressedTarget, actor: string): Promise<SuppressedTarget> | SuppressedTarget;
  deleteSuppressedTarget(
    target: string,
    actor: string,
    reason: string
  ): Promise<{ target: string; status: "deleted" }> | { target: string; status: "deleted" };
  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options?: { includeAllRatings?: boolean }
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> | { packages: CatalogPackage[]; nextCursor: string | null };
  deleteCanonicalPackage(canonicalId: string, actor: string, reason: string): Promise<boolean> | boolean;
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

export interface DownstreamStore {
  recordReportSubmission(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> | ReportSubmissionResponse;
  recordCreatorClaimIntake(appId: string, input: CreatorClaimIntakeRequest): Promise<CreatorClaimIntakeResponse> | CreatorClaimIntakeResponse;
  registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> | RegisterAppResponse;
  authenticateUser(token: string): Promise<{ userId: string; userName: string; ageVerified?: boolean } | null> | { userId: string; userName: string; ageVerified?: boolean } | null;
  authenticateApp(appToken: string): Promise<DownstreamAppPrincipal | null> | DownstreamAppPrincipal | null;
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
