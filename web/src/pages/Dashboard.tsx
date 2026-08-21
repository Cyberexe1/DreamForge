import { useEffect, useState } from 'react';
import { imageUrl } from '../api';
import { updateName, useAuth, type User } from '../auth';
import { SaveButton } from '../components/SaveButton';
import { prettyMood } from '../lib/mood';
import { href, navigate } from '../lib/router';
import { istDateTime, longDate, nextRun, shortDate, timeUntil } from '../lib/schedule';
import { currentStreak, usePulseData } from '../lib/usePulseData';
import type { ArchiveEntry } from '../types';

const SCHEDULED = 'eventbridge.schedule';

/**
 * Read-only console over the agent's public output, plus the signed-in user's
 * own data from DynamoDB.
 *
 * There is deliberately no control here that can start a run — not a generate
 * button, not a "run now", not a scheduling form. The dashboard observes; the
 * schedule acts. See .kiro/steering/product.md.
 */
export function Dashboard() {
  const auth = useAuth();
  const { status, capsule, archive, reload } = usePulseData();
  const next = nextRun();

  useEffect(() => {
    if (auth.status === 'anonymous') navigate('/login');
  }, [auth.status]);

  if (auth.status !== 'authenticated') {
    return (
      <div className="mx-auto max-w-6xl px-5 pt-32 sm:px-8">
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/[0.07]" />
        <div className="mt-4 h-9 w-64 animate-pulse rounded-full bg-white/[0.07]" />
      </div>
    );
  }

  const user = auth.user;
  const streak = currentStreak(archive);
  const saved = new Set(user.savedDates);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-8 pt-28 sm:px-8 sm:pt-36">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Dashboard</span>
          <h1 className="mt-2 font-display text-3xl font-light text-white sm:text-4xl">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Watching an agent that needs no supervision.
          </p>
        </div>

        <button type="button" onClick={reload} className="btn-ghost">
          Refresh view
        </button>
      </div>

      <p className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-xs leading-relaxed text-slate-400">
        This is a read-only view. Nothing here can start a run — the agent is triggered only
        by its schedule, next at{' '}
        <span className="text-slate-200">{istDateTime(next)}</span>.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] lg:grid-cols-4">
        <Stat label="Next run" value={timeUntil(next)} sub={istDateTime(next)} />
        <Stat
          label="Capsules published"
          value={status === 'loading' ? '—' : String(archive.length)}
          sub="one per morning"
        />
        <Stat
          label="Unbroken streak"
          value={status === 'loading' ? '—' : `${streak} ${streak === 1 ? 'day' : 'days'}`}
          sub="consecutive publishes"
        />
        <Stat
          label="You saved"
          value={String(user.savedDates.length)}
          sub={user.savedDates.length === 1 ? 'capsule' : 'capsules'}
        />
      </dl>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {capsule ? (
          <section>
            <h2 className="label">Most recent capsule</h2>
            <article className="card mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:p-7">
              <div className="w-full shrink-0 overflow-hidden rounded-2xl bg-ink-850 sm:w-44">
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

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <SaveButton date={capsule.date} saved={saved.has(capsule.date)} />
                  <span className="pill">
                    {capsule.meta.trigger === SCHEDULED ? 'Scheduled' : 'Manual'}
                  </span>
                  <span className="pill">
                    {capsule.meta.critique_score === null
                      ? 'No score'
                      : `${capsule.meta.critique_score}/10`}
                  </span>
                </div>
              </div>
            </article>
          </section>
        ) : (
          <div />
        )}

        <ProfileCard user={user} />
      </div>

      <section className="mt-12">
        <h2 className="label">Run history</h2>
        {status === 'loading' && <HistorySkeleton />}
        {status === 'unavailable' && (
          <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
            The agent&apos;s output could not be reached just now. Next scheduled run is{' '}
            {timeUntil(next)}.
          </p>
        )}
        {status === 'ready' && <HistoryTable entries={archive} saved={saved} />}
      </section>

      <p className="mt-12 text-xs text-slate-600">
        Signed in as {user.email} ·{' '}
        <a href={href('/')} className="rounded underline decoration-white/20 underline-offset-4">
          back to the site
        </a>
      </p>
    </div>
  );
}

/** Profile and account data, all of it read from DynamoDB. */
function ProfileCard({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateName(name.trim());
      setEditing(false);
    } catch {
      setError('Could not save that name.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="label">Your account</h2>
      <div className="card mt-4 p-6">
        {editing ? (
          <div>
            <label htmlFor="profile-name" className="label block">
              Display name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-ink-950/60 px-4 py-2.5
                         text-sm text-white hover:border-white/20 disabled:opacity-60"
            />
            {error && (
              <p role="alert" className="mt-2 text-xs text-rose-300">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || name.trim().length < 2}
                className="btn-primary px-4 py-2 text-xs"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setName(user.name);
                  setEditing(false);
                  setError(null);
                }}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="font-display text-xl text-white">{user.name}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{user.email}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-ghost mt-4 px-4 py-2 text-xs"
            >
              Edit name
            </button>
          </>
        )}

        <dl className="mt-6 space-y-3 border-t border-white/[0.07] pt-5 text-xs">
          <Row label="Member since" value={shortDate(user.createdAt.slice(0, 10))} />
          <Row
            label="Last sign-in"
            value={user.lastLoginAt ? istDateTime(new Date(user.lastLoginAt)) : 'This one'}
          />
          <Row label="Sign-ins" value={String(user.loginCount)} />
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-300">{value}</dd>
    </div>
  );
}

function HistoryTable({ entries, saved }: { entries: ArchiveEntry[]; saved: Set<string> }) {
  if (entries.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
        No capsules yet. The first one appears after the agent&apos;s next scheduled run.
      </p>
    );
  }

  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-4 overflow-x-auto rounded-3xl border border-white/10">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Every capsule the agent has published, most recent first
        </caption>
        <thead>
          <tr className="bg-white/[0.04] text-[11px] uppercase tracking-[0.14em] text-slate-500">
            <th scope="col" className="px-5 py-3 font-semibold">Date</th>
            <th scope="col" className="px-5 py-3 font-semibold">Title</th>
            <th scope="col" className="hidden px-5 py-3 font-semibold sm:table-cell">Theme</th>
            <th scope="col" className="px-5 py-3 font-semibold">Saved</th>
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
                <SaveButton date={entry.date} saved={saved.has(entry.date)} />
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
    <div
      className="mt-4 space-y-px overflow-hidden rounded-3xl border border-white/10"
      aria-busy="true"
    >
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
