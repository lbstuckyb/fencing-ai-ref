import type { SignalSpec } from '../signals/evaluator';

/**
 * One signal in a picker: its name, and whether the arm used carries meaning.
 *
 * Six of the ten signals name the fencer on the referee's right or left, and a
 * referee who does not know which six will eventually make a correct gesture
 * that awards a phrase to the wrong person — hence the two lamps.
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
      className={`focusable flex w-full items-center justify-between gap-3 border-l-4 px-3 py-2 text-left transition-colors ${
        selected ? 'border-chalk bg-chalk/10' : 'border-transparent hover:bg-chalk/5'
      }`}
    >
      <span className="display text-2xl">{spec.label}</span>
      {spec.directional ? (
        <span role="img" aria-label="names a fencer" className="flex shrink-0 gap-1">
          <span className="h-2.5 w-2.5 bg-lamp-red" />
          <span className="h-2.5 w-2.5 bg-lamp-green" />
        </span>
      ) : null}
    </button>
  );
}
