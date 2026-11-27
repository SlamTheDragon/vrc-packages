import {
  ApproveLeadSchema,
  BulkApproveLeadsRequestSchema,
  BulkApproveLeadsResponseSchema,
  CatalogListResponseSchema,
  CreateSteeringProfileSchema,
  CreateSuppressedTargetSchema,
  DelegatedClaimCursorSchema,
  DelegatedClaimListResponseSchema,
  DeleteJobRequestSchema,
  DeleteJobResponseSchema,
  DeleteSuppressedTargetSchema,
  EnqueueJobRequestSchema,
  EnqueueJobResponseSchema,
  InitializeCoordinatorRequestSchema,
  InitializeCoordinatorResponseSchema,
  IssueNodeCredentialSchema,
  LeadActionResponseSchema,
  LeadListResponseSchema,
  LeadStatusSchema,
  NodeCredentialResponseSchema,
  OPERATOR_PROTOCOL_VERSION,
  OperatorAppCursorSchema,
  OperatorAppListQuerySchema,
  OperatorAppListResponseSchema,
  OperatorClaimListQuerySchema,
  OperatorJobIdSchema,
  OperatorJobListQuerySchema,
  OperatorJobListResponseSchema,
  OperatorNodeListQuerySchema,
  OperatorNodeListResponseSchema,
  OperatorStatusResponseSchema,
  OperatorSteeringProfileListQuerySchema,
  OperatorSuppressedTargetListQuerySchema,
  PruneNodeResponseSchema,
  RejectLeadSchema,
  RequeueJobRequestSchema,
  RequeueJobResponseSchema,
  ReviewAppCandidateRequestSchema,
  ReviewAppCandidateResponseSchema,
  RevokeNodeRequestSchema,
  RevokeNodeResponseSchema,
  SetAppDelegationRequestSchema,
  SetAppDelegationResponseSchema,
  SteeringProfileActionSchema,
  SteeringProfileCursorSchema,
  SteeringProfileDeleteResponseSchema,
  SteeringProfileListResponseSchema,
  SteeringProfileResponseSchema,
  SuppressLeadDomainRequestSchema,
  SuppressLeadDomainResponseSchema,
  SuppressedTargetDeleteResponseSchema,
  SuppressedTargetListResponseSchema,
  SuppressedTargetResponseSchema,
  SystemPurgeRequestSchema,
  SystemPurgeResponseSchema,
  TakedownCursorSchema,
  TakedownListResponseSchema,
  UpdateJobRequestSchema,
  UpdateJobResponseSchema,
  UpdateSteeringProfileSchema,
  VerifyDelegatedClaimRequestSchema,
  VerifyDelegatedClaimResponseSchema,
  VerifyTakedownRequestSchema,
  VerifyTakedownResponseSchema,
  decodeCatalogCursor,
  decodeDelegatedClaimCursor,
  decodeLeadCursor,
  decodeOperatorAppCursor,
  decodeOperatorJobCursor,
  decodeOperatorNodeCursor,
  decodeSteeringProfileCursor,
  decodeSuppressedTargetCursor,
  decodeTakedownCursor,
  type OperatorEnvironment
} from "vrc-packages-api";
import {
  CoordinatorConflict,
  UnsupportedMediaTypeError,
  type OperatorStore
} from "../domain/ports/stores.ts";
import { workerLogger } from "../worker_logger.ts";
import { isOperatorAuthorized, parseIntegerQueryParam } from "./auth.ts";
import { readJson } from "./handler.ts";
import {
  RATE_LIMIT_POLICIES,
  applyRateLimitHeaders,
  defaultRateLimiter,
  extractClientIp,
  rateLimitResponse,
  type IRateLimiter
} from "./rate_limiter.ts";

export type { OperatorStore };

export interface OperatorHandlerOptions {
  environment?: OperatorEnvironment;
  purgeEnabled?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: OPERATOR_PROTOCOL_VERSION, code, error: message }, status);
}

const INTEGER_QUERY_KEYS = new Set(["limit", "priorityLane"]);

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
    rawQuery[key] = INTEGER_QUERY_KEYS.has(key) ? parseIntegerQueryParam(value) : value;
  }
  const parsed = schema.safeParse(rawQuery);
  return parsed.success ? parsed.data : null;
}

const NOT_FOUND_MESSAGES = new Set([
  "Lead not found",
  "Steering profile not found",
  "Suppressed target not found",
  "Job not found",
  "Takedown not found",
  "Node not found",
  "Claim not found",
  "App not found"
]);

/** Separate operator boundary. Node credentials never grant these controls. */
export async function handleOperatorRequest(
  request: Request,
  store: OperatorStore,
  configuredToken: string,
  rateLimiter: IRateLimiter = defaultRateLimiter,
  options: OperatorHandlerOptions = {}
): Promise<Response> {
  const url = new URL(request.url);
  const environment: OperatorEnvironment = options.environment ?? "development";
  const purgeEnabled = options.purgeEnabled === true;

  const isStatus = request.method === "GET" && url.pathname === "/v1/operator/status";
  const isInit = request.method === "POST" && url.pathname === "/v1/operator/init";
  const isPurge = request.method === "POST" && url.pathname === "/v1/operator/system/purge";

  const nodeListing = request.method === "GET" && url.pathname === "/v1/operator/nodes";
  const nodeIssue = request.method === "POST" && url.pathname === "/v1/operator/nodes";
  const nodeRevoke =
    request.method === "POST" ? /^\/v1\/operator\/nodes\/([A-Za-z0-9._-]{1,100})\/revoke$/.exec(url.pathname) : null;
  const nodePrune =
    request.method === "DELETE" ? /^\/v1\/operator\/nodes\/([A-Za-z0-9._-]{1,100})$/.exec(url.pathname) : null;

  const jobListing = request.method === "GET" && url.pathname === "/v1/operator/jobs";
  const jobEnqueue = request.method === "POST" && url.pathname === "/v1/operator/jobs";
  const jobRequeue =
    request.method === "POST" ? /^\/v1\/operator\/jobs\/([^/]+)\/requeue$/.exec(url.pathname) : null;
  const jobUpdate =
    request.method === "PATCH" && !url.pathname.endsWith("/requeue")
      ? /^\/v1\/operator\/jobs\/([^/]+)$/.exec(url.pathname)
      : null;
  const jobDelete =
    request.method === "DELETE" ? /^\/v1\/operator\/jobs\/([^/]+)$/.exec(url.pathname) : null;

  const leadListing = request.method === "GET" && url.pathname === "/v1/operator/leads";
  const leadBulkApprove = request.method === "POST" && url.pathname === "/v1/operator/leads/bulk-approve";
  const leadSuppressDomain = request.method === "POST" && url.pathname === "/v1/operator/leads/suppress-domain";
  const leadAction =
    request.method === "POST" ? /^\/v1\/operator\/leads\/([a-f0-9]{64})\/(approve|reject)$/.exec(url.pathname) : null;

  const profileListing = request.method === "GET" && url.pathname === "/v1/operator/steering-profiles";
  const profileCreate = request.method === "POST" && url.pathname === "/v1/operator/steering-profiles";
  const profileEnable =
    request.method === "POST" ? /^\/v1\/operator\/steering-profiles\/([^/]+)\/enable$/.exec(url.pathname) : null;
  const profileDisable =
    request.method === "POST" ? /^\/v1\/operator\/steering-profiles\/([^/]+)\/disable$/.exec(url.pathname) : null;
  const profileUpdate =
    request.method === "PATCH" ? /^\/v1\/operator\/steering-profiles\/([^/]+)$/.exec(url.pathname) : null;
  const profileDelete =
    request.method === "DELETE" ? /^\/v1\/operator\/steering-profiles\/([^/]+)$/.exec(url.pathname) : null;

  const suppressedListing = request.method === "GET" && url.pathname === "/v1/operator/suppressed-targets";
  const suppressedCreate = request.method === "POST" && url.pathname === "/v1/operator/suppressed-targets";
  const suppressedDelete = request.method === "DELETE" && url.pathname === "/v1/operator/suppressed-targets";

  const catalogListing = request.method === "GET" && url.pathname === "/v1/operator/catalog";
  const takedownListing = request.method === "GET" && url.pathname === "/v1/operator/takedowns";
  const takedownVerify =
    request.method === "POST" ? /^\/v1\/operator\/takedowns\/([^/]+)\/verify$/.exec(url.pathname) : null;
  const claimListing = request.method === "GET" && url.pathname === "/v1/operator/claims";
  const claimVerify =
    request.method === "POST" ? /^\/v1\/operator\/claims\/([^/]+)\/verify$/.exec(url.pathname) : null;
  const appListing = request.method === "GET" && url.pathname === "/v1/operator/apps";
  const appDelegation =
    request.method === "POST" ? /^\/v1\/operator\/apps\/([^/]+)\/delegation$/.exec(url.pathname) : null;
  const appCandidateReview =
    request.method === "POST" ? /^\/v1\/operator\/apps\/([^/]+)\/candidate-review$/.exec(url.pathname) : null;

  const isGetRoute =
    isStatus ||
    nodeListing ||
    jobListing ||
    leadListing ||
    profileListing ||
    suppressedListing ||
    catalogListing ||
    takedownListing ||
    claimListing ||
    appListing;

  const isMutatingRoute =
    isInit ||
    isPurge ||
    nodeIssue ||
    Boolean(nodeRevoke) ||
    Boolean(nodePrune) ||
    jobEnqueue ||
    Boolean(jobUpdate) ||
    Boolean(jobRequeue) ||
    Boolean(jobDelete) ||
    leadBulkApprove ||
    leadSuppressDomain ||
    Boolean(leadAction) ||
    profileCreate ||
    Boolean(profileUpdate) ||
    Boolean(profileEnable) ||
    Boolean(profileDisable) ||
    Boolean(profileDelete) ||
    suppressedCreate ||
    suppressedDelete ||
    Boolean(takedownVerify) ||
    Boolean(claimVerify) ||
    Boolean(appDelegation) ||
    Boolean(appCandidateReview);

  if (!isGetRoute && !isMutatingRoute) {
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

  const profilePathId =
    profileUpdate?.[1] ?? profileEnable?.[1] ?? profileDisable?.[1] ?? profileDelete?.[1];
  const rawJobPathId = jobUpdate?.[1] ?? jobRequeue?.[1] ?? jobDelete?.[1];
  const decodedJobId = rawJobPathId !== undefined ? decodeURIComponent(rawJobPathId) : undefined;

  if (
    (profilePathId !== undefined && !SteeringProfileCursorSchema.shape.profileId.safeParse(profilePathId).success) ||
    (decodedJobId !== undefined && !OperatorJobIdSchema.safeParse(decodedJobId).success) ||
    (takedownVerify && !TakedownCursorSchema.shape.takedownId.safeParse(takedownVerify[1]).success) ||
    (claimVerify && !DelegatedClaimCursorSchema.shape.claimId.safeParse(claimVerify[1]).success) ||
    (appDelegation && !OperatorAppCursorSchema.shape.appId.safeParse(appDelegation[1]).success) ||
    (appCandidateReview && !OperatorAppCursorSchema.shape.appId.safeParse(appCandidateReview[1]).success)
  ) {
    return failure(404, "not_found", "Route not found");
  }

  if (isStatus) {
    const statusPayload = await store.getOperatorStatus(environment, purgeEnabled);
    return ok(OperatorStatusResponseSchema.parse(statusPayload));
  }

  if (leadListing) {
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

  if (profileListing) {
    const query = parseOperatorListQuery(
      url.searchParams,
      ["limit", "cursor"],
      OperatorSteeringProfileListQuerySchema
    );
    const cursor = query?.cursor ? decodeSteeringProfileCursor(query.cursor) : null;
    if (!query || (query.cursor !== undefined && !cursor)) {
      return failure(400, "invalid_query", "Steering profile limit or cursor is invalid");
    }
    return ok(
      SteeringProfileListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listSteeringProfilesPage(
          query.limit,
          cursor ? { ...cursor, profileId: cursor.profileId.toLowerCase() } : null
        ))
      })
    );
  }

  if (suppressedListing) {
    const query = parseOperatorListQuery(
      url.searchParams,
      ["limit", "cursor"],
      OperatorSuppressedTargetListQuerySchema
    );
    const cursor = query?.cursor ? decodeSuppressedTargetCursor(query.cursor) : null;
    if (!query || (query.cursor !== undefined && !cursor)) {
      return failure(400, "invalid_query", "Suppressed target limit or cursor is invalid");
    }
    return ok(
      SuppressedTargetListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listSuppressedTargetsPage(query.limit, cursor))
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
    const cursor = query.data.cursor ? decodeDelegatedClaimCursor(query.data.cursor) : null;
    return ok(
      DelegatedClaimListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listDelegatedClaimsPage(
          query.data.reviewStatus,
          query.data.limit,
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
    const cursor = query.data.cursor ? decodeOperatorAppCursor(query.data.cursor) : null;
    return ok(
      OperatorAppListResponseSchema.parse({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        ...(await store.listOperatorAppsPage(
          query.data.limit,
          cursor ? { ...cursor, appId: cursor.appId.toLowerCase() } : null,
          query.data.candidateStatus
        ))
      })
    );
  }

  if (nodeListing) {
    const query = parseOperatorListQuery(url.searchParams, ["status", "limit", "cursor"], OperatorNodeListQuerySchema);
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
      ["state", "platform", "priorityLane", "limit", "cursor"],
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
          { state: query.state, platform: query.platform, priorityLane: query.priorityLane },
          query.limit,
          cursor
        ))
      })
    );
  }

  if (isPurge && !purgeEnabled) {
    workerLogger.warn("Blocked development purge request outside development environment", { environment });
    return failure(403, "forbidden", "Development D1 system purge is disabled outside VRCP_ENV=development");
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
    if (isInit) {
      const parsed = InitializeCoordinatorRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Invalid initialization payload");
      if (!store.initSchema) {
        return failure(501, "not_implemented", "Schema initialization not supported by store");
      }
      await store.initSchema({ autoSeed: false });
      workerLogger.info("Coordinator D1 schema initialized via /v1/operator/init", { autoSeed: false });
      return ok(
        InitializeCoordinatorResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          status: "ok",
          message: "Schema initialized",
          autoSeed: false
        })
      );
    }

    if (isPurge) {
      const parsed = SystemPurgeRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "System purge payload is invalid");
      const response = await store.purgeDevelopmentDatabase(parsed.data, "operator-api");
      workerLogger.info("Development D1 schema purged via /v1/operator/system/purge", {
        preservedNodes: response.preservedNodes,
        seededProfiles: response.seededProfiles
      });
      return ok(SystemPurgeResponseSchema.parse(response));
    }

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

    if (nodePrune) {
      const parsed = RevokeNodeRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", parsed.error.issues[0]?.message ?? "Invalid prune body");
      await store.pruneNode(nodePrune[1], "operator-api", parsed.data.reason);
      return ok(
        PruneNodeResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: nodePrune[1],
          status: "pruned"
        })
      );
    }

    if (nodeIssue) {
      const parsed = IssueNodeCredentialSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Node credential body is invalid");
      const issued = await store.issueNodeCredential(parsed.data, "operator-api");
      return ok(
        NodeCredentialResponseSchema.parse({
          schemaVersion: OPERATOR_PROTOCOL_VERSION,
          nodeId: parsed.data.nodeId,
          capabilities: issued.capabilities,
          token: issued.token
        }),
        201
      );
    }

    if (jobEnqueue) {
      const parsed = EnqueueJobRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Job body is invalid");
      const jobId = await store.enqueueJob(parsed.data, "operator-api");
      return ok(EnqueueJobResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, jobId }));
    }

    if (jobUpdate && decodedJobId !== undefined) {
      const parsed = UpdateJobRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Update job body is invalid");
      const job = await store.updateJob(decodedJobId, parsed.data, "operator-api");
      return ok(UpdateJobResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, job }));
    }

    if (jobRequeue && decodedJobId !== undefined) {
      const parsed = RequeueJobRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Requeue job body is invalid");
      const job = await store.requeueJob(decodedJobId, parsed.data, "operator-api");
      return ok(RequeueJobResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, job }));
    }

    if (jobDelete && decodedJobId !== undefined) {
      const parsed = DeleteJobRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Delete job body is invalid");
      const result = await store.deleteJob(decodedJobId, "operator-api", parsed.data.reason);
      return ok(DeleteJobResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }

    if (profileCreate) {
      const parsed = CreateSteeringProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Steering profile body is invalid");
      const profile = await store.createSteeringProfile(parsed.data, "operator-api");
      return ok(SteeringProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }), 201);
    }

    if (profileUpdate) {
      const parsed = UpdateSteeringProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Steering profile update body is invalid");
      const profile = await store.updateSteeringProfile(
        profileUpdate[1].toLowerCase(),
        parsed.data,
        "operator-api"
      );
      return ok(SteeringProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }));
    }

    if (profileEnable) {
      const parsed = SteeringProfileActionSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Enable body is invalid");
      const profile = await store.enableSteeringProfile(
        profileEnable[1].toLowerCase(),
        "operator-api",
        parsed.data.reason
      );
      return ok(SteeringProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }));
    }

    if (profileDisable) {
      const parsed = SteeringProfileActionSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Disable body is invalid");
      const profile = await store.disableSteeringProfile(
        profileDisable[1].toLowerCase(),
        "operator-api",
        parsed.data.reason
      );
      return ok(SteeringProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, profile }));
    }

    if (profileDelete) {
      const parsed = SteeringProfileActionSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Delete profile body is invalid");
      const result = await store.deleteSteeringProfile(
        profileDelete[1].toLowerCase(),
        "operator-api",
        parsed.data.reason
      );
      return ok(SteeringProfileDeleteResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }

    if (suppressedCreate) {
      const parsed = CreateSuppressedTargetSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Suppressed target body is invalid");
      const suppressedTarget = await store.createSuppressedTarget(parsed.data, "operator-api");
      return ok(
        SuppressedTargetResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, suppressedTarget }),
        201
      );
    }

    if (suppressedDelete) {
      const parsed = DeleteSuppressedTargetSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Delete suppressed target body is invalid");
      const result = await store.deleteSuppressedTarget(
        parsed.data.target,
        "operator-api",
        parsed.data.reason
      );
      return ok(
        SuppressedTargetDeleteResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result })
      );
    }

    if (leadBulkApprove) {
      const parsed = BulkApproveLeadsRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Bulk approve leads body is invalid");
      const result = await store.bulkApproveLeads(parsed.data, "operator-api");
      return ok(BulkApproveLeadsResponseSchema.parse(result));
    }

    if (leadSuppressDomain) {
      const parsed = SuppressLeadDomainRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Suppress lead domain body is invalid");
      const result = await store.suppressLeadDomain(parsed.data, "operator-api");
      return ok(SuppressLeadDomainResponseSchema.parse(result));
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
      return ok(SetAppDelegationResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }

    if (appCandidateReview) {
      const parsed = ReviewAppCandidateRequestSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Candidate review body is invalid");
      const result = await store.reviewAppCandidate(appCandidateReview[1].toLowerCase(), parsed.data, "operator-api");
      return ok(ReviewAppCandidateResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, ...result }));
    }

    const [, leadKey, action] = leadAction!;
    if (action === "approve") {
      const parsed = ApproveLeadSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Approval body is invalid");
      const jobId = await store.approveLead(
        leadKey,
        parsed.data.minDelayMs,
        "operator-api",
        parsed.data.reason
      );
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
    if (error instanceof CoordinatorConflict) {
      const code = error.status === 403 ? "forbidden" : error.status === 404 ? "not_found" : error.status === 400 ? "invalid_payload" : "conflict";
      workerLogger.warn("Operator conflict", { path: url.pathname, status: error.status, message: error.message });
      return failure(error.status, code, error.message);
    }
    const message = error instanceof Error ? error.message : "Operator action failed";
    if (message === "Node not revoked") return failure(409, "not_revoked", "Node must be revoked before it can be pruned.");
    const missing = NOT_FOUND_MESSAGES.has(message);
    workerLogger.warn("Operator action failed", { path: url.pathname, message, missing }, error);
    return failure(missing ? 404 : 409, missing ? "not_found" : "conflict", message);
  }
}

export function createOperatorHandler(
  store: OperatorStore,
  configuredToken: string,
  rateLimiter: IRateLimiter = defaultRateLimiter,
  options: OperatorHandlerOptions = {}
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/v1/operator/")) return null;
    return handleOperatorRequest(request, store, configuredToken, rateLimiter, options);
  };
}
