const authAttempts = new Map();
const expensiveAttempts = new Map();

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function createRateLimiter({ keyPrefix, windowMs, maxRequests }) {
  const store = keyPrefix === "auth" ? authAttempts : expensiveAttempts;

  return (req, res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.path}:${clientKey(req)}`;
    const current = store.get(key);
    const entry = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    store.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later.",
      });
    }

    return next();
  };
}

export const authRateLimit = createRateLimiter({
  keyPrefix: "auth",
  windowMs: 60 * 1000,
  maxRequests: 50,
});

export const expensiveRateLimit = createRateLimiter({
  keyPrefix: "expensive",
  windowMs: 60 * 1000,
  maxRequests: 30,
});

export function securityHeaders(_req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  });
  next();
}

export function validateJwtSecret(secret = process.env.JWT_SECRET) {
  if (typeof secret !== "string" || !secret.trim() || /your[_-]?jwt[_-]?secret|change[_-]?me|password/i.test(secret)) {
    throw new Error("JWT_SECRET must be a strong, non-placeholder secret");
  }
}

