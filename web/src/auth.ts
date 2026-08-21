import { useEffect, useState } from 'react';

/**
 * ⚠️  THIS IS NOT AUTHENTICATION.
 *
 * There is no auth server in this project. This is a browser-local session
 * marker so the dashboard has a signed-in state to render. Specifically:
 *
 *   - no credentials are ever sent anywhere
 *   - no password is stored, hashed or otherwise
 *   - anyone can create a "session" by typing any valid-looking email
 *   - clearing site data removes it
 *
 * That is acceptable here only because it gates nothing. Every capsule on the
 * site is public, the dashboard is a read-only view of that same public JSON,
 * and no user data exists to protect.
 *
 * If this ever needs to guard something real, replace this file wholesale with
 * Amazon Cognito (Hosted UI + an authorizer on a real API). Do not extend it.
 * See D-019 in docs/MEMORY.md.
 */

const STORAGE_KEY = 'cp.session.v1';

export interface Session {
  email: string;
  name: string;
  /** ISO timestamp the local session was created. */
  since: string;
}

const listeners = new Set<(session: Session | null) => void>();

function read(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Session).email === 'string' &&
      typeof (parsed as Session).name === 'string'
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    // Corrupt or unavailable storage (private mode, quota). Treat as signed out.
    return null;
  }
}

function write(session: Session | null): void {
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage unavailable. The in-memory notification below still fires, so the
    // UI stays consistent for this page view.
  }
  for (const listener of listeners) listener(session);
}

export function getSession(): Session | null {
  return read();
}

/**
 * Creates the local session. The password argument is validated for shape by
 * the caller and deliberately never accepted here — there is nothing to send
 * it to, and storing it would be indefensible.
 */
export function startSession(email: string, name?: string): Session {
  const trimmed = email.trim().toLowerCase();
  const session: Session = {
    email: trimmed,
    name: name?.trim() || nameFromEmail(trimmed),
    since: new Date().toISOString(),
  };
  write(session);
  return session;
}

export function endSession(): void {
  write(null);
}

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(() => read());

  useEffect(() => {
    listeners.add(setSession);
    // Keep tabs in sync if storage changes elsewhere.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) setSession(read());
    };
    window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(setSession);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return session;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase();
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Reader';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Shape checks only. Not security. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 8;
