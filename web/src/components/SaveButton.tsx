import { useState } from 'react';
import { saveCapsule, unsaveCapsule } from '../auth';

/**
 * Bookmarks a capsule against the signed-in account.
 *
 * This records a preference; it does not commission work. Nothing in this
 * product can ask the agent to create anything.
 */
export function SaveButton({ date, saved }: { date: string; saved: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(false);
    try {
      if (saved) await unsaveCapsule(date);
      else await saveCapsule(date);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={saved}
      title={error ? 'Could not save. Try again.' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs
                  font-medium transition-all disabled:opacity-50
                  ${
                    saved
                      ? 'border-ember-400/40 bg-ember-400/10 text-ember-300 hover:bg-ember-400/20'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white'
                  }
                  ${error ? 'border-rose-400/50 text-rose-300' : ''}`}
    >
      <span aria-hidden="true">{saved ? '★' : '☆'}</span>
      {busy ? 'Saving…' : saved ? 'Saved' : 'Save'}
    </button>
  );
}
