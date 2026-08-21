import { useCallback, useEffect, useState } from 'react';
import { fetchArchive, fetchLatest } from '../api';
import type { ArchiveEntry, Capsule } from '../types';

export type DataStatus = 'loading' | 'ready' | 'unavailable';

export interface PulseData {
  status: DataStatus;
  capsule: Capsule | null;
  archive: ArchiveEntry[];
  reload: () => void;
}

/** Shared loader so the landing page and the dashboard read identical data. */
export function usePulseData(): PulseData {
  const [status, setStatus] = useState<DataStatus>('loading');
  const [capsule, setCapsule] = useState<Capsule | null>(null);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      // The archive resolves to [] on failure, so only the capsule decides
      // whether there is anything to show.
      const [latest, entries] = await Promise.all([fetchLatest(), fetchArchive()]);
      setCapsule(latest);
      setArchive(entries);
      setStatus('ready');
    } catch (err) {
      console.error('Could not load the latest capsule', err);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, capsule, archive, reload: () => void load() };
}

/** Consecutive days of published work, counting back from the most recent entry. */
export function currentStreak(entries: ArchiveEntry[]): number {
  if (entries.length === 0) return 0;

  const days = [...new Set(entries.map((e) => e.date))].sort().reverse();
  let streak = 1;

  for (let i = 1; i < days.length; i += 1) {
    const prev = days[i - 1];
    const curr = days[i];
    if (!prev || !curr) break;
    if (dayGap(curr, prev) !== 1) break;
    streak += 1;
  }

  return streak;
}

function dayGap(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}
