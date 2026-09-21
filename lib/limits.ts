// In-memory fixed-window rate limiter. Good enough to blunt casual abuse on one server.
// On serverless hosts each instance has its own counters, so pair with the host's firewall / a shared store at launch.
const buckets = new Map<string, { n: number; t: number }>();
let lastPrune = 0;

/** Returns true when the caller is OVER the limit. */
export function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (now - lastPrune > 60_000) {
    lastPrune = now;
    for (const [k, v] of buckets) if (now - v.t > 3_600_000) buckets.delete(k);
    if (buckets.size > 20_000) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || now - b.t > windowMs) {
    buckets.set(key, { n: 1, t: now });
    return false;
  }
  return ++b.n > max;
}

/** Best-effort client IP. Uses the LAST x-forwarded-for hop (added by the trusted proxy), not the spoofable first one. */
export function clientIp(req: Request) {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",").pop()!.trim();
  return "local";
}

/** True if `key` has ALREADY reached `max` within the window (does not count this call). */
export function isBlocked(key: string, max: number, windowMs: number) {
  const b = buckets.get(key);
  return !!b && Date.now() - b.t <= windowMs && b.n >= max;
}
