import { useEffect } from 'react';
import { imageUrl } from '../api';
import { useSession } from '../auth';
import { prettyMood } from '../lib/mood';
import { href, navigate } from '../lib/router';
import { istDateTime, longDate, nextRun, shortDate, timeUntil } from '../lib/schedule';
import { currentStreak, usePulseData } from '../lib/usePulseData';
import type { ArchiveEntry } from '../types';

const SCHEDULED = 'eventbridge.schedule';

/**
 * A read-only console over the agent's public output.
 *
 * There is deliberately no control here that can start a run — not a generate
 * button, not a "run now", not a scheduling form. The dashboard observes; the
 * schedule acts. See .kiro/steering/product.md.
 */
export function Dashboard() {
  const session = useSession();
  const { status, capsule, archive, reload } = usePulseData();
  const next = nextRun();

  useEffect(() => {
    if (!session) navigate('/login');
  }, [session]);

  if (!session) return null;

  const streak = currentStreak(archive);
  const total = archive.length;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-8 pt-28 sm:px-8 sm:pt-36">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Dashboard</span>
          <h1 className="mt-2 font-display text-3xl font-light text-white sm:text-4xl">
            {greeting()}, {session.name.split(' ')[0]}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Watching an agent that needs no supervision.
          </p>
        </div>

        <button type="button" onClick={reload} className="btn-ghost">
          Refresh view
        </button>
      </div>

      {/* The dashboard observes published work; it cannot commission any. */}
      <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-xs leading-relaxed text-slate-400">
        This is a read-only view. Nothing here can start a run — the agent is triggered only
        by its schedule, next at{' '}
        <span className="text-slate-200">{istDateTime(next)}</span>.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] lg:grid-cols-4">
        <Stat label="Next run" value={timeUntil(next)} sub={istDateTime(next)} />
        <Stat
          label="Capsules published"
          value={status === 'loading' ? '—' : String(total)}
          sub="one per morning"
        />
        <Stat
          label="Unbroken streak"
          value={status === 'loading' ? '—' : `${streak} ${streak === 1 ? 'day' : 'days'}`}
          sub="consecutive publishes"
        />
        <Stat
          label="Last trigger"
          value={capsule ? (capsule.meta.trigger === SCHEDULED ? 'Schedule' : 'Manual') : '—'}
          sub={capsule ? capsule.meta.trigger : 'awaiting first run'}
        />
      </dl>

      {capsule && (
        <section className="mt-10">
          <h2 className="label">Most recent capsule</h2>
          <article className="card mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:p-7">
            <div className="w-full shrink-0 overflow-hidden rounded-2xl bg-ink-850 sm:w-48">
              {capsule.image_key ? (
                <img
                  src={imageUrl(capsule.image_key)}
                  alt={`Artwork for ${capsule.title}`}
                  loading="lazy"
                  className="h-40 w-full object-cover sm:h-full"
                />
              ) : (
                <div className="grid h-40 w-full place-items-center text-[11px] text-slate-500 sm:h-full">
                  Words only
                </div>
              )}
            </div>

            <div className="min-w-0">
              <time dateTime={capsule.date} className="font-mono text-[11px] text-slate-500">
                {longDate(capsule.date)}
              </time>
              <h3 className="mt-2 font-display text-xl text-white">{capsule.title}</h3>
              <p className="mt-1.5 text-sm text-pulse-300/80">
                {capsule.theme} · {prettyMood(capsule.mood)}
              </p>

              {capsule.reasoning && (
                <p className="mt-4 border-l-2 border-white/10 pl-4 text-sm italic leading-relaxed text-slate-400">
                  {capsule.reasoning}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="pill">
                  Self-critique{' '}
                  {capsule.meta.critique_score === null
                    ? 'n/a'
                    : `${capsule.meta.critique_score}/10`}
                </span>
                <span className="pill">
                  {capsule.meta.revisions === 0
                    ? 'First pass'
                    : `${capsule.meta.revisions} revision`}
                </span>
                <span className="pill">{(capsule.meta.duration_ms / 1000).toFixed(1)}s</span>
              </div>

              <a href="#today" className="btn-ghost mt-6">
                Read it in full
              </a>
            </div>
          </article>
        </section>
      )}

      <section className="mt-12">
        <h2 className="label">Run history</h2>
        {status === 'loading' && <HistorySkeleton />}
        {status === 'unavailable' && (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
            The agent&apos;s output could not be reached just now. Next scheduled run is{' '}
            {timeUntil(next)}.
          </p>
        )}
        {status === 'ready' && <HistoryTable entries={archive} />}
      </section>

      <p className="mt-12 text-xs text-slate-600">
        Signed in locally as {session.email}. No account exists on any server —{' '}
        <a href={href('/')} className="rounded underline decoration-white/20 underline-offset-4">
          back to the site
        </a>
        .
      </p>
    </div>
  );
}

function HistoryTable({ entries }: { entries: ArchiveEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
        No capsules yet. The first one appears after the agent&apos;s next scheduled run.
      </p>
    );
  }

  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Every capsule the agent has published, most recent first
        </caption>
        <thead>
          <tr className="bg-white/[0.04] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <th scope="col" className="px-5 py-3 font-semibold">
              Date
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Title
            </th>
            <th scope="col" className="hidden px-5 py-3 font-semibold sm:table-cell">
              Theme
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Art
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {ordered.map((entry) => (
            <tr key={entry.date} className="bg-ink-900/50 transition-colors hover:bg-ink-850">
              <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-500">
                <time dateTime={entry.date}>{shortDate(entry.date)}</time>
              </td>
              <td className="px-5 py-4 text-slate-200">{entry.title}</td>
              <td className="hidden px-5 py-4 text-pulse-300/70 sm:table-cell">{entry.theme}</td>
              <td className="px-5 py-4">
                {entry.image_key ? (
                  <span className="text-xs text-emerald-300/80">Illustrated</span>
                ) : (
                  <span className="text-xs text-slate-500">Text only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="mt-4 space-y-px overflow-hidden rounded-3xl border border-white/10" aria-busy="true">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 bg-ink-900/50 px-5 py-4">
          <div className="h-3 w-12 animate-pulse rounded-full bg-white/[0.07]" />
          <div className="h-3 flex-1 animate-pulse rounded-full bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-ink-900/70 px-5 py-5">
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 font-display text-lg text-white">{value}</dd>
      <dd className="mt-0.5 truncate text-xs text-slate-500">{sub}</dd>
    </div>
  );
}

function greeting(): string {
  const hourIst = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  if (hourIst < 12) return 'Good morning';
  if (hourIst < 17) return 'Good afternoon';
  return 'Good evening';
}
