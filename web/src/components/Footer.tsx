import { REPO_URL, RUN_TIME_LABEL } from '../config';

const SERVICES = [
  'EventBridge',
  'Lambda',
  'Bedrock',
  'S3',
  'DynamoDB',
  'CloudFront',
  'CloudWatch',
] as const;

export function Footer() {
  return (
    <footer className="mt-28 border-t border-white/[0.07] bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-10">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-pulse-400 to-pulse-500 text-sm"
              >
                🌧️
              </span>
              <span className="font-display text-base font-semibold text-white">
                Creative Pulse
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              An autonomous creative agent. Wakes at {RUN_TIME_LABEL}, decides what to make,
              makes it, and publishes. Built for the Weekend Creative Agent Challenge.
            </p>
          </div>

          <div>
            <span className="label">Running on</span>
            <ul className="mt-4 flex max-w-xs flex-wrap gap-2">
              {SERVICES.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-400"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <span className="label">Source</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost mt-4"
            >
              View on GitHub
            </a>
          </div>
        </div>

        <p className="mt-12 border-t border-white/[0.05] pt-6 text-xs text-slate-600">
          Every word and image on this site was produced without human initiation.
        </p>
      </div>
    </footer>
  );
}
