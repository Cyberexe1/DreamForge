import { useEffect, useState } from 'react';
import { request, setToken, getToken } from './lib/backend';

/**
 * Real accounts, backed by the Node API in backend/ and DynamoDB.
 * Passwords are bcrypt-hashed server-side; nothing sensitive is held here.
 */
export interface User {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  lastLoginAt: string | null;
  savedDates: string[];
  loginCount: number;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface MeResponse {
  user: User;
}

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: null };

const listeners = new Set<(state: AuthState) => void>();

let state: AuthState = { status: getToken() ? 'loading' : 'anonymous', user: null };
let bootstrapped = false;

function publish(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener(next);
}

/** Restores the session from a stored token by re-reading the profile. */
async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  if (!getToken()) {
    publish({ status: 'anonymous', user: null });
    return;
  }

  try {
    const { user } = await request<MeResponse>('/api/me', { auth: true });
    publish({ status: 'authenticated', user });
  } catch {
    // request() already cleared an invalid token.
    publish({ status: 'anonymous', user: null });
  }
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const { token, user } = await request<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: input,
  });
  setToken(token);
  publish({ status: 'authenticated', user });
  return user;
}

export async function logIn(input: { email: string; password: string }): Promise<User> {
  const { token, user } = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: input,
  });
  setToken(token);
  publish({ status: 'authenticated', user });
  return user;
}

export function logOut(): void {
  setToken(null);
  publish({ status: 'anonymous', user: null });
  // Fire-and-forget; tokens are stateless so there is nothing to revoke.
  void request('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export async function updateName(name: string): Promise<User> {
  const { user } = await request<MeResponse>('/api/me', {
    method: 'PATCH',
    body: { name },
    auth: true,
  });
  publish({ status: 'authenticated', user });
  return user;
}

export async function saveCapsule(date: string): Promise<User> {
  const { user } = await request<MeResponse>(`/api/me/saved/${date}`, {
    method: 'PUT',
    auth: true,
  });
  publish({ status: 'authenticated', user });
  return user;
}

export async function unsaveCapsule(date: string): Promise<User> {
  const { user } = await request<MeResponse>(`/api/me/saved/${date}`, {
    method: 'DELETE',
    auth: true,
  });
  publish({ status: 'authenticated', user });
  return user;
}

export function useAuth(): AuthState {
  const [current, setCurrent] = useState<AuthState>(state);

  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    void bootstrap();
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);

  return current;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase();
}

/** Client-side shape checks. The server validates authoritatively. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 10;
