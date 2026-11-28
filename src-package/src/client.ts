import { z } from "zod";
import {
  type Platform
} from "./types/index.ts";
import {
  CatalogPackageClientReadSchema
} from "./types/package.ts";
import {
  CATALOG_PROTOCOL_VERSION,
  CatalogDeltaActionSchema,
  type CatalogDeltaResponse,
  CatalogDeltaQuerySchema,
  type PublicCatalogListQuery,
  PublicCatalogListQuerySchema,
  type PublicCatalogListResponse,
  decodeCatalogCursor,
  decodeCatalogDeltaCursor
} from "./protocol/catalog.ts";
import {
  DOWNSTREAM_PROTOCOL_VERSION,
  QueryOriginSchema,
  type CatalogSearchRequest,
  CatalogSearchRequestSchema,
  type CatalogSearchResponse,
  type RegisterAppRequest,
  RegisterAppRequestSchema,
  type RegisterAppResponse,
  RegisterAppResponseSchema,
  type ReportSubmissionRequest,
  ReportSubmissionRequestSchema,
  type ReportSubmissionResponse,
  ReportSubmissionResponseSchema,
  type CreatorClaimIntakeRequest,
  CreatorClaimIntakeRequestSchema,
  type CreatorClaimIntakeResponse,
  CreatorClaimIntakeResponseSchema,
  type QueryOrigin
} from "./protocol/downstream.ts";
import {
  UserAppListQuerySchema,
  UserAppListResponseSchema,
  UserAppResponseSchema,
  UserAppSchema,
  type UserAppListQuery,
  type UserAppListResponse,
  type UserAppResponse
} from "./protocol/user.ts";
import {
  MODERATOR_PROTOCOL_VERSION,
  ModeratorRatingRecordSchema,
  type ModeratorRatingListResponse,
  ModeratorRatingListResponseSchema,
  ModeratorRatingListQuerySchema,
  SetRatingAdjustmentRequestSchema,
  type SetRatingAdjustmentResponse,
  SetRatingAdjustmentResponseSchema,
  ModeratorAppCursorSchema,
  ModeratorAppListQuerySchema,
  type ModeratorAppListResponse,
  ModeratorAppListResponseSchema,
  ModeratorReviewAppCandidateRequestSchema,
  type ModeratorReviewAppCandidateResponse,
  ModeratorReviewAppCandidateResponseSchema
} from "./protocol/moderator.ts";
import { type ContentRating, type Umbrella } from "./taxonomy/taxonomy.ts";
import {
  type LeadStatus,
  type CandidateStatus,
  type PriorityLane,
  OperatorJobIdSchema,
  OperatorStatusResponseSchema,
  type OperatorStatusResponse,
  SystemPurgeRequestSchema,
  type SystemPurgeRequest,
  SystemPurgeResponseSchema,
  type SystemPurgeResponse,
  OperatorLeadListQuerySchema,
  OperatorSteeringProfileListQuerySchema,
  OperatorSuppressedTargetListQuerySchema,
  OperatorCatalogListQuerySchema,
  OperatorTakedownListQuerySchema,
  OperatorClaimListQuerySchema,
  OperatorAppListQuerySchema,
  OperatorAppListResponseSchema,
  type OperatorAppListResponse,
  SetAppDelegationRequestSchema,
  SetAppDelegationResponseSchema,
  type SetAppDelegationResponse,
  ReviewAppCandidateRequestSchema,
  ReviewAppCandidateResponseSchema,
  type ReviewAppCandidateResponse,
  LeadCursorSchema,
  SteeringProfileCursorSchema,
  TakedownCursorSchema,
  DelegatedClaimCursorSchema,
  OperatorAppCursorSchema,
  ApproveLeadSchema,
  RejectLeadSchema,
  BulkApproveLeadsRequestSchema,
  type BulkApproveLeadsRequest,
  BulkApproveLeadsResponseSchema,
  type BulkApproveLeadsResponse,
  SuppressLeadDomainRequestSchema,
  type SuppressLeadDomainRequest,
  SuppressLeadDomainResponseSchema,
  type SuppressLeadDomainResponse,
  CreateSteeringProfileSchema,
  type CreateSteeringProfile,
  UpdateSteeringProfileSchema,
  type UpdateSteeringProfile,
  SteeringProfileActionSchema,
  SteeringProfileDeleteResponseSchema,
  type SteeringProfileDeleteResponse,
  SteeringProfileResponseSchema,
  type SteeringProfileResponse,
  SteeringProfileListResponseSchema,
  type SteeringProfileListResponse,
  CreateSuppressedTargetSchema,
  type CreateSuppressedTarget,
  DeleteSuppressedTargetSchema,
  type DeleteSuppressedTarget,
  SuppressedTargetResponseSchema,
  type SuppressedTargetResponse,
  SuppressedTargetListResponseSchema,
  type SuppressedTargetListResponse,
  SuppressedTargetDeleteResponseSchema,
  type SuppressedTargetDeleteResponse,
  IssueNodeCredentialSchema,
  type IssueNodeCredential,
  NodeCredentialResponseSchema,
  type NodeCredentialResponse,
  RevokeNodeRequestSchema,
  RevokeNodeResponseSchema,
  type RevokeNodeResponse,
  PruneNodeResponseSchema,
  type PruneNodeResponse,
  type OperatorNodeStatus,
  OperatorNodeListQuerySchema,
  OperatorNodeListResponseSchema,
  type OperatorNodeListResponse,
  type OperatorJobState,
  OperatorJobListQuerySchema,
  OperatorJobListResponseSchema,
  type OperatorJobListResponse,
  EnqueueJobRequestSchema,
  EnqueueJobResponseSchema,
  type EnqueueJobRequest,
  type EnqueueJobResponse,
  UpdateJobRequestSchema,
  type UpdateJobRequest,
  UpdateJobResponseSchema,
  type UpdateJobResponse,
  RequeueJobRequestSchema,
  type RequeueJobRequest,
  RequeueJobResponseSchema,
  type RequeueJobResponse,
  DeleteJobRequestSchema,
  DeleteJobResponseSchema,
  type DeleteJobResponse,
  InitializeCoordinatorRequestSchema,
  InitializeCoordinatorResponseSchema,
  type InitializeCoordinatorResponse,
  type LeadListResponse,
  LeadListResponseSchema,
  type LeadActionResponse,
  LeadActionResponseSchema,
  type CatalogListResponse,
  type TakedownListResponse,
  TakedownListResponseSchema,
  VerifyTakedownRequestSchema,
  type VerifyTakedownResponse,
  VerifyTakedownResponseSchema,
  VerifyDelegatedClaimRequestSchema,
  VerifyDelegatedClaimResponseSchema,
  type VerifyDelegatedClaimResponse,
  DelegatedClaimListResponseSchema,
  type DelegatedClaimListResponse,
  OperatorStagingListQuerySchema,
  OperatorStagingListResponseSchema,
  type OperatorStagingListResponse,
  type OperatorStagingAuditState,
  OperatorStagingDecisionRequestSchema,
  OperatorStagingDecisionResponseSchema,
  type OperatorStagingDecisionResponse,
  OperatorVocabularyResponseSchema,
  type OperatorVocabularyResponse,
  OperatorVocabularyUpsertRequestSchema,
  OperatorVocabularyUpsertResponseSchema,
  type OperatorVocabularyUpsertResponse,
  type VocabularyRuleKind
} from "./protocol/operator.ts";
import { CursorTimestampSchema, CursorTokenSchema } from "./encoding/cursor.ts";

export const MAX_SDK_ERROR_BYTES = 64 * 1024;
export const MAX_SDK_SUCCESS_BYTES = 4 * 1024 * 1024;
export const DEFAULT_SDK_TIMEOUT_MS = 15_000;

const ClientPublicCatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PROTOCOL_VERSION),
  packages: z.array(CatalogPackageClientReadSchema),
  nextCursor: CursorTokenSchema.refine((value) => decodeCatalogCursor(value) !== null, "Invalid catalog cursor").nullable()
});

const ClientCatalogSearchResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  items: z.array(CatalogPackageClientReadSchema),
  nextCursor: CursorTokenSchema.refine((value) => decodeCatalogCursor(value) !== null, "Invalid search cursor").nullable().optional(),
  totalEstimated: z.number().int().min(0).optional(),
  count: z.number().int().min(0).optional(),
  queryOrigin: QueryOriginSchema.optional()
});

const ClientCatalogDeltaSchema = z.strictObject({
  action: CatalogDeltaActionSchema,
  canonicalId: z.string().min(1).max(500),
  updatedAt: CursorTimestampSchema,
  package: CatalogPackageClientReadSchema.optional()
});

const ClientCatalogDeltaResponseSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_PROTOCOL_VERSION),
  epoch: z.string().min(1).max(100),
  deltas: z.array(ClientCatalogDeltaSchema),
  nextCursor: CursorTokenSchema.refine((value) => decodeCatalogDeltaCursor(value) !== null, "Invalid delta cursor").nullable()
});

const ClientOperatorCatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  packages: z.array(CatalogPackageClientReadSchema),
  nextCursor: CursorTokenSchema.refine((value) => decodeCatalogCursor(value) !== null, "Invalid Catalog cursor").nullable()
});

export interface VRCPClientTelemetryEvent {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  status: number;
  durationMs: number;
  requestId: string | null;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  retryAfterSec: number | null;
  errorCode?: string;
}

function parseNumericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = parseNumericHeader(response.headers, "content-length");
  if (declared !== null && declared > maxBytes) {
    await response.body?.cancel();
    throw new VRCPApiError(response.status, `Response exceeds maximum byte limit of ${maxBytes} bytes`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new VRCPApiError(response.status, `Response exceeds maximum byte limit of ${maxBytes} bytes`);
    }
    return text;
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new VRCPApiError(response.status, `Response exceeds maximum byte limit of ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export class VRCPApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "VRCPApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface VRCPackageClientOptions {
  /** Coordinator baseUrl, e.g. "https://api.vrc-packages.example" or "http://127.0.0.1:8787" */
  baseUrl: string;
  /** Downstream application token starting with `vrcp_app_` */
  appToken?: string;
  /** User token starting with `vrcp_usr_` */
  userToken?: string;
  /** Operator token for administrative endpoints */
  operatorToken?: string;
  /** Request timeout in milliseconds (defaults to 15000). */
  timeoutMs?: number;
  /** Optional non-secret telemetry observer invoked on each HTTP response or transport error. */
  onTelemetry?: (event: VRCPClientTelemetryEvent) => void;
  /** Custom fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
}

export interface CatalogSearchParams {
  query?: string;
  queryOrigin: QueryOrigin;
  umbrella?: Umbrella;
  category?: string;
  platform?: Platform;
  rating?: ContentRating;
  tags?: string[];
  limit?: number;
  cursor?: string | null;
}

const CanonicalIdPathParamSchema = ModeratorRatingRecordSchema.shape.canonicalId.refine(
  (value) => value.trim().length > 0 && value.trim() !== "." && value.trim() !== "..",
  "Canonical package ID cannot be blank, '.', or '..'"
);

export interface SyncDeltasParams {
  cursor?: string;
  limit?: number;
}

export class VRCPackageClient {
  private readonly baseUrl: string;
  private readonly appToken?: string;
  private readonly userToken?: string;
  private readonly operatorToken?: string;
  private readonly timeoutMs: number;
  private readonly onTelemetry?: (event: VRCPClientTelemetryEvent) => void;
  private readonly fetchFn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: VRCPackageClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.appToken = options.appToken;
    this.userToken = options.userToken;
    this.operatorToken = options.operatorToken;
    this.timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_SDK_TIMEOUT_MS;
    this.onTelemetry = options.onTelemetry;
    const resolvedFetch = options.fetch ?? globalThis.fetch;
    this.fetchFn = (input, init) => resolvedFetch(input, init);
  }

  private emitTelemetry(event: VRCPClientTelemetryEvent): void {
    if (!this.onTelemetry) return;
    try {
      this.onTelemetry(event);
    } catch {
      // Telemetry callbacks must never break API calls.
    }
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    options: {
      auth?: "app" | "user" | "operator" | "none";
      body?: unknown;
      queryParams?: Record<string, string | number | undefined>;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.queryParams) {
      for (const [key, val] of Object.entries(options.queryParams)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const headers: Record<string, string> = {
      "Accept": "application/json"
    };

    if (options.auth === "app") {
      if (!this.appToken) {
        throw new VRCPApiError(401, "Application token (vrcp_app_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.appToken}`;
    } else if (options.auth === "user") {
      if (!this.userToken) {
        throw new VRCPApiError(401, "User token (vrcp_usr_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.userToken}`;
    } else if (options.auth === "operator") {
      if (!this.operatorToken) {
        throw new VRCPApiError(401, "Operator token required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.operatorToken}`;
    }

    let requestBody: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`Request timed out after ${this.timeoutMs}ms`)), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method,
        headers,
        body: requestBody,
        redirect: "manual",
        signal: controller.signal
      });
    } catch (cause) {
      clearTimeout(timeoutId);
      const isTimeout = controller.signal.aborted;
      this.emitTelemetry({
        method,
        path,
        status: isTimeout ? 408 : 0,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId: null,
        rateLimitLimit: null,
        rateLimitRemaining: null,
        retryAfterSec: null,
        errorCode: isTimeout ? "request_timeout" : "network_error"
      });
      if (isTimeout) {
        throw new VRCPApiError(408, `Request timed out after ${this.timeoutMs}ms`, "request_timeout");
      }
      throw cause;
    }
    clearTimeout(timeoutId);

    const requestId = response.headers.get("X-Request-Id");
    const rateLimitLimit = parseNumericHeader(response.headers, "X-RateLimit-Limit");
    const rateLimitRemaining = parseNumericHeader(response.headers, "X-RateLimit-Remaining");
    const retryAfterSec = parseNumericHeader(response.headers, "Retry-After");

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      this.emitTelemetry({
        method,
        path,
        status: response.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId,
        rateLimitLimit,
        rateLimitRemaining,
        retryAfterSec,
        errorCode: "redirect_not_permitted"
      });
      throw new VRCPApiError(response.status, "API redirects are not permitted");
    }

    if (!response.ok) {
      const errorText = await readBoundedText(response, MAX_SDK_ERROR_BYTES);
      let errorBody: any = errorText;
      try {
        errorBody = JSON.parse(errorText);
      } catch {}
      const message = typeof errorBody === "object" && (errorBody?.message || errorBody?.error)
        ? (errorBody.message || errorBody.error)
        : `Request failed with status ${response.status}`;
      const code = typeof errorBody === "object" ? (errorBody?.code ?? errorBody?.error) : undefined;
      this.emitTelemetry({
        method,
        path,
        status: response.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId,
        rateLimitLimit,
        rateLimitRemaining,
        retryAfterSec,
        errorCode: typeof code === "string" ? code : undefined
      });
      throw new VRCPApiError(response.status, message, code, errorBody);
    }

    const responseText = await readBoundedText(response, MAX_SDK_SUCCESS_BYTES);
    try {
      const parsed = JSON.parse(responseText) as T;
      this.emitTelemetry({
        method,
        path,
        status: response.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId,
        rateLimitLimit,
        rateLimitRemaining,
        retryAfterSec
      });
      return parsed;
    } catch {
      this.emitTelemetry({
        method,
        path,
        status: response.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId,
        rateLimitLimit,
        rateLimitRemaining,
        retryAfterSec,
        errorCode: "invalid_json"
      });
      throw new VRCPApiError(
        response.status,
        `Invalid JSON response received with status ${response.status}`,
        "invalid_json",
        responseText
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Public and App Catalog Namespace (/v1/app/*)                             */
  /* ------------------------------------------------------------------------ */

  readonly index = {
    /**
     * Queries the public canonical package index projection (GET /v1/app/index).
     */
    query: async (params: PublicCatalogListQuery = {}): Promise<PublicCatalogListResponse> => {
      const query = PublicCatalogListQuerySchema.parse(params);
      const res = await this.request<unknown>("/v1/app/index", "GET", {
        auth: "none",
        queryParams: {
          limit: query.limit,
          cursor: query.cursor
        }
      });
      return ClientPublicCatalogListResponseSchema.parse(res) as unknown as PublicCatalogListResponse;
    },

    /**
     * Executes bounded search with mandatory query attribution (user_authored vs app_automated).
     * Requires downstream application token (POST /v1/app/index/search).
     */
    search: async (params: CatalogSearchParams): Promise<CatalogSearchResponse> => {
      const payload: CatalogSearchRequest = {
        schemaVersion: 1,
        query: params.query,
        queryOrigin: params.queryOrigin,
        umbrella: params.umbrella,
        category: params.category,
        platform: params.platform,
        rating: params.rating,
        tags: params.tags,
        limit: params.limit ?? 50,
        cursor: params.cursor
      };
      const res = await this.request<unknown>("/v1/app/index/search", "POST", {
        auth: "app",
        body: CatalogSearchRequestSchema.parse(payload)
      });
      return ClientCatalogSearchResponseSchema.parse(res) as unknown as CatalogSearchResponse;
    },

    /**
     * Pages current catalog changes (GET /v1/app/index/delta), not an immutable event log.
     */
    syncDeltas: async (params: SyncDeltasParams = {}): Promise<CatalogDeltaResponse> => {
      const query = CatalogDeltaQuerySchema.parse(params);
      const res = await this.request<unknown>("/v1/app/index/delta", "GET", {
        auth: "none",
        queryParams: {
          cursor: query.cursor,
          limit: query.limit
        }
      });
      return ClientCatalogDeltaResponseSchema.parse(res) as unknown as CatalogDeltaResponse;
    }
  };

  readonly app = {
    /**
     * Registers a downstream application (POST /v1/app/register).
     * Gated by user authentication (userToken) or operator token.
     */
    register: async (
      request: RegisterAppRequest,
      options?: { auth?: "user" | "operator" }
    ): Promise<RegisterAppResponse> => {
      const body = RegisterAppRequestSchema.parse(request);
      let auth: "user" | "operator";
      if (options?.auth) {
        auth = options.auth;
      } else if (this.userToken && this.operatorToken) {
        throw new VRCPApiError(
          400,
          "Ambiguous credentials for app registration: specify auth 'user' or 'operator' when both tokens are configured"
        );
      } else if (this.userToken) {
        auth = "user";
      } else if (this.operatorToken) {
        auth = "operator";
      } else {
        throw new VRCPApiError(401, "User or operator token required");
      }
      const res = await this.request<unknown>("/v1/app/register", "POST", {
        auth,
        body
      });
      return RegisterAppResponseSchema.parse(res);
    }
  };

  readonly reports = {
    /**
     * Submits demand, relationship feedback, issue, or pending removal reports (POST /v1/app/report).
     * Requires downstream application token.
     */
    submit: async (report: ReportSubmissionRequest): Promise<ReportSubmissionResponse> => {
      const res = await this.request<unknown>("/v1/app/report", "POST", {
        auth: "app",
        body: ReportSubmissionRequestSchema.parse(report)
      });
      return ReportSubmissionResponseSchema.parse(res);
    }
  };

  readonly claims = {
    /**
     * Submits signed creator ownership claim attestation for review (POST /v1/app/claims/intake).
     * Requires downstream application token.
     */
    submitIntake: async (request: CreatorClaimIntakeRequest): Promise<CreatorClaimIntakeResponse> => {
      const res = await this.request<unknown>("/v1/app/claims/intake", "POST", {
        auth: "app",
        body: CreatorClaimIntakeRequestSchema.parse(request)
      });
      return CreatorClaimIntakeResponseSchema.parse(res);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* User Namespace (/v1/user/*)                                              */
  /* ------------------------------------------------------------------------ */

  readonly user = {
    apps: {
      list: async (params: Partial<UserAppListQuery> = {}): Promise<UserAppListResponse> => {
        const query = UserAppListQuerySchema.parse(params);
        if (query.cursor) query.cursor = query.cursor.toLowerCase();
        return UserAppListResponseSchema.parse(
          await this.request<unknown>("/v1/user/apps", "GET", { auth: "user", queryParams: query })
        );
      },
      get: async (appId: string): Promise<UserAppResponse> => {
        const id = UserAppSchema.shape.appId.parse(appId).toLowerCase();
        return UserAppResponseSchema.parse(
          await this.request<unknown>(`/v1/user/apps/${id}`, "GET", { auth: "user" })
        );
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Admin Operator Protocol (/v1/operator/*)                                 */
  /* ------------------------------------------------------------------------ */

  readonly operator = {
    /**
     * Reads Coordinator environment, development purge availability, and queue readiness (GET /v1/operator/status).
     */
    status: async (): Promise<OperatorStatusResponse> => {
      const res = await this.request<unknown>("/v1/operator/status", "GET", { auth: "operator" });
      return OperatorStatusResponseSchema.parse(res);
    },

    /**
     * Executes a development-only D1 schema purge and rebuild (POST /v1/operator/system/purge).
     */
    systemPurge: async (request: SystemPurgeRequest): Promise<SystemPurgeResponse> => {
      const body = SystemPurgeRequestSchema.parse(request);
      const res = await this.request<unknown>("/v1/operator/system/purge", "POST", {
        auth: "operator",
        body
      });
      return SystemPurgeResponseSchema.parse(res);
    },

    /** Initialize Coordinator storage schema without auto-seeding unauthorized source grants. */
    init: async (params: { autoSeed?: false } = {}): Promise<InitializeCoordinatorResponse> => {
      const body = InitializeCoordinatorRequestSchema.parse({ schemaVersion: 1, ...params });
      const response = await this.request<unknown>("/v1/operator/init", "POST", { auth: "operator", body });
      return InitializeCoordinatorResponseSchema.parse(response);
    },

    jobs: {
      /**
       * Lists operator crawl jobs with optional state, platform, priority lane, query, and targetHost filters (GET /v1/operator/jobs).
       */
      list: async (params: {
        state?: OperatorJobState;
        platform?: Platform;
        priorityLane?: PriorityLane;
        query?: string;
        targetHost?: string;
        limit?: number;
        cursor?: string;
      } = {}): Promise<OperatorJobListResponse> => {
        const query = OperatorJobListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/jobs", "GET", {
          auth: "operator",
          queryParams: {
            state: query.state,
            platform: query.platform,
            priorityLane: query.priorityLane,
            query: query.query,
            targetHost: query.targetHost,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return OperatorJobListResponseSchema.parse(res);
      },

      /** Record a crawl candidate. Existing jobs keep their state and lease. */
      enqueue: async (request: EnqueueJobRequest): Promise<EnqueueJobResponse> => {
        const body = EnqueueJobRequestSchema.parse(request);
        const response = await this.request<unknown>("/v1/operator/jobs", "POST", { auth: "operator", body });
        return EnqueueJobResponseSchema.parse(response);
      },

      /**
       * Updates priority lane, recrawl interval, or next fetch time on a crawl job (PATCH /v1/operator/jobs/{jobId}).
       */
      update: async (
        jobId: string,
        request: Omit<UpdateJobRequest, "schemaVersion">
      ): Promise<UpdateJobResponse> => {
        const id = OperatorJobIdSchema.parse(jobId);
        const body = UpdateJobRequestSchema.parse({ schemaVersion: 1, ...request });
        const response = await this.request<unknown>(`/v1/operator/jobs/${encodeURIComponent(id)}`, "PATCH", {
          auth: "operator",
          body
        });
        return UpdateJobResponseSchema.parse(response);
      },

      /**
       * Requeues an unleased or completed crawl job for immediate dispatch (POST /v1/operator/jobs/{jobId}/requeue).
       */
      requeue: async (
        jobId: string,
        request: Omit<RequeueJobRequest, "schemaVersion">
      ): Promise<RequeueJobResponse> => {
        const id = OperatorJobIdSchema.parse(jobId);
        const body = RequeueJobRequestSchema.parse({ schemaVersion: 1, ...request });
        const response = await this.request<unknown>(`/v1/operator/jobs/${encodeURIComponent(id)}/requeue`, "POST", {
          auth: "operator",
          body
        });
        return RequeueJobResponseSchema.parse(response);
      },

      /**
       * Deletes an unleased crawl job from the queue (DELETE /v1/operator/jobs/{jobId}).
       */
      delete: async (jobId: string, reason: string): Promise<DeleteJobResponse> => {
        const id = OperatorJobIdSchema.parse(jobId);
        const body = DeleteJobRequestSchema.parse({ schemaVersion: 1, reason });
        const response = await this.request<unknown>(`/v1/operator/jobs/${encodeURIComponent(id)}`, "DELETE", {
          auth: "operator",
          body
        });
        return DeleteJobResponseSchema.parse(response);
      }
    },

    leads: {
      /**
       * Lists pending, approved, or rejected discovery leads (GET /v1/operator/leads).
       */
      list: async (params: {
        status?: LeadStatus;
        query?: string;
        targetHost?: string;
        limit?: number;
        cursor?: string;
      } = {}): Promise<LeadListResponse> => {
        const query = OperatorLeadListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/leads", "GET", {
          auth: "operator",
          queryParams: {
            status: query.status,
            query: query.query,
            targetHost: query.targetHost,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return LeadListResponseSchema.parse(res);
      },

      /**
       * Approves a discovery lead into the crawl queue (POST /v1/operator/leads/{leadKey}/approve).
       */
      approve: async (
        leadKey: string,
        params: { minDelayMs?: number; reason: string }
      ): Promise<LeadActionResponse> => {
        const id = LeadCursorSchema.shape.leadKey.parse(leadKey);
        const res = await this.request<unknown>(`/v1/operator/leads/${encodeURIComponent(id)}/approve`, "POST", {
          auth: "operator",
          body: ApproveLeadSchema.parse({ schemaVersion: 1, ...params })
        });
        return LeadActionResponseSchema.parse(res);
      },

      /**
       * Rejects a discovery lead (POST /v1/operator/leads/{leadKey}/reject).
       */
      reject: async (
        leadKey: string,
        params: { reason: string }
      ): Promise<LeadActionResponse> => {
        const id = LeadCursorSchema.shape.leadKey.parse(leadKey);
        const res = await this.request<unknown>(`/v1/operator/leads/${encodeURIComponent(id)}/reject`, "POST", {
          auth: "operator",
          body: RejectLeadSchema.parse({ schemaVersion: 1, ...params })
        });
        return LeadActionResponseSchema.parse(res);
      },

      /**
       * Bulk-approves multiple pending discovery leads (POST /v1/operator/leads/bulk-approve).
       */
      bulkApprove: async (request: BulkApproveLeadsRequest): Promise<BulkApproveLeadsResponse> => {
        const body = BulkApproveLeadsRequestSchema.parse(request);
        const res = await this.request<unknown>("/v1/operator/leads/bulk-approve", "POST", {
          auth: "operator",
          body
        });
        return BulkApproveLeadsResponseSchema.parse(res);
      },

      /**
       * Suppresses a target host domain and rejects matching pending leads (POST /v1/operator/leads/suppress-domain).
       */
      suppressDomain: async (request: SuppressLeadDomainRequest): Promise<SuppressLeadDomainResponse> => {
        const body = SuppressLeadDomainRequestSchema.parse(request);
        const res = await this.request<unknown>("/v1/operator/leads/suppress-domain", "POST", {
          auth: "operator",
          body
        });
        return SuppressLeadDomainResponseSchema.parse(res);
      }
    },

    steeringProfiles: {
      /**
       * Lists unified steering profiles (GET /v1/operator/steering-profiles).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<SteeringProfileListResponse> => {
        const query = OperatorSteeringProfileListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/steering-profiles", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return SteeringProfileListResponseSchema.parse(res);
      },

      /**
       * Creates a unified steering profile (POST /v1/operator/steering-profiles).
       */
      create: async (request: CreateSteeringProfile): Promise<SteeringProfileResponse> => {
        const res = await this.request<unknown>("/v1/operator/steering-profiles", "POST", {
          auth: "operator",
          body: CreateSteeringProfileSchema.parse(request)
        });
        return SteeringProfileResponseSchema.parse(res);
      },

      /**
       * Updates mutable fields on a steering profile (PATCH /v1/operator/steering-profiles/{id}).
       */
      update: async (
        profileId: string,
        request: Omit<UpdateSteeringProfile, "schemaVersion">
      ): Promise<SteeringProfileResponse> => {
        const id = SteeringProfileCursorSchema.shape.profileId.parse(profileId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/steering-profiles/${encodeURIComponent(id)}`, "PATCH", {
          auth: "operator",
          body: UpdateSteeringProfileSchema.parse({ schemaVersion: 1, ...request })
        });
        return SteeringProfileResponseSchema.parse(res);
      },

      /**
       * Re-enables a disabled steering profile (POST /v1/operator/steering-profiles/{id}/enable).
       */
      enable: async (profileId: string, reason: string): Promise<SteeringProfileResponse> => {
        const id = SteeringProfileCursorSchema.shape.profileId.parse(profileId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/steering-profiles/${encodeURIComponent(id)}/enable`, "POST", {
          auth: "operator",
          body: SteeringProfileActionSchema.parse({ schemaVersion: 1, reason })
        });
        return SteeringProfileResponseSchema.parse(res);
      },

      /**
       * Disables a steering profile via instant kill-switch (POST /v1/operator/steering-profiles/{id}/disable).
       */
      disable: async (profileId: string, reason: string): Promise<SteeringProfileResponse> => {
        const id = SteeringProfileCursorSchema.shape.profileId.parse(profileId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/steering-profiles/${encodeURIComponent(id)}/disable`, "POST", {
          auth: "operator",
          body: SteeringProfileActionSchema.parse({ schemaVersion: 1, reason })
        });
        return SteeringProfileResponseSchema.parse(res);
      },

      /**
       * Permanently deletes a steering profile (DELETE /v1/operator/steering-profiles/{id}).
       */
      delete: async (profileId: string, reason: string): Promise<SteeringProfileDeleteResponse> => {
        const id = SteeringProfileCursorSchema.shape.profileId.parse(profileId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/steering-profiles/${encodeURIComponent(id)}`, "DELETE", {
          auth: "operator",
          body: SteeringProfileActionSchema.parse({ schemaVersion: 1, reason })
        });
        return SteeringProfileDeleteResponseSchema.parse(res);
      }
    },

    suppressedTargets: {
      /**
       * Lists suppressed targets across URL, origin, and domain scopes (GET /v1/operator/suppressed-targets).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<SuppressedTargetListResponse> => {
        const query = OperatorSuppressedTargetListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/suppressed-targets", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return SuppressedTargetListResponseSchema.parse(res);
      },

      /**
       * Adds a hard block entry in suppressed_targets (POST /v1/operator/suppressed-targets).
       */
      create: async (request: CreateSuppressedTarget): Promise<SuppressedTargetResponse> => {
        const res = await this.request<unknown>("/v1/operator/suppressed-targets", "POST", {
          auth: "operator",
          body: CreateSuppressedTargetSchema.parse(request)
        });
        return SuppressedTargetResponseSchema.parse(res);
      },

      /**
       * Deletes a suppressed target entry (DELETE /v1/operator/suppressed-targets).
       */
      delete: async (request: DeleteSuppressedTarget): Promise<SuppressedTargetDeleteResponse> => {
        const res = await this.request<unknown>("/v1/operator/suppressed-targets", "DELETE", {
          auth: "operator",
          body: DeleteSuppressedTargetSchema.parse(request)
        });
        return SuppressedTargetDeleteResponseSchema.parse(res);
      }
    },

    nodes: {
      /**
       * Lists registered crawler nodes and current heartbeat status (GET /v1/operator/nodes).
       */
      list: async (params: {
        status?: OperatorNodeStatus;
        limit?: number;
        cursor?: string;
      } = {}): Promise<OperatorNodeListResponse> => {
        const query = OperatorNodeListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/nodes", "GET", {
          auth: "operator",
          queryParams: {
            status: query.status,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return OperatorNodeListResponseSchema.parse(res);
      },

      /** Revoke credentials without releasing a possibly in-flight origin reservation. */
      revoke: async (nodeId: string, reason: string): Promise<RevokeNodeResponse> => {
        RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
        const body = RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason });
        const response = await this.request<unknown>(`/v1/operator/nodes/${encodeURIComponent(nodeId)}/revoke`, "POST", {
          auth: "operator",
          body
        });
        return RevokeNodeResponseSchema.parse(response);
      },

      /** Hard-deletes a revoked crawler node from the registry (DELETE /v1/operator/nodes/{nodeId}). */
      prune: async (nodeId: string, reason: string): Promise<PruneNodeResponse> => {
        IssueNodeCredentialSchema.shape.nodeId.parse(nodeId);
        const body = RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason });
        const response = await this.request<unknown>(
          `/v1/operator/nodes/${encodeURIComponent(nodeId)}`,
          "DELETE",
          { auth: "operator", body }
        );
        return PruneNodeResponseSchema.parse(response);
      },

      /**
       * Issues an audited node credential with Coordinator-derived capabilities (POST /v1/operator/nodes).
       */
      issue: async (request: IssueNodeCredential): Promise<NodeCredentialResponse> => {
        const res = await this.request<unknown>("/v1/operator/nodes", "POST", {
          auth: "operator",
          body: IssueNodeCredentialSchema.parse(request)
        });
        return NodeCredentialResponseSchema.parse(res);
      }
    },

    catalog: {
      /**
       * Lists canonical packages with operator oversight (GET /v1/operator/catalog).
       */
      list: async (params: { query?: string; limit?: number; cursor?: string } = {}): Promise<CatalogListResponse> => {
        const query = OperatorCatalogListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/catalog", "GET", {
          auth: "operator",
          queryParams: {
            query: query.query,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return ClientOperatorCatalogListResponseSchema.parse(res) as unknown as CatalogListResponse;
      }
    },

    takedowns: {
      /**
       * Audits recorded creator opt-outs and delistings (GET /v1/operator/takedowns).
       */
      list: async (params: {
        requesterType?: "unauthenticated_creator" | "user" | "admin_operator";
        limit?: number;
        cursor?: string;
      } = {}): Promise<TakedownListResponse> => {
        const query = OperatorTakedownListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/takedowns", "GET", {
          auth: "operator",
          queryParams: {
            requesterType: query.requesterType,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return TakedownListResponseSchema.parse(res);
      },

      /**
       * Records an operator verdict on a stored creator opt-out (POST /v1/operator/takedowns/{id}/verify).
       */
      verify: async (
        takedownId: string,
        request: { verdict: "accepted" | "rejected"; notes?: string }
      ): Promise<VerifyTakedownResponse> => {
        const id = TakedownCursorSchema.shape.takedownId.parse(takedownId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/takedowns/${encodeURIComponent(id)}/verify`, "POST", {
          auth: "operator",
          body: VerifyTakedownRequestSchema.parse({
            schemaVersion: 1,
            verdict: request.verdict,
            notes: request.notes
          })
        });
        return VerifyTakedownResponseSchema.parse(res);
      }
    },

    claims: {
      /**
       * Audits recorded delegated creator claims (GET /v1/operator/claims).
       */
      list: async (params: {
        reviewStatus?: "pending" | "accepted" | "rejected";
        limit?: number;
        cursor?: string;
      } = {}): Promise<DelegatedClaimListResponse> => {
        const query = OperatorClaimListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/claims", "GET", {
          auth: "operator",
          queryParams: {
            reviewStatus: query.reviewStatus,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return DelegatedClaimListResponseSchema.parse(res);
      },

      /**
       * Records an operator verdict on a stored delegated creator claim (POST /v1/operator/claims/{id}/verify).
       */
      verify: async (
        claimId: string,
        request: { verdict: "accepted" | "rejected"; notes?: string }
      ): Promise<VerifyDelegatedClaimResponse> => {
        const id = DelegatedClaimCursorSchema.shape.claimId.parse(claimId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/claims/${encodeURIComponent(id)}/verify`, "POST", {
          auth: "operator",
          body: VerifyDelegatedClaimRequestSchema.parse({
            schemaVersion: 1,
            verdict: request.verdict,
            notes: request.notes
          })
        });
        return VerifyDelegatedClaimResponseSchema.parse(res);
      }
    },

    apps: {
      /**
       * Lists registered downstream applications (GET /v1/operator/apps).
       */
      list: async (params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}): Promise<OperatorAppListResponse> => {
        const query = OperatorAppListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/apps", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor,
            candidateStatus: query.candidateStatus
          }
        });
        return OperatorAppListResponseSchema.parse(res);
      },

      /**
       * Sets delegation authority for a registered application (POST /v1/operator/apps/{appId}/delegation).
       */
      setDelegation: async (
        appId: string,
        request: { delegationAllowed: boolean; reason?: string }
      ): Promise<SetAppDelegationResponse> => {
        const id = OperatorAppCursorSchema.shape.appId.parse(appId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/apps/${encodeURIComponent(id)}/delegation`, "POST", {
          auth: "operator",
          body: SetAppDelegationRequestSchema.parse({
            schemaVersion: 1,
            delegationAllowed: request.delegationAllowed,
            reason: request.reason
          })
        });
        return SetAppDelegationResponseSchema.parse(res);
      },

      /**
       * Reviews a registered application candidate for trusted access (POST /v1/operator/apps/{appId}/candidate-review).
       */
      reviewCandidate: async (
        appId: string,
        request: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string }
      ): Promise<ReviewAppCandidateResponse> => {
        const id = OperatorAppCursorSchema.shape.appId.parse(appId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/apps/${encodeURIComponent(id)}/candidate-review`, "POST", {
          auth: "operator",
          body: ReviewAppCandidateRequestSchema.parse({
            schemaVersion: 1,
            candidateStatus: request.candidateStatus,
            grantDelegation: request.grantDelegation,
            notes: request.notes
          })
        });
        return ReviewAppCandidateResponseSchema.parse(res);
      }
    },

    staging: {
      /**
       * Lists pre-ingestion staged items and aggregated unknown tokens (GET /v1/operator/staging).
       */
      list: async (params: {
        auditState?: OperatorStagingAuditState;
        platform?: Platform;
        query?: string;
        limit?: number;
        cursor?: string;
      } = {}): Promise<OperatorStagingListResponse> => {
        const query = OperatorStagingListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/staging", "GET", {
          auth: "operator",
          queryParams: {
            auditState: query.auditState,
            platform: query.platform,
            query: query.query,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return OperatorStagingListResponseSchema.parse(res);
      },

      /**
       * Records an operator approve or reject decision on a staged source item (POST /v1/operator/staging/{sourceKey}/decision).
       */
      decide: async (
        sourceKey: string,
        request: { decision: "approve" | "reject"; suppressDomain?: boolean; reason: string }
      ): Promise<OperatorStagingDecisionResponse> => {
        const key = sourceKey.trim();
        if (!key || key === "." || key === "..") {
          throw new VRCPApiError(400, "Staging sourceKey cannot be blank, '.', or '..'", "invalid_identifier");
        }
        const res = await this.request<unknown>(`/v1/operator/staging/${encodeURIComponent(key)}/decision`, "POST", {
          auth: "operator",
          body: OperatorStagingDecisionRequestSchema.parse({
            schemaVersion: 1,
            decision: request.decision,
            suppressDomain: request.suppressDomain ?? false,
            reason: request.reason
          })
        });
        return OperatorStagingDecisionResponseSchema.parse(res);
      }
    },

    vocabulary: {
      /**
       * Lists dynamic avatar-base and tag-mapping vocabulary rules (GET /v1/operator/vocabulary).
       */
      get: async (): Promise<OperatorVocabularyResponse> => {
        const res = await this.request<unknown>("/v1/operator/vocabulary", "GET", {
          auth: "operator"
        });
        return OperatorVocabularyResponseSchema.parse(res);
      },

      /**
       * Creates or updates one dynamic literal-alias vocabulary rule (POST /v1/operator/vocabulary).
       */
      upsert: async (request: {
        ruleId: string;
        kind: VocabularyRuleKind;
        canonicalValue: string;
        aliases: string[];
        umbrella?: Umbrella;
        category?: string;
        enabled?: boolean;
        reason: string;
      }): Promise<OperatorVocabularyUpsertResponse> => {
        const res = await this.request<unknown>("/v1/operator/vocabulary", "POST", {
          auth: "operator",
          body: OperatorVocabularyUpsertRequestSchema.parse({
            schemaVersion: 1,
            ...request
          })
        });
        return OperatorVocabularyUpsertResponseSchema.parse(res);
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Moderator Protocol (/v1/moderator/*)                                     */
  /* ------------------------------------------------------------------------ */

  readonly moderator = {
    ratings: {
      /**
       * Lists canonical packages for content rating review (GET /v1/moderator/ratings).
       * Requires age-verified moderator user token.
       */
      list: async (params: { rating?: ContentRating; limit?: number; cursor?: string } = {}): Promise<ModeratorRatingListResponse> => {
        const query = ModeratorRatingListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/moderator/ratings", "GET", {
          auth: "user",
          queryParams: {
            rating: query.rating,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return ModeratorRatingListResponseSchema.parse(res);
      },

      /**
       * Adjusts the content rating of a canonical package (POST /v1/moderator/ratings/{canonicalId}).
       * Requires age-verified moderator user token.
       */
      adjust: async (
        canonicalId: string,
        request: { newRating: ContentRating; reason: string }
      ): Promise<SetRatingAdjustmentResponse> => {
        const id = CanonicalIdPathParamSchema.parse(canonicalId);
        const res = await this.request<unknown>(`/v1/moderator/ratings/${encodeURIComponent(id)}`, "POST", {
          auth: "user",
          body: SetRatingAdjustmentRequestSchema.parse({
            schemaVersion: MODERATOR_PROTOCOL_VERSION,
            newRating: request.newRating,
            reason: request.reason
          })
        });
        return SetRatingAdjustmentResponseSchema.parse(res);
      }
    },

    apps: {
      /**
       * Lists registered applications for candidate review (GET /v1/moderator/apps).
       * Requires age-verified moderator user token.
       */
      list: async (params: { limit?: number; cursor?: string; candidateStatus?: CandidateStatus } = {}): Promise<ModeratorAppListResponse> => {
        const query = ModeratorAppListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/moderator/apps", "GET", {
          auth: "user",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor,
            candidateStatus: query.candidateStatus
          }
        });
        return ModeratorAppListResponseSchema.parse(res);
      },

      /**
       * Reviews a registered application candidate without trusted/delegation escalation (POST /v1/moderator/apps/{appId}/candidate-review).
       * Requires age-verified moderator user token.
       */
      reviewCandidate: async (
        appId: string,
        request: { candidateStatus: "none" | "reviewed"; notes?: string }
      ): Promise<ModeratorReviewAppCandidateResponse> => {
        const id = ModeratorAppCursorSchema.shape.appId.parse(appId).toLowerCase();
        const res = await this.request<unknown>(`/v1/moderator/apps/${encodeURIComponent(id)}/candidate-review`, "POST", {
          auth: "user",
          body: ModeratorReviewAppCandidateRequestSchema.parse({
            schemaVersion: MODERATOR_PROTOCOL_VERSION,
            candidateStatus: request.candidateStatus,
            notes: request.notes
          })
        });
        return ModeratorReviewAppCandidateResponseSchema.parse(res);
      }
    }
  };
}
