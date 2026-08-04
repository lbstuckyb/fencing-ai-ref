import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';
import ComingSoon from '../components/ComingSoon';
import PageHeader from '../components/PageHeader';

const MODE_PATHS = ['/reference', '/practice', '/scenarios'];

export default function Home() {
  const modes = NAV_ITEMS.filter((item) => MODE_PATHS.includes(item.path));

  return (
    <>
      <PageHeader
        title="Fencing Referee Trainer"
        lede="Practise the two separable halves of refereeing: making the official FIE hand signals correctly, and reading a phrase to issue the right sequence of calls."
      />

      <ul className="grid gap-4 sm:grid-cols-3">
        {modes.map((mode) => (
          <li key={mode.path}>
            <Link
              to={mode.path}
              className="flex h-full flex-col rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-900"
            >
              <span className="font-medium">{mode.label}</span>
              <span className="mt-1 text-sm text-slate-600 dark:text-slate-400">{mode.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ComingSoon stage="3">
          The full introduction, the on-device privacy note and the FIE rules links land with the
          rules data.
        </ComingSoon>
      </div>
    </>
  );
}
