import { REPO_URL } from '../config';

const NAV = [
  { label: 'Today', href: '#today' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Archive', href: '#archive' },
] as const;

/**
 * Floating, rounded, frosted header.
 *
 * The primary action is deliberately "View on GitHub" — there is no generate
 * button anywhere in this product, because nothing here is human-initiated.
 * See .kiro/steering/product.md.
 */
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
      <div
        className="mx-auto flex max-w-6xl items-center gap-3 rounded-[1.75rem] border
                   border-white/10 bg-ink-900/70 px-3 py-2.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.9)]
                   backdrop-blur-xl sm:gap-4 sm:rounded-[2rem] sm:px-4 sm:py-3"
      >
        {/* Brand */}
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2.5 rounded-full pl-1 pr-2 sm:gap-3"
          aria-label="Creative Pulse, back to top"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br
                       from-pulse-400 to-pulse-500 text-base shadow-lg shadow-pulse-500/25"
          >
            🌧️
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[0.975rem] font-semibold tracking-tight text-white">
              Creative Pulse
            </span>
            <span className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">
              Autonomous, daily
            </span>
          </span>
        </a>

        {/* Nav */}
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        {/* Live status — the agent is the only actor here */}
        <span
          className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-400/20
                     bg-emerald-400/[0.07] px-3 py-1.5 text-[11px] font-medium
                     text-emerald-300 md:ml-0 md:inline-flex"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400"
          />
          Agent active
        </span>

        {/* Primary action */}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="btn-primary shrink-0 px-4 py-2 sm:px-5 sm:py-2.5"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-4 w-4 fill-current"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.91-.88-2.91-2.9 0-.83.3-1.51.79-2.04-.08-.2-.35-1 .07-2.08 0 0 .64-.2 2.1.78a7.1 7.1 0 0 1 1.91-.26c.65 0 1.3.09 1.91.26 1.46-.99 2.1-.78 2.1-.78.42 1.08.15 1.88.07 2.08.49.53.79 1.21.79 2.04 0 2.03-1.13 2.7-2.92 2.9.29.26.55.75.55 1.51 0 1.09-.01 1.98-.01 2.25 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span className="hidden sm:inline">View on GitHub</span>
          <span className="sm:hidden">GitHub</span>
        </a>
      </div>
    </header>
  );
}
