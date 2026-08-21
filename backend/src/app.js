import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';

export function createApp() {
  const app = express();

  // Behind a Lambda Function URL or CloudFront, so req.ip must come from
  // X-Forwarded-For rather than the socket address.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(helmet());

  /**
   * Strict origin allowlist. Never reflect an arbitrary Origin header, and no
   * credentials mode — the client sends a bearer token, not a cookie, so there
   * is no CSRF surface to protect.
   */
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers send no Origin header.
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed: ${origin}`));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      // X-Auth-Token rather than Authorization, because CloudFront OAC reserves
      // Authorization for its SigV4 signature. See lib/token.js.
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token'],
      credentials: false,
      maxAge: 86400,
    }),
  );

  // Small ceiling: these endpoints only ever receive short JSON objects.
  app.use(express.json({ limit: '8kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dreamforge-backend' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
