import { config } from '../config.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'not_found', message: 'No such endpoint.' });
}

/**
 * Central error handler. Client errors report their message; anything else is
 * logged server-side and reported generically, so internals and stack traces
 * never reach a response body.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity
export function errorHandler(err, req, res, _next) {
  const status = Number(err?.status) || 500;

  if (status >= 500) {
    console.error('[error]', {
      method: req.method,
      path: req.path,
      name: err?.name,
      message: err?.message,
      stack: config.isProduction ? undefined : err?.stack,
    });

    return res.status(500).json({
      error: 'internal_error',
      message: 'Something went wrong on our side.',
    });
  }

  return res.status(status).json({
    error: err.name === 'ValidationError' ? 'validation_failed' : err.code ?? 'bad_request',
    message: err.message ?? 'Request could not be processed.',
    ...(err.fields ? { fields: err.fields } : {}),
  });
}
