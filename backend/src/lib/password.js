import { createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

const scryptAsync = promisify(scrypt);

/**
 * Password hashing: bcrypt.
 *
 * `bcryptjs` (pure JS) rather than the native `bcrypt` package, because the
 * native one compiles C++ bindings that must be built for the Lambda target —
 * a hash built on Windows will not load on arm64 Amazon Linux. Pure JS costs
 * some speed and buys a deployment package that works everywhere.
 *
 * ── Why the SHA-256 pre-hash ──
 * bcrypt silently ignores everything past 72 bytes, so a long passphrase would
 * have its tail discarded with no error. Hashing to a fixed-length digest first
 * removes that cliff without weakening bcrypt: the digest is base64, always 44
 * bytes, and carries the full entropy of the original input. This is the same
 * construction as Passlib's `bcrypt_sha256`, hence the stored prefix.
 *
 * Stored formats, all self-describing so the scheme can change again later:
 *   bcrypt-sha256$$2a$12$...   current
 *   $2a$... / $2b$...          plain bcrypt, verified for completeness
 *   scrypt$N$r$p$salt$hash     legacy, still verified so no account breaks
 */

const BCRYPT_SHA256_PREFIX = 'bcrypt-sha256$';

/** bcrypt only sees this digest, never the raw password. */
function digest(plaintext) {
  return createHash('sha256').update(String(plaintext), 'utf8').digest('base64');
}

export async function hashPassword(plaintext) {
  const hash = await bcrypt.hash(digest(plaintext), config.password.bcryptCost);
  return BCRYPT_SHA256_PREFIX + hash;
}

/**
 * Constant-time where it matters, and false rather than throwing on a malformed
 * record — a corrupt row must be indistinguishable from a wrong password.
 */
export async function verifyPassword(plaintext, stored) {
  try {
    const record = String(stored);

    if (record.startsWith(BCRYPT_SHA256_PREFIX)) {
      return await bcrypt.compare(
        digest(plaintext),
        record.slice(BCRYPT_SHA256_PREFIX.length),
      );
    }

    if (record.startsWith('$2')) {
      return await bcrypt.compare(String(plaintext), record);
    }

    if (record.startsWith('scrypt$')) {
      return await verifyScrypt(plaintext, record);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * True when a stored hash uses an older scheme or a lower cost than we now
 * require. Callers can transparently re-hash on a successful login.
 */
export function needsRehash(stored) {
  const record = String(stored);
  if (!record.startsWith(BCRYPT_SHA256_PREFIX)) return true;

  const cost = Number(record.split('$')[3]);
  return !Number.isInteger(cost) || cost < config.password.bcryptCost;
}

/** Legacy scheme. Kept so accounts created before the bcrypt switch still work. */
async function verifyScrypt(plaintext, stored) {
  const parts = stored.split('$');
  if (parts.length !== 6) return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');

  const actual = await scryptAsync(plaintext, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
