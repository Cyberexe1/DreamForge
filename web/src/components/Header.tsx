import { endSession, initials, useSession } from '../auth';
import { href, navigate, useRoute } from '../lib/router';

const NAV = [
  { label: 'Today', href: '#today' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Archive', href: '#archive' },
] as const;

/**
 * Floating, rounded, frosted header.
 *
 * Note what is absent: there is no generate, create or regenerate control here
 * or anywhere else in the product. Nothing on this site is human-initiated.
 * See .kiro/steering/product.md.
 */
export function Header() {
  const session = useSession();
  const route = useRoute();
  const onDashboard = route === '/dashboard';

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
      <div
        className="mx-auto flex max-w-6xl items-center gap-2 rounded-[1.75rem] border
                   border-white/10 bg-ink-900/70 px-3 py-2.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.9)]
                   backdrop-blur-xl sm:gap-4 sm:rounded-[2rem] sm:px-4 sm:py-3"
      >
        {/* Brand */}
        <a
          href={href('/')}
          className="flex shrink-0 items-center gap-2.5 rounded-full pl-1 pr-1 sm:gap-3 sm:pr-2"
          aria-label="Creative Pulse, home"
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

        {/* Section nav — anchors resolve to the landing page from any route */}
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        {/* Agent liveness — the agent is the only actor on this site */}
        <span
          className="ml-auto hidden items-center gap-2 rounded-full border border-emerald-400/20
                     bg-emerald-400/[0.07] px-3 py-1.5 text-[11px] font-medium
                     text-emerald-300 lg:ml-0 lg:inline-flex"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-400"
          />
          Agent active
        </span>

        {session ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            {!onDashboard && (
              <a href={href('/dashboard')} className="btn-primary px-4 py-2 sm:px-5 sm:py-2.5">
                Dashboard
              </a>
            )}

            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 pl-1 pr-1">
              <span
                title={session.email}
                className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br
                           from-pulse-400 to-pulse-500 text-[11px] font-semibold text-ink-950"
              >
                {initials(session.name)}
              </span>
              <button
                type="button"
                onClick={() => {
                  endSession();
                  navigate('/');
                }}
                className="rounded-full px-3 py-1.5 text-xs text-slate-400 transition-colors
                           hover:bg-white/5 hover:text-white"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <a
              href={href('/login')}
              className="btn-ghost px-3.5 py-2 sm:px-5 sm:py-2.5"
              aria-current={route === '/login' ? 'page' : undefined}
            >
              Log in
            </a>
            <a
              href={href('/signup')}
              className="btn-primary px-4 py-2 sm:px-5 sm:py-2.5"
              aria-current={route === '/signup' ? 'page' : undefined}
            >
              Sign up
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
