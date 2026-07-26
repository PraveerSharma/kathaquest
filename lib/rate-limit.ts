type Bucket = { count: number; resetAt: number };

declare global {
  var __kathaquestRateLimits: Map<string, Bucket> | undefined;
}

const buckets =
  globalThis.__kathaquestRateLimits ?? new Map<string, Bucket>();
globalThis.__kathaquestRateLimits = buckets;

export function checkRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): { allowed: boolean; retryAfterSeconds: number } {
  const forwarded = request.headers.get("x-forwarded-for");
  const client = forwarded?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${client}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
