import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Short-lived bearer token. Claims are kept minimal — the token proves identity
 * and nothing more. Profile data is always read fresh from DynamoDB so a rename
 * or a deletion takes effect immediately rather than at token expiry.
 */
export function signToken(user) {
  return jwt.sign({ email: user.email }, config.jwt.secret, {
    algorithm: 'HS256',
    subject: user.userId,
    issuer: config.jwt.issuer,
    expiresIn: config.jwt.expiresIn,
  });
}

/** Returns the payload, or null for anything invalid, expired or malformed. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
    });
  } catch {
    return null;
  }
}

/**
 * Extracts the session token from a request.
 *
 * X-Auth-Token is checked first and is what the browser actually sends. The
 * reason is CloudFront: Origin Access Control signs each request to the Lambda
 * URL with SigV4 *in the Authorization header*, so a forwarded viewer
 * Authorization header would overwrite that signature and the origin would
 * reject the call with 403. Authorization is still accepted for direct local
 * development and for API clients that bypass CloudFront.
 */
export function tokenFrom(req) {
  const direct = req.get('x-auth-token');
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const header = req.get('authorization');
  if (typeof header !== 'string') return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1] : null;
}
