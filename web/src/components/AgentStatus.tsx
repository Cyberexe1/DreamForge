import { istDateTime, nextRun, timeUntil } from '../lib/schedule';
import type { Capsule } from '../types';

const SCHEDULED = 'eventbridge.schedule';

/**
 * Autonomy evidence, rendered honestly. meta.trigger is shown verbatim — a
 * manually invoked run is never presented as a scheduled one.
 */
export function AgentStatus({ capsule }: { capsule: Capsule }) {
  const { meta } = capsule;
  const next = nextRun();
  const wasScheduled = meta.trigger === SCHEDULED;

  return (
    <section className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-20">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse-dot rounded-full bg-emerald-400"
          />
          <h2 className="font-display text-lg text-white">Agent status</h2>
          <span
            className={`pill ml-auto ${
              wasScheduled
                ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'
                : 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300'
            }`}
          >
            {wasScheduled ? 'Scheduled run' : 'Manual run'}
            <code className="font-mono text-[10px] opacity-70">{meta.trigger}</code>
          </span>
        </div>

        {/* The agent's own reasoning is the clearest proof a decision happened */}
        {capsule.reasoning && (
          <div className="border-b border-white/[0.07] px-6 py-6 sm:px-8">
            <span className="label">Why the agent chose this today</span>
            <p className="mt-3 max-w-3xl font-display text-lg font-light italic leading-relaxed text-slate-300">
              &ldquo;{capsule.reasoning}&rdquo;
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-3 lg:grid-cols-5">
          <Cell label="Last execution" value={istDateTime(new Date(meta.generated_at))} />
          <Cell label="Next execution" value={timeUntil(next)} sub={istDateTime(next)} />
          <Cell
            label="Self-critique"
            value={meta.critique_score === null ? 'n/a' : `${meta.critique_score}/10`}
            sub={meta.revisions === 0 ? 'accepted first pass' : `${meta.revisions} revision`}
          />
          <Cell label="Run duration" value={`${(meta.duration_ms / 1000).toFixed(1)}s`} />
          <Cell
            label="Human input"
            value="None"
            sub="no prompt, no click"
            className="col-span-2 sm:col-span-1"
          />
        </dl>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-4 text-[11px] text-slate-500 sm:px-8">
          <span className="font-mono">{meta.models.text}</span>
          {meta.models.image && (
            <>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-700" />
              <span className="font-mono">{meta.models.image}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  className = '',
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={`bg-ink-900/70 px-6 py-5 ${className}`}>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 font-display text-base text-white">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}
