export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_POLICIES = {
  PUBLIC_CATALOG: { limit: 60, windowSeconds: 60 },
  NODE_CLAIM: { limit: 30, windowSeconds: 60 },
  NODE_HEARTBEAT: { limit: 20, windowSeconds: 60 },
  NODE_RESULT: { limit: 60, windowSeconds: 60 },
  APP_SEARCH: { limit: 120, windowSeconds: 60 },
  APP_REPORT: { limit: 30, windowSeconds: 60 },
  APP_CLAIMS_INTAKE: { limit: 30, windowSeconds: 60 },
  APP_REGISTER: { limit: 100, windowSeconds: 60 },
  USER_ROUTES: { limit: 120, windowSeconds: 60 },
  MODERATOR_ROUTES: { limit: 120, windowSeconds: 60 },
  OPERATOR_ROUTES: { limit: 1200, windowSeconds: 60 }
} as const;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAfterSeconds: number;
}

export interface IRateLimiter {
  check(key: string, policy: RateLimitPolicy, now?: number): RateLimitResult | Promise<RateLimitResult>;
  reset?(): void | Promise<void>;
}

export interface IKVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export class InMemoryRateLimiter implements IRateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private lastCleanup = Date.now();

  check(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
    if (now - this.lastCleanup > 60_000) {
      this.cleanup(now);
    }
    const windowMs = policy.windowSeconds * 1000;
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return {
        allowed: true,
        limit: policy.limit,
        remaining: policy.limit - 1,
        resetAfterSeconds: policy.windowSeconds
      };
    }

    const resetAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    if (entry.count >= policy.limit) {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAfterSeconds
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit - entry.count,
      resetAfterSeconds
    };
  }

  private cleanup(now: number): void {
    this.lastCleanup = now;
    for (const [key, val] of this.windows.entries()) {
      if (now >= val.resetAt) {
        this.windows.delete(key);
      }
    }
  }

  reset(): void {
    this.windows.clear();
    this.lastCleanup = Date.now();
  }
}

export class KvRateLimiter implements IRateLimiter {
  constructor(private kv: IKVNamespace) {}

  async check(key: string, policy: RateLimitPolicy, now = Date.now()): Promise<RateLimitResult> {
    const windowSec = policy.windowSeconds;
    const bucket = Math.floor(now / (windowSec * 1000));
    const storageKey = `rl:${key}:${bucket}`;
    const resetAtEpoch = (bucket + 1) * windowSec;
    const resetAfterSeconds = Math.max(1, resetAtEpoch - Math.floor(now / 1000));

    let currentCount = 0;
    try {
      const raw = await this.kv.get(storageKey);
      if (raw) {
        currentCount = parseInt(raw, 10) || 0;
      }
    } catch {
      currentCount = 0;
    }

    if (currentCount >= policy.limit) {
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAfterSeconds
      };
    }

    const nextCount = currentCount + 1;
    const ttl = Math.max(60, windowSec * 2);
    try {
      await this.kv.put(storageKey, String(nextCount), { expirationTtl: ttl });
    } catch {
      // Edge KV write tolerance
    }

    return {
      allowed: true,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - nextCount),
      resetAfterSeconds
    };
  }
}

export const defaultRateLimiter = new InMemoryRateLimiter();

export function createRateLimiter(env?: {
  RATE_LIMIT_KV?: IKVNamespace;
}): IRateLimiter {
  if (env?.RATE_LIMIT_KV) {
    return new KvRateLimiter(env.RATE_LIMIT_KV);
  }
  return defaultRateLimiter;
}

export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

export function rateLimitResponse(
  result: RateLimitResult,
  schemaVersion = 1,
  message = "Rate limit exceeded. Please retry later."
): Response {
  const resetAtEpoch = Math.floor(Date.now() / 1000) + result.resetAfterSeconds;
  return new Response(
    JSON.stringify({
      schemaVersion,
      code: "rate_limited",
      error: message
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(result.resetAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetAtEpoch),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

export function applyRateLimitHeaders(response: Response, result: RateLimitResult): Response {
  const headers = new Headers(response.headers);
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(result.remaining));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
