import type {
  EnqueueJobRequest,
  RevokeNodeRequest,
  AutoQueueRule,
  IssueNodeCredential,
  RuleCursor,
  CreateAutoQueueRule,
  CatalogCursor,
  CatalogPackage,
  PackageFront,
  CatalogDelta,
  CatalogDeltaCursor,
  ContentRating,
  ModeratorRatingRecord,
  LeadCursor,
  LeadRow,
  TakedownCursor,
  TakedownRecord,
  DelegatedClaimCursor,
  DelegatedClaimRecord,
  OperatorAppCursor,
  OperatorAppRecord,
  UserAppListResponse,
  ReportSubmissionRequest,
  ReportSubmissionResponse,
  RegisterAppRequest,
  RegisterAppResponse,
  CatalogSearchRequest,
  CatalogSearchResponse,
  CreatorClaimIntakeRequest,
  CreatorClaimIntakeResponse
} from "vrc-packages-api";
import type {
  Platform,
  HeartbeatRequest,
  HeartbeatResponse,
  ClaimRequest,
  ClaimResponse,
  ResultRequest,
  ResultResponse,
  BatchResultRequest,
  BatchResultResponse
} from "vrc-packages-network/node";
import { classifyOutboundLeadKind } from "vrc-packages-network/source-targets";
import type {
  SourceAccessProfile,
  SourcePurpose,
  ProfileCursor,
  CreateSourceAccessProfile
} from "../../domain/access/source_access_profile.ts";
import type {
  CoordinatorStore,
  NodePrincipal,
  OperatorStore,
  PublicCatalogStore,
  DownstreamStore,
  UserStore,
  ModeratorStore,
  DemandFeedbackInput,
  DemandFeedbackReceipt
} from "../../domain/ports/stores.ts";
import type { DesktopToolEvidence } from "../../domain/classification/taxonomy.ts";
import type { AvatarCompatibility } from "../../domain/classification/avatar_compatibility.ts";
import type {
  D1Database,
  SourceAccessProfileRow,
  CanonicalUmbrella,
  CanonicalLifecycle,
  EvidenceKind,
  LinkReviewState,
  CanonicalPackage,
  IdentityLink
} from "./definitions.ts";
import {
  D1PlaneContext,
  CRAWL_JOB_LEASE_MS,
  type OperatorAuditLogRow
} from "./planes/shared_context.ts";
import { WorkforcePlane } from "./planes/workforce_plane.ts";
import { ObservationPlane } from "./planes/observation_plane.ts";
import { CatalogPlane } from "./planes/catalog_plane.ts";
import { OperatorPlane } from "./planes/operator_plane.ts";
import { DownstreamAndModerationPlane } from "./planes/downstream_and_moderation_plane.ts";

export { classifyOutboundLeadKind, CRAWL_JOB_LEASE_MS, type OperatorAuditLogRow };

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
    this.workforce = new WorkforcePlane(this.ctx, (input, actor) =>
      this.operator.createSourceAccessProfile(input, actor)
    );
    this.operator = new OperatorPlane(this.ctx, (url, platform, minDelayMs, sourceRuleId, purpose, audit) =>
      this.workforce.seedJob(url, platform, minDelayMs, sourceRuleId, purpose, audit)
    );
    this.observation = new ObservationPlane(
      this.ctx,
      (leadKey, minDelayMs, actor, reason, sourceRuleId) =>
        this.approveDiscoveryLead(leadKey, minDelayMs, actor, reason, sourceRuleId)
    );
    this.catalog = new CatalogPlane(this.ctx);
    this.downstream = new DownstreamAndModerationPlane(this.ctx);
  }

  seedInitialJobs(): Promise<void> {
    return this.workforce.seedInitialJobs();
  }

  seedInitialProfiles(actor = "system-bootstrap"): Promise<void> {
    return this.workforce.seedInitialProfiles(actor);
  }

  initSchema(autoSeed = false): Promise<void> {
    return this.workforce.initSchema(autoSeed);
  }

  activeSourceAccessProfileForTarget(
    platform: Platform,
    target: string,
    purpose: SourcePurpose,
    cache?: Map<string, SourceAccessProfileRow[]>
  ): Promise<SourceAccessProfile | null> {
    return this.ctx.activeSourceAccessProfileForTarget(platform, target, purpose, cache);
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
      // Best-effort durable lead promotion sweep before claim scan
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

  createNodeCredential(
    nodeId: string,
    capabilities: Platform[],
    audit?: { actor: string; reason: string }
  ): Promise<string> {
    return this.operator.createNodeCredential(nodeId, capabilities, audit);
  }

  evaluateWorkforceDistribution(candidateCapabilities?: Platform[]): Promise<Platform[]> {
    return this.operator.evaluateWorkforceDistribution(candidateCapabilities);
  }

  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> {
    return this.operator.issueNodeCredential(input, actor);
  }

  listLeadsPage(
    status: "pending_review" | "approved" | "rejected",
    limit: number,
    cursor: LeadCursor | null
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    return this.operator.listLeadsPage(status, limit, cursor);
  }

  approveDiscoveryLead(
    leadKey: string,
    minDelayMs = 1000,
    actor = "local-cli",
    reason = "Operator reviewed listing",
    sourceRuleId?: string
  ): Promise<string> {
    return this.operator.approveDiscoveryLead(leadKey, minDelayMs, actor, reason, sourceRuleId);
  }

  approveVpmListingLead(
    leadKey: string,
    minDelayMs = 1000,
    actor = "local-cli",
    reason = "Operator reviewed listing",
    sourceRuleId?: string
  ): Promise<string> {
    return this.approveDiscoveryLead(leadKey, minDelayMs, actor, reason, sourceRuleId);
  }

  rejectLead(leadKey: string, actor: string, reason: string): Promise<void> {
    return this.operator.rejectLead(leadKey, actor, reason);
  }

  listAutoQueueRulesPage(
    limit: number,
    cursor: RuleCursor | null
  ): Promise<{ rules: AutoQueueRule[]; nextCursor: string | null }> {
    return this.operator.listAutoQueueRulesPage(limit, cursor);
  }

  createAutoQueueRule(input: CreateAutoQueueRule, actor: string): Promise<AutoQueueRule> {
    return this.operator.createAutoQueueRule(input, actor);
  }

  disableAutoQueueRule(ruleId: string, actor: string, reason: string): Promise<AutoQueueRule> {
    return this.operator.disableAutoQueueRule(ruleId, actor, reason);
  }

  listSourceAccessProfilesPage(
    limit: number,
    cursor: ProfileCursor | null
  ): Promise<{ profiles: SourceAccessProfile[]; nextCursor: string | null }> {
    return this.operator.listSourceAccessProfilesPage(limit, cursor);
  }

  createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string): Promise<SourceAccessProfile> {
    return this.operator.createSourceAccessProfile(input, actor);
  }

  disableSourceAccessProfile(profileId: string, actor: string, reason: string): Promise<SourceAccessProfile> {
    return this.operator.disableSourceAccessProfile(profileId, actor, reason);
  }

  listAuditLogs(options?: {
    entityType?: "node" | "lead" | "job" | "rule" | "profile" | "app";
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

  buildCatalogPackagesBatch(
    pkgRows: Array<{
      canonical_id: string;
      umbrella: string;
      category: string;
      lifecycle: string;
      display_name: string;
      vpm_id: string | null;
      created_at: string;
      updated_at: string;
      published_at?: string | null;
      timestamp_confidence?: string | null;
      content_rating?: string | null;
    }>
  ): Promise<CatalogPackage[]> {
    return this.catalog.buildCatalogPackagesBatch(pkgRows);
  }

  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options?: { includeAllRatings?: boolean }
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> {
    return this.catalog.listCanonicalPackagesPage(limit, cursor, options);
  }

  listCatalogDeltasPage(
    limit: number,
    cursor: CatalogDeltaCursor | null
  ): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null }> {
    return this.catalog.listCatalogDeltasPage(limit, cursor);
  }

  enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> {
    return this.workforce.enqueueJob(input, actor);
  }

  seedJob(
    url: string,
    platform: Platform,
    minDelayMs = 1000,
    sourceRuleId?: string,
    purpose: SourcePurpose = "metadata",
    audit?: { actor: string; reason: string; leadKey?: string }
  ): Promise<string> {
    return this.workforce.seedJob(url, platform, minDelayMs, sourceRuleId, purpose, audit);
  }

  claimDueRobotsRefresh(): Promise<{ origin: string; leaseId: string } | null> {
    return this.workforce.claimDueRobotsRefresh();
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

  upsertSourceItem(item: {
    sourceKey: string;
    platform: Platform;
    sourceUrl: string;
    latestDigest: string;
    latestVersionNo?: number;
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
    vpmId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string | null;
    timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
    contentRating?: ContentRating | null;
  }): Promise<
    CanonicalPackage & {
      publishedAt?: string | null;
      timestampConfidence?: string | null;
      contentRating?: ContentRating;
    }
  > {
    return this.catalog.upsertCanonicalPackage(pkg);
  }

  getCanonicalPackage(
    canonicalId: string
  ): Promise<
    | (CanonicalPackage & {
        publishedAt?: string | null;
        timestampConfidence?: string | null;
        contentRating?: ContentRating;
      })
    | null
  > {
    return this.catalog.getCanonicalPackage(canonicalId);
  }

  createIdentityLink(link: {
    linkId?: string;
    sourceKey: string;
    canonicalId: string;
    evidenceKind: EvidenceKind;
    confidence: number;
    reviewState?: LinkReviewState;
    createdAt?: string;
    reviewedAt?: string | null;
  }): Promise<IdentityLink> {
    return this.catalog.createIdentityLink(link);
  }

  getIdentityLinksForCanonical(canonicalId: string): Promise<IdentityLink[]> {
    return this.catalog.getIdentityLinksForCanonical(canonicalId);
  }

  getIdentityLinksForSourceItem(sourceKey: string): Promise<IdentityLink[]> {
    return this.catalog.getIdentityLinksForSourceItem(sourceKey);
  }

  updateIdentityLinkReview(linkId: string, reviewState: LinkReviewState): Promise<boolean> {
    return this.catalog.updateIdentityLinkReview(linkId, reviewState);
  }

  deleteIdentityLink(linkId: string): Promise<boolean> {
    return this.catalog.deleteIdentityLink(linkId);
  }

  listAvatarCompatibilities(sourceKey: string): Promise<AvatarCompatibility[]> {
    return this.catalog.listAvatarCompatibilities(sourceKey);
  }

  recordDesktopToolEvidence(evidence: DesktopToolEvidence & { confidence: number }): Promise<void> {
    return this.catalog.recordDesktopToolEvidence(evidence);
  }

  getDesktopToolEvidence(canonicalId: string): Promise<(DesktopToolEvidence & { confidence: number }) | null> {
    return this.catalog.getDesktopToolEvidence(canonicalId);
  }

  deleteCanonicalPackage(canonicalId: string): Promise<boolean> {
    return this.catalog.deleteCanonicalPackage(canonicalId);
  }

  upsertPackageFront(front: {
    frontId?: string;
    canonicalId: string;
    sourceKey: string;
    platform: Platform;
    storefrontUrl: string;
    price?: number | null;
    currency?: string | null;
    availability?: "available" | "delisted" | "unknown";
    observedAt?: string;
  }): Promise<PackageFront> {
    return this.catalog.upsertPackageFront(front);
  }

  getPackageFrontsForCanonical(canonicalId: string): Promise<PackageFront[]> {
    return this.catalog.getPackageFrontsForCanonical(canonicalId);
  }

  deletePackageFront(frontId: string): Promise<boolean> {
    return this.catalog.deletePackageFront(frontId);
  }

  recordRemovalReport(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> {
    return this.downstream.recordRemovalReport(appId, input);
  }

  recordIssueReport(
    appId: string,
    input: unknown
  ): Promise<{ schemaVersion: 1; status: "accepted"; reportId: string; recordedAt: string }> {
    return this.downstream.recordIssueReport(appId, input);
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

  authenticateApp(appToken: string) {
    return this.downstream.authenticateApp(appToken);
  }

  recordDownstreamFeedback(appId: string, input: DemandFeedbackInput): Promise<DemandFeedbackReceipt> {
    return this.downstream.recordDownstreamFeedback(appId, input);
  }

  searchCatalogPackages(
    input: CatalogSearchRequest,
    options: { isAgeVerified?: boolean } = {}
  ): Promise<CatalogSearchResponse> {
    return this.catalog.searchCatalogPackages(input, options);
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

  authenticateUser(token: string) {
    return this.downstream.authenticateUser(token);
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

  recordCreatorClaimIntake(
    appId: string,
    input: CreatorClaimIntakeRequest
  ): Promise<CreatorClaimIntakeResponse> {
    return this.downstream.recordCreatorClaimIntake(appId, input);
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

  recordAppActivity(appId: string): Promise<void> {
    return this.downstream.recordAppActivity(appId);
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

  setAppDelegation(appId: string, allowed: boolean, actor: string, reason?: string) {
    return this.operator.setAppDelegation(appId, allowed, actor, reason);
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
