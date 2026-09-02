// A small in-memory sliding-window limiter — same approach and same
// documented limitation as the reference project's lib/rate-limit.ts:
// per-process only, fine for a single-instance deployment, would need a
// shared store (Redis, etc.) behind this same function signature for
// multi-instance production traffic.

const buckets = new Map();

/**
 * @param {string} key - e.g. `login:${email}` or `signup:${ip}`
 * @param {number} max - max attempts allowed in the window
 * @param {number} windowMs - window size in milliseconds
 * @returns {boolean} true if the request is allowed, false if rate-limited
 */
function checkRateLimit(key, max, windowMs) {
  const now = Date.now();
  const attempts = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (attempts.length >= max) {
    buckets.set(key, attempts);
    return false;
  }
  attempts.push(now);
  buckets.set(key, attempts);
  return true;
}

// Periodically drop empty/stale buckets so this doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of buckets) {
    const fresh = attempts.filter((t) => now - t < 60 * 60 * 1000);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}, 10 * 60 * 1000).unref();

module.exports = { checkRateLimit };
