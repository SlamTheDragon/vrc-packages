import { readJson } from "./handler.ts";
import { UnsupportedMediaTypeError, type OperatorStore } from "../domain/ports/stores.ts";
import {
  OPERATOR_PROTOCOL_VERSION,
  RevokeNodeRequestSchema,
  RevokeNodeResponseSchema,
  EnqueueJobRequestSchema,
  EnqueueJobResponseSchema,
  AutoQueueRuleListResponseSchema,
  AutoQueueRuleResponseSchema,
  CreateAutoQueueRuleSchema,
  DisableAutoQueueRuleSchema,
  decodeRuleCursor,
  RuleCursorSchema,
  IssueNodeCredentialSchema,
  NodeCredentialResponseSchema,
  OperatorNodeListQuerySchema,
  OperatorNodeListResponseSchema,
  decodeOperatorNodeCursor,
  OperatorJobListQuerySchema,
  OperatorJobListResponseSchema,
  decodeOperatorJobCursor,
  CatalogListResponseSchema,
  decodeCatalogCursor,
  OperatorClaimListQuerySchema,
  ApproveLeadSchema,
  LeadActionResponseSchema,
  LeadListResponseSchema,
  LeadStatusSchema,
  RejectLeadSchema,
  decodeLeadCursor,
  decodeTakedownCursor,
  TakedownListResponseSchema,
  TakedownCursorSchema,
  VerifyTakedownRequestSchema,
  VerifyTakedownResponseSchema,
  decodeDelegatedClaimCursor,
  DelegatedClaimListResponseSchema,
  DelegatedClaimCursorSchema,
  VerifyDelegatedClaimRequestSchema,
  VerifyDelegatedClaimResponseSchema,
  decodeOperatorAppCursor,
  OperatorAppListResponseSchema,
  SetAppDelegationRequestSchema,
  SetAppDelegationResponseSchema,
  ReviewAppCandidateRequestSchema,
  ReviewAppCandidateResponseSchema,
  OperatorAppCursorSchema,
  OperatorAppListQuerySchema,
  CreateSourceAccessProfileSchema,
  DisableSourceAccessProfileSchema,
  SourceAccessProfileListResponseSchema,
  SourceAccessProfileResponseSchema,
  decodeProfileCursor,
  ProfileCursorSchema
} from "vrc-packages-api";
import { parseCapabilityToken } from "../domain/security/capability_token.ts";
import { workerLogger } from "../worker_logger.ts";
import { isOperatorAuthorized, parseIntegerQueryParam } from "./auth.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export type { OperatorStore };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: OPERATOR_PROTOCOL_VERSION, code, error: message }, status);
}

function parseOperatorListQuery<T>(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }
): T | null {
  const keys = [...searchParams.keys()];
  if (keys.some((key) => !allowedKeys.includes(key) || searchParams.getAll(key).length > 1)) {
    return null;
  }
  const rawQuery: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (!searchParams.has(key)) continue;
    const value = searchParams.get(key);
    if (value === null || value === "") return null;
    rawQuery[key] = key === "limit" ? parseIntegerQueryParam(value) : value;
  }
  const parsed = schema.safeParse(rawQuery);
  return parsed.success ? parsed.data : null;
}

/** Separate operator boundary. Node credentials never grant these controls. */
export async function handleOperatorRequest(
  request: Request,
  store: OperatorStore,
  configuredToken: string,
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const url = new URL(request.url);
  const leadAction = /^\/v1\/operator\/leads\/([a-f0-9]{64})\/(approve|reject)$/.exec(url.pathname);
  const listing = request.method === "GET" && url.pathname === "/v1/operator/leads";
  const ruleListing = request.method === "GET" && url.pathname === "/v1/operator/autoqueue-rules";
  const ruleCreate = request.method === "POST" && url.pathname === "/v1/operator/autoqueue-rules";
  const ruleDisable = request.method === "POST" && /^\/v1\/operator\/autoqueue-rules\/([^/]+)\/disable$/.exec(url.pathname);
  const profileListing = request.method === "GET" && url.pathname === "/v1/operator/source-profiles";
  const profileCreate = request.method === "POST" && url.pathname === "/v1/operator/source-profiles";
  const nodeListing = request.method === "GET" && url.pathname === "/v1/operator/nodes";
  const nodeIssue = request.method === "POST" && url.pathname === "/v1/operator/nodes";
  const nodeRevoke = request.method === "POST" && /^\/v1\/operator\/nodes\/([A-Za-z0-9._-]{1,100})\/revoke$/.exec(url.pathname);
  const jobListing = request.method === "GET" && url.pathname === "/v1/operator/jobs";
  const jobEnqueue = request.method === "POST" && url.pathname === "/v1/operator/jobs";
  const profileDisable = request.method === "POST" && /^\/v1\/operator\/source-profiles\/([^/]+)\/disable$/.exec(url.pathname);
  const catalogListing = request.method === "GET" && url.pathname === "/v1/operator/catalog";
  const takedownListing = request.method === "GET" && url.pathname === "/v1/operator/takedowns";
  const takedownVerify = request.method === "POST" && /^\/v1\/operator\/takedowns\/([^/]+)\/verify$/.exec(url.pathname);
  const claimListing = request.method === "GET" && url.pathname === "/v1/operator/claims";
  const claimVerify = request.method === "POST" && /^\/v1\/operator\/claims\/([^/]+)\/verify$/.exec(url.pathname);
  const appListing = request.method === "GET" && url.pathname === "/v1/operator/apps";
  const appDelegation = request.method === "POST" && /^\/v1\/operator\/apps\/([^/]+)\/delegation$/.exec(url.pathname);
  const appCandidateReview = request.method === "POST" && /^\/v1\/operator\/apps\/([^/]+)\/candidate-review$/.exec(url.pathname);

  if (
    !nodeListing &&
    !nodeRevoke &&
    !jobListing &&
    !jobEnqueue &&
    !listing &&
    !ruleListing &&
    !ruleCreate &&
    !ruleDisable &&
    !profileListing &&
    !profileCreate &&
    !nodeIssue &&
    !profileDisable &&
    !catalogListing &&
    !takedownListing &&
    !takedownVerify &&
    !claimListing &&
    !claimVerify &&
    !appListing &&
    !appDelegation &&
    !appCandidateReview &&
    !(request.method === "POST" && leadAction)
  ) {
    return failure(404, "not_found", "Route not found");
  }
  if (!isOperatorAuthorized(request, configuredToken)) {
    workerLogger.warn("Operator bearer credential invalid or missing", { path: url.pathname });
    return failure(401, "unauthorized", "Operator bearer credential required");
  }
  const clientIp = extractClientIp(request);
  const operatorRate = await rateLimiter.check(`operator:${clientIp}`, RATE_LIMIT_POLICIES.OPERATOR_ROUTES);
  if (!operatorRate.allowed) {
    workerLogger.warn("Operator rate limit exceeded", { path: url.pathname, clientIp });
    return rateLimitResponse(
      operatorRate,
      OPERATOR_PROTOCOL_VERSION,
      "Rate limit exceeded for operator requests. Please retry later."
    );
  }
  const ok = (body: unknown, status = 200) => applyRateLimitHeaders(json(body, status), operatorRate);

  if (
    (ruleDisable && !RuleCursorSchema.shape.ruleId.safeParse(ruleDisable[1]).success) ||
    (profileDisable && !ProfileCursorSchema.shape.profileId.safeParse(profileDisable[1]).success) ||
    (takedownVerify && !TakedownCursorSchema.shape.takedownId.safeParse(takedownVerify[1]).success) ||
    (claimVerify && !DelegatedClaimCursorSchema.shape.claimId.safeParse(claimVerify[1]).success) ||
    (appDelegation && !OperatorAppCursorSchema.shape.appId.safeParse(appDelegation[1]).success) ||
    (appCandidateReview && !OperatorAppCursorSchema.shape.appId.safeParse(appCandidateReview[1]).success)
  ) {
    return failure(404, "not_found", "Route not found");
  }
  if (listing) {
    const status = LeadStatusSchema.safeParse(url.searchParams.get("status") || "pending_review");
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = status.success && cursorValue ? decodeLeadCursor(cursorValue, status.data) : null;
    if (
      !status.success ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      url.searchParams.getAll("status").length > 1 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      (cursorValue !== null && !cursor) ||
      [...url.searchParams.keys()].some((key) => !["status", "limit", "cursor"].includes(key))
    ) {
      return failure(400, "invalid_query", "Status, limit, or cursor is invalid");
    }
    return ok(
      LeadListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listLeadsPage(status.data, limit, cursor))
      })
    );
  }
  if (ruleListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeRuleCursor(cursorValue) : null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      (cursorValue !== null && !cursor) ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))
    ) {
      return failure(400, "invalid_query", "Rule limit or cursor is invalid");
    }
    return ok(
      AutoQueueRuleListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listAutoQueueRulesPage(limit, cursor ? { ...cursor, ruleId: cursor.ruleId.toLowerCase() } : null))
      })
    );
  }
  if (profileListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeProfileCursor(cursorValue) : null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      (cursorValue !== null && !cursor) ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))
    ) {
      return failure(400, "invalid_query", "Profile limit or cursor is invalid");
    }
    return ok(
      SourceAccessProfileListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listSourceAccessProfilesPage(
          limit,
          cursor ? { ...cursor, profileId: cursor.profileId.toLowerCase() } : null
        ))
      })
    );
  }
  if (catalogListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCatalogCursor(cursorValue) : null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      (cursorValue !== null && !cursor) ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))
    ) {
      return failure(400, "invalid_query", "Catalog limit or cursor is invalid");
    }
    return ok(
      CatalogListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listCanonicalPackagesPage(limit, cursor, { includeAllRatings: true }))
      })
    );
  }
  if (takedownListing) {
    const requesterTypeParam = url.searchParams.get("requesterType");
    const validRequesterTypes = ["unauthenticated_creator", "user", "admin_operator"];
    if (requesterTypeParam && !validRequesterTypes.includes(requesterTypeParam)) {
      return failure(400, "invalid_query", "Invalid requesterType filter");
    }
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeTakedownCursor(cursorValue) : null;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      url.searchParams.getAll("requesterType").length > 1 ||
      (cursorValue !== null && !cursor) ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor", "requesterType"].includes(key))
    ) {
      return failure(400, "invalid_query", "Takedown limit or cursor is invalid");
    }
    return ok(
      TakedownListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listTakedownsPage(
          requesterTypeParam || undefined,
          limit,
          cursor ? { ...cursor, takedownId: cursor.takedownId.toLowerCase() } : null
        ))
      })
    );
  }
  if (claimListing) {
    const rawLimit = Number(url.searchParams.get("limit") || "100");
    const rawCursor = url.searchParams.get("cursor");
    const reviewStatusParam = url.searchParams.get("reviewStatus");
    const query = OperatorClaimListQuerySchema.safeParse({
      limit: rawLimit,
      cursor: rawCursor || undefined,
      reviewStatus: reviewStatusParam || undefined
    });
    if (
      !query.success ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      url.searchParams.getAll("reviewStatus").length > 1 ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor", "reviewStatus"].includes(key))
    ) {
      return failure(400, "invalid_query", query.success ? "Unknown query keys" : "Claim query parameters are invalid");
    }
    const limit = query.data.limit;
    const cursor = query.data.cursor ? decodeDelegatedClaimCursor(query.data.cursor) : null;
    return ok(
      DelegatedClaimListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listDelegatedClaimsPage(
          query.data.reviewStatus,
          limit,
          cursor ? { ...cursor, claimId: cursor.claimId.toLowerCase() } : null
        ))
      })
    );
  }
  if (appListing) {
    const rawLimit = Number(url.searchParams.get("limit") || "100");
    const rawCursor = url.searchParams.get("cursor");
    const candidateStatusParam = url.searchParams.get("candidateStatus");
    const query = OperatorAppListQuerySchema.safeParse({
      limit: rawLimit,
      cursor: rawCursor || undefined,
      candidateStatus: candidateStatusParam || undefined
    });
    if (
      !query.success ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      url.searchParams.getAll("candidateStatus").length > 1 ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor", "candidateStatus"].includes(key))
    ) {
      return failure(400, "invalid_query", query.success ? "Unknown query keys" : "App query parameters are invalid");
    }
    const limit = query.data.limit;
    const cursor = query.data.cursor ? decodeOperatorAppCursor(query.data.cursor) : null;
    return ok(
      OperatorAppListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listOperatorAppsPage(
          limit,
          cursor ? { ...cursor, appId: cursor.appId.toLowerCase() } : null,
          query.data.candidateStatus
        ))
      })
    );
  }
  if (nodeListing) {
    const query = parseOperatorListQuery(
      url.searchParams,
      ["status", "limit", "cursor"],
      OperatorNodeListQuerySchema
    );
    const cursor = query?.cursor ? decodeOperatorNodeCursor(query.cursor) : null;
    if (!query || (query.cursor !== undefined && !cursor)) {
      return failure(400, "invalid_query", "Node query parameters are invalid");
    }
    return ok(
      OperatorNodeListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listNodesPage(query.status, query.limit, cursor))
      })
    );
  }
  if (jobListing) {
    const query = parseOperatorListQuery(
      url.searchParams,
      ["state", "platform", "limit", "cursor"],
      OperatorJobListQuerySchema
    );
    const cursor = query?.cursor ? decodeOperatorJobCursor(query.cursor) : null;
    if (!query || (query.cursor !== undefined && !cursor)) {
      return failure(400, "invalid_query", "Job query parameters are invalid");
    }
    return ok(
      OperatorJobListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listJobsPage(
          { state: query.state, platform: query.platform },
          query.limit,
          cursor
        ))
      })
    );
  }

  let body: unknown;
  try {
    body = await readJson(request);
  } catch (error) {
    if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
    if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
    return failure(400, "bad_json", "Request body must be bounded valid JSON");
  }
  try {
    if (nodeRevoke) {
      const parsed = RevokeNodeRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Revocation body is invalid");
      await store.revokeNode(nodeRevoke[1], parsed.data, "operator-api");
      return ok(
        RevokeNodeResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: nodeRevoke[1],
          status: "revoked"
        })
      );
    }
    if (jobEnqueue) {
      const parsed = EnqueueJobRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Job body is invalid");
      const jobId = await store.enqueueJob(parsed.data, "operator-api");
      return ok(EnqueueJobResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, jobId }));
    }
    if (nodeIssue) {
      const parsed = IssueNodeCredentialSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Node credential body is invalid");
      const token = await store.issueNodeCredential(parsed.data, "operator-api");
      const capabilities = parseCapabilityToken(token)?.capabilities ?? parsed.data.capabilities ?? ["vpm"];
      return ok(
        NodeCredentialResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: parsed.data.nodeId,
          capabilities,
          token
        }),
        201
      );
    }
    if (profileCreate) {
      const parsed = CreateSourceAccessProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Source profile body is invalid");
      const profile = await store.createSourceAccessProfile(parsed.data, "operator-api");
      return ok(SourceAccessProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }), 201);
    }
    if (profileDisable) {
      const parsed = DisableSourceAccessProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Disable body is invalid");
      const profile = await store.disableSourceAccessProfile(
        profileDisable[1].toLowerCase(),
        "operator-api",
        parsed.data.reason
      );
      return ok(SourceAccessProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }));
    }
    if (ruleCreate) {
      const parsed = CreateAutoQueueRuleSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Auto-queue rule body is invalid");
      const rule = await store.createAutoQueueRule(parsed.data, "operator-api");
      return ok(AutoQueueRuleResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, rule }), 201);
    }
    if (ruleDisable) {
      const parsed = DisableAutoQueueRuleSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Disable body is invalid");
      const rule = await store.disableAutoQueueRule(ruleDisable[1].toLowerCase(), "operator-api", parsed.data.reason);
      return ok(AutoQueueRuleResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, rule }));
    }
    if (takedownVerify) {
      const parsed = VerifyTakedownRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Verify takedown body is invalid");
      const result = await store.verifyTakedown(
        takedownVerify[1].toLowerCase(),
        parsed.data.verdict,
        "operator-api",
        parsed.data.notes
      );
      return ok(VerifyTakedownResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }
    if (claimVerify) {
      const parsed = VerifyDelegatedClaimRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Verify claim body is invalid");
      const result = await store.verifyDelegatedClaim(
        claimVerify[1].toLowerCase(),
        parsed.data.verdict,
        "operator-api",
        parsed.data.notes
      );
      return ok(VerifyDelegatedClaimResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }
    if (appDelegation) {
      const parsed = SetAppDelegationRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Set app delegation body is invalid");
      const result = await store.setAppDelegation(
        appDelegation[1].toLowerCase(),
        parsed.data.delegationAllowed,
        "operator-api",
        parsed.data.reason
      );
      return ok(
        SetAppDelegationResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          ...result
        })
      );
    }
    if (appCandidateReview) {
      const parsed = ReviewAppCandidateRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Candidate review body is invalid");
      const result = await store.reviewAppCandidate(appCandidateReview[1].toLowerCase(), parsed.data, "operator-api");
      return ok(
        ReviewAppCandidateResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          ...result
        })
      );
    }
    const [, leadKey, action] = leadAction!;
    if (action === "approve") {
      const parsed = ApproveLeadSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Approval body is invalid");
      const approveFn = store.approveDiscoveryLead
        ? store.approveDiscoveryLead.bind(store)
        : store.approveVpmListingLead.bind(store);
      const jobId = await approveFn(leadKey, parsed.data.minDelayMs ?? 1000, "operator-api", parsed.data.reason);
      return ok(
        LeadActionResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          leadKey,
          status: "approved",
          jobId
        })
      );
    }
    const parsed = RejectLeadSchema.safeParse(body);
    if (!parsed.success) return failure(400, "invalid_payload", "Rejection body is invalid");
    await store.rejectLead(leadKey, "operator-api", parsed.data.reason);
    return ok(
      LeadActionResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        leadKey,
        status: "rejected"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operator action failed";
    const missing =
      message === "Lead not found" ||
      message === "Rule not found" ||
      message === "Source profile not found" ||
      message === "Takedown not found" ||
      message === "Node not found" ||
      message === "Claim not found" ||
      message === "App not found";
    workerLogger.warn("Operator action failed", { path: url.pathname, message, missing }, error);
    return failure(missing ? 404 : 409, missing ? "not_found" : "conflict", message);
  }
}

export function createOperatorHandler(
  store: OperatorStore,
  configuredToken: string,
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/v1/operator/")) return null;
    return handleOperatorRequest(request, store, configuredToken, rateLimiter);
  };
}
