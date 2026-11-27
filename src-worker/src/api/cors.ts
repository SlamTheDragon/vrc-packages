const PUBLIC_CATALOG_ROUTES = new Set(["/v1/app/index", "/v1/app/index/delta"]);
const AUTHENTICATED_APP_ROUTES = new Set([
  "/v1/app/register",
  "/v1/app/report",
  "/v1/app/index/search",
  "/v1/app/claims/intake"
]);

export type CorsRouteClass = "public_catalog" | "authenticated_browser" | "non_cors";

export function classifyCorsRoute(pathname: string): CorsRouteClass {
  if (PUBLIC_CATALOG_ROUTES.has(pathname)) {
    return "public_catalog";
  }
  if (
    pathname.startsWith("/v1/operator/") ||
    pathname.startsWith("/v1/moderator/") ||
    pathname.startsWith("/v1/user/") ||
    AUTHENTICATED_APP_ROUTES.has(pathname)
  ) {
    return "authenticated_browser";
  }
  return "non_cors";
}

export function normalizeExactOrigin(rawOrigin: string | null | undefined): string | null {
  if (!rawOrigin) return null;
  const trimmed = rawOrigin.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== trimmed) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(rawAllowedOrigins?: string): Set<string> {
  const allowed = new Set<string>();
  if (!rawAllowedOrigins) return allowed;
  for (const part of rawAllowedOrigins.split(",")) {
    const origin = normalizeExactOrigin(part);
    if (origin) {
      allowed.add(origin);
    }
  }
  return allowed;
}

export function matchAllowedOrigin(request: Request, rawAllowedOrigins?: string): string | null {
  const requestOrigin = normalizeExactOrigin(request.headers.get("Origin"));
  if (!requestOrigin) return null;
  const allowed = parseAllowedOrigins(rawAllowedOrigins);
  return allowed.has(requestOrigin) ? requestOrigin : null;
}

export function handleCorsPreflight(request: Request, rawAllowedOrigins?: string): Response | null {
  if (request.method !== "OPTIONS") return null;

  const pathname = new URL(request.url).pathname;
  const routeClass = classifyCorsRoute(pathname);

  if (routeClass === "public_catalog") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        "Cache-Control": "public, max-age=60"
      }
    });
  }

  if (routeClass === "authenticated_browser") {
    const matchedOrigin = matchAllowedOrigin(request, rawAllowedOrigins);
    if (matchedOrigin) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": matchedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Max-Age": "600",
          "Cache-Control": "no-store",
          Vary: "Origin"
        }
      });
    }
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        code: "cors_origin_forbidden",
        error: "Origin not allowed"
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          Vary: "Origin"
        }
      }
    );
  }

  return null;
}

export function applyCorsHeaders(request: Request, response: Response, rawAllowedOrigins?: string): Response {
  const pathname = new URL(request.url).pathname;
  const routeClass = classifyCorsRoute(pathname);
  const headers = new Headers(response.headers);

  if (routeClass === "public_catalog") {
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  if (routeClass === "authenticated_browser") {
    const matchedOrigin = matchAllowedOrigin(request, rawAllowedOrigins);
    if (matchedOrigin) {
      headers.set("Access-Control-Allow-Origin", matchedOrigin);
      headers.set(
        "Access-Control-Expose-Headers",
        "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After"
      );
      headers.set("Vary", "Origin");
    } else {
      headers.delete("Access-Control-Allow-Origin");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  headers.delete("Access-Control-Allow-Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
