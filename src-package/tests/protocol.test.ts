import { describe, it, expect } from "bun:test";
import {
  CatalogPackageSchema,
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
  DemandSignalReportRequestSchema,
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
  LeadRowSchema,
  LeadCursorSchema,
  encodeLeadCursor,
  decodeLeadCursor,
  ApproveLeadSchema,
  RejectLeadSchema,
  CreateSourceAccessProfileSchema,
  encodeProfileCursor,
  decodeProfileCursor,
  AutoQueueRuleSchema,
  CreateAutoQueueRuleSchema,
  encodeRuleCursor,
  decodeRuleCursor,
  IssueNodeCredentialSchema,
  NodeCredentialResponseSchema,
  OperatorNodeStatusSchema,
  OperatorNodeHeartbeatStateSchema,
  OperatorNodeRecordSchema,
  OperatorNodeCursorSchema,
  encodeOperatorNodeCursor,
  decodeOperatorNodeCursor,
  OperatorNodeListQuerySchema,
  OperatorNodeListResponseSchema,
  OperatorJobStateSchema,
  OperatorJobRecordSchema,
  OperatorJobCursorSchema,
  encodeOperatorJobCursor,
  decodeOperatorJobCursor,
  OperatorJobListQuerySchema,
  OperatorJobListResponseSchema,
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
  decodeOperatorAppCursor
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
  it("validates CatalogPackage and strict PackageFront schemas with default contentRating", () => {
    const validFront = {
      frontId: "123e4567-e89b-12d3-a456-426614174000",
      canonicalId: "pkg-123",
      sourceKey: "booth:12345",
      platform: "booth" as const,
      storefrontUrl: "https://booth.pm/ja/items/12345",
      price: 1500,
      currency: "JPY",
      availability: "available" as const,
      observedAt: new Date().toISOString()
    };
    const validPkg = {
      canonicalId: "pkg-123",
      umbrella: "tools" as const,
      category: "companion_client",
      lifecycle: "active" as const,
      displayName: "My Tool",
      vpmId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedLinks: [],
      fronts: [validFront]
    };
    const parsed = CatalogPackageSchema.parse(validPkg);
    expect(parsed.contentRating).toBe("general");
    expect(parsed).toEqual({ ...validPkg, contentRating: "general" });

    const ratedPkg = { ...validPkg, contentRating: "sexual_suggestive" as const };
    expect(CatalogPackageSchema.parse(ratedPkg).contentRating).toBe("sexual_suggestive");

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
  });

  it("validates ReportSubmissionRequest as a strict 3-branch discriminated union", () => {
    const removal = { schemaVersion: 1 as const, reportType: "removal_request" as const, canonicalId: "pkg-123", reason: "Incorrect attribution" };
    expect(RemovalReportRequestSchema.safeParse(removal).success).toBe(true);
    expect(ReportSubmissionRequestSchema.safeParse(removal).success).toBe(true);
    expect(ReportSubmissionRequestSchema.safeParse({
      schemaVersion: 1,
      reportType: "removal_request",
      targetUrl: "https://booth.pm/ja/items/12345",
      reason: "Creator request"
    }).success).toBe(true);
    // Target requirement (targetUrl or canonicalId) is enforced on ReportSubmissionRequestSchema
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

    // Explicit content report sub-categories
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

    // Cross-variant fields, missing reportKind, and unknown report kinds are rejected
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

    // Coordinator-style cursor with status and firstSeenAt
    const coordLeadCursor = {
      status: "pending_review" as const,
      firstSeenAt: "2026-10-01T10:00:00.000Z",
      leadKey: "b".repeat(64)
    };
    const encCoordLead = encodeLeadCursor(coordLeadCursor);
    expect(decodeLeadCursor(encCoordLead, "pending_review")).toEqual(coordLeadCursor);
    expect(decodeLeadCursor(encCoordLead, "rejected")).toBeNull();

    const profileCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      profileId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encProfile = encodeProfileCursor(profileCursor);
    expect(decodeProfileCursor(encProfile)).toEqual(profileCursor);
    expect(decodeProfileCursor("invalid-profile-cursor")).toBeNull();

    const ruleCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      ruleId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encRule = encodeRuleCursor(ruleCursor);
    expect(decodeRuleCursor(encRule)).toEqual(ruleCursor);
    expect(decodeRuleCursor("invalid-rule-cursor")).toBeNull();

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

  it("enforces source-profile path, query and evidence constraints", () => {
    const input = { schemaVersion: 1, platform: "booth", origin: "https://booth.pm",
      pathScope: "/ja/items/", method: "GET", purpose: "metadata", minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z", reviewReference: "REV-2026-BOOTH",
      reason: "Reviewed metadata", retainClasses: ["normalized_facts"], publishClasses: [] };
    expect(CreateSourceAccessProfileSchema.safeParse(input).success).toBe(true);
    for (const pathScope of ["/ja/items/*", "ja/items/", "/ja//items/", "/ja/../items/",
      "/ja/%2Fitems", "/ja/%2E", "/ja/%e3%81%82", "/ja/%FF", "/ja/%E3%81%82/"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope }).success).toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope: "/ja/%E3%81%82" }).success).toBe(true);
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope: "/ja/items", exactQuery: "page=1&sort=new" }).success).toBe(true);
    for (const change of [
      { exactQuery: "page=1" }, { pathScope: "/ja/items", exactQuery: "page=1&next=%2F" },
      { retainClasses: [] }, { retainClasses: ["normalized_facts", "normalized_facts"] },
      { publishClasses: ["normalized_facts", "normalized_facts"] }, { publishClasses: ["creator_prose"] }
    ]) expect(CreateSourceAccessProfileSchema.safeParse({ ...input, ...change }).success).toBe(false);
    for (const origin of ["http://booth.pm", "https://booth.pm/", "https://booth.pm:8443", "https://user@booth.pm"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
  });

  it("rejects auto-queue grants outside the implemented wire contract", () => {
    const rule = { schemaVersion: 1, leadKind: "vpm_listing", origin: "https://packages.example.org",
      pathScope: "/index.json", minDelayMs: 1000, expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "Review fixture", reason: "Reviewed listing" };
    expect(CreateAutoQueueRuleSchema.safeParse(rule).success).toBe(true);
    for (const change of [
      { leadKind: "storefront_product" }, { leadKind: "github_repository" },
      { origin: "http://packages.example.org" }, { origin: "https://packages.example.org/path" },
      { origin: "https://user@packages.example.org" }, { origin: "https://packages.example.org." },
      { origin: "https://localhost" }, { origin: "https://packages.example.org:8443" },
      { pathScope: "/vpm/*" }, { pathScope: "index.json" }, { pathScope: "/vpm//" },
      { pathScope: "/vpm/../" }, { pathScope: "/%E3%81%82" }, { pathScope: "/" + "x".repeat(200) }
    ]) expect(CreateAutoQueueRuleSchema.safeParse({ ...rule, ...change }).success).toBe(false);
    const stored = { ...rule, ruleId: "123e4567-e89b-12d3-a456-426614174000",
      createdAt: "2026-10-01T00:00:00.000Z", disabledAt: null };
    const { schemaVersion, ...response } = stored;
    expect(AutoQueueRuleSchema.safeParse(response).success).toBe(true);
    expect(AutoQueueRuleSchema.safeParse({ ...response, pathScope: "/vpm/*" }).success).toBe(false);
    expect(AutoQueueRuleSchema.safeParse({ ...response, leadKind: "publisher_site" }).success).toBe(false);
  });

  it("rejects credential responses that violate coordinator identity bounds", () => {
    const response = { schemaVersion: 1, nodeId: "fixture-node", capabilities: ["vpm"],
      token: "vrcp_" + "0".repeat(64) + "0004" };
    expect(NodeCredentialResponseSchema.safeParse(response).success).toBe(true);
    for (const schema of [NodeCredentialResponseSchema]) {
      for (const nodeId of ["", "node with spaces", "x".repeat(101), "../node"]) {
        expect(schema.safeParse({ ...response, nodeId }).success).toBe(false);
      }
      for (const capabilities of [[], Array(11).fill("vpm"), ["unknown"]]) {
        expect(schema.safeParse({ ...response, capabilities }).success).toBe(false);
      }
      expect(schema.safeParse({ ...response, extra: true }).success).toBe(false);
      expect(schema.safeParse({ ...response, token: "vrcp_invalid" }).success).toBe(false);
    }
  });

  it("validates coordinator init and operator lead request/row schemas", () => {
    expect(InitializeCoordinatorRequestSchema.safeParse({ schemaVersion: 1, autoSeed: true }).success).toBe(true);
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
      autoSeed: false,
      extra: true
    }).success).toBe(false);

    const wireLead = { lead_key: "a".repeat(64), kind: "vpm_listing" as const, target_url: "https://publisher.example/index.json",
      claimed_package_id: null, discovered_from_url: "https://directory.example/catalog", discovered_from_item_key: null,
      status: "pending_review" as const, first_seen_at: "2026-10-04T00:00:00.000Z", last_seen_at: "2026-10-04T00:00:00.000Z" };
    expect(LeadRowSchema.parse(wireLead)).toEqual(wireLead);
    for (const input of [{ ...wireLead, leadKey: wireLead.lead_key }, { ...wireLead, extra: true },
      { ...wireLead, kind: "unknown_kind" }, { ...wireLead, discovered_from_url: undefined },
      { ...wireLead, discovered_from_url: null }]) {
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
  });

  it("validates operator source profile, auto-queue rule, node, and takedown schemas", () => {
    expect(() => CreateSourceAccessProfileSchema.parse({
      schemaVersion: 1,
      platform: "booth",
      origin: "https://booth.pm",
      pathScope: "/ja/items/",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Storefront access approved",
      retainClasses: ["normalized_facts"],
      publishClasses: ["normalized_facts"]
    })).not.toThrow();

    expect(() => CreateAutoQueueRuleSchema.parse({
      schemaVersion: 1,
      leadKind: "vpm_listing",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-VPM",
      reason: "Auto-queue trusted listing"
    })).not.toThrow();

    expect(() => IssueNodeCredentialSchema.parse({
      schemaVersion: 1,
      nodeId: "primary-node",
      capabilities: ["vpm", "github"],
      reason: "Primary production worker"
    })).not.toThrow();

    expect(() => VerifyTakedownRequestSchema.parse({
      schemaVersion: 1,
      verdict: "accepted",
      notes: "Proof verified in bio token"
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

    // Backward-compatible defaults
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
    expect(() => ModeratorReviewAppCandidateRequestSchema.parse(operatorReviewReq)).not.toThrow();
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

  it("validates operator crawl job listing schemas, cursors, and strict lease-id exclusion", () => {
    const ruleId = "123e4567-e89b-12d3-a456-426614174000";
    const profileId = "123e4567-e89b-12d3-a456-426614174001";
    const legacyJob = {
      jobId: "job-b1",
      platform: "booth" as const,
      url: "https://booth.pm/ja/items/12345",
      origin: "https://booth.pm",
      state: "leased" as const,
      purpose: "metadata" as const,
      nextFetchAt: "2026-10-01T12:00:00.000Z",
      claimedBy: "worker-node-1",
      leaseExpiresAt: "2026-10-01T12:02:00.000Z",
      createdAt: "2026-10-01T11:55:00.000Z",
      robotsDeferredUntil: null,
      sourceRuleId: null,
      leaseProfileId: profileId
    };
    const uuidJob = {
      jobId: "123e4567-e89b-12d3-a456-426614174099",
      platform: "vpm" as const,
      url: "https://vpm.example.com/index.json",
      origin: "https://vpm.example.com",
      state: "pending" as const,
      purpose: "discovery" as const,
      nextFetchAt: "2026-10-01T12:05:00.000Z",
      claimedBy: null,
      leaseExpiresAt: null,
      createdAt: "2026-10-01T11:56:00.000Z",
      robotsDeferredUntil: "2026-10-01T12:10:00.000Z",
      sourceRuleId: ruleId,
      leaseProfileId: null
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
      { ...legacyJob, extra: true },
      { ...legacyJob, jobId: "" },
      { ...legacyJob, jobId: "k".repeat(121) },
      { ...legacyJob, state: "queued" },
      { ...legacyJob, platform: "unknown" },
      { ...legacyJob, purpose: "crawl" },
      { ...legacyJob, sourceRuleId: "not-a-uuid" },
      { ...legacyJob, leaseProfileId: "not-a-uuid" },
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
      limit: 50,
      cursor: encodedJobCursor
    })).toEqual({
      state: "leased",
      platform: "booth",
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
  });
});
