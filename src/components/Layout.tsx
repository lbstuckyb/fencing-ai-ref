import { NavLink, Outlet } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';
import ThemeToggle from './ThemeToggle';

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
  return isActive
    ? `${base} bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900`
    : `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100`;
}

export default function Layout() {
  return (
    <div className="flex min-h-full flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sky-600 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <NavLink
            to="/"
            className="text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Fencing Referee Trainer
          </NavLink>

          <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={navLinkClass}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 px-4 py-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
          <p>
            Camera processing runs entirely on your device — no video leaves the browser, and there
            is no backend.
          </p>
          <p>Signals per FIE Technical Rules, Article t.63.</p>
        </div>
      </footer>
    </div>
  );
}
