// A simple sliding-window rate limiter: tracks recent request timestamps per
// key (e.g. username) in memory, and rejects once too many land inside the
// window. No external dependency needed for this — it's just a Map of
// arrays, cleaned up lazily on each check.
//
// This is intentionally in-memory, not Redis-backed: fine for a single
// server instance. If you horizontally scale to multiple Node processes,
// this would need to move to a shared store (Redis) since each instance
// would otherwise track limits independently — worth mentioning if asked
// about scaling in an interview.

const requestLog = new Map(); // key -> array of timestamps (ms)

/**
 * @param {string} key - unique identifier for who/what is being limited (e.g. username)
 * @param {number} maxRequests - how many requests are allowed inside the window
 * @param {number} windowMs - the window size in milliseconds
 * @returns {boolean} true if this request should be BLOCKED (limit exceeded)
 */
function isRateLimited(key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = requestLog.get(key) || [];

  // Drop timestamps outside the current window
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    requestLog.set(key, recent); // keep the trimmed list even when blocking
    return true;
  }

  recent.push(now);
  requestLog.set(key, recent);
  return false;
}

// Periodic cleanup so the Map doesn't grow forever with stale keys from
// users who disconnected — runs every 5 minutes, drops anything with no
// activity in the last 10 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of requestLog.entries()) {
    const recent = timestamps.filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length === 0) requestLog.delete(key);
    else requestLog.set(key, recent);
  }
}, 5 * 60 * 1000);

module.exports = { isRateLimited };