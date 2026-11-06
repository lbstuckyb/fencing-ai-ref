import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LANGS, setLang, t, tx, useLang } from '../i18n';
import type { Lang } from '../i18n';
import { STEPS, TOOLS } from '../nav';

function stepClass({ isActive }: { isActive: boolean }) {
  return `focusable flex items-baseline gap-1.5 border-b-2 px-1 py-1 font-display text-sm font-bold uppercase tracking-wider sm:text-lg sm:tracking-widest transition-colors ${
    isActive ? 'border-chalk text-chalk' : 'border-transparent text-mute hover:text-chalk'
  }`;
}

/**
 * EN · ES · FR — the current one lit, the others a click away. On a phone the
 * bar has no room for three buttons, so it is one native picker there.
 */
function LanguageSelector() {
  const lang = useLang();
  const label = t('lang.selector');
  const text = 'font-display text-sm font-bold uppercase tracking-widest';
  return (
    <>
      <select
        aria-label={label}
        value={lang}
        onChange={(event) => setLang(event.target.value as Lang)}
        className={`focusable cursor-pointer appearance-none bg-transparent text-chalk sm:hidden ${text}`}
      >
        {LANGS.map((code) => (
          <option key={code} value={code} className="bg-ink">
            {code.toUpperCase()}
          </option>
        ))}
      </select>

      <div role="group" aria-label={label} className="hidden items-center gap-1.5 sm:flex">
        {LANGS.map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            onClick={() => setLang(code)}
            aria-pressed={code === lang}
            title={tx(`lang.names.${code}`)}
            className={`focusable transition-colors ${text} ${
              code === lang ? 'text-chalk' : 'text-mute hover:text-chalk'
            }`}
          >
            {code}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The frame every page sits in: one thin bar and then the whole viewport. Pages
 * that fill the screen take `h-full`; the ones that are tables scroll inside
 * `main`, so the bar never leaves.
 */
export default function Layout() {
  const { pathname } = useLocation();
  // Read here so the whole frame re-renders, and keys the page below so it
  // re-mounts in the new language: page text is read with plain `t()` calls.
  const lang = useLang();
  const tuning = TOOLS.some((tool) => tool.path === pathname);

  return (
    <div className="flex h-dvh flex-col bg-ink text-chalk">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-chalk focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        {t('nav.skip')}
      </a>

      <header className="flex shrink-0 items-center gap-x-3 border-b border-line px-3 py-2 sm:gap-x-8 sm:px-5">
        <NavLink to="/" aria-label={t('nav.brand')} className="focusable flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 bg-lamp-red" />
          <span aria-hidden className="h-3 w-3 bg-lamp-green" />
          <span className="display hidden pl-1 text-xl sm:inline">{t('nav.brandShort')}</span>
        </NavLink>

        <nav aria-label={t('nav.main')} className="flex flex-1 items-center gap-3 sm:gap-6">
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
          aria-label={t('nav.tuning')}
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

        <NavLink
          to="/about"
          aria-label={t('nav.about')}
          className={({ isActive }) =>
            `focusable font-display text-sm font-bold uppercase tracking-widest transition-colors ${
              isActive ? 'text-chalk' : 'text-mute hover:text-chalk'
            }`
          }
        >
          {/* Words where there is room; on a phone, an "i" in the same type. */}
          <span aria-hidden className="hidden sm:inline">
            {t('nav.about')}
          </span>
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center border border-current text-xs normal-case sm:hidden"
          >
            i
          </span>
        </NavLink>

        <LanguageSelector />
      </header>

      <main key={lang} id="main" className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
