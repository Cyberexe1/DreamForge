import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Two reasons it's hash-based rather than history-based:
 *
 * 1. The site is static on S3 behind CloudFront. Path routing would need
 *    custom error-page rewrites on the distribution; hash routing needs nothing.
 * 2. Anything not starting with "#/" is treated as an in-page anchor, so the
 *    landing page's #today / #archive links keep working untouched.
 */
export type Route = '/' | '/login' | '/signup' | '/dashboard';

const ROUTES: readonly Route[] = ['/', '/login', '/signup', '/dashboard'];

function parse(hash: string): Route {
  if (!hash.startsWith('#/')) return '/';
  const path = hash.slice(1);
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : '/';
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(route: Route): void {
  window.location.hash = route;
}

/** Anchor href for a route, so links stay real links. */
export function href(route: Route): string {
  return `#${route}`;
}
