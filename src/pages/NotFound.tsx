import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" lede="That route does not exist." />
      <Link
        to="/"
        className="text-sm font-medium text-sky-700 underline underline-offset-4 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
      >
        Back to home
      </Link>
    </>
  );
}
