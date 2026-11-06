import { Link } from 'react-router-dom';
import { SIGNAL_ARTICLE } from '../data/rules';
import { t } from '../i18n';

export default function About() {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-6 px-5 py-8 sm:px-10">
      <h1 className="display text-7xl sm:text-9xl">{t('about.title')}</h1>
      <div className="flex max-w-2xl flex-col gap-4 text-lg text-chalk sm:text-xl">
        <p>{t('about.p1')}</p>
        <p>{t('about.p2', { article: SIGNAL_ARTICLE.article })}</p>
        <p className="text-mute">{t('about.p3')}</p>
      </div>
      <Link to="/" className="btn btn-go">
        {t('common.home')}
      </Link>
    </div>
  );
}
