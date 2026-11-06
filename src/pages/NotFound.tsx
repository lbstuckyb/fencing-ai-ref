import { Link } from 'react-router-dom';
import { t } from '../i18n';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-6 px-5 sm:px-10">
      <h1 className="display text-7xl sm:text-9xl">{t('notFound.title')}</h1>
      <Link to="/" className="btn btn-go">
        {t('common.home')}
      </Link>
    </div>
  );
}
