import { config } from '../config.js';

/**
 * In-memory fixed-window limiter for the credential endpoints.
 *
 * ⚠️  Known limitation: this state is per-process. Behind multiple Lambda
 * instances an attacker gets the allowance once per warm container. It raises
 * the cost of credential stuffing but is not a hard ceiling. A shared limiter
 * (DynamoDB counter with TTL, or WAF rate rules on the Function URL) is the
 * correct fix if this ever faces real traffic. See D-022 in docs/MEMORY.md.
 */
const attempts = new Map();

function prune(now) {
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }
}

function keyFor(req) {
  // Email is included so one attacker cannot lock out an unrelated account,
  // and so spraying many emails from one IP still accumulates against the IP.
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  return `${req.ip}|${email}`;
}

export function credentialRateLimit(req, res, next) {
  const now = Date.now();
  const { windowMs, maxAttempts } = config.rateLimit;

  if (attempts.size > 5000) prune(now);

  const key = keyFor(req);
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + windowMs });
  }

  const current = attempts.get(key);

  if (current.count >= maxAttempts) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'too_many_attempts',
      message: 'Too many attempts. Try again shortly.',
      retryAfter,
    });
  }

  // Only failures count, so a legitimate user is never penalised. The route
  // calls this on a rejected credential.
  req.recordFailedAttempt = () => {
    const live = attempts.get(key);
    if (live) live.count += 1;
  };

  req.clearFailedAttempts = () => attempts.delete(key);

  return next();
}
