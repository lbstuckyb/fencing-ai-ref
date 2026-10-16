import { useState } from 'react';
import { Link } from 'react-router-dom';
import Hint from '../components/Hint';
import {
  FIE_RULES_INDEX,
  REFERENCE_SIGNALS,
  RULE_DOCUMENTS,
  RULE_DOCUMENTS_EDITION,
  SIGNAL_GROUPS,
  SIGNAL_GROUP_LABELS,
} from '../data/rules';
import type { SignalGroup } from '../data/rules';
import { signalSpec } from '../signals/specs';

/**
 * The signal library — every signal in Article t.63, numbered and grouped the
 * way the rulebook orders them, not the way the app happened to build them.
 *
 * Half the entries are graded: `signalSpec(id)` resolves against
 * `signals/specs.ts` for the core ten, and each links into
 * `/practice?signal=id`. The other ten resolve against `REFERENCE_SIGNALS`
 * instead: t.63 signals this app describes but does not yet grade.
 */

const GROUP_ORDER: readonly SignalGroup[] = [
  'preparatory',
  'phrase_analysis',
  'awarding',
  'administrative',
];

interface Entry {
  id: string;
  /** Position in the rulebook's order, 1-based; stable across filters. */
  number: string;
  group: SignalGroup;
  label: string;
  description: string;
  graded: boolean;
  directional: boolean;
  needsHands: boolean;
}

const ENTRIES: readonly Entry[] = SIGNAL_GROUPS.flatMap(({ id, group }, index) => {
  const spec = signalSpec(id);
  const reference = REFERENCE_SIGNALS.find((entry) => entry.id === id);
  const source = spec ?? reference;
  if (!source) return [];
  return [
    {
      id,
      number: String(index + 1).padStart(2, '0'),
      group,
      label: source.label,
      description: source.description,
      graded: spec !== undefined,
      directional: spec?.directional ?? false,
      needsHands: spec?.needsHands ?? false,
    },
  ];
});

/** The first one that can be drilled, so the way onward is on screen from the start. */
const FIRST = ENTRIES.find((entry) => entry.graded) ?? ENTRIES[0];

export default function Reference() {
  const [filter, setFilter] = useState<SignalGroup | 'all'>('all');
  const [selectedId, setSelectedId] = useState(FIRST.id);
  const selected = ENTRIES.find((entry) => entry.id === selectedId) ?? FIRST;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <h1 className="sr-only">Learn</h1>

      <section
        aria-label="Selected signal"
        className="flex shrink-0 flex-col justify-between gap-6 border-b border-line p-5 sm:p-8 lg:order-last lg:w-1/2 lg:border-b-0 lg:border-l"
      >
        <div key={selected.id} className="animate-rise">
          <p className="display text-6xl text-mute sm:text-8xl">{selected.number}</p>
          <h2 className="display mt-2 text-6xl sm:text-8xl">{selected.label}</h2>
          <p className="mt-4 max-w-md text-lg text-chalk/80">{selected.description}</p>

          <ul className="caption mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <li>{SIGNAL_GROUP_LABELS[selected.group]}</li>
            {selected.graded ? (
              <li className="flex items-center gap-2">
                {selected.directional ? (
                  <>
                    <span aria-hidden className="h-2.5 w-2.5 bg-lamp-red" />
                    <span aria-hidden className="h-2.5 w-2.5 bg-lamp-green" />
                    Names a fencer
                    <Hint align="left">
                      The arm you use says which fencer: left arm for the fencer on your left (red),
                      right arm for the one on your right (green).
                    </Hint>
                  </>
                ) : (
                  'Either arm'
                )}
              </li>
            ) : (
              <li>Not graded</li>
            )}
            {selected.needsHands ? <li>Reads your hand</li> : null}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selected.graded ? (
            <Link to={`/practice?signal=${selected.id}`} className="btn btn-go px-8 py-3 text-xl">
              Drill {selected.label} ›
            </Link>
          ) : null}
          <Link to="/practice" className="btn">
            Drill all ›
          </Link>
          <details className="relative ml-auto">
            <summary className="btn cursor-pointer list-none">Rulebook ↗</summary>
            <ul className="absolute bottom-full right-0 z-30 mb-2 w-64 border border-line bg-panel py-1 text-sm">
              {[FIE_RULES_INDEX, ...RULE_DOCUMENTS].map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focusable flex items-baseline justify-between gap-3 px-3 py-2 hover:bg-chalk/10"
                  >
                    {doc.title}
                    {doc === FIE_RULES_INDEX ? null : (
                      <span className="caption text-[0.65rem]">{RULE_DOCUMENTS_EDITION} · PDF</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col lg:w-1/2">
        <div
          role="group"
          aria-label="Filter by group"
          className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-3 py-2"
        >
          {(['all', ...GROUP_ORDER] as const).map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setFilter(group)}
              aria-pressed={filter === group}
              className="btn whitespace-nowrap text-sm"
            >
              {group === 'all' ? 'All' : SIGNAL_GROUP_LABELS[group]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {GROUP_ORDER.filter((group) => filter === 'all' || filter === group).map((group) => (
            <section key={group} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`} className="caption border-b border-line px-4 pb-2 pt-5">
                {SIGNAL_GROUP_LABELS[group]}
              </h2>
              <ul>
                {ENTRIES.filter((entry) => entry.group === group).map((entry) => (
                  <li key={entry.id} className="border-b border-line">
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      aria-pressed={entry.id === selected.id}
                      className={`focusable flex w-full items-baseline gap-4 border-l-4 px-4 py-2.5 text-left transition-colors ${
                        entry.id === selected.id
                          ? 'border-chalk bg-chalk/10'
                          : 'border-transparent hover:bg-chalk/5'
                      } ${entry.graded ? '' : 'text-mute'}`}
                    >
                      <span aria-hidden className="display w-8 text-xl text-mute">
                        {entry.number}
                      </span>
                      <span className="display text-3xl sm:text-4xl">{entry.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
