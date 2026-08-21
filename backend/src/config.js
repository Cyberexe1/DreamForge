/**
 * All configuration comes from the environment. Read once, validated at boot,
 * so a misconfigured deployment fails immediately instead of at first request.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** Long enough that a brute-force on the signature is not the weak link. */
const MIN_SECRET_LENGTH = 32;

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function list(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const jwtSecret = required('JWT_SECRET');

if (jwtSecret.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
  );
}

if (isProduction && jwtSecret.startsWith('dev-')) {
  throw new Error('Refusing to start in production with a development JWT_SECRET.');
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  region: process.env.AWS_REGION ?? 'us-east-1',

  tables: {
    users: process.env.USERS_TABLE ?? 'dreamforge-users',
  },

  jwt: {
    secret: jwtSecret,
    /** Short-lived by design: the token lives in browser storage. */
    expiresIn: process.env.JWT_EXPIRES_IN ?? '2h',
    issuer: 'dreamforge',
  },

  /** Explicit allowlist. Never reflect an arbitrary Origin header. */
  allowedOrigins: list('ALLOWED_ORIGINS', [
    'http://localhost:5173',
    'http://localhost:5174',
  ]),

  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
  },

  password: {
    minLength: 10,
    maxLength: 200,
    /**
     * bcrypt work factor. 12 is the target; drop to 10 (the OWASP floor) if
     * login latency becomes uncomfortable, since bcryptjs is pure JS and each
     * increment doubles the work.
     */
    bcryptCost: clampCost(process.env.BCRYPT_COST, 12),
  },
};

function clampCost(raw, fallback) {
  const cost = Number(raw ?? fallback);
  if (!Number.isInteger(cost) || cost < 10 || cost > 15) return fallback;
  return cost;
}
