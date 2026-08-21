import { tokenFrom, verifyToken } from '../lib/token.js';
import { findByEmail } from '../repositories/users.js';

/**
 * Verifies the bearer token, then loads the user fresh from DynamoDB.
 *
 * The extra read is deliberate: it means a deleted account stops working
 * immediately rather than when its token happens to expire, and profile
 * changes are never served stale out of a token claim.
 */
export async function requireAuth(req, res, next) {
  const token = tokenFrom(req);

  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sign in to continue.' });
  }

  const payload = verifyToken(token);
  if (!payload?.email) {
    return res.status(401).json({ error: 'invalid_token', message: 'Your session has expired.' });
  }

  try {
    const user = await findByEmail(payload.email);
    if (!user || user.userId !== payload.sub) {
      return res.status(401).json({ error: 'invalid_token', message: 'Your session has expired.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
