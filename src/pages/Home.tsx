import { Link } from 'react-router-dom';
import { SIGNAL_GROUPS, WEAPON_RULES } from '../data/rules';
import { STEPS } from '../nav';

/** One screen: the two lamps, one line, and the way in. */
export default function Home() {
  const figures = [
    { value: `${SIGNAL_GROUPS.length}`, label: 'Signals' },
    { value: '1–2 s', label: 'Hold' },
    { value: `${WEAPON_RULES.length}`, label: 'Weapons' },
  ];

  return (
    <div className="relative flex h-full min-h-[34rem] flex-col justify-between overflow-hidden px-5 py-6 sm:px-10 sm:py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 65% at 0% 0%, rgb(255 59 48 / 0.3), transparent 70%), radial-gradient(55% 65% at 100% 0%, rgb(34 224 122 / 0.26), transparent 70%)',
        }}
      />

      <div aria-hidden className="relative flex justify-between">
        <span className="h-3 w-[36%] bg-lamp-red shadow-[0_0_50px_6px_var(--color-lamp-red)]" />
        <span className="h-3 w-[36%] bg-lamp-green shadow-[0_0_50px_6px_var(--color-lamp-green)]" />
      </div>

      <div className="relative animate-rise">
        <h1 className="display text-[clamp(4.5rem,15vw,14rem)]">
          Make
          <br />
          the call.
        </h1>
        <Link to={STEPS[0].path} className="btn btn-go mt-8 px-10 py-4 text-2xl">
          Enter ›
        </Link>
      </div>

      <dl className="relative grid grid-cols-3 gap-4 border-t border-line pt-4">
        {figures.map(({ value, label }) => (
          <div key={label}>
            <dd className="display text-4xl tabular-nums sm:text-6xl">{value}</dd>
            <dt className="caption mt-1 text-sm sm:text-base">{label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
