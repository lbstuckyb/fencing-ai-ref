import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { STEPS, TOOLS } from '../nav';
import { SIGNAL_ARTICLE } from '../data/rules';
import Hint from './Hint';

function stepClass({ isActive }: { isActive: boolean }) {
  return `focusable flex items-baseline gap-1.5 border-b-2 px-1 py-1 font-display text-base font-bold uppercase tracking-widest sm:text-lg transition-colors ${
    isActive ? 'border-chalk text-chalk' : 'border-transparent text-mute hover:text-chalk'
  }`;
}

/**
 * The frame every page sits in: one thin bar and then the whole viewport. Pages
 * that fill the screen take `h-full`; the ones that are tables scroll inside
 * `main`, so the bar never leaves.
 */
export default function Layout() {
  const { pathname } = useLocation();
  const tuning = TOOLS.some((tool) => tool.path === pathname);

  return (
    <div className="flex h-dvh flex-col bg-ink text-chalk">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-chalk focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>

      <header className="flex shrink-0 items-center gap-x-3 border-b border-line px-3 py-2 sm:gap-x-8 sm:px-5">
        <NavLink
          to="/"
          aria-label="Fencing Referee Trainer"
          className="focusable flex items-center gap-2"
        >
          <span aria-hidden className="h-3 w-3 bg-lamp-red" />
          <span aria-hidden className="h-3 w-3 bg-lamp-green" />
          <span className="display hidden pl-1 text-xl sm:inline">Referee</span>
        </NavLink>

        <nav aria-label="Main" className="flex flex-1 items-center gap-3 sm:gap-6">
          {STEPS.map((step) => (
            <NavLink key={step.path} to={step.path} className={stepClass}>
              <span aria-hidden className="hidden text-xs text-mute sm:inline">
                {step.number}
              </span>
              {step.label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to={TOOLS[0].path}
          aria-label="Tuning"
          className={`focusable flex h-6 w-6 items-center justify-center transition-colors ${
            tuning ? 'text-chalk' : 'text-mute hover:text-chalk'
          }`}
        >
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
            <circle cx="15" cy="7" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
        </NavLink>

        <Hint label="About">
          Runs on your device. No video leaves the browser. Graded against FIE Technical Rules,
          Article {SIGNAL_ARTICLE.article}.
        </Hint>
      </header>

      <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
