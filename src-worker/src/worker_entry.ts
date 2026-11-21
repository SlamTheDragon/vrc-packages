import { Coordinator } from "./storage/d1/coordinator.ts";
import { createCoordinatorHandler, readJson } from "./api/handler.ts";
import { UnsupportedMediaTypeError } from "./domain/ports/stores.ts";
import { InitializeCoordinatorRequestSchema, InitializeCoordinatorResponseSchema } from "vrc-packages-api";
import { createOperatorHandler } from "./api/operator_handler.ts";
import { createPublicCatalogHandler } from "./api/public_handler.ts";
import { createDownstreamHandler } from "./api/downstream_handler.ts";
import { createUserHandler } from "./api/user_handler.ts";
import { createModeratorHandler } from "./api/moderator_handler.ts";
import { isOperatorAuthorized } from "./api/auth.ts";
import { applyCorsHeaders, handleCorsPreflight } from "./api/cors.ts";
import { workerLogger } from "./worker_logger.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  createRateLimiter,
  type IKVNamespace
} from "./api/rate_limiter.ts";

export type Env = Omit<Cloudflare.Env, "RATE_LIMIT_KV" | "CORS_ALLOWED_ORIGINS"> & {
  RATE_LIMIT_KV?: Cloudflare.Env["RATE_LIMIT_KV"];
  CORS_ALLOWED_ORIGINS?: string;
};

function errorResponse(status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ schemaVersion: 1, code, error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsOrigins = env.CORS_ALLOWED_ORIGINS;
    try {
      const preflight = handleCorsPreflight(request, corsOrigins);
      if (preflight) return preflight;

      const store = new Coordinator(env.VRCP_D1);
      const rateLimiter = createRateLimiter(env as unknown as {
        RATE_LIMIT_KV?: IKVNamespace;
      });
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/v1/operator/init") {
        const clientIp = extractClientIp(request);
        const initRate = await rateLimiter.check(`operator:init:${clientIp}`, RATE_LIMIT_POLICIES.OPERATOR_ROUTES);
        if (!initRate.allowed) {
          return applyCorsHeaders(
            request,
            rateLimitResponse(initRate, 1, "Rate limit exceeded for operator init."),
            corsOrigins
          );
        }
        if (!isOperatorAuthorized(request, env.OPERATOR_TOKEN)) {
          return applyCorsHeaders(request, errorResponse(401, "unauthorized", "Unauthorized"), corsOrigins);
        }
        let payload: unknown;
        try {
          payload = await readJson(request);
        } catch (cause) {
          if (cause instanceof RangeError) {
            return applyCorsHeaders(
              request,
              errorResponse(413, "invalid_payload", "Payload exceeds 256 KiB"),
              corsOrigins
            );
          }
          if (cause instanceof UnsupportedMediaTypeError) {
            return applyCorsHeaders(
              request,
              errorResponse(cause.status, "invalid_payload", cause.message),
              corsOrigins
            );
          }
          return applyCorsHeaders(
            request,
            errorResponse(400, "bad_json", "Request body must be valid JSON"),
            corsOrigins
          );
        }
        const parsed = InitializeCoordinatorRequestSchema.safeParse(payload);
        if (!parsed.success) {
          return applyCorsHeaders(
            request,
            errorResponse(400, "invalid_payload", "Invalid initialization payload"),
            corsOrigins
          );
        }
        const autoSeed = parsed.data.autoSeed ?? true;
        await store.initSchema(autoSeed);
        workerLogger.info("Coordinator D1 schema initialized via /v1/operator/init", { autoSeed });
        return applyCorsHeaders(
          request,
          applyRateLimitHeaders(
            new Response(
              JSON.stringify(
                InitializeCoordinatorResponseSchema.parse({
                  schemaVersion: 1,
                  status: "ok",
                  message: "Schema initialized",
                  autoSeed
                })
              ),
              {
                status: 200,
                headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
              }
            ),
            initRate
          ),
          corsOrigins
        );
      }

      const publicHandler = createPublicCatalogHandler(store, rateLimiter);
      const downstreamHandler = createDownstreamHandler(store, env.OPERATOR_TOKEN, rateLimiter);
      const userHandler = createUserHandler(store, rateLimiter);
      const moderatorHandler = createModeratorHandler(store, rateLimiter);
      const nodeHandler = createCoordinatorHandler(store, rateLimiter);
      const operatorHandler = createOperatorHandler(store, env.OPERATOR_TOKEN, rateLimiter);
      const handled =
        (await publicHandler(request)) ??
        (await downstreamHandler(request)) ??
        (await userHandler(request)) ??
        (await moderatorHandler(request)) ??
        (await nodeHandler(request)) ??
        (await operatorHandler(request));
      if (handled) return applyCorsHeaders(request, handled, corsOrigins);

      workerLogger.warn("Route not found in worker fetch", { path: url.pathname, method: request.method });
      return applyCorsHeaders(request, errorResponse(404, "not_found", "Not Found"), corsOrigins);
    } catch (error) {
      const path = new URL(request.url).pathname;
      workerLogger.error("Unhandled exception in worker fetch", error, { path });
      return applyCorsHeaders(request, errorResponse(500, "internal_error", "Internal Server Error"), corsOrigins);
    }
  }
} satisfies ExportedHandler<Env>;
