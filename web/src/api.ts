import type { ArchiveEntry, Capsule } from './types';
import { MOCK_ARCHIVE, MOCK_CAPSULE } from './mock';

const DATA_BASE = (import.meta.env.VITE_DATA_BASE ?? '').replace(/\/$/, '');

/**
 * Local development convenience only. Never enabled in a production build —
 * the site must never present invented work as the agent's output.
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' && import.meta.env.DEV;

/** Public URL for a generated image. */
export function imageUrl(key: string): string {
  if (USE_MOCK) return '';
  return `${DATA_BASE}/${key.replace(/^\//, '')}`;
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${DATA_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} responded ${res.status}`);
  return res.json();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Narrow once, at the boundary, so components can trust their props. */
function asCapsule(raw: unknown): Capsule {
  if (!isRecord(raw) || typeof raw['date'] !== 'string' || typeof raw['title'] !== 'string') {
    throw new Error('Malformed capsule payload');
  }
  return raw as unknown as Capsule;
}

function asArchive(raw: unknown): ArchiveEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is ArchiveEntry => isRecord(e) && typeof e['date'] === 'string',
  );
}

export async function fetchLatest(): Promise<Capsule> {
  if (USE_MOCK) return MOCK_CAPSULE;
  return asCapsule(await getJson('/data/latest.json'));
}

/** The archive is decorative. A failure here must not break the page. */
export async function fetchArchive(): Promise<ArchiveEntry[]> {
  if (USE_MOCK) return MOCK_ARCHIVE;
  try {
    return asArchive(await getJson('/data/index.json'));
  } catch {
    return [];
  }
}
