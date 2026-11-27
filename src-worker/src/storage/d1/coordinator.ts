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
  UserAppListResponse,
  VerificationStatus
} from "vrc-packages-api";
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
import { classifyOutboundLeadKind } from "vrc-packages-network/source-targets";
import type { SourcePurpose } from "../../domain/access/steering_profile.ts";
import type {
  CoordinatorStore,
  DownstreamAppPrincipal,
  DownstreamStore,
  ModeratorStore,
  NodeCredentialIssued,
  NodePrincipal,
  OperatorStore,
  PublicCatalogStore,
  UserPrincipal,
  UserStore
} from "../../domain/ports/stores.ts";
import type {
  CanonicalLifecycle,
  CanonicalUmbrella,
  D1Database,
  EvidenceKind,
  LinkReviewState,
  ListingRelation,
  ListingSource
} from "./definitions.ts";
import { CatalogPlane } from "./planes/catalog_plane.ts";
import { DownstreamAndModerationPlane } from "./planes/downstream_and_moderation_plane.ts";
import { ObservationPlane } from "./planes/observation_plane.ts";
import { OperatorPlane, type SeedJobOptions } from "./planes/operator_plane.ts";
import { CRAWL_JOB_LEASE_MS, D1PlaneContext, type OperatorAuditLogRow } from "./planes/shared_context.ts";
import { WorkforcePlane } from "./planes/workforce_plane.ts";

export { classifyOutboundLeadKind, CRAWL_JOB_LEASE_MS, type OperatorAuditLogRow, type SeedJobOptions };

export class Coordinator
  implements CoordinatorStore, OperatorStore, PublicCatalogStore, DownstreamStore, UserStore, ModeratorStore
{
  private readonly ctx: D1PlaneContext;
  private readonly workforce: WorkforcePlane;
  private readonly observation: ObservationPlane;
  private readonly catalog: CatalogPlane;
  private readonly operator: OperatorPlane;
  private readonly downstream: DownstreamAndModerationPlane;

  constructor(
    readonly db: D1Database,
    readonly now: () => number = Date.now
  ) {
    this.ctx = new D1PlaneContext(db, now);
    this.workforce = new WorkforcePlane(this.ctx);
    this.operator = new OperatorPlane(this.ctx, (url, platform, options) =>
      this.workforce.seedJob(url, platform, options)
    );
    this.observation = new ObservationPlane(
      this.ctx,
      (leadKey, minDelayMs, actor, reason) => this.operator.approveLead(leadKey, minDelayMs, actor, reason),
      (url, platform, options) => this.workforce.seedJob(url, platform, options)
    );
    this.catalog = new CatalogPlane(this.ctx);
    this.downstream = new DownstreamAndModerationPlane(this.ctx);
  }

  initSchema(options?: { autoSeed?: false }): Promise<void> {
    return this.operator.initSchema(options);
  }

  getOperatorStatus(environment: OperatorEnvironment, purgeEnabled: boolean): Promise<OperatorStatusResponse> {
    return this.operator.getOperatorStatus(environment, purgeEnabled);
  }

  purgeDevelopmentDatabase(input: SystemPurgeRequest, actor: string): Promise<SystemPurgeResponse> {
    return this.operator.purgeDevelopmentDatabase(input, actor);
  }

  activeSteeringProfileForTarget(
    platform: Platform,
    target: string,
    purpose: SourcePurpose,
    cache?: Map<string, SteeringProfile[]>
  ): Promise<SteeringProfile | null> {
    return this.ctx.activeSteeringProfileForTarget(platform, target, purpose, cache);
  }

  authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> {
    return this.workforce.authenticate(nodeId, bearer);
  }

  heartbeat(request: HeartbeatRequest, principal: NodePrincipal): Promise<HeartbeatResponse> {
    return this.workforce.heartbeat(request, principal);
  }

  async claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> {
    try {
      await this.observation.retryPendingAutoPromotions();
    } catch {
      // Best-effort auto-promotion sweep before claim scan
    }
    return this.workforce.claim(request, principal);
  }

  retryPendingAutoPromotions(limit?: number): Promise<number> {
    return this.observation.retryPendingAutoPromotions(limit);
  }

  submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> {
    return this.observation.submit(request, principal);
  }

  submitBatch(request: BatchResultRequest, principal: NodePrincipal): Promise<BatchResultResponse> {
    return this.observation.submitBatch(request, principal);
  }

  revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> {
    return this.operator.revokeNode(nodeId, input, actor);
  }

  pruneNode(nodeId: string, actor: string, reason: string): Promise<void> {
    return this.operator.pruneNode(nodeId, actor, reason);
  }

  createNodeCredential(
    nodeId: string,
    capabilities: Platform[],
    audit?: { actor: string; reason: string }
  ): Promise<NodeCredentialIssued> {
    return this.operator.createNodeCredential(nodeId, capabilities, audit);
  }

  evaluateWorkforceDistribution(candidateCapabilities?: Platform[]): Promise<Platform[]> {
    return this.operator.evaluateWorkforceDistribution(candidateCapabilities);
  }

  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<NodeCredentialIssued> {
    return this.operator.issueNodeCredential(input, actor);
  }

  listNodesPage(
    status?: OperatorNodeStatus,
    limit = 100,
    cursor: OperatorNodeCursor | null = null
  ): Promise<{ nodes: OperatorNodeRecord[]; nextCursor: string | null }> {
    return this.operator.listNodesPage(status, limit, cursor);
  }

  enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> {
    return this.operator.enqueueJob(input, actor);
  }

  seedJob(url: string, platform: Platform, options?: SeedJobOptions): Promise<string> {
    return this.workforce.seedJob(url, platform, options);
  }

  listJobsPage(
    filters?: { state?: OperatorJobState; platform?: Platform; priorityLane?: PriorityLane },
    limit = 100,
    cursor: OperatorJobCursor | null = null
  ): Promise<{ jobs: OperatorJobRecord[]; nextCursor: string | null }> {
    return this.operator.listJobsPage(filters, limit, cursor);
  }

  updateJob(jobId: string, input: UpdateJobRequest, actor: string): Promise<OperatorJobRecord> {
    return this.operator.updateJob(jobId, input, actor);
  }

  requeueJob(jobId: string, input: RequeueJobRequest, actor: string): Promise<OperatorJobRecord> {
    return this.operator.requeueJob(jobId, input, actor);
  }

  deleteJob(jobId: string, actor: string, reason: string): Promise<{ jobId: string; status: "deleted" }> {
    return this.operator.deleteJob(jobId, actor, reason);
  }

  listLeadsPage(
    status: LeadStatus,
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    return this.operator.listLeadsPage(status, limit, cursor);
  }

  approveLead(
    leadKey: string,
    minDelayMs: number | undefined,
    actor: string,
    reason: string,
    priorityLane?: PriorityLane
  ): Promise<string> {
    return this.operator.approveLead(leadKey, minDelayMs, actor, reason, priorityLane);
  }

  bulkApproveLeads(input: BulkApproveLeadsRequest, actor: string): Promise<BulkApproveLeadsResponse> {
    return this.operator.bulkApproveLeads(input, actor);
  }

  rejectLead(leadKey: string, actor: string, reason: string): Promise<void> {
    return this.operator.rejectLead(leadKey, actor, reason);
  }

  suppressLeadDomain(input: SuppressLeadDomainRequest, actor: string): Promise<SuppressLeadDomainResponse> {
    return this.operator.suppressLeadDomain(input, actor);
  }

  listSteeringProfilesPage(
    limit: number,
    cursor: SteeringProfileCursor | null
  ): Promise<{ profiles: SteeringProfile[]; nextCursor: string | null }> {
    return this.operator.listSteeringProfilesPage(limit, cursor);
  }

  createSteeringProfile(input: CreateSteeringProfile, actor: string): Promise<SteeringProfile> {
    return this.operator.createSteeringProfile(input, actor);
  }

  updateSteeringProfile(
    profileId: string,
    input: UpdateSteeringProfile,
    actor: string
  ): Promise<SteeringProfile> {
    return this.operator.updateSteeringProfile(profileId, input, actor);
  }

  enableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> {
    return this.operator.enableSteeringProfile(profileId, actor, reason);
  }

  disableSteeringProfile(profileId: string, actor: string, reason: string): Promise<SteeringProfile> {
    return this.operator.disableSteeringProfile(profileId, actor, reason);
  }

  deleteSteeringProfile(
    profileId: string,
    actor: string,
    reason: string
  ): Promise<{ profileId: string; status: "deleted" }> {
    return this.operator.deleteSteeringProfile(profileId, actor, reason);
  }

  listSuppressedTargetsPage(
    limit: number,
    cursor: SuppressedTargetCursor | null
  ): Promise<{ targets: SuppressedTarget[]; nextCursor: string | null }> {
    return this.operator.listSuppressedTargetsPage(limit, cursor);
  }

  createSuppressedTarget(input: CreateSuppressedTarget, actor: string): Promise<SuppressedTarget> {
    return this.operator.createSuppressedTarget(input, actor);
  }

  deleteSuppressedTarget(
    target: string,
    actor: string,
    reason: string
  ): Promise<{ target: string; status: "deleted" }> {
    return this.operator.deleteSuppressedTarget(target, actor, reason);
  }

  claimDueRobotsRefresh(capabilities?: readonly Platform[]): Promise<{ origin: string; leaseId: string } | null> {
    return this.workforce.claimDueRobotsRefresh(capabilities);
  }

  reserveRobotsRefresh(origin: string): Promise<string | null> {
    return this.workforce.reserveRobotsRefresh(origin);
  }

  releaseRobotsRefresh(origin: string, leaseId: string): Promise<boolean> {
    return this.workforce.releaseRobotsRefresh(origin, leaseId);
  }

  completeRobotsRefresh(origin: string, leaseId: string, statusCode: number, body = ""): Promise<boolean> {
    return this.workforce.completeRobotsRefresh(origin, leaseId, statusCode, body);
  }

  recordRobotsSnapshot(origin: string, statusCode: number, body = ""): Promise<void> {
    return this.workforce.recordRobotsSnapshot(origin, statusCode, body);
  }

  listAuditLogs(options?: {
    entityType?: OperatorAuditLogRow["entity_type"];
    entityId?: string;
    limit?: number;
  }): Promise<OperatorAuditLogRow[]> {
    return this.operator.listAuditLogs(options);
  }

  getCatalogEpoch(): Promise<string> {
    return this.catalog.getCatalogEpoch();
  }

  resetCatalogEpoch(): Promise<string> {
    return this.catalog.resetCatalogEpoch();
  }

  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options: { includeAllRatings?: boolean } = {}
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> {
    return this.catalog.listCanonicalPackagesPage(limit, cursor, options);
  }

  listCatalogDeltasPage(
    limit: number,
    cursor: CatalogDeltaCursor | null
  ): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null }> {
    return this.catalog.listCatalogDeltasPage(limit, cursor);
  }

  searchCatalogPackages(
    input: CatalogSearchRequest,
    options: { isAgeVerified?: boolean } = {}
  ): Promise<CatalogSearchResponse> {
    return this.catalog.searchCatalogPackages(input, options);
  }

  upsertSourceItem(item: {
    sourceKey: string;
    platform: Platform;
    sourceUrl: string;
    latestDigest: string;
    payloadJson?: string;
    observedAt?: string;
    complete?: boolean;
    issuesJson?: string;
    steeringProfileId?: string | null;
    goneAt?: string | null;
  }): Promise<void> {
    return this.catalog.upsertSourceItem(item);
  }

  upsertCanonicalPackage(pkg: {
    canonicalId: string;
    umbrella: CanonicalUmbrella;
    category: string;
    lifecycle: CanonicalLifecycle;
    displayName: string;
    ownerKey?: string | null;
    ownerName?: string | null;
    verificationStatus?: VerificationStatus;
    verifiedByAppId?: string | null;
    vpmId?: string | null;
    vpmLatestVersion?: string | null;
    vpmRepoUrl?: string | null;
    summary?: string | null;
    tags?: string[];
    qualityFlags?: string[];
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string | null;
    timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
    contentRating?: ContentRating | null;
  }): Promise<CatalogPackage> {
    return this.catalog.upsertCanonicalPackage(pkg);
  }

  getCanonicalPackage(canonicalId: string): Promise<CatalogPackage | null> {
    return this.catalog.getCanonicalPackage(canonicalId);
  }

  deleteCanonicalPackage(canonicalId: string, actor?: string, reason?: string): Promise<boolean> {
    return this.catalog.deleteCanonicalPackage(canonicalId, actor, reason);
  }

  upsertListingSource(source: {
    sourceLinkId?: string;
    canonicalId: string;
    sourceKey: string;
    platform: Platform;
    storefrontUrl: string;
    evidenceKind: EvidenceKind;
    confidence: number;
    reviewState?: LinkReviewState;
    price?: number | null;
    currency?: string | null;
    availability?: "available" | "delisted" | "unknown";
    observedAt?: string;
    reviewedAt?: string | null;
  }): Promise<ListingSource> {
    return this.catalog.upsertListingSource(source);
  }

  getListingSourcesForCanonical(canonicalId: string): Promise<ListingSource[]> {
    return this.catalog.getListingSourcesForCanonical(canonicalId);
  }

  listRelationsForCanonical(canonicalId: string): Promise<ListingRelation[]> {
    return this.catalog.listRelationsForCanonical(canonicalId);
  }

  submitDelistRequest(input: {
    targetUrl?: string;
    canonicalId?: string;
    reason: string;
    requesterType: "unauthenticated_creator" | "user" | "admin_operator";
    requesterId?: string;
    proofKind?: "storefront_bio_token" | "dns_txt" | "manual_notice";
    proofValue?: string;
    contactEmail?: string;
  }) {
    return this.operator.submitDelistRequest(input);
  }

  listTakedownsPage(
    requesterType?: string,
    limit = 100,
    cursor: TakedownCursor | null = null
  ): Promise<{ records: TakedownRecord[]; nextCursor: string | null }> {
    return this.operator.listTakedownsPage(requesterType, limit, cursor);
  }

  verifyTakedown(
    takedownId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ takedownId: string; status: "accepted" | "rejected"; updatedAt: string }> {
    return this.operator.verifyTakedown(takedownId, verdict, actor, notes);
  }

  listDelegatedClaimsPage(
    reviewStatus?: string,
    limit = 100,
    cursor: DelegatedClaimCursor | null = null
  ): Promise<{ records: DelegatedClaimRecord[]; nextCursor: string | null }> {
    return this.operator.listDelegatedClaimsPage(reviewStatus, limit, cursor);
  }

  verifyDelegatedClaim(
    claimId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ claimId: string; status: "accepted" | "rejected"; updatedAt: string }> {
    return this.operator.verifyDelegatedClaim(claimId, verdict, actor, notes);
  }

  listOperatorAppsPage(
    limit = 100,
    cursor: OperatorAppCursor | null = null,
    candidateStatus?: string
  ): Promise<{ apps: OperatorAppRecord[]; nextCursor: string | null }> {
    return this.operator.listOperatorAppsPage(limit, cursor, candidateStatus);
  }

  reviewAppCandidate(
    appId: string,
    input: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string },
    actor: string
  ) {
    return this.operator.reviewAppCandidate(appId, input, actor);
  }

  setAppDelegation(
    appId: string,
    allowed: boolean,
    actor: string,
    reason?: string
  ): Promise<{ appId: string; delegationAllowed: boolean; permissions: string[]; updatedAt: string }> {
    return this.operator.setAppDelegation(appId, allowed, actor, reason);
  }

  recordReportSubmission(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> {
    return this.downstream.recordReportSubmission(appId, input);
  }

  listUserApps(
    userId: string,
    limit: number,
    cursor: string | null,
    appId?: string
  ): Promise<UserAppListResponse> {
    return this.downstream.listUserApps(userId, limit, cursor, appId);
  }

  registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> {
    return this.downstream.registerApp(input, ownerUserId);
  }

  authenticateApp(appToken: string): Promise<DownstreamAppPrincipal | null> {
    return this.downstream.authenticateApp(appToken);
  }

  issueUserToken(
    userName: string,
    contactEmail?: string,
    ageVerified = false,
    isModerator = false
  ): Promise<{
    userId: string;
    userName: string;
    token: string;
    ageVerified: boolean;
    isModerator: boolean;
  }> {
    return this.downstream.issueUserToken(userName, contactEmail, ageVerified, isModerator);
  }

  authenticateUser(token: string): Promise<UserPrincipal | null> {
    return this.downstream.authenticateUser(token);
  }

  recordCreatorClaimIntake(
    appId: string,
    input: CreatorClaimIntakeRequest
  ): Promise<CreatorClaimIntakeResponse> {
    return this.downstream.recordCreatorClaimIntake(appId, input);
  }

  recordAppActivity(appId: string): Promise<void> {
    return this.downstream.recordAppActivity(appId);
  }

  listModeratorRatingsPage(
    rating?: ContentRating,
    limit = 100,
    cursor: { updatedAt: string; canonicalId: string } | null = null
  ): Promise<{ ratings: ModeratorRatingRecord[]; nextCursor: string | null }> {
    return this.downstream.listModeratorRatingsPage(rating, limit, cursor);
  }

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
  } | null> {
    return this.downstream.adjustPackageRating(canonicalId, newRating, adjustedBy, reason);
  }
}
