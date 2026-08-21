const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'df.token.v1';

/**
 * The bearer token lives in localStorage, which is readable by any successful
 * XSS. Accepted here because the token is short-lived (2h) and guards only
 * bookmarks over already-public capsules. An httpOnly cookie is stronger and
 * would need the API and site on one origin. See D-022 in docs/MEMORY.md.
 */
export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode, quota). The session lasts this page view.
  }
}

/** Field-level messages keyed by input name, as returned by the API. */
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldErrors;

  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (!token) throw new ApiError(401, 'unauthorized', 'Sign in to continue.');
    // Not Authorization: the API sits behind CloudFront, whose Origin Access
    // Control signs requests to the Lambda URL with SigV4 in the Authorization
    // header. Sending our own there would overwrite that signature and the
    // origin would reject it with 403.
    headers['X-Auth-Token'] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Is the API running?');
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body; handled by the status check below.
  }

  if (!res.ok) {
    const p = (payload ?? {}) as { error?: string; message?: string; fields?: FieldErrors };

    // An expired or rejected token should not leave a stale one behind.
    if (res.status === 401 && auth) setToken(null);

    throw new ApiError(
      res.status,
      p.error ?? 'request_failed',
      p.message ?? 'Something went wrong.',
      p.fields ?? {},
    );
  }

  return payload as T;
}
