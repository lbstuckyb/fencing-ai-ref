import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';
import PageHeader from '../components/PageHeader';
import {
  allowedSignals,
  exclusionReason,
  FIE_RULES_INDEX,
  RULE_DOCUMENTS,
  RULE_DOCUMENTS_EDITION,
  SIGNAL_ARTICLE,
  signalLabel,
  WEAPON_RULES,
  CORE_SIGNALS,
} from '../data/rules';

const MODE_PATHS = ['/reference', '/practice', '/scenarios'];

const CARD =
  'block h-full rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900';

/** `id` is required: it is the target of the section's `aria-labelledby`. */
function SectionHeading({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {note ? <p className="text-sm text-slate-600 dark:text-slate-400">{note}</p> : null}
    </div>
  );
}

export default function Home() {
  const modes = NAV_ITEMS.filter((item) => MODE_PATHS.includes(item.path));

  return (
    <>
      <PageHeader
        title="Fencing Referee Trainer"
        lede="Refereeing is two separable skills: making the official FIE hand signals correctly, and reading a phrase to issue the right sequence of calls. Both are normally only learnable standing next to an experienced referee. A webcam and a browser can drill both."
      />

      <p className="mb-8 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Signals are graded against{' '}
        <span className="font-medium text-slate-900 dark:text-slate-100">
          FIE Technical Rules, Article {SIGNAL_ARTICLE.article}
        </span>{' '}
        ({SIGNAL_ARTICLE.figure}) — including its duration criterion:{' '}
        <q className="italic">{SIGNAL_ARTICLE.durationRule}</q> A signal held too briefly is marked
        as such, because the rulebook says so.
      </p>

      <section
        aria-labelledby="privacy-heading"
        className="mb-10 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40"
      >
        <h2
          id="privacy-heading"
          className="text-sm font-semibold text-emerald-900 dark:text-emerald-200"
        >
          Everything runs on your device
        </h2>
        <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
          Pose estimation happens in your browser. There is no backend and no upload: no video,
          image or landmark ever leaves your machine. The camera is only on while a drill page is
          open.
        </p>
      </section>

      <section aria-labelledby="modes-heading" className="mb-10">
        <h2 id="modes-heading" className="sr-only">
          What you can do
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {modes.map((mode) => (
            <li key={mode.path}>
              <Link to={mode.path} className={`${CARD} flex flex-col`}>
                <span className="font-medium">{mode.label}</span>
                <span className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {mode.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rules-heading" className="mb-10">
        <SectionHeading
          id="rules-heading"
          title="The rulebook"
          note="Read the source, not a summary of it."
        />

        <a href={FIE_RULES_INDEX.url} target="_blank" rel="noreferrer" className={CARD}>
          <span className="font-medium">
            {FIE_RULES_INDEX.title}{' '}
            <span aria-hidden="true" className="text-slate-400">
              ↗
            </span>
          </span>
          <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
            {FIE_RULES_INDEX.description}
          </span>
        </a>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {RULE_DOCUMENTS.map((doc) => (
            <li key={doc.id}>
              <a href={doc.url} target="_blank" rel="noreferrer" className={`${CARD} text-sm`}>
                <span className="font-medium">
                  {doc.title}{' '}
                  <span aria-hidden="true" className="text-slate-400">
                    ↗
                  </span>
                </span>
                <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {RULE_DOCUMENTS_EDITION} edition · PDF
                </span>
                <span className="mt-2 block text-slate-600 dark:text-slate-400">
                  {doc.description}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          The three PDF links point at the {RULE_DOCUMENTS_EDITION} edition specifically and will
          break when the FIE publishes the next one. If a link fails, use the index above — it
          always resolves to the current edition.
        </p>
      </section>

      <section aria-labelledby="weapons-heading">
        <SectionHeading
          id="weapons-heading"
          title="What changes by weapon"
          note="Weapon is not a filter tag — it changes which calls exist."
        />
        <ul className="grid gap-4 sm:grid-cols-3">
          {WEAPON_RULES.map((weapon) => {
            const excluded = CORE_SIGNALS.filter(
              (signal) => !allowedSignals(weapon.id).includes(signal.id)
            );
            return (
              <li
                key={weapon.id}
                className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              >
                <h3 className="font-medium">{weapon.label}</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {weapon.rightOfWay ? 'Right of way' : 'No right of way'}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{weapon.summary}</p>
                <dl className="mt-3 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">Target</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{weapon.target}</dd>
                </dl>
                {excluded.length > 0 ? (
                  <div className="mt-3 text-sm">
                    <p className="text-slate-500 dark:text-slate-400">Calls that cannot occur</p>
                    <ul className="mt-1 space-y-1">
                      {excluded.map((signal) => (
                        <li key={signal.id} className="text-slate-700 dark:text-slate-300">
                          <abbr
                            className="no-underline decoration-dotted underline-offset-4 hover:underline"
                            title={exclusionReason(weapon.id, signal.id)}
                          >
                            {signalLabel(signal.id)}
                          </abbr>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
