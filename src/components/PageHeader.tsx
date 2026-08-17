import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  lede: ReactNode;
}

export default function PageHeader({ title, lede }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-base text-slate-600 dark:text-slate-400">{lede}</p>
    </header>
  );
}
