import type { SignalSpec } from '../signals/evaluator';

/**
 * One signal in the picker: what it is called, what it means, and whether the
 * arm used carries meaning.
 *
 * The directional note is the part worth showing here rather than only in the
 * prompt. Six of the ten signals name the fencer on the referee's right or left,
 * and a referee who does not know which six will eventually make a correct
 * gesture that awards a phrase to the wrong person.
 */

interface SignalCardProps {
  spec: SignalSpec;
  /** Whether the drill is currently prompting this signal. */
  selected: boolean;
  onSelect: (spec: SignalSpec) => void;
}

export default function SignalCard({ spec, selected, onSelect }: SignalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(spec)}
      aria-pressed={selected}
      className={`h-full w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
        selected
          ? 'border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
          : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900'
      }`}
    >
      <span className="block text-base font-medium">{spec.label}</span>
      <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
        {spec.description}
      </span>
      <span className="mt-2 block text-xs text-slate-500 dark:text-slate-500">
        {spec.directional ? 'Names a fencer — the arm matters' : 'Either arm'}
        {spec.needsHands ? ' · reads your hand' : ''}
      </span>
    </button>
  );
}
