import {
  DOWNSTREAM_PROTOCOL_VERSION,
  RegisterAppRequestSchema,
  RegisterAppResponseSchema,
  ReportSubmissionRequestSchema,
  ReportSubmissionResponseSchema,
  CatalogSearchRequestSchema,
  CatalogSearchResponseSchema,
  CreatorClaimIntakeRequestSchema,
  CreatorClaimIntakeResponseSchema
} from "vrc-packages-api";
import { readJson } from "./handler.ts";
import {
  CoordinatorConflict,
  UnsupportedMediaTypeError,
  type DownstreamAppPrincipal,
  type DownstreamStore,
  type DemandFeedbackInput
} from "../domain/ports/stores.ts";
import { workerLogger } from "../worker_logger.ts";
import { extractBearerToken, isOperatorBearerToken } from "./auth.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export type { DownstreamAppPrincipal, DownstreamStore };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: DOWNSTREAM_PROTOCOL_VERSION, code, error: message }, status);
}

export async function handleDownstreamRequest(
  request: Request,
  store: DownstreamStore,
  operatorToken = "",
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isRegister = request.method === "POST" && path === "/v1/app/register";
  const isFeedback = request.method === "POST" && path === "/v1/app/report";
  const isSearch = request.method === "POST" && path === "/v1/app/index/search";
  const isClaimIntake = request.method === "POST" && path === "/v1/app/claims/intake";

  if (!isRegister && !isFeedback && !isSearch && !isClaimIntake) {
    return failure(404, "not_found", "Route not found");
  }

  if (isRegister) {
    const clientIp = extractClientIp(request);
    const regRate = await rateLimiter.check(`app:register:${clientIp}`, RATE_LIMIT_POLICIES.APP_REGISTER);
    if (!regRate.allowed) {
      workerLogger.warn("App register rate limit exceeded", { path, clientIp });
      return rateLimitResponse(
        regRate,
        DOWNSTREAM_PROTOCOL_VERSION,
        "Rate limit exceeded for application registration. Please retry later."
      );
    }

    const token = extractBearerToken(request) ?? "";
    const operator = isOperatorBearerToken(token, operatorToken);
    const user = operator ? null : await store.authenticateUser(token);
    if (!operator && !user) return failure(401, "unauthorized", "User or operator credential required");
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = RegisterAppRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    try {
      const response = await store.registerApp(parsed.data, user?.userId);
      return applyRateLimitHeaders(json(RegisterAppResponseSchema.parse(response), 201), regRate);
    } catch (error) {
      workerLogger.error("Failed to register downstream app", error, { path });
      return failure(500, "internal_error", "App registration failed");
    }
  }

  const appToken = extractBearerToken(request);
  if (!appToken) {
    workerLogger.warn("Downstream application bearer credential required", { path });
    return failure(401, "unauthorized", "Application bearer credential required");
  }

  const app = await store.authenticateApp(appToken);
  if (!app) {
    workerLogger.warn("Invalid downstream application token", { path });
    return failure(401, "unauthorized", "Invalid application token");
  }

  try {
    await store.recordAppActivity(app.appId);
  } catch (err) {
    workerLogger.warn("Failed to record application activity", { appId: app.appId }, err);
  }

  if (isFeedback) {
    const reportRate = await rateLimiter.check(`app:report:${app.appId}`, RATE_LIMIT_POLICIES.APP_REPORT);
    if (!reportRate.allowed) {
      workerLogger.warn("App report rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(
        reportRate,
        DOWNSTREAM_PROTOCOL_VERSION,
        "Rate limit exceeded for application report submissions. Please retry later."
      );
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const reportParsed = ReportSubmissionRequestSchema.safeParse(body);
    if (!reportParsed.success) {
      return failure(
        400,
        "invalid_payload",
        reportParsed.error.issues.map((i) => i.path.join(".") || "body").join(", ")
      );
    }

    if (reportParsed.data.reportType === "removal_request") {
      const isTrusted =
        app.candidateStatus === "trusted" ||
        app.isTrusted === true ||
        app.permissions.includes("takedowns:submit") ||
        app.permissions.includes("claims:delegate");
      if (!isTrusted) {
        workerLogger.warn("Untrusted application attempted creator takedown request", { path, appId: app.appId });
        return failure(
          403,
          "forbidden",
          "Application is not authorized for creator takedown requests; trusted registered app status required"
        );
      }

      try {
        const response = await store.recordRemovalReport(app.appId, reportParsed.data);
        return applyRateLimitHeaders(json(ReportSubmissionResponseSchema.parse(response), 202), reportRate);
      } catch (error) {
        workerLogger.error("Failed to record removal report", error, { path, appId: app.appId });
        return failure(500, "internal_error", "Removal report could not be recorded");
      }
    }

    if (reportParsed.data.reportType === "issue_report") {
      try {
        const response = await store.recordIssueReport(app.appId, reportParsed.data);
        return applyRateLimitHeaders(json(ReportSubmissionResponseSchema.parse(response), 200), reportRate);
      } catch (error) {
        workerLogger.error("Failed to record issue report", error, { path, appId: app.appId });
        return failure(500, "internal_error", "Issue report could not be recorded");
      }
    }

    if (!app.permissions.includes("demand:feedback")) {
      return failure(403, "forbidden", "Application is not authorized for demand feedback");
    }

    const data = reportParsed.data;
    const signalType = data.signalKind ?? "search_miss";
    const feedbackInput: DemandFeedbackInput = {
      signalType,
      query: data.query,
      zeroHits: data.zeroHits,
      targetUrl: data.targetUrl,
      metadata: {
        ...data.metadata,
        reportType: data.reportType,
        reportKind: data.reportKind,
        canonicalId: data.canonicalId,
        ...(data.reason !== undefined ? { reason: data.reason } : {})
      }
    };

    try {
      const response = await store.recordDownstreamFeedback(app.appId, feedbackInput);
      return applyRateLimitHeaders(
        json(
          ReportSubmissionResponseSchema.parse({
            schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
            status: "accepted",
            reportId: response.signalId,
            recordedAt: response.recordedAt
          }),
          200
        ),
        reportRate
      );
    } catch (error) {
      workerLogger.error("Failed to record downstream feedback", error, { path, appId: app.appId });
      return failure(500, "internal_error", "Feedback ingestion failed");
    }
  }

  if (isClaimIntake) {
    if (!app.permissions.includes("claims:delegate")) {
      return failure(403, "forbidden", "Application is not authorized for delegated creator claims");
    }

    const claimRate = await rateLimiter.check(`app:claim:${app.appId}`, RATE_LIMIT_POLICIES.APP_CLAIMS_INTAKE);
    if (!claimRate.allowed) {
      workerLogger.warn("App claim intake rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(
        claimRate,
        DOWNSTREAM_PROTOCOL_VERSION,
        "Rate limit exceeded for delegated creator claims intake. Please retry later."
      );
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = CreatorClaimIntakeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    if (parsed.data.attestation.appId !== app.appId) {
      return failure(403, "forbidden", "Attestation appId does not match caller");
    }

    try {
      const response = await store.recordCreatorClaimIntake(app.appId, parsed.data);
      return applyRateLimitHeaders(json(CreatorClaimIntakeResponseSchema.parse(response), 202), claimRate);
    } catch (error) {
      if (error instanceof CoordinatorConflict) {
        return failure(error.status, "conflict", error.message);
      }
      workerLogger.error("Failed to record creator claim intake", error, { path, appId: app.appId });
      return failure(500, "internal_error", "Claim intake failed");
    }
  }

  if (isSearch) {
    if (!app.permissions.includes("catalog:search")) {
      return failure(403, "forbidden", "Application is not authorized for catalog searches");
    }

    const searchRate = await rateLimiter.check(`app:search:${app.appId}`, RATE_LIMIT_POLICIES.APP_SEARCH);
    if (!searchRate.allowed) {
      workerLogger.warn("App search rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(
        searchRate,
        DOWNSTREAM_PROTOCOL_VERSION,
        "Rate limit exceeded for catalog searches. Please retry later."
      );
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = CatalogSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    try {
      const response = await store.searchCatalogPackages(parsed.data, { isAgeVerified: app.isAgeVerified ?? false });
      return applyRateLimitHeaders(json(CatalogSearchResponseSchema.parse(response), 200), searchRate);
    } catch (error) {
      workerLogger.error("Failed to execute catalog search", error, { path, appId: app.appId });
      return failure(500, "internal_error", "Catalog search failed");
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createDownstreamHandler(
  store: DownstreamStore,
  operatorToken = "",
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/v1/app/register" ||
      path === "/v1/app/report" ||
      path === "/v1/app/claims/intake" ||
      path === "/v1/app/index/search"
    ) {
      return handleDownstreamRequest(request, store, operatorToken, rateLimiter);
    }
    return null;
  };
}
