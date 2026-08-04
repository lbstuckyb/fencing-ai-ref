interface ComingSoonProps {
  /** Plan stage that fills this page in — see docs/PLAN.md. */
  stage: string;
  children: string;
}

/**
 * Marks a route that exists so navigation is complete, but whose contents land
 * in a later stage. Removed page by page as the stages land.
 */
export default function ComingSoon({ stage, children }: ComingSoonProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Stage {stage}
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{children}</p>
    </div>
  );
}
