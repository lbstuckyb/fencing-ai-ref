import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import {
  REFERENCE_SIGNALS,
  SIGNAL_ARTICLE,
  SIGNAL_GROUPS,
  SIGNAL_GROUP_LABELS,
} from '../data/rules';
import type { SignalGroup } from '../data/rules';
import { signalSpec } from '../signals/specs';

/**
 * The signal library — every signal in Article t.63, grouped and ordered the
 * way the rulebook groups them, not the way the app happened to build them.
 *
 * Two thirds of the entries here are graded: `signalSpec(id)` resolves against
 * `signals/specs.ts` for the core ten, and each links into `/practice?signal=id`
 * — the deep link `PracticeSignals.tsx` has carried since stage 13, unused until
 * now. The remaining ten resolve against `REFERENCE_SIGNALS` instead: t.63 signals
 * this app describes but does not yet grade (procedural calls, and phrase-analysis
 * or administrative calls with no gesture drill built for them).
 */

const GROUP_ORDER: readonly SignalGroup[] = [
  'preparatory',
  'phrase_analysis',
  'awarding',
  'administrative',
];

const CARD = 'flex h-full flex-col rounded-lg border p-4';
const GRADED_CARD = `${CARD} border-slate-200 dark:border-slate-800`;
const UNGRADED_CARD = `${CARD} border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900`;

const BADGE =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide';

export default function Reference() {
  return (
    <>
      <PageHeader
        title="Signal reference"
        lede={`Every signal in FIE Technical Rules Article ${SIGNAL_ARTICLE.article} (${SIGNAL_ARTICLE.figure}), grouped the way the rulebook groups them. The core ten are graded — open one in the practice drill straight from its card.`}
      />

      {GROUP_ORDER.map((group) => {
        const ids = SIGNAL_GROUPS.filter((entry) => entry.group === group).map((entry) => entry.id);
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="mb-10">
            <h2 id={`group-${group}`} className="mb-3 text-lg font-semibold tracking-tight">
              {SIGNAL_GROUP_LABELS[group]}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ids.map((id) => {
                const spec = signalSpec(id);
                if (spec) {
                  return (
                    <li key={id}>
                      <div className={GRADED_CARD}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-base font-medium">{spec.label}</span>
                          <span
                            className={`${BADGE} bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300`}
                          >
                            {spec.rule}
                          </span>
                        </div>
                        <p className="mt-1 flex-1 text-sm text-slate-600 dark:text-slate-400">
                          {spec.description}
                        </p>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                          {spec.directional ? 'Names a fencer — the arm matters' : 'Either arm'}
                          {spec.needsHands ? ' · reads your hand' : ''}
                        </p>
                        <Link
                          to={`/practice?signal=${spec.id}`}
                          className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-1.5 text-center text-sm font-medium transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          Practice this one
                        </Link>
                      </div>
                    </li>
                  );
                }

                const reference = REFERENCE_SIGNALS.find((entry) => entry.id === id);
                if (!reference) return null;
                return (
                  <li key={id}>
                    <div className={UNGRADED_CARD}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-medium">{reference.label}</span>
                        <span
                          className={`${BADGE} bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}
                        >
                          Not graded
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {reference.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}
