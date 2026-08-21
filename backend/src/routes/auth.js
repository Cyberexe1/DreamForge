import { Router } from 'express';
import { hashPassword, needsRehash, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';
import { validateLogin, validateSignup } from '../lib/validate.js';
import { credentialRateLimit } from '../middleware/rateLimit.js';
import {
  createUser,
  findCredentials,
  recordLogin,
  updatePasswordHash,
} from '../repositories/users.js';

export const authRouter = Router();

/**
 * Deliberately identical for "no such account" and "wrong password" so the
 * endpoint cannot be used to enumerate registered emails.
 */
const BAD_CREDENTIALS = {
  error: 'invalid_credentials',
  message: 'That email and password combination is not right.',
};

authRouter.post('/signup', credentialRateLimit, async (req, res, next) => {
  try {
    const { name, email, password } = validateSignup(req.body);

    const passwordHash = await hashPassword(password);
    const user = await createUser({ email, name, passwordHash });

    console.log('[auth] account created', { userId: user.userId });

    return res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err?.name === 'EmailTakenError') {
      // Signup inherently reveals whether an email is registered; the useful
      // message wins here, and the rate limiter covers abuse.
      return res.status(409).json({
        error: 'email_taken',
        message: 'That email already has an account. Try logging in.',
      });
    }
    return next(err);
  }
});

authRouter.post('/login', credentialRateLimit, async (req, res, next) => {
  try {
    const { email, password } = validateLogin(req.body);
    const record = await findCredentials(email);

    if (!record) {
      // Still spend time hashing so a missing account is not detectably faster
      // than a wrong password.
      await hashPassword(password);
      req.recordFailedAttempt?.();
      return res.status(401).json(BAD_CREDENTIALS);
    }

    const ok = await verifyPassword(password, record.passwordHash);
    if (!ok) {
      req.recordFailedAttempt?.();
      return res.status(401).json(BAD_CREDENTIALS);
    }

    req.clearFailedAttempts?.();

    /**
     * Upgrade the stored hash while we legitimately hold the plaintext. This is
     * how the scrypt-era records and any below-target cost migrate without
     * asking anyone to reset a password. Failure here must not fail the login.
     */
    if (needsRehash(record.passwordHash)) {
      try {
        await updatePasswordHash(email, await hashPassword(password));
        console.log('[auth] password hash upgraded', { userId: record.user.userId });
      } catch (err) {
        console.error('[auth] rehash failed, login continues', { name: err?.name });
      }
    }

    const user = await recordLogin(email);

    console.log('[auth] login', { userId: user.userId });

    return res.json({ token: signToken(user), user });
  } catch (err) {
    return next(err);
  }
});

/**
 * Tokens are stateless, so there is nothing to revoke server-side. The client
 * discards it. Present for API completeness and to keep that fact explicit.
 */
authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});
