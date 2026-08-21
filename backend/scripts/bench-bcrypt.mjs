import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Measures bcryptjs cost on this machine so the work factor is chosen from a
 * measurement rather than a guess. Aim for 100-400ms per hash: slow enough that
 * offline cracking is expensive, fast enough that a login feels instant.
 *
 * Lambda arm64 at 1024MB is roughly comparable to a modern laptop core, so
 * these numbers transfer reasonably well.
 */
const password = 'correct horse battery staple';
const digest = createHash('sha256').update(password).digest('base64');

console.log('cost   hash      verify');
console.log('----   ------    ------');

for (const cost of [10, 11, 12, 13]) {
  const t0 = performance.now();
  const hash = await bcrypt.hash(digest, cost);
  const t1 = performance.now();
  await bcrypt.compare(digest, hash);
  const t2 = performance.now();

  console.log(
    `${String(cost).padEnd(6)} ${(t1 - t0).toFixed(0).padStart(4)}ms    ${(t2 - t1)
      .toFixed(0)
      .padStart(4)}ms`,
  );
}
