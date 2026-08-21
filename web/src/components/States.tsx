import { istDateTime, nextRun, timeUntil } from '../lib/schedule';

/** Skeleton, not a spinner — the layout must not jump when data lands. */
export function LoadingState() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-24 sm:px-8 sm:pt-32" aria-busy="true">
      <span className="sr-only">Loading today&apos;s capsule</span>
      <div className="h-3 w-28 animate-pulse rounded-full bg-white/[0.07]" />
      <div className="mt-4 h-9 w-72 animate-pulse rounded-full bg-white/[0.07]" />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.05]" />
        <div className="card space-y-4 p-9">
          <div className="h-8 w-3/4 animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-px w-14 bg-white/10" />
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded-full bg-white/[0.05]"
              style={{ width: `${72 + ((i * 13) % 26)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The agent may simply not have published yet. Never show a raw error or an
 * empty page — a stale or waiting site still beats a broken one.
 */
export function WaitingState({ onRetry }: { onRetry: () => void }) {
  const next = nextRun();

  return (
    <div className="mx-auto max-w-2xl px-5 pt-32 text-center sm:pt-40">
      <span
        aria-hidden="true"
        className="mx-auto grid h-14 w-14 place-items-center rounded-3xl border border-white/10 bg-white/[0.04] text-2xl"
      >
        ✦
      </span>
      <h2 className="mt-7 font-display text-3xl font-light text-white">
        The agent&apos;s latest work is on its way
      </h2>
      <p className="mt-4 text-slate-400">
        Nothing is published for right now. The next scheduled run is{' '}
        <span className="text-slate-200">{timeUntil(next)}</span>, at {istDateTime(next)}.
      </p>
      <button type="button" onClick={onRetry} className="btn-ghost mt-8">
        Check again
      </button>
    </div>
  );
}
