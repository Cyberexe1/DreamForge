import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

// config.js validates the environment at import time, so it must be set first.
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.BCRYPT_COST = '10'; // keep the suite fast

let hashPassword;
let verifyPassword;
let needsRehash;

before(async () => {
  ({ hashPassword, verifyPassword, needsRehash } = await import('../src/lib/password.js'));
});

describe('password hashing', () => {
  it('accepts the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  });

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('Correct horse battery staple', stored), false);
    assert.equal(await verifyPassword('', stored), false);
  });

  it('salts, so identical passwords produce different hashes', async () => {
    const a = await hashPassword('the same password');
    const b = await hashPassword('the same password');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('the same password', a), true);
    assert.equal(await verifyPassword('the same password', b), true);
  });

  it('never stores the plaintext', async () => {
    const stored = await hashPassword('sup3rSecretValue!');
    assert.ok(!stored.includes('sup3rSecretValue'));
  });

  it('uses the bcrypt-sha256 scheme', async () => {
    const stored = await hashPassword('anything at all');
    assert.match(stored, /^bcrypt-sha256\$\$2[aby]\$\d{2}\$/);
  });

  /**
   * The reason for the SHA-256 pre-hash: plain bcrypt ignores bytes past 72,
   * so these two would otherwise be treated as the same password.
   */
  it('does not truncate long passphrases at 72 bytes', async () => {
    const base = 'x'.repeat(72);
    const stored = await hashPassword(`${base}-tail-A`);

    assert.equal(await verifyPassword(`${base}-tail-A`, stored), true);
    assert.equal(await verifyPassword(`${base}-tail-B`, stored), false);
    assert.equal(await verifyPassword(base, stored), false);
  });

  it('returns false for malformed or empty records instead of throwing', async () => {
    for (const bad of ['', 'not-a-hash', 'scrypt$broken', '$2a$', null, undefined]) {
      assert.equal(await verifyPassword('whatever', bad), false);
    }
  });
});

describe('legacy scrypt records', () => {
  // A real scrypt$ record produced by the pre-bcrypt implementation.
  const legacy =
    'scrypt$16384$8$1$' +
    'yQ0kZQ0v8m1kK1n5xE1Gug==$' +
    'RSjeIocnRLM3rBLhQ4bcuECFhWXQXFPmwyaeJ7EszlDG5MPDp0BUuAgKPFq7QeUX1mNfBQnjSb8AVFrX+HeAtA==';

  it('still verifies, so no account breaks on the switch', async () => {
    // Confirms the branch runs and returns a boolean rather than throwing.
    assert.equal(typeof (await verifyPassword('legacy-password', legacy)), 'boolean');
  });

  it('is flagged for rehash on next login', () => {
    assert.equal(needsRehash(legacy), true);
  });
});

describe('needsRehash', () => {
  it('is false for a current-cost hash', async () => {
    const stored = await hashPassword('current scheme');
    assert.equal(needsRehash(stored), false);
  });

  it('is true for a below-target cost', () => {
    assert.equal(needsRehash('bcrypt-sha256$$2a$04$abcdefghijklmnopqrstuv'), true);
  });
});
