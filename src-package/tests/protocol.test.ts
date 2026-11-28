import { describe, it, expect } from "bun:test";
import { PlatformSchema } from "../src/types/platform.ts";
import {
  CatalogPackageSchema,
  CatalogPackageClientReadSchema,
  CatalogListingSourceSchema,
  CatalogRelationSchema,
  VerificationStatusSchema,
  CatalogQualityFlagSchema,
  PackageFrontSchema,
  encodeCatalogCursor,
  decodeCatalogCursor
} from "../src/types/package.ts";
import {
  encodeCatalogDeltaCursor,
  decodeCatalogDeltaCursor,
  PublicCatalogListQuerySchema,
  PublicCatalogListResponseSchema
} from "../src/protocol/catalog.ts";
import {
  CatalogSearchRequestSchema,
  ConsolidatedReportTypeSchema,
  DemandSignalReportRequestSchema,
  RelationshipFeedbackReportRequestSchema,
  IssueReportRequestSchema,
  RemovalReportRequestSchema,
  ReportSubmissionRequestSchema,
  CreatorDelegationAttestationSchema,
  CreatorClaimIntakeRequestSchema,
  CreatorClaimIntakeResponseSchema
} from "../src/protocol/downstream.ts";
import { UserAppListQuerySchema } from "../src/protocol/user.ts";
import {
  InitializeCoordinatorRequestSchema,
  InitializeCoordinatorResponseSchema,
  OperatorStatusResponseSchema,
  SystemPurgeRequestSchema,
  SystemPurgeResponseSchema,
  LeadRowSchema,
  LeadCursorSchema,
  encodeLeadCursor,
  decodeLeadCursor,
  ApproveLeadSchema,
  RejectLeadSchema,
  BulkApproveLeadsRequestSchema,
  BulkApproveLeadsResponseSchema,
  SuppressLeadDomainRequestSchema,
  SuppressLeadDomainResponseSchema,
  HostMatchModeSchema,
  QueryModeSchema,
  CreateSteeringProfileSchema,
  SteeringProfileSchema,
  UpdateSteeringProfileSchema,
  SteeringProfileActionSchema,
  SteeringProfileDeleteResponseSchema,
  encodeSteeringProfileCursor,
  decodeSteeringProfileCursor,
  OperatorSteeringProfileListQuerySchema,
  SteeringProfileResponseSchema,
  SteeringProfileListResponseSchema,
  SuppressedTargetScopeSchema,
  SuppressedTargetSchema,
  CreateSuppressedTargetSchema,
  DeleteSuppressedTargetSchema,
  encodeSuppressedTargetCursor,
  decodeSuppressedTargetCursor,
  OperatorSuppressedTargetListQuerySchema,
  SuppressedTargetResponseSchema,
  SuppressedTargetListResponseSchema,
  SuppressedTargetDeleteResponseSchema,
  IssueNodeCredentialSchema,
  NodeCredentialResponseSchema,
  PruneNodeResponseSchema,
  OperatorNodeStatusSchema,
  OperatorNodeHeartbeatStateSchema,
  OperatorNodeRecordSchema,
  OperatorNodeCursorSchema,
  encodeOperatorNodeCursor,
  decodeOperatorNodeCursor,
  OperatorNodeListQuerySchema,
  OperatorNodeListResponseSchema,
  PriorityLaneSchema,
  EnqueueJobRequestSchema,
  OperatorJobIdSchema,
  OperatorJobStateSchema,
  OperatorJobRecordSchema,
  OperatorJobCursorSchema,
  encodeOperatorJobCursor,
  decodeOperatorJobCursor,
  OperatorJobListQuerySchema,
  OperatorJobListResponseSchema,
  UpdateJobRequestSchema,
  UpdateJobResponseSchema,
  RequeueJobRequestSchema,
  RequeueJobResponseSchema,
  DeleteJobRequestSchema,
  DeleteJobResponseSchema,
  encodeTakedownCursor,
  decodeTakedownCursor,
  VerifyTakedownRequestSchema,
  VerifyTakedownResponseSchema,
  DelegatedClaimRecordSchema,
  encodeDelegatedClaimCursor,
  decodeDelegatedClaimCursor,
  VerifyDelegatedClaimRequestSchema,
  VerifyDelegatedClaimResponseSchema,
  OperatorAppRecordSchema,
  OperatorAppListResponseSchema,
  OperatorAppListQuerySchema,
  SetAppDelegationRequestSchema,
  SetAppDelegationResponseSchema,
  CandidateStatusSchema,
  ReviewAppCandidateRequestSchema,
  ReviewAppCandidateResponseSchema,
  encodeOperatorAppCursor,
  decodeOperatorAppCursor,
  OperatorLeadListQuerySchema,
  OperatorCatalogListQuerySchema,
  encodeOperatorStagingCursor,
  decodeOperatorStagingCursor,
  OperatorStagingListQuerySchema,
  OperatorStagingListResponseSchema,
  OperatorStagingDecisionRequestSchema,
  OperatorVocabularyUpsertRequestSchema
} from "../src/protocol/operator.ts";
import {
  ModeratorRatingRecordSchema,
  encodeModeratorRatingCursor,
  decodeModeratorRatingCursor,
  ModeratorRatingListQuerySchema,
  ModeratorRatingListResponseSchema,
  SetRatingAdjustmentRequestSchema,
  SetRatingAdjustmentResponseSchema,
  ModeratorAppRecordSchema,
  ModeratorAppListQuerySchema,
  ModeratorAppListResponseSchema,
  ModeratorReviewAppCandidateRequestSchema,
  ModeratorReviewAppCandidateResponseSchema
} from "../src/protocol/moderator.ts";

describe("src-package wire protocols", () => {
  it("enforces 9 atomic platforms and rejects retired curated platform", () => {
    const valid = [
      "booth",
      "github",
      "vpm",
      "gumroad",
      "jinxxy",
      "itch",
      "shopify",
      "sellfy",
      "custom_domain"
    ] as const;
    expect(PlatformSchema.options).toEqual([...valid]);
    for (const platform of valid) {
      expect(PlatformSchema.parse(platform)).toBe(platform);
    }
    expect(PlatformSchema.safeParse("curated").success).toBe(false);
  });

  it("validates extended CatalogPackage, CatalogListingSource, CatalogRelation, and strict PackageFront schemas", () => {
    const now = "2026-10-01T12:00:00.000Z";
    const source = {
      sourceLinkId: "123e4567-e89b-12d3-a456-426614174000",
      sourceKey: "booth:12345",
      platform: "booth" as const,
      storefrontUrl: "https://booth.pm/ja/items/12345",
      evidenceKind: "vpm_id" as const,
      confidence: 1,
      reviewState: "accepted" as const,
      price: 1500,
      currency: "JPY",
      availability: "available" as const,
      observedAt: now,
      reviewedAt: null
    };
    const relation = {
      relationId: "123e4567-e89b-12d3-a456-426614174001",
      sourceCanonicalId: "pkg-123",
      targetCanonicalId: null,
      targetAvatarBase: "Kikyo",
      relationType: "compatible_with_avatar" as const,
      scope: "named_base" as const,
      confidence: 0.9,
      evidenceSource: "title_bracket",
      feedbackUpCount: 3,
      feedbackDownCount: 1
    };

    const minimalPkg = {
      canonicalId: "pkg-123",
      umbrella: "tools" as const,
      category: "vpm_tool",
      lifecycle: "active" as const,
      displayName: "My Tool",
      vpmId: null,
      createdAt: now,
      updatedAt: now
    };
    const parsedMinimal = CatalogPackageSchema.parse(minimalPkg);
    expect(parsedMinimal).toEqual({
      ...minimalPkg,
      ownerKey: null,
      ownerName: null,
      verificationStatus: "unverified",
      tags: [],
      qualityFlags: [],
      contentRating: "general",
      sources: [],
      relations: []
    });

    const fullPkg = {
      canonicalId: "pkg-123",
      umbrella: "tools" as const,
      category: "vpm_tool",
      lifecycle: "deleted" as const,
      displayName: "My Tool",
      ownerKey: "github:author-1",
      ownerName: "Author One",
      verificationStatus: "verified" as const,
      verifiedByAppId: "123e4567-e89b-12d3-a456-426614174002",
      vpmId: "com.author.tool",
      vpmLatestVersion: "1.2.3",
      vpmRepoUrl: "https://vpm.author.example/index.json",
      summary: "Functional tool summary",
      tags: ["avatar-setup", "physbones"],
      qualityFlags: ["missing_zip_sha256" as const],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      timestampConfidence: "confirmed" as const,
      contentRating: "sexual_suggestive" as const,
      sources: [source],
      relations: [relation]
    };
    expect(CatalogPackageSchema.parse(fullPkg)).toEqual(fullPkg);
    expect(VerificationStatusSchema.parse("unverified")).toBe("unverified");
    expect(CatalogQualityFlagSchema.parse("skeleton")).toBe("skeleton");
    expect(CatalogListingSourceSchema.parse(source)).toEqual(source);
    expect(CatalogRelationSchema.parse(relation)).toEqual(relation);

    expect(CatalogPackageSchema.safeParse({ ...minimalPkg, acceptedLinks: [] }).success).toBe(false);
    expect(CatalogPackageSchema.safeParse({ ...minimalPkg, fronts: [] }).success).toBe(false);
    expect(CatalogPackageSchema.safeParse({ ...minimalPkg, qualityFlags: ["invented_flag"] }).success).toBe(false);
    expect(CatalogListingSourceSchema.safeParse({ ...source, platform: "curated" }).success).toBe(false);
    expect(CatalogListingSourceSchema.safeParse({ ...source, storefrontUrl: "http://booth.pm/ja/items/12345" }).success).toBe(false);
    expect(CatalogRelationSchema.safeParse({ ...relation, relationType: "unknown_rel" }).success).toBe(false);

    const validFront = {
      frontId: "123e4567-e89b-12d3-a456-426614174000",
      canonicalId: "pkg-123",
      sourceKey: "booth:12345",
      platform: "booth" as const,
      storefrontUrl: "https://booth.pm/ja/items/12345",
      price: 1500,
      currency: "JPY",
      availability: "available" as const,
      observedAt: now
    };
    expect(PackageFrontSchema.parse(validFront)).toEqual(validFront);
    expect(PackageFrontSchema.safeParse({ ...validFront, frontId: "front-1" }).success).toBe(false);
    expect(PackageFrontSchema.safeParse({ ...validFront, observedAt: "not-a-timestamp" }).success).toBe(false);
    expect(PackageFrontSchema.safeParse({ ...validFront, extra: true }).success).toBe(false);
  });

  it("encodes and decodes catalog delta cursors", () => {
    const cursor = {
      updatedAt: "2026-10-01T12:00:00.000Z",
      canonicalId: "canonical-456"
    };
    const encoded = encodeCatalogDeltaCursor(cursor);
    expect(typeof encoded).toBe("string");
    const decoded = decodeCatalogDeltaCursor(encoded);
    expect(decoded).toEqual(cursor);

    expect(decodeCatalogDeltaCursor("invalid-cursor-token-xxx")).toBeNull();
  });

  it("encodes and decodes standard catalog page cursors", () => {
    const cursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      canonicalId: "canonical-789"
    };
    const encoded = encodeCatalogCursor(cursor);
    const decoded = decodeCatalogCursor(encoded);
    expect(decoded).toEqual(cursor);
  });

  it("validates public catalog paging and rejects unusable continuation tokens", () => {
    const cursor = encodeCatalogCursor({ createdAt: "2026-10-01T12:00:00.000Z", canonicalId: "pkg-1" });
    expect(PublicCatalogListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(PublicCatalogListQuerySchema.parse({ limit: 100, cursor })).toEqual({ limit: 100, cursor });
    const page = { schemaVersion: 1 as const, packages: [], nextCursor: cursor };
    expect(PublicCatalogListResponseSchema.parse(page)).toEqual(page);
    expect(PublicCatalogListResponseSchema.parse({ ...page, nextCursor: null }).nextCursor).toBeNull();
    for (const invalid of ["", "bad/cursor", btoa("{}"), cursor + "=",
      btoa(JSON.stringify({ createdAt: "not-a-date", canonicalId: "pkg-1" }))]) {
      expect(PublicCatalogListQuerySchema.safeParse({ cursor: invalid }).success).toBe(false);
      expect(PublicCatalogListResponseSchema.safeParse({ ...page, nextCursor: invalid }).success).toBe(false);
    }
  });

  it("validates CatalogSearchRequest and enforces queryOrigin with optional rating", () => {
    const req = {
      schemaVersion: 1,
      query: "avatar clothes",
      queryOrigin: "user_authored" as const,
      rating: "mature" as const,
      limit: 20
    };
    const parsed = CatalogSearchRequestSchema.parse(req);
    expect(parsed.queryOrigin).toBe("user_authored");
    expect(parsed.rating).toBe("mature");
    expect(CatalogSearchRequestSchema.safeParse({ ...req, platform: "curated" }).success).toBe(false);
  });

  it("validates ReportSubmissionRequest as a strict 4-branch discriminated union", () => {
    expect(ConsolidatedReportTypeSchema.options).toEqual([
      "demand_signal",
      "relationship_feedback",
      "issue_report",
      "removal_request"
    ]);

    const removal = {
      schemaVersion: 1 as const,
      reportType: "removal_request" as const,
      canonicalId: "pkg-123",
      reason: "Incorrect attribution"
    };
    expect(RemovalReportRequestSchema.safeParse(removal).success).toBe(true);
    expect(ReportSubmissionRequestSchema.safeParse(removal).success).toBe(true);
    expect(ReportSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      reportType: "removal_request",
      targetUrl: "https://booth.pm/ja/items/12345",
      reason: "Creator request"
    }).success).toBe(true);
    expect(ReportSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      reportType: "removal_request",
      reason: "Missing target"
    }).success).toBe(false);
    for (const invalid of [
      { ...removal, reason: "" },
      { ...removal, reason: "   " },
      { ...removal, reason: undefined },
      { ...removal, signalKind: "refresh_demand" },
      { ...removal, reportKind: "broken_link" },
      { ...removal, query: "search" },
      { ...removal, zeroHits: true },
      { ...removal, extra: true }
    ]) {
      expect(RemovalReportRequestSchema.safeParse(invalid).success).toBe(false);
      expect(ReportSubmissionRequestSchema.safeParse(invalid).success).toBe(false);
    }

    const feedbackByCanonical = {
      schemaVersion: 1 as const,
      reportType: "relationship_feedback" as const,
      canonicalId: "pkg-outfit-1",
      relatedCanonicalId: "pkg-avatar-1",
      relationType: "compatible_with_avatar" as const,
      vote: "up" as const,
      reason: "Confirmed fit on Kikyo v1.2"
    };
    const feedbackByAvatar = {
      schemaVersion: 1 as const,
      reportType: "relationship_feedback" as const,
      canonicalId: "pkg-outfit-1",
      targetAvatarBase: "Kikyo",
      relationType: "compatible_with_avatar" as const,
      vote: "down" as const
    };
    expect(RelationshipFeedbackReportRequestSchema.parse(feedbackByCanonical)).toEqual(feedbackByCanonical);
    expect(ReportSubmissionRequestSchema.parse(feedbackByCanonical)).toEqual(feedbackByCanonical);
    expect(ReportSubmissionRequestSchema.parse(feedbackByAvatar)).toEqual(feedbackByAvatar);
    // Target requirement (relatedCanonicalId or targetAvatarBase) is enforced on ReportSubmissionRequestSchema
    expect(ReportSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      reportType: "relationship_feedback",
      canonicalId: "pkg-outfit-1",
      relationType: "compatible_with_avatar",
      vote: "up"
    }).success).toBe(false);
    for (const invalid of [
      { ...feedbackByCanonical, canonicalId: "   " },
      { ...feedbackByCanonical, vote: "neutral" },
      { ...feedbackByCanonical, relationType: "unknown_relation" },
      { ...feedbackByCanonical, reportKind: "broken_link" },
      { ...feedbackByCanonical, extra: true }
    ]) {
      expect(RelationshipFeedbackReportRequestSchema.safeParse(invalid).success).toBe(false);
      expect(ReportSubmissionRequestSchema.safeParse(invalid).success).toBe(false);
    }

    const demand = {
      schemaVersion: 1 as const,
      reportType: "demand_signal" as const,
      signalKind: "search_miss" as const,
      query: "missing package",
      zeroHits: true
    };
    expect(() => DemandSignalReportRequestSchema.parse(demand)).not.toThrow();
    expect(() => ReportSubmissionRequestSchema.parse(demand)).not.toThrow();
    for (const invalid of [
      { ...demand, reportKind: "broken_link" },
      { ...demand, extra: true }
    ]) {
      expect(DemandSignalReportRequestSchema.safeParse(invalid).success).toBe(false);
      expect(ReportSubmissionRequestSchema.safeParse(invalid).success).toBe(false);
    }

    const issue = {
      schemaVersion: 1 as const,
      reportType: "issue_report" as const,
      reportKind: "broken_link" as const,
      targetUrl: "https://example.com/broken",
      canonicalId: "pkg-123"
    };
    expect(() => IssueReportRequestSchema.parse(issue)).not.toThrow();
    expect(() => ReportSubmissionRequestSchema.parse(issue)).not.toThrow();

    const falsePositive = {
      schemaVersion: 1 as const,
      reportType: "issue_report" as const,
      reportKind: "explicit_false_positive" as const,
      canonicalId: "pkg-safe-model",
      reason: "Safe avatar asset flagged incorrectly as explicit"
    };
    expect(() => ReportSubmissionRequestSchema.parse(falsePositive)).not.toThrow();

    const falseNegative = {
      schemaVersion: 1 as const,
      reportType: "issue_report" as const,
      reportKind: "explicit_false_negative" as const,
      targetUrl: "https://booth.pm/ja/items/999999",
      reason: "Unrated asset contains unflagged explicit adult content"
    };
    expect(() => ReportSubmissionRequestSchema.parse(falseNegative)).not.toThrow();

    for (const invalid of [
      { schemaVersion: 1, reportType: "issue_report", canonicalId: "pkg-123" },
      { ...issue, signalKind: "search_miss" },
      { ...issue, query: "missing package" },
      { ...issue, zeroHits: true },
      { ...issue, reportKind: "unauthorized_kind" },
      { ...issue, extra: true }
    ]) {
      expect(IssueReportRequestSchema.safeParse(invalid).success).toBe(false);
      expect(ReportSubmissionRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("encodes, decodes, and validates operator cursors", () => {
    const leadCursor = {
      status: "pending_review" as const,
      firstSeenAt: "2026-10-01T12:00:00.000Z",
      leadKey: "a".repeat(64)
    };
    const encLead = encodeLeadCursor(leadCursor);
    expect(decodeLeadCursor(encLead)).toEqual(leadCursor);
    expect(decodeLeadCursor("invalid-lead-cursor")).toBeNull();
    expect(decodeLeadCursor(encLead, "pending_review")).toEqual(leadCursor);
    expect(decodeLeadCursor(encLead, "rejected")).toBeNull();

    const profileCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      profileId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encProfile = encodeSteeringProfileCursor(profileCursor);
    expect(decodeSteeringProfileCursor(encProfile)).toEqual(profileCursor);
    expect(decodeSteeringProfileCursor("invalid-profile-cursor")).toBeNull();

    const suppressedCursor = {
      suppressedAt: "2026-10-01T12:00:00.000Z",
      target: "spam.example"
    };
    const encSuppressed = encodeSuppressedTargetCursor(suppressedCursor);
    expect(decodeSuppressedTargetCursor(encSuppressed)).toEqual(suppressedCursor);
    expect(decodeSuppressedTargetCursor("invalid-suppressed-cursor")).toBeNull();

    const takedownCursor = {
      recordedAt: "2026-10-01T12:00:00.000Z",
      takedownId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encTakedown = encodeTakedownCursor(takedownCursor);
    expect(decodeTakedownCursor(encTakedown)).toEqual(takedownCursor);
    expect(decodeTakedownCursor("invalid-takedown-cursor")).toBeNull();
  });

  it("rejects lead cursors that cannot be used by the coordinator", () => {
    const key = "a".repeat(64);
    for (const invalid of [
      { leadKey: key },
      { leadKey: key, lastSeenAt: "2026-10-01T12:00:00.000Z" },
      { leadKey: key, firstSeenAt: "2026-10-01T12:00:00.000Z" },
      { leadKey: key, status: "pending_review", firstSeenAt: "not-a-date" },
      { leadKey: key, status: "pending_review", firstSeenAt: "2026-10-01T12:00:00.000Z", extra: true }
    ]) {
      expect(LeadCursorSchema.safeParse(invalid).success).toBe(false);
      const encoded = btoa(JSON.stringify(invalid)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      expect(decodeLeadCursor(encoded, "pending_review")).toBeNull();
    }
  });

  it("validates unified SteeringProfile create, record, update, and action schemas", () => {
    expect(HostMatchModeSchema.options).toEqual(["exact", "wildcard_subdomain", "any_vpm_https"]);
    expect(QueryModeSchema.options).toEqual(["none", "exact", "pagination"]);

    const baseExact = {
      schemaVersion: 1 as const,
      platform: "booth" as const,
      hostMatchMode: "exact" as const,
      hostPattern: "booth.pm",
      pathScope: "/ja/items/",
      queryMode: "none" as const,
      method: "GET" as const,
      purpose: "metadata" as const,
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Reviewed metadata",
      retainClasses: ["normalized_facts" as const],
      publishClasses: [] as ("normalized_facts" | "creator_prose" | "raw_payload" | "media_metadata")[]
    };
    const parsedCreate = CreateSteeringProfileSchema.parse(baseExact);
    expect(parsedCreate.autoPromote).toBe(false);
    expect(parsedCreate.recrawlIntervalMs).toBe(21_600_000);
    expect(parsedCreate.maxPaginationDepth).toBe(5);

    expect(CreateSteeringProfileSchema.safeParse({
      ...baseExact,
      platform: "vpm",
      hostMatchMode: "any_vpm_https",
      hostPattern: "*",
      pathScope: "/index.json",
      purpose: "discovery",
      autoPromote: true
    }).success).toBe(true);

    expect(CreateSteeringProfileSchema.safeParse({
      ...baseExact,
      hostMatchMode: "wildcard_subdomain",
      hostPattern: "*.booth.pm",
      pathScope: "/ja/browse/",
      queryMode: "pagination",
      queryScope: "page,sort",
      purpose: "discovery"
    }).success).toBe(true);

    expect(CreateSteeringProfileSchema.safeParse({
      ...baseExact,
      pathScope: "/ja/items",
      queryMode: "exact",
      queryScope: "page=1&sort=new"
    }).success).toBe(true);

    expect(CreateSteeringProfileSchema.safeParse({
      ...baseExact,
      pathScope: "/ja/%E3%81%82"
    }).success).toBe(true);

    for (const invalid of [
      { ...baseExact, platform: "curated" },
      { ...baseExact, hostMatchMode: "any_vpm_https", hostPattern: "*" }, // platform !== "vpm"
      { ...baseExact, platform: "vpm", hostMatchMode: "any_vpm_https", hostPattern: "vpm.example" },
      { ...baseExact, hostMatchMode: "wildcard_subdomain", hostPattern: "booth.pm" },
      { ...baseExact, hostMatchMode: "wildcard_subdomain", hostPattern: "*.localhost" },
      { ...baseExact, hostMatchMode: "wildcard_subdomain", hostPattern: "*.sub.localhost" },
      { ...baseExact, hostMatchMode: "wildcard_subdomain", hostPattern: "*.127.0.0.1" },
      { ...baseExact, hostMatchMode: "wildcard_subdomain", hostPattern: "*.Booth.pm" },
      { ...baseExact, hostPattern: "https://booth.pm" },
      { ...baseExact, hostPattern: "booth.pm:8443" },
      { ...baseExact, hostPattern: "*.booth.pm" },
      { ...baseExact, hostPattern: "localhost" },
      { ...baseExact, hostPattern: "sub.localhost" },
      { ...baseExact, hostPattern: "127.0.0.1" },
      { ...baseExact, hostPattern: "8.8.8.8" },
      { ...baseExact, hostPattern: "[::1]" },
      { ...baseExact, hostPattern: "::1" },
      { ...baseExact, hostPattern: "Booth.pm" },
      { ...baseExact, hostPattern: "0x7f.1" },
      { ...baseExact, pathScope: "/ja/items/*" },
      { ...baseExact, pathScope: "ja/items/" },
      { ...baseExact, pathScope: "/ja//items/" },
      { ...baseExact, pathScope: "/ja/../items/" },
      { ...baseExact, pathScope: "/ja/%2Fitems" },
      { ...baseExact, pathScope: "/ja/%2E" },
      { ...baseExact, pathScope: "/ja/%e3%81%82" },
      { ...baseExact, pathScope: "/ja/%FF" },
      { ...baseExact, pathScope: "/ja/%E3%81%82/" },
      { ...baseExact, queryMode: "none", queryScope: "page=1" },
      { ...baseExact, queryMode: "exact", queryScope: "page=1" }, // directory + exact query disallowed
      { ...baseExact, pathScope: "/ja/items", queryMode: "exact", queryScope: "page" },
      { ...baseExact, pathScope: "/ja/items", queryMode: "exact", queryScope: "page=1&next=%2F" },
      { ...baseExact, pathScope: "/ja/items", queryMode: "exact", queryScope: null },
      { ...baseExact, queryMode: "pagination", queryScope: null },
      { ...baseExact, queryMode: "pagination", queryScope: "page=1&next=%2F" },
      { ...baseExact, queryMode: "pagination", queryScope: "page," },
      { ...baseExact, retainClasses: [] },
      { ...baseExact, retainClasses: ["normalized_facts", "normalized_facts"] },
      { ...baseExact, publishClasses: ["normalized_facts", "normalized_facts"] },
      { ...baseExact, publishClasses: ["creator_prose"] },
      { ...baseExact, recrawlIntervalMs: 59_999 },
      { ...baseExact, maxPaginationDepth: 51 }
    ]) {
      expect(CreateSteeringProfileSchema.safeParse(invalid).success).toBe(false);
    }

    const storedProfile = {
      profileId: "123e4567-e89b-12d3-a456-426614174000",
      platform: "booth" as const,
      hostMatchMode: "exact" as const,
      hostPattern: "booth.pm",
      pathScope: "/ja/items/",
      queryMode: "none" as const,
      queryScope: null,
      method: "GET" as const,
      purpose: "metadata" as const,
      autoPromote: false,
      recrawlIntervalMs: 21_600_000,
      minDelayMs: 2000,
      maxPaginationDepth: 5,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Reviewed metadata",
      retainClasses: ["normalized_facts" as const],
      publishClasses: [],
      createdAt: "2026-10-01T10:00:00.000Z",
      disabledAt: null
    };
    expect(SteeringProfileSchema.parse(storedProfile)).toEqual(storedProfile);
    expect(SteeringProfileSchema.safeParse({ ...storedProfile, schemaVersion: 1 }).success).toBe(false);

    expect(SteeringProfileResponseSchema.parse({ schemaVersion: 1, profile: storedProfile }).profile.profileId)
      .toBe(storedProfile.profileId);
    expect(SteeringProfileListResponseSchema.parse({ schemaVersion: 1, profiles: [storedProfile], nextCursor: null }).profiles)
      .toHaveLength(1);
    expect(OperatorSteeringProfileListQuerySchema.parse({})).toEqual({ limit: 100 });

    expect(UpdateSteeringProfileSchema.safeParse({
      schemaVersion: 1,
      autoPromote: true,
      minDelayMs: 3000,
      reason: "Enable auto-promotion"
    }).success).toBe(true);
    expect(UpdateSteeringProfileSchema.safeParse({ schemaVersion: 1, reason: "Nothing updated" }).success).toBe(false);
    expect(UpdateSteeringProfileSchema.safeParse({
      schemaVersion: 1,
      hostMatchMode: "exact",
      reason: "Missing hostPattern"
    }).success).toBe(false);

    expect(SteeringProfileActionSchema.parse({ schemaVersion: 1, reason: "Kill-switch engaged" }).reason)
      .toBe("Kill-switch engaged");
    expect(SteeringProfileDeleteResponseSchema.parse({
      schemaVersion: 1,
      profileId: storedProfile.profileId,
      status: "deleted"
    }).status).toBe("deleted");
  });

  it("validates SuppressedTarget CRUD and SuppressLeadDomain schemas", () => {
    expect(SuppressedTargetScopeSchema.options).toEqual(["url", "origin", "domain"]);

    expect(CreateSuppressedTargetSchema.safeParse({
      schemaVersion: 1,
      target: "https://booth.pm/ja/items/12345",
      scope: "url",
      reason: "Creator requested exclusion"
    }).success).toBe(true);
    expect(CreateSuppressedTargetSchema.safeParse({
      schemaVersion: 1,
      target: "https://spam.example",
      scope: "origin",
      reason: "Blocked origin"
    }).success).toBe(true);
    expect(CreateSuppressedTargetSchema.safeParse({
      schemaVersion: 1,
      target: "spam.example",
      scope: "domain",
      reason: "Blocked domain"
    }).success).toBe(true);

    for (const invalid of [
      { schemaVersion: 1, target: "http://booth.pm/ja/items/12345", scope: "url", reason: "Bad scheme" },
      { schemaVersion: 1, target: "https://localhost/item", scope: "url", reason: "Localhost" },
      { schemaVersion: 1, target: "https://spam.example/", scope: "origin", reason: "Trailing slash" },
      { schemaVersion: 1, target: "https://spam.example:8443", scope: "origin", reason: "Port disallowed" },
      { schemaVersion: 1, target: "https://127.0.0.1", scope: "origin", reason: "IP disallowed" },
      { schemaVersion: 1, target: "https://spam.example", scope: "domain", reason: "Scheme disallowed" },
      { schemaVersion: 1, target: "spam.example/path", scope: "domain", reason: "Slash disallowed" },
      { schemaVersion: 1, target: "localhost", scope: "domain", reason: "Localhost disallowed" },
      { schemaVersion: 1, target: "127.0.0.1", scope: "domain", reason: "IP disallowed" }
    ]) {
      expect(CreateSuppressedTargetSchema.safeParse(invalid).success).toBe(false);
    }

    const stored = {
      target: "spam.example",
      scope: "domain" as const,
      reason: "Blocked domain",
      suppressedAt: "2026-10-01T10:00:00.000Z"
    };
    expect(SuppressedTargetSchema.parse(stored)).toEqual(stored);
    expect(SuppressedTargetResponseSchema.parse({ schemaVersion: 1, suppressedTarget: stored }).suppressedTarget).toEqual(stored);
    expect(SuppressedTargetListResponseSchema.parse({ schemaVersion: 1, targets: [stored], nextCursor: null }).targets)
      .toHaveLength(1);
    expect(OperatorSuppressedTargetListQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(DeleteSuppressedTargetSchema.parse({ schemaVersion: 1, target: "spam.example", reason: "Appeal approved" }).target)
      .toBe("spam.example");
    expect(SuppressedTargetDeleteResponseSchema.parse({ schemaVersion: 1, target: "spam.example", status: "deleted" }).status)
      .toBe("deleted");

    const parsedSuppressLead = SuppressLeadDomainRequestSchema.parse({
      schemaVersion: 1,
      targetHost: "spam.example",
      reason: "Non-VRChat storefront"
    });
    expect(parsedSuppressLead.rejectPendingLeads).toBe(true);
    expect(SuppressLeadDomainRequestSchema.safeParse({
      schemaVersion: 1,
      targetHost: "https://spam.example",
      reason: "Bad host"
    }).success).toBe(false);
    expect(SuppressLeadDomainResponseSchema.parse({
      schemaVersion: 1,
      targetHost: "spam.example",
      scope: "domain",
      rejectedLeadCount: 14
    }).rejectedLeadCount).toBe(14);
  });

  it("rejects manual capabilities on node issuance and validates NODE_TOKEN_REGEX responses", () => {
    expect(IssueNodeCredentialSchema.safeParse({
      schemaVersion: 1,
      nodeId: "primary-node",
      reason: "Primary production worker"
    }).success).toBe(true);
    expect(IssueNodeCredentialSchema.safeParse({
      schemaVersion: 1,
      nodeId: "primary-node",
      capabilities: ["vpm"],
      reason: "Manual capabilities rejected"
    }).success).toBe(false);

    const response = {
      schemaVersion: 1,
      nodeId: "fixture-node",
      capabilities: ["vpm"],
      token: "vrcp_" + "0".repeat(64) + "01ff"
    };
    expect(NodeCredentialResponseSchema.safeParse(response).success).toBe(true);
    for (const nodeId of ["", "node with spaces", "x".repeat(101), ".", "..", "../node"]) {
      expect(NodeCredentialResponseSchema.safeParse({ ...response, nodeId }).success).toBe(false);
    }
    for (const capabilities of [[], Array(10).fill("vpm"), ["curated"], ["unknown"]]) {
      expect(NodeCredentialResponseSchema.safeParse({ ...response, capabilities }).success).toBe(false);
    }
    expect(NodeCredentialResponseSchema.safeParse({ ...response, extra: true }).success).toBe(false);
    expect(NodeCredentialResponseSchema.safeParse({ ...response, token: "vrcp_invalid" }).success).toBe(false);
    expect(NodeCredentialResponseSchema.safeParse({ ...response, token: "vrcp_" + "0".repeat(64) }).success).toBe(false);
  });

  it("validates coordinator status, dev system purge, init, and lead bulk schemas", () => {
    expect(InitializeCoordinatorRequestSchema.safeParse({ schemaVersion: 1 }).success).toBe(true);
    expect(InitializeCoordinatorRequestSchema.safeParse({ schemaVersion: 1, autoSeed: false }).success).toBe(true);
    expect(InitializeCoordinatorRequestSchema.safeParse({ schemaVersion: 1, autoSeed: true }).success).toBe(false);
    expect(InitializeCoordinatorRequestSchema.safeParse({ schemaVersion: 1, extra: true }).success).toBe(false);
    expect(InitializeCoordinatorResponseSchema.safeParse({
      schemaVersion: 1,
      status: "ok",
      message: "Schema initialized",
      autoSeed: false
    }).success).toBe(true);
    expect(InitializeCoordinatorResponseSchema.safeParse({
      schemaVersion: 1,
      status: "ok",
      message: "Schema initialized",
      autoSeed: true
    }).success).toBe(false);

    const statusPayload = {
      schemaVersion: 1 as const,
      environment: "development" as const,
      purgeEnabled: true,
      d1SchemaState: "v0-17" as const,
      queueReadiness: {
        claimableJobs: 5,
        blockedJobs: 2,
        pendingLeads: 8,
        unresolvedDemandSignals: 3,
        activeNodes: 1,
        activeSteeringProfiles: 4
      }
    };
    expect(OperatorStatusResponseSchema.parse(statusPayload)).toEqual(statusPayload);
    expect(OperatorStatusResponseSchema.safeParse({ ...statusPayload, environment: "staging" }).success).toBe(false);
    expect(OperatorStatusResponseSchema.safeParse({ ...statusPayload, d1SchemaState: "v0-26" }).success).toBe(false);

    const purgeParsed = SystemPurgeRequestSchema.parse({
      schemaVersion: 1,
      confirm: "PURGE_DEVELOPMENT_D1"
    });
    expect(purgeParsed.preserveNodes).toBe(true);
    expect(purgeParsed.seedPreviewStarter).toBe(false);
    expect(SystemPurgeRequestSchema.safeParse({ schemaVersion: 1, confirm: "PURGE_PRODUCTION" }).success).toBe(false);
    expect(SystemPurgeResponseSchema.parse({
      schemaVersion: 1,
      status: "purged",
      d1SchemaState: "v0-17",
      preservedNodes: 2,
      seededProfiles: 0
    }).status).toBe("purged");

    const wireLead = {
      lead_key: "a".repeat(64),
      kind: "vpm_listing" as const,
      target_url: "https://publisher.example/index.json",
      target_host: "publisher.example",
      claimed_package_id: null,
      discovered_from_url: "https://directory.example/catalog",
      discovered_from_item_key: null,
      status: "pending_review" as const,
      first_seen_at: "2026-10-04T00:00:00.000Z",
      last_seen_at: "2026-10-04T00:00:00.000Z"
    };
    expect(LeadRowSchema.parse(wireLead)).toEqual(wireLead);
    for (const input of [
      { ...wireLead, leadKey: wireLead.lead_key },
      { ...wireLead, target_host: undefined },
      { ...wireLead, target_host: "" },
      { ...wireLead, extra: true },
      { ...wireLead, kind: "unknown_kind" },
      { ...wireLead, discovered_from_url: undefined },
      { ...wireLead, discovered_from_url: null }
    ]) {
      expect(LeadRowSchema.safeParse(input).success).toBe(false);
    }
    for (const schema of [ApproveLeadSchema, RejectLeadSchema]) {
      expect(schema.safeParse({ schemaVersion: 1 }).success).toBe(false);
    }
    expect(() => ApproveLeadSchema.parse({
      schemaVersion: 1,
      minDelayMs: 2000,
      reason: "Valid lead approved"
    })).not.toThrow();
    expect(() => RejectLeadSchema.parse({
      schemaVersion: 1,
      reason: "Irrelevant content"
    })).not.toThrow();

    expect(BulkApproveLeadsRequestSchema.parse({
      schemaVersion: 1,
      leadKeys: ["a".repeat(64)],
      priorityLane: 1,
      reason: "Approve VPM batch"
    }).priorityLane).toBe(1);
    expect(BulkApproveLeadsRequestSchema.safeParse({
      schemaVersion: 1,
      leadKeys: [],
      reason: "Empty"
    }).success).toBe(false);
    expect(BulkApproveLeadsResponseSchema.parse({
      schemaVersion: 1,
      approved: [{ leadKey: "a".repeat(64), jobId: "job-1" }],
      skipped: []
    }).approved).toHaveLength(1);
  });

  it("validates operator node prune and takedown schemas", () => {
    expect(() => PruneNodeResponseSchema.parse({
      schemaVersion: 1,
      nodeId: "primary-node",
      status: "pruned"
    })).not.toThrow();

    expect(PruneNodeResponseSchema.safeParse({
      schemaVersion: 1,
      nodeId: "primary-node",
      status: "revoked"
    }).success).toBe(false);

    expect(PruneNodeResponseSchema.safeParse({
      schemaVersion: 1,
      nodeId: "primary-node",
      status: "pruned",
      extra: true
    }).success).toBe(false);

    expect(() => VerifyTakedownRequestSchema.parse({
      schemaVersion: 1,
      verdict: "accepted",
      notes: "Proof verified in bio"
    })).not.toThrow();

    expect(() => VerifyTakedownResponseSchema.parse({
      schemaVersion: 1,
      takedownId: "123e4567-e89b-12d3-a456-426614174000",
      status: "accepted",
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();
  });

  it("validates delegated creator claim attestation and verification schemas", () => {
    const validAttestation = {
      appId: "123e4567-e89b-12d3-a456-426614174000",
      action: "creator_ownership_claim" as const,
      frontUrl: "https://creator.booth.pm",
      creatorId: "booth_creator_123",
      challengeToken: "vrcp_chal_0123456789abcdef",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      nonce: "nonce_abcdef0123456789"
    };
    expect(() => CreatorDelegationAttestationSchema.parse(validAttestation)).not.toThrow();

    const claimRequest = {
      schemaVersion: 1,
      attestation: validAttestation,
      signature: "sig_abc123456789",
      reason: "Creator requested storefront claim",
      contactEmail: "creator@example.com"
    };
    expect(() => CreatorClaimIntakeRequestSchema.parse(claimRequest)).not.toThrow();

    const claimResponse = {
      schemaVersion: 1,
      status: "accepted" as const,
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      reviewStatus: "pending" as const,
      recordedAt: new Date().toISOString()
    };
    expect(() => CreatorClaimIntakeResponseSchema.parse(claimResponse)).not.toThrow();

    const claimRecord = {
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      appId: "123e4567-e89b-12d3-a456-426614174000",
      action: "creator_ownership_claim" as const,
      frontUrl: "https://creator.booth.pm",
      creatorId: "booth_creator_123",
      challengeToken: "vrcp_chal_0123456789abcdef",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      nonce: "nonce_abcdef0123456789",
      signature: "sig_abc123456789",
      reason: "Creator requested storefront claim",
      contactEmail: "creator@example.com",
      reviewStatus: "pending" as const,
      reviewNotes: null,
      recordedAt: "2026-10-01T12:00:00.000Z"
    };
    expect(() => DelegatedClaimRecordSchema.parse(claimRecord)).not.toThrow();

    const claimCursor = {
      recordedAt: "2026-10-01T12:00:00.000Z",
      claimId: "123e4567-e89b-12d3-a456-426614174001"
    };
    const encClaimCursor = encodeDelegatedClaimCursor(claimCursor);
    expect(decodeDelegatedClaimCursor(encClaimCursor)).toEqual(claimCursor);
    expect(decodeDelegatedClaimCursor("invalid-cursor")).toBeNull();

    expect(() => VerifyDelegatedClaimRequestSchema.parse({
      schemaVersion: 1,
      verdict: "accepted",
      notes: "Attestation signature and storefront check verified"
    })).not.toThrow();

    expect(() => VerifyDelegatedClaimResponseSchema.parse({
      schemaVersion: 1,
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      status: "accepted",
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();
  });

  it("validates operator and moderator app delegation and candidate review schemas", () => {
    const appRecord = {
      appId: "123e4567-e89b-12d3-a456-426614174002",
      appName: "Creator Companion App",
      contactEmail: "contact@companion.test",
      permissions: ["catalog:read", "catalog:search", "demand:feedback"],
      delegationAllowed: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      revokedAt: null
    };
    expect(() => OperatorAppRecordSchema.parse(appRecord)).not.toThrow();
    expect(() => OperatorAppListResponseSchema.parse({
      schemaVersion: 1,
      apps: [appRecord],
      nextCursor: null
    })).not.toThrow();

    const appCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      appId: "123e4567-e89b-12d3-a456-426614174002"
    };
    const encAppCursor = encodeOperatorAppCursor(appCursor);
    expect(decodeOperatorAppCursor(encAppCursor)).toEqual(appCursor);
    expect(decodeOperatorAppCursor("invalid-cursor")).toBeNull();

    expect(() => SetAppDelegationRequestSchema.parse({
      schemaVersion: 1,
      delegationAllowed: true,
      reason: "Approved trusted app"
    })).not.toThrow();

    expect(() => SetAppDelegationResponseSchema.parse({
      schemaVersion: 1,
      appId: "123e4567-e89b-12d3-a456-426614174002",
      delegationAllowed: true,
      permissions: ["catalog:read", "catalog:search", "demand:feedback", "claims:delegate"],
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();

    expect(CandidateStatusSchema.parse("review_pending")).toBe("review_pending");
    expect(CandidateStatusSchema.parse("trusted")).toBe("trusted");
    expect(() => CandidateStatusSchema.parse("invalid_status")).toThrow();

    const appWithCandidate = {
      appId: "123e4567-e89b-12d3-a456-426614174003",
      appName: "High Traffic Service",
      permissions: ["catalog:read", "catalog:search"],
      delegationAllowed: false,
      requestCount: 150,
      lastActiveAt: "2026-10-01T15:00:00.000Z",
      candidateStatus: "review_pending" as const,
      candidateFlags: ["intensive_usage", "high_frequency_api"],
      createdAt: "2026-10-01T10:00:00.000Z",
      revokedAt: null
    };
    const parsedApp = OperatorAppRecordSchema.parse(appWithCandidate);
    expect(parsedApp.requestCount).toBe(150);
    expect(parsedApp.candidateStatus).toBe("review_pending");
    expect(parsedApp.candidateFlags).toContain("intensive_usage");
    expect(ModeratorAppRecordSchema.parse(appWithCandidate)).toEqual(parsedApp);

    const legacyApp = {
      appId: "123e4567-e89b-12d3-a456-426614174004",
      appName: "Legacy App",
      permissions: ["catalog:read"],
      delegationAllowed: false,
      createdAt: "2026-10-01T10:00:00.000Z",
      revokedAt: null
    };
    const parsedLegacy = OperatorAppRecordSchema.parse(legacyApp);
    expect(parsedLegacy.requestCount).toBe(0);
    expect(parsedLegacy.candidateStatus).toBe("none");
    expect(parsedLegacy.candidateFlags).toEqual([]);

    expect(() => OperatorAppListQuerySchema.parse({
      candidateStatus: "review_pending",
      limit: 10
    })).not.toThrow();

    expect(OperatorAppListQuerySchema.safeParse({ limit: "10" }).success).toBe(false);

    expect(() => ModeratorAppListQuerySchema.parse({
      candidateStatus: "trusted",
      limit: 50
    })).not.toThrow();
    for (const badLimit of ["50", "abc", 0, 101, 1.5]) {
      expect(ModeratorAppListQuerySchema.safeParse({ limit: badLimit }).success).toBe(false);
    }
    expect(() => UserAppListQuerySchema.parse({ limit: 25 })).not.toThrow();
    for (const badLimit of ["25", "abc", 0, 101, 1.5]) {
      expect(UserAppListQuerySchema.safeParse({ limit: badLimit }).success).toBe(false);
    }
    expect(() => ModeratorAppListResponseSchema.parse({
      schemaVersion: 1,
      apps: [appWithCandidate],
      nextCursor: encAppCursor
    })).not.toThrow();

    const operatorReviewReq = {
      schemaVersion: 1,
      candidateStatus: "trusted" as const,
      grantDelegation: true,
      notes: "App has passed high-volume review and verified creator checks"
    };
    expect(() => ReviewAppCandidateRequestSchema.parse(operatorReviewReq)).not.toThrow();

    const operatorReviewResp = {
      schemaVersion: 1,
      appId: "123e4567-e89b-12d3-a456-426614174003",
      candidateStatus: "trusted" as const,
      candidateFlags: ["intensive_usage"],
      delegationAllowed: true,
      permissions: ["catalog:read", "catalog:search", "claims:delegate"],
      reviewedAt: "2026-10-01T16:00:00.000Z"
    };
    expect(() => ReviewAppCandidateResponseSchema.parse(operatorReviewResp)).not.toThrow();
    expect(ModeratorReviewAppCandidateRequestSchema.safeParse(operatorReviewReq).success).toBe(false);
    expect(ModeratorReviewAppCandidateRequestSchema.safeParse({
      schemaVersion: 1,
      candidateStatus: "reviewed",
      grantDelegation: true
    }).success).toBe(false);
    expect(() => ModeratorReviewAppCandidateRequestSchema.parse({
      schemaVersion: 1,
      candidateStatus: "reviewed",
      notes: "Recommend for operator check"
    })).not.toThrow();
    expect(() => ModeratorReviewAppCandidateResponseSchema.parse(operatorReviewResp)).not.toThrow();
  });

  it("validates moderator content rating schemas", () => {
    const ratingRecord = {
      canonicalId: "pkg-12345",
      displayName: "Sample Asset",
      currentRating: "mature" as const,
      umbrella: "assets" as const,
      category: "props",
      reportCount: 2,
      updatedAt: "2026-10-01T12:00:00.000Z"
    };
    expect(() => ModeratorRatingRecordSchema.parse(ratingRecord)).not.toThrow();
    expect(ModeratorRatingRecordSchema.safeParse({ ...ratingRecord, umbrella: "invalid" }).success).toBe(false);

    const moderatorCursor = {
      updatedAt: "2026-10-01T12:00:00.000Z",
      canonicalId: "pkg-12345"
    };
    const encModCursor = encodeModeratorRatingCursor(moderatorCursor);
    expect(decodeModeratorRatingCursor(encModCursor)).toEqual(moderatorCursor);
    expect(decodeModeratorRatingCursor("invalid-mod-cursor")).toBeNull();

    expect(() => ModeratorRatingListQuerySchema.parse({
      rating: "mature",
      limit: 20,
      cursor: encModCursor
    })).not.toThrow();
    for (const badLimit of ["20", "abc", 0, 101, 1.5]) {
      expect(ModeratorRatingListQuerySchema.safeParse({ limit: badLimit }).success).toBe(false);
    }

    expect(() => ModeratorRatingListResponseSchema.parse({
      schemaVersion: 1,
      ratings: [ratingRecord],
      nextCursor: encModCursor
    })).not.toThrow();

    expect(() => SetRatingAdjustmentRequestSchema.parse({
      schemaVersion: 1,
      newRating: "adult_restricted",
      reason: "Verified adult content elements"
    })).not.toThrow();

    expect(() => SetRatingAdjustmentResponseSchema.parse({
      schemaVersion: 1,
      canonicalId: "pkg-12345",
      previousRating: "mature",
      newRating: "adult_restricted",
      adjustedBy: "mod-user-1",
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();
  });

  it("validates operator node listing schemas, cursors, and strict secret exclusion", () => {
    const activeWithHeartbeat = {
      nodeId: "worker-node-1",
      capabilities: ["vpm", "github"] as ("vpm" | "github")[],
      status: "active" as const,
      revokedAt: null,
      lastSeenAt: "2026-10-01T12:00:00.000Z",
      heartbeatState: "fetching" as const,
      activeJobId: "job-b1"
    };
    const activeLongJobId = {
      ...activeWithHeartbeat,
      nodeId: "worker-node-2",
      heartbeatState: "idle" as const,
      activeJobId: "j".repeat(120)
    };
    const activeNoHeartbeat = {
      nodeId: "worker-node-3",
      capabilities: ["booth"] as ("booth")[],
      status: "active" as const,
      revokedAt: null,
      lastSeenAt: null,
      heartbeatState: null,
      activeJobId: null
    };
    const revokedNode = {
      nodeId: "worker-node-4",
      capabilities: ["vpm"] as ("vpm")[],
      status: "revoked" as const,
      revokedAt: "2026-10-02T00:00:00.000Z",
      lastSeenAt: "2026-10-01T23:55:00.000Z",
      heartbeatState: null,
      activeJobId: null
    };

    expect(OperatorNodeStatusSchema.parse("active")).toBe("active");
    expect(OperatorNodeStatusSchema.parse("revoked")).toBe("revoked");
    expect(OperatorNodeHeartbeatStateSchema.parse("idle")).toBe("idle");
    expect(OperatorNodeHeartbeatStateSchema.parse("fetching")).toBe("fetching");

    for (const row of [activeWithHeartbeat, activeLongJobId, activeNoHeartbeat, revokedNode]) {
      expect(OperatorNodeRecordSchema.parse(row)).toEqual(row);
    }

    for (const invalid of [
      { ...activeWithHeartbeat, token: "vrcp_" + "a".repeat(68) },
      { ...activeWithHeartbeat, token_hash: "b".repeat(64) },
      { ...activeWithHeartbeat, extra: true },
      { ...activeWithHeartbeat, activeJobId: "" },
      { ...activeWithHeartbeat, activeJobId: "j".repeat(121) },
      { ...activeWithHeartbeat, status: "offline" },
      { ...activeWithHeartbeat, heartbeatState: "running" },
      { ...activeWithHeartbeat, capabilities: [] },
      { ...activeWithHeartbeat, capabilities: ["curated"] },
      { ...activeWithHeartbeat, nodeId: "." },
      { ...activeWithHeartbeat, nodeId: ".." }
    ]) {
      expect(OperatorNodeRecordSchema.safeParse(invalid).success).toBe(false);
    }

    const nodeCursor = { nodeId: "worker-node-1" };
    const encodedNodeCursor = encodeOperatorNodeCursor(nodeCursor);
    expect(decodeOperatorNodeCursor(encodedNodeCursor)).toEqual(nodeCursor);
    expect(decodeOperatorNodeCursor("invalid-node-cursor")).toBeNull();
    const tamperedNodeCursor = btoa(JSON.stringify({ nodeId: "worker-node-1", extra: true }))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect(decodeOperatorNodeCursor(tamperedNodeCursor)).toBeNull();
    const dotNodeCursor = btoa(JSON.stringify({ nodeId: ".." }))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect(OperatorNodeCursorSchema.safeParse({ nodeId: ".." }).success).toBe(false);
    expect(decodeOperatorNodeCursor(dotNodeCursor)).toBeNull();

    expect(OperatorNodeListQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(OperatorNodeListQuerySchema.parse({ status: "revoked", limit: 25, cursor: encodedNodeCursor })).toEqual({
      status: "revoked",
      limit: 25,
      cursor: encodedNodeCursor
    });
    expect(OperatorNodeListQuerySchema.safeParse({ cursor: tamperedNodeCursor }).success).toBe(false);
    expect(OperatorNodeListQuerySchema.safeParse({ extra: true }).success).toBe(false);

    expect(OperatorNodeListResponseSchema.parse({
      schemaVersion: 1,
      nodes: [activeWithHeartbeat, activeNoHeartbeat, revokedNode],
      nextCursor: encodedNodeCursor
    }).nodes).toHaveLength(3);
    expect(OperatorNodeListResponseSchema.safeParse({
      schemaVersion: 1,
      nodes: [{ ...activeWithHeartbeat, token_hash: "c".repeat(64) }],
      nextCursor: null
    }).success).toBe(false);
    expect(OperatorNodeListResponseSchema.safeParse({
      schemaVersion: 1,
      nodes: [],
      nextCursor: tamperedNodeCursor
    }).success).toBe(false);
  });

  it("validates operator crawl job listing, enqueue, update, requeue, delete, and strict lease-id exclusion", () => {
    const profileId = "123e4567-e89b-12d3-a456-426614174001";
    for (const lane of [1, 2, 3, 4] as const) {
      expect(PriorityLaneSchema.parse(lane)).toBe(lane);
    }
    expect(PriorityLaneSchema.safeParse(0).success).toBe(false);
    expect(PriorityLaneSchema.safeParse(5).success).toBe(false);

    expect(OperatorJobIdSchema.safeParse("job-1").success).toBe(true);
    for (const badId of ["", "   ", ".", "..", " . ", " .. ", "x".repeat(121)]) {
      expect(OperatorJobIdSchema.safeParse(badId).success).toBe(false);
    }

    expect(EnqueueJobRequestSchema.parse({
      schemaVersion: 1,
      url: "https://vpm.example.com/index.json",
      platform: "vpm",
      purpose: "discovery",
      minDelayMs: 2000,
      priorityLane: 1,
      recrawlIntervalMs: 21_600_000,
      reason: "VPM manifest seed"
    }).priorityLane).toBe(1);

    const legacyJob = {
      jobId: "job-b1",
      platform: "booth" as const,
      url: "https://booth.pm/ja/items/12345",
      origin: "https://booth.pm",
      state: "leased" as const,
      purpose: "metadata" as const,
      priorityLane: 3 as const,
      recrawlIntervalMs: 86_400_000,
      paginationDepth: 0,
      nextFetchAt: "2026-10-01T12:00:00.000Z",
      claimedBy: "worker-node-1",
      leaseExpiresAt: "2026-10-01T12:02:00.000Z",
      createdAt: "2026-10-01T11:55:00.000Z",
      robotsDeferredUntil: null,
      steeringProfileId: profileId,
      claimabilityBlockers: []
    };
    const uuidJob = {
      jobId: "123e4567-e89b-12d3-a456-426614174099",
      platform: "vpm" as const,
      url: "https://vpm.example.com/index.json",
      origin: "https://vpm.example.com",
      state: "blocked" as const,
      purpose: "discovery" as const,
      priorityLane: 1 as const,
      recrawlIntervalMs: 21_600_000,
      paginationDepth: 2,
      nextFetchAt: "2026-10-01T12:05:00.000Z",
      claimedBy: null,
      leaseExpiresAt: null,
      createdAt: "2026-10-01T11:56:00.000Z",
      robotsDeferredUntil: "2026-10-01T12:10:00.000Z",
      steeringProfileId: null,
      claimabilityBlockers: ["missing_steering_profile", "robots_deferred"]
    };

    for (const state of ["pending", "leased", "done", "backoff", "blocked"] as const) {
      expect(OperatorJobStateSchema.parse(state)).toBe(state);
    }
    expect(OperatorJobRecordSchema.parse(legacyJob)).toEqual(legacyJob);
    expect(OperatorJobRecordSchema.parse(uuidJob)).toEqual(uuidJob);
    expect(OperatorJobRecordSchema.parse({ ...legacyJob, jobId: "k".repeat(120) }).jobId).toHaveLength(120);

    for (const invalid of [
      { ...legacyJob, leaseId: "lease-1" },
      { ...legacyJob, lease_id: "lease-1" },
      { ...legacyJob, sourceRuleId: profileId },
      { ...legacyJob, leaseProfileId: profileId },
      { ...legacyJob, extra: true },
      { ...legacyJob, jobId: "" },
      { ...legacyJob, jobId: ".." },
      { ...legacyJob, jobId: "k".repeat(121) },
      { ...legacyJob, state: "queued" },
      { ...legacyJob, platform: "curated" },
      { ...legacyJob, priorityLane: 5 },
      { ...legacyJob, paginationDepth: -1 },
      { ...legacyJob, purpose: "crawl" },
      { ...legacyJob, steeringProfileId: "not-a-uuid" },
      { ...legacyJob, claimedBy: ".." }
    ]) {
      expect(OperatorJobRecordSchema.safeParse(invalid).success).toBe(false);
    }

    const jobCursor = { createdAt: "2026-10-01T11:55:00.000Z", jobId: "job-b1" };
    const encodedJobCursor = encodeOperatorJobCursor(jobCursor);
    expect(decodeOperatorJobCursor(encodedJobCursor)).toEqual(jobCursor);
    expect(decodeOperatorJobCursor("invalid-job-cursor")).toBeNull();
    const tamperedJobCursor = btoa(JSON.stringify({ createdAt: "2026-10-01T11:55:00.000Z", jobId: "job-b1", extra: true }))
      .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    expect(decodeOperatorJobCursor(tamperedJobCursor)).toBeNull();
    expect(OperatorJobCursorSchema.safeParse({ createdAt: "bad-date", jobId: "job-b1" }).success).toBe(false);

    expect(OperatorJobListQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(OperatorJobListQuerySchema.parse({
      state: "leased",
      platform: "booth",
      priorityLane: 2,
      limit: 50,
      cursor: encodedJobCursor
    })).toEqual({
      state: "leased",
      platform: "booth",
      priorityLane: 2,
      limit: 50,
      cursor: encodedJobCursor
    });
    expect(OperatorJobListQuerySchema.safeParse({ cursor: tamperedJobCursor }).success).toBe(false);
    expect(OperatorJobListQuerySchema.safeParse({ extra: true }).success).toBe(false);

    expect(OperatorJobListResponseSchema.parse({
      schemaVersion: 1,
      jobs: [legacyJob, uuidJob],
      nextCursor: encodedJobCursor
    }).jobs).toHaveLength(2);
    expect(OperatorJobListResponseSchema.safeParse({
      schemaVersion: 1,
      jobs: [{ ...legacyJob, leaseId: "lease-secret" }],
      nextCursor: null
    }).success).toBe(false);
    expect(OperatorJobListResponseSchema.safeParse({
      schemaVersion: 1,
      jobs: [{ ...legacyJob, lease_id: "lease-secret" }],
      nextCursor: null
    }).success).toBe(false);
    expect(OperatorJobListResponseSchema.safeParse({
      schemaVersion: 1,
      jobs: [],
      nextCursor: tamperedJobCursor
    }).success).toBe(false);

    expect(UpdateJobRequestSchema.safeParse({ schemaVersion: 1, priorityLane: 1, reason: "Promote VPM job" }).success).toBe(true);
    expect(UpdateJobRequestSchema.safeParse({ schemaVersion: 1, reason: "Missing mutable fields" }).success).toBe(false);
    expect(UpdateJobResponseSchema.parse({ schemaVersion: 1, job: legacyJob }).job.jobId).toBe("job-b1");
    expect(RequeueJobRequestSchema.parse({ schemaVersion: 1, priorityLane: 1, reason: "Run now" }).priorityLane).toBe(1);
    expect(RequeueJobResponseSchema.parse({ schemaVersion: 1, job: legacyJob }).job.jobId).toBe("job-b1");
    expect(DeleteJobRequestSchema.parse({ schemaVersion: 1, reason: "Obsolete job" }).reason).toBe("Obsolete job");
    expect(DeleteJobResponseSchema.parse({ schemaVersion: 1, jobId: "job-b1", status: "deleted" }).status).toBe("deleted");
  });

  it("validates P21 staging, vocabulary, query filters, URI schemes, and client forward-read tolerance", () => {
    expect(PackageFrontSchema.safeParse({
      frontId: "123e4567-e89b-12d3-a456-426614174010",
      canonicalId: "pkg-1",
      sourceKey: "booth:1",
      platform: "booth",
      storefrontUrl: "javascript:alert(1)",
      observedAt: "2026-11-28T00:00:00.000Z"
    }).success).toBe(false);

    expect(OperatorLeadListQuerySchema.parse({
      status: "pending_review",
      query: "avatar",
      targetHost: "shop.booth.pm",
      limit: 25
    })).toMatchObject({ query: "avatar", targetHost: "shop.booth.pm" });
    expect(OperatorCatalogListQuerySchema.parse({ query: "shader", limit: 25 }).query).toBe("shader");

    const stagingCursor = encodeOperatorStagingCursor({
      observedAt: "2026-11-28T00:00:00.000Z",
      sourceKey: "booth:12345"
    });
    expect(decodeOperatorStagingCursor(stagingCursor)).toEqual({
      observedAt: "2026-11-28T00:00:00.000Z",
      sourceKey: "booth:12345"
    });
    expect(OperatorStagingListQuerySchema.parse({
      auditState: "pending_audit",
      platform: "booth",
      query: "Chise",
      cursor: stagingCursor
    }).platform).toBe("booth");
    expect(OperatorStagingListQuerySchema.safeParse({ platform: "curated" }).success).toBe(false);

    expect(() => OperatorStagingListResponseSchema.parse({
      schemaVersion: 1,
      items: [{
        sourceKey: "booth:12345",
        platform: "booth",
        sourceUrl: "https://booth.pm/ja/items/12345",
        title: "Chise Dress",
        author: "Creator",
        auditState: "pending_audit",
        relevanceConfidence: 0.42,
        extractedTags: ["Chise"],
        bracketTokens: ["チセ対応"],
        observedAt: "2026-11-28T00:00:00.000Z"
      }],
      unknownTokens: [{ token: "チセ対応", count: 14, sampleSourceKey: "booth:12345" }],
      nextCursor: stagingCursor
    })).not.toThrow();

    expect(OperatorStagingDecisionRequestSchema.safeParse({
      schemaVersion: 1,
      decision: "approve",
      reason: "Confirmed outfit"
    }).success).toBe(true);
    expect(OperatorStagingDecisionRequestSchema.safeParse({
      schemaVersion: 1,
      decision: "approve"
    }).success).toBe(false);

    expect(OperatorVocabularyUpsertRequestSchema.safeParse({
      schemaVersion: 1,
      ruleId: "avatar-chise",
      kind: "avatar_base",
      canonicalValue: "Chise",
      aliases: ["Chise", "チセ"],
      reason: "Promote new base"
    }).success).toBe(true);
    expect(OperatorVocabularyUpsertRequestSchema.safeParse({
      schemaVersion: 1,
      ruleId: "avatar-chise",
      kind: "avatar_base",
      canonicalValue: "Chise",
      aliases: ["Chise"]
    }).success).toBe(false);

    const parsedRead = CatalogPackageClientReadSchema.parse({
      canonicalId: "com.example.evolved",
      umbrella: "avatars",
      category: "avatar_clothing",
      lifecycle: "active",
      displayName: "Chise Outfit",
      vpmId: null,
      qualityFlags: ["future_flag"],
      additiveExtra: { note: "forward-compatible" },
      createdAt: "2026-11-28T00:00:00.000Z",
      updatedAt: "2026-11-28T00:00:00.000Z",
      contentRating: "general"
    });
    expect(parsedRead.qualityFlags).toEqual(["future_flag"]);
    expect(CatalogPackageClientReadSchema.safeParse({
      ...parsedRead,
      contentRating: "unknown_rating"
    }).success).toBe(false);
  });
});
