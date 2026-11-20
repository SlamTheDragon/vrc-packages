import {
  ClaimRequestSchema,
  ClaimResponseSchema,
  HeartbeatRequestSchema,
  HeartbeatResponseSchema,
  PROTOCOL_VERSION,
  ResultRequestSchema,
  ResultResponseSchema,
  BatchResultRequestSchema,
  BatchResultResponseSchema,
  NodeRobotsClaimRequestSchema,
  NodeRobotsClaimResponseSchema,
  NodeRobotsResultRequestSchema,
  NodeRobotsResultResponseSchema,
  type ClaimRequest,
  type ClaimResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type ResultRequest,
  type ResultResponse,
  type BatchResultRequest,
  type BatchResultResponse,
  type NodeRobotsResultRequest
} from "vrc-packages-network/node";
import {
  CoordinatorConflict,
  UnsupportedMediaTypeError,
  type CoordinatorStore,
  type NodePrincipal
} from "../domain/ports/stores.ts";
import { workerLogger } from "../worker_logger.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export {
  CoordinatorConflict,
  UnsupportedMediaTypeError,
  NodeRobotsClaimRequestSchema,
  NodeRobotsClaimResponseSchema,
  NodeRobotsResultRequestSchema,
  NodeRobotsResultResponseSchema,
  type CoordinatorStore,
  type NodePrincipal
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: PROTOCOL_VERSION, error: message, code }, status);
}

/** Bound bytes before parsing, regardless of Content-Length accuracy. */
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new UnsupportedMediaTypeError("Content-Type must be application/json");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing JSON body");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      await reader.cancel();
      throw new RangeError("Payload exceeds 256 KiB");
    }
    parts.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined));
}

export async function handleNodeRequest(
  request: Request,
  store: CoordinatorStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const ALLOWED_NODE_ROUTES = [
    "/v1/node/jobs/claim",
    "/v1/node/jobs/result",
    "/v1/node/jobs/results",
    "/v1/node/heartbeat",
    "/v1/node/robots/claim",
    "/v1/node/robots/result"
  ];
  if (request.method !== "POST" || !ALLOWED_NODE_ROUTES.includes(path)) {
    return failure(404, "not_found", "Route not found");
  }

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) {
    workerLogger.warn("Node bearer credential required", { path });
    return failure(401, "unauthorized", "Node bearer credential required");
  }

  const clientIp = extractClientIp(request);
  const tokenPrefix = auth.slice(7, 23);
  const isRobotsClaim = path === "/v1/node/robots/claim";
  const isRobotsResult = path === "/v1/node/robots/result";
  const isClaim = path.endsWith("/claim");
  const isHeartbeat = path.endsWith("/heartbeat");

  const policy = isClaim
    ? RATE_LIMIT_POLICIES.NODE_CLAIM
    : isHeartbeat
    ? RATE_LIMIT_POLICIES.NODE_HEARTBEAT
    : RATE_LIMIT_POLICIES.NODE_RESULT;

  const rateKey = `node:${isClaim ? "claim" : isHeartbeat ? "heartbeat" : "result"}:${clientIp}:${tokenPrefix}`;
  const rateResult = await rateLimiter.check(rateKey, policy);
  if (!rateResult.allowed) {
    workerLogger.warn("Node rate limit exceeded", { path, clientIp });
    return rateLimitResponse(
      rateResult,
      PROTOCOL_VERSION,
      `Rate limit exceeded for node ${isClaim ? "claims" : isHeartbeat ? "heartbeats" : "submissions"}. Please retry later.`
    );
  }

  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch (error) {
    workerLogger.warn("Failed to parse node request JSON", { path }, error);
    if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
    if (error instanceof UnsupportedMediaTypeError) return failure(error.status, "invalid_payload", error.message);
    return failure(400, "bad_json", "Request body must be valid JSON");
  }

  const isBatchResult =
    path.endsWith("/results") ||
    (path.endsWith("/result") && !isRobotsResult && Array.isArray((payload as Record<string, unknown> | null)?.results));
  const parsed = isRobotsClaim
    ? NodeRobotsClaimRequestSchema.safeParse(payload)
    : isRobotsResult
    ? NodeRobotsResultRequestSchema.safeParse(payload)
    : isClaim
    ? ClaimRequestSchema.safeParse(payload)
    : isHeartbeat
    ? HeartbeatRequestSchema.safeParse(payload)
    : isBatchResult
    ? BatchResultRequestSchema.safeParse(payload)
    : ResultRequestSchema.safeParse(payload);
  if (!parsed.success) {
    workerLogger.warn("Invalid payload schema for node request", { path, issues: parsed.error.issues });
    return failure(400, "invalid_payload", parsed.error.issues.map((issue) => issue.path.join(".") || "body").join(", "));
  }

  const nodeId = parsed.data.nodeId;
  const principal = await store.authenticate(nodeId, auth.slice(7).trim());
  if (!principal) {
    workerLogger.warn("Node authentication failed", { path, nodeId });
    return failure(401, "unauthorized", "Invalid node credential");
  }

  try {
    if (isRobotsClaim) {
      if (!store.claimDueRobotsRefresh) {
        return failure(501, "not_implemented", "Robots refresh not supported by store");
      }
      const due = await store.claimDueRobotsRefresh();
      if (!due) {
        return applyRateLimitHeaders(
          json(
            NodeRobotsClaimResponseSchema.parse({
              schemaVersion: PROTOCOL_VERSION,
              status: "empty",
              retryAfterMs: 60000
            })
          ),
          rateResult
        );
      }
      workerLogger.info("Node claimed robots refresh", { nodeId: principal.nodeId, origin: due.origin, leaseId: due.leaseId });
      return applyRateLimitHeaders(
        json(
          NodeRobotsClaimResponseSchema.parse({
            schemaVersion: PROTOCOL_VERSION,
            status: "leased",
            origin: due.origin,
            leaseId: due.leaseId
          })
        ),
        rateResult
      );
    }
    if (isRobotsResult) {
      if (!store.completeRobotsRefresh) {
        return failure(501, "not_implemented", "Robots refresh not supported by store");
      }
      const data = parsed.data as NodeRobotsResultRequest;
      const completed = await store.completeRobotsRefresh(data.origin, data.leaseId, data.statusCode, data.body);
      if (!completed) {
        workerLogger.warn("Robots refresh completion rejected", {
          nodeId: principal.nodeId,
          origin: data.origin,
          leaseId: data.leaseId
        });
        return failure(403, "forbidden", "Robots refresh lease expired or was replaced");
      }
      workerLogger.info("Node submitted robots result", {
        nodeId: principal.nodeId,
        origin: data.origin,
        statusCode: data.statusCode
      });
      return applyRateLimitHeaders(
        json(
          NodeRobotsResultResponseSchema.parse({
            schemaVersion: PROTOCOL_VERSION,
            status: "accepted",
            origin: data.origin
          })
        ),
        rateResult
      );
    }
    if (isClaim) {
      const response = await store.claim(parsed.data as ClaimRequest, principal);
      workerLogger.info("Node claimed job", { nodeId: principal.nodeId, status: response.status });
      return applyRateLimitHeaders(json(ClaimResponseSchema.parse(response)), rateResult);
    }
    if (isHeartbeat) {
      const response = await store.heartbeat(parsed.data as HeartbeatRequest, principal);
      return applyRateLimitHeaders(json(HeartbeatResponseSchema.parse(response)), rateResult);
    }
    if (isBatchResult) {
      const response = await store.submitBatch(parsed.data as BatchResultRequest, principal);
      workerLogger.info("Node submitted batch results", {
        nodeId: principal.nodeId,
        count: (parsed.data as BatchResultRequest).results.length
      });
      return applyRateLimitHeaders(json(BatchResultResponseSchema.parse(response)), rateResult);
    }
    const response = await store.submit(parsed.data as ResultRequest, principal);
    workerLogger.info("Node submitted job result", {
      nodeId: principal.nodeId,
      jobId: (parsed.data as ResultRequest).jobId
    });
    return applyRateLimitHeaders(json(ResultResponseSchema.parse(response)), rateResult);
  } catch (error) {
    if (error instanceof CoordinatorConflict) {
      workerLogger.warn("Coordinator conflict", {
        path,
        nodeId: principal.nodeId,
        status: error.status,
        message: error.message
      });
      const code = error.status === 403 ? "forbidden" : error.status === 404 ? "not_found" : "conflict";
      return failure(error.status, code, error.message);
    }
    workerLogger.error("Coordinator request unhandled error", error, { path, nodeId: principal.nodeId });
    return failure(500, "internal_error", "Coordinator request failed");
  }
}

export function createCoordinatorHandler(
  store: CoordinatorStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/v1/node/")) return null;
    return handleNodeRequest(request, store, rateLimiter);
  };
}
