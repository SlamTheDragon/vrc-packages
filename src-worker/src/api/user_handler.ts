import {
  DOWNSTREAM_PROTOCOL_VERSION,
  UserAppListQuerySchema,
  UserAppListResponseSchema,
  UserAppResponseSchema
} from "vrc-packages-api";
import type { UserPrincipal, UserStore } from "../domain/ports/stores.ts";
import { workerLogger } from "../worker_logger.ts";
import { extractBearerToken, parseIntegerQueryParam } from "./auth.ts";
import {
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export type { UserPrincipal, UserStore };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: DOWNSTREAM_PROTOCOL_VERSION, code, error: message }, status);
}

/**
 * Handles all /v1/user/* routes.
 *
 * Route map:
 *   GET /v1/user/apps and /v1/user/apps/{appId}: owned application metadata
 */
export async function handleUserRequest(
  request: Request,
  store: UserStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isAppList = request.method === "GET" && path === "/v1/user/apps";
  const appMatch = request.method === "GET" ? /^\/v1\/user\/apps\/([^/]+)$/.exec(path) : null;

  if (!isAppList && !appMatch) {
    return failure(404, "not_found", "Route not found");
  }

  const token = extractBearerToken(request);
  if (!token) {
    return failure(401, "unauthorized", "User bearer credential required (vrcp_usr_)");
  }
  const user = await store.authenticateUser(token);
  if (!user) {
    workerLogger.warn("Invalid user token", { path });
    return failure(401, "unauthorized", "Invalid user credential");
  }

  const userRate = await rateLimiter.check(`user:${user.userId}`, RATE_LIMIT_POLICIES.USER_ROUTES);
  if (!userRate.allowed) {
    workerLogger.warn("User route rate limit exceeded", { path, userId: user.userId });
    return rateLimitResponse(
      userRate,
      DOWNSTREAM_PROTOCOL_VERSION,
      "Rate limit exceeded for user requests. Please retry later."
    );
  }

  if (isAppList || appMatch) {
    const rawParams: Record<string, unknown> = Object.fromEntries(url.searchParams);
    if (url.searchParams.has("limit")) {
      rawParams.limit = parseIntegerQueryParam(url.searchParams.get("limit"));
    }
    const parsed = UserAppListQuerySchema.safeParse(rawParams);
    if (!parsed.success || [...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length > 1)) {
      return failure(400, "invalid_query", "Invalid app list query");
    }
    const parsedId = appMatch ? UserAppResponseSchema.shape.app.shape.appId.safeParse(appMatch[1]) : null;
    if (parsedId && !parsedId.success) return failure(404, "not_found", "App not found");
    const appId = parsedId?.success ? parsedId.data.toLowerCase() : undefined;
    try {
      const page = await store.listUserApps(
        user.userId,
        appId ? 1 : parsed.data.limit,
        appId ? null : parsed.data.cursor?.toLowerCase() ?? null,
        appId
      );
      if (appId) {
        return page.apps[0]
          ? applyRateLimitHeaders(json(UserAppResponseSchema.parse({ schemaVersion: 1, app: page.apps[0] })), userRate)
          : failure(404, "not_found", "App not found");
      }
      return applyRateLimitHeaders(json(UserAppListResponseSchema.parse(page)), userRate);
    } catch (error) {
      workerLogger.error("User app read failed", error, { path, userId: user.userId });
      return failure(500, "internal_error", "App metadata could not be read");
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createUserHandler(
  store: UserStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/v1/user/")) {
      return handleUserRequest(request, store, rateLimiter);
    }
    return null;
  };
}
