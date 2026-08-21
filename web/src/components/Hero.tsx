import { RUN_TIME_LABEL } from '../config';
import { istDateTime, nextRun, timeUntil } from '../lib/schedule';

/**
 * The landing statement. Its job is to make the autonomy unmistakable within
 * a few seconds, since that is the whole premise of the project.
 */
export function Hero() {
  const next = nextRun();

  return (
    <section id="top" className="relative overflow-hidden pt-32 sm:pt-40">
      {/* Ambient wash */}
      <div
        aria-hidden="true"
        className="aurora pointer-events-none absolute inset-0 -top-40 animate-drift opacity-90"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r
                   from-transparent via-white/15 to-transparent"
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <span className="pill animate-reveal">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-pulse-400"
          />
          Runs by itself, every day at {RUN_TIME_LABEL}
        </span>

        <h1
          className="mt-7 max-w-4xl font-display text-[2.6rem] font-light leading-[1.05]
                     tracking-tight text-white animate-reveal sm:text-6xl lg:text-7xl"
          style={{ animationDelay: '60ms' }}
        >
          Nobody asked it to
          <br />
          make this.
        </h1>

        <p
          className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 animate-reveal sm:text-lg"
          style={{ animationDelay: '120ms' }}
        >
          DreamForge is an autonomous agent. Each morning it reads the date and the
          weather, remembers what it already made this week, decides what today should be
          about, writes it, illustrates it, and publishes.
          <span className="text-slate-300">
            {' '}
            There is no generate button on this page — by the time you arrive, the work is
            already done.
          </span>
        </p>

        <div
          className="mt-9 flex flex-wrap items-center gap-3 animate-reveal"
          style={{ animationDelay: '180ms' }}
        >
          <a href="#today" className="btn-primary">
            Read today&apos;s capsule
            <span aria-hidden="true">↓</span>
          </a>
          <a href="#how-it-works" className="btn-ghost">
            How the agent decides
          </a>
        </div>

        {/* Next scheduled run — visible proof there's a schedule, not a button */}
        <dl
          className="mt-14 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-3xl
                     border border-white/10 bg-white/[0.04] animate-reveal sm:grid-cols-3"
          style={{ animationDelay: '240ms' }}
        >
          <Stat label="Next run" value={timeUntil(next)} detail={istDateTime(next)} />
          <Stat label="Triggered by" value="EventBridge" detail="Not a human" />
          <Stat
            label="Human input"
            value="None"
            detail="No prompts, no clicks"
            className="col-span-2 sm:col-span-1"
          />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
  className = '',
}: {
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={`bg-ink-900/60 px-5 py-4 ${className}`}>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 font-display text-lg text-white">{value}</dd>
      <dd className="mt-0.5 text-xs text-slate-500">{detail}</dd>
    </div>
  );
}
