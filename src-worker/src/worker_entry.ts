import type { OperatorEnvironment } from "vrc-packages-api";
import { applyCorsHeaders, handleCorsPreflight } from "./api/cors.ts";
import { createDownstreamHandler } from "./api/downstream_handler.ts";
import { createCoordinatorHandler } from "./api/handler.ts";
import { createModeratorHandler } from "./api/moderator_handler.ts";
import { createOperatorHandler } from "./api/operator_handler.ts";
import { createPublicCatalogHandler } from "./api/public_handler.ts";
import { createRateLimiter } from "./api/rate_limiter.ts";
import { createUserHandler } from "./api/user_handler.ts";
import { Coordinator } from "./storage/d1/coordinator.ts";
import { workerLogger } from "./worker_logger.ts";

export type Env = Omit<Cloudflare.Env, "RATE_LIMIT_KV" | "CORS_ALLOWED_ORIGINS" | "VRCP_ENV"> & {
  RATE_LIMIT_KV?: Cloudflare.Env["RATE_LIMIT_KV"];
  CORS_ALLOWED_ORIGINS?: string;
  VRCP_ENV?: string;
};

function resolveOperatorEnvironment(rawEnv?: string): OperatorEnvironment {
  if (rawEnv === "production") return "production";
  if (rawEnv === "preview") return "preview";
  if (rawEnv === "development") return "development";
  return "production";
}

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
      const rateLimiter = createRateLimiter(env);
      const environment = resolveOperatorEnvironment(env.VRCP_ENV);
      const purgeEnabled = env.VRCP_ENV === "development";

      const publicHandler = createPublicCatalogHandler(store, rateLimiter);
      const downstreamHandler = createDownstreamHandler(store, env.OPERATOR_TOKEN, rateLimiter);
      const userHandler = createUserHandler(store, rateLimiter);
      const moderatorHandler = createModeratorHandler(store, rateLimiter);
      const nodeHandler = createCoordinatorHandler(store, rateLimiter);
      const operatorHandler = createOperatorHandler(store, env.OPERATOR_TOKEN, rateLimiter, {
        environment,
        purgeEnabled
      });

      const handled =
        (await publicHandler(request)) ??
        (await downstreamHandler(request)) ??
        (await userHandler(request)) ??
        (await moderatorHandler(request)) ??
        (await nodeHandler(request)) ??
        (await operatorHandler(request));
      if (handled) return applyCorsHeaders(request, handled, corsOrigins);

      const url = new URL(request.url);
      workerLogger.warn("Route not found in worker fetch", { path: url.pathname, method: request.method });
      return applyCorsHeaders(request, errorResponse(404, "not_found", "Not Found"), corsOrigins);
    } catch (error) {
      const path = new URL(request.url).pathname;
      workerLogger.error("Unhandled exception in worker fetch", error, { path });
      return applyCorsHeaders(request, errorResponse(500, "internal_error", "Internal Server Error"), corsOrigins);
    }
  }
} satisfies ExportedHandler<Env>;
