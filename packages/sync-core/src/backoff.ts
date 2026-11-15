/**
 * Exponential backoff calculation with jitter (doc 11 §4.4).
 * Base: 2s, 4s, 8s, 16s... up to max 300s (5 mins).
 */
export function calculateBackoff(
  attempt: number,
  baseMs: number = 2000,
  maxMs: number = 300000,
  jitterRatio: number = 0.2
): number {
  if (attempt <= 0) return baseMs;
  const rawBackoff = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = rawBackoff * jitterRatio * (Math.random() * 2 - 1);
  return Math.max(1000, Math.floor(rawBackoff + jitter));
}

