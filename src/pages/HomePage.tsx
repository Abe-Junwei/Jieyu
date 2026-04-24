import '../styles/pages/home-page.css';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PanelSection } from '../components/ui/PanelSection';
import { t, tf, useLocale } from '../i18n';
import { resolveHostVersion } from '../config/hostVersion';
import {
  aggregateProjectProgressRates,
  loadAllHomeProjectProgressBundles,
  type HomeProjectProgressBundle,
  type ProgressRate,
  type TranscriptionRecordProgressRow,
} from '../utils/homeTranscriptionRecordProgress';
import { buildTranscriptionDeepLinkHref, buildTranscriptionWorkspaceReturnHref } from '../utils/transcriptionUrlDeepLink';

function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '';
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function formatRecordHeading(locale: ReturnType<typeof useLocale>, row: TranscriptionRecordProgressRow): string {
  if (row.kind === 'text_record') {
    return t(locale, 'app.glossary.textRecord');
  }
  const dur = row.durationSec !== undefined ? formatDurationSec(row.durationSec) : '';
  const base = `${t(locale, 'app.glossary.transcriptionRecord')}: ${row.filename}`;
  return dur ? `${base} · ${dur}` : base;
}

function formatPercent(locale: ReturnType<typeof useLocale>, rate: ProgressRate): string {
  if (rate === null) return t(locale, 'app.home.progress.na');
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

function ProgressRow(props: {
  locale: ReturnType<typeof useLocale>;
  labelKey: 'app.home.progress.transcription' | 'app.home.progress.translation' | 'app.home.progress.annotation';
  rate: ProgressRate;
  variant: 'transcription' | 'translation' | 'annotation';
}) {
  const { locale, labelKey, rate, variant } = props;
  const pct = rate === null ? 0 : Math.round(Math.max(0, Math.min(1, rate)) * 100);
  const fillClass = variant === 'translation'
    ? 'home-progress-fill home-progress-fill--translation'
    : variant === 'annotation'
      ? 'home-progress-fill home-progress-fill--annotation'
      : 'home-progress-fill';

  return (
    <div className="home-triple-row" role="group" aria-label={t(locale, labelKey)}>
      <span className="home-triple-label">{t(locale, labelKey)}</span>
      <div className="home-progress-track" aria-hidden>
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
      <span className="home-triple-value">{formatPercent(locale, rate)}</span>
    </div>
  );
}

function TripleBlock(props: {
  locale: ReturnType<typeof useLocale>;
  transcription: ProgressRate;
  translation: ProgressRate;
  annotation: ProgressRate;
}) {
  const { locale, transcription, translation, annotation } = props;
  return (
    <div className="home-triple">
      <ProgressRow locale={locale} labelKey="app.home.progress.transcription" rate={transcription} variant="transcription" />
      <ProgressRow locale={locale} labelKey="app.home.progress.translation" rate={translation} variant="translation" />
      <ProgressRow locale={locale} labelKey="app.home.progress.annotation" rate={annotation} variant="annotation" />
    </div>
  );
}

function ProjectCard(props: { locale: ReturnType<typeof useLocale>; bundle: HomeProjectProgressBundle }) {
  const { locale, bundle } = props;
  const agg = useMemo(() => aggregateProjectProgressRates(bundle.records), [bundle.records]);
  const updatedLabel = useMemo(() => {
    const ms = Date.parse(bundle.updatedAt);
    if (!Number.isFinite(ms)) return bundle.updatedAt;
    return new Date(ms).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [bundle.updatedAt, locale]);

  return (
    <article className="home-project-card" aria-labelledby={`home-project-${bundle.textId}`}>
      <div className="home-project-card-header">
        <h2 className="home-project-card-title" id={`home-project-${bundle.textId}`}>
          <Link
            to={buildTranscriptionDeepLinkHref({ textId: bundle.textId })}
            className="home-project-title-link"
            title={t(locale, 'app.home.openProject')}
          >
            {bundle.titleLabel}
          </Link>
        </h2>
        <span className="home-project-card-meta">
          {tf(locale, 'app.home.projectMetaUpdated', { date: updatedLabel })}
          {bundle.languageCode ? ` · ${bundle.languageCode}` : ''}
        </span>
      </div>
      <p className="home-record-title" style={{ marginTop: 0 }}>{t(locale, 'app.home.projectOverview')}</p>
      <TripleBlock locale={locale} transcription={agg.transcription} translation={agg.translation} annotation={agg.annotation} />

      {bundle.records.length > 0 ? (
        bundle.records.map((row) => (
          <div key={row.mediaId} className="home-record-block">
            <div className="home-record-title">
              {row.kind === 'transcription_record' ? (
                <Link
                  to={buildTranscriptionDeepLinkHref({ textId: bundle.textId, mediaId: row.mediaId })}
                  className="home-project-title-link"
                  title={t(locale, 'app.home.openTranscriptionRecord')}
                >
                  {formatRecordHeading(locale, row)}
                </Link>
              ) : (
                formatRecordHeading(locale, row)
              )}
            </div>
            <TripleBlock
              locale={locale}
              transcription={row.transcriptionRate}
              translation={row.translationRate}
              annotation={row.annotationRate}
            />
          </div>
        ))
      ) : (
        <p className="home-page-empty" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {t(locale, 'app.home.noProgressData')}
        </p>
      )}
    </article>
  );
}

export function HomePage() {
  const locale = useLocale();
  const version = useMemo(() => resolveHostVersion(), []);

  const { data: bundles = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['homeProjectProgress', locale],
    queryFn: () => loadAllHomeProjectProgressBundles(locale),
    staleTime: 45_000,
  });

  return (
    <div className="home-page panel">
      <header className="home-page-hero">
        <p className="home-page-hero-kicker">{t(locale, 'app.home.title')}</p>
        <h1>{t(locale, 'app.title')}</h1>
        <p className="home-page-hero-tagline">{t(locale, 'app.subtitle')}</p>
        <p>{t(locale, 'app.home.subtitle')}</p>
        <div className="home-page-hero-actions">
          <Link className="home-page-link-btn" to={buildTranscriptionWorkspaceReturnHref()}>
            {t(locale, 'app.home.openTranscription')}
          </Link>
          <button type="button" className="home-page-link-btn" onClick={() => void refetch()} disabled={isFetching}>
            {t(locale, 'app.home.refresh')}
          </button>
        </div>
        <p className="home-project-card-meta" style={{ marginTop: '0.75rem' }}>
          {tf(locale, 'app.home.version', { version })}
        </p>
      </header>

      <PanelSection title={t(locale, 'app.home.sectionProjects')} description={t(locale, 'app.home.sectionProjectsDesc')}>
        {isLoading ? <div className="home-page-loading" aria-busy="true">{t(locale, 'app.home.loading')}</div> : null}
        {isError ? (
          <div className="home-page-error" role="alert">
            {t(locale, 'app.home.errorPrefix')}
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : null}
        {!isLoading && !isError && bundles.length === 0 ? (
          <div className="home-page-empty">{t(locale, 'app.home.noProjects')}</div>
        ) : null}
        {!isLoading && !isError && bundles.map((bundle) => (
          <ProjectCard key={bundle.textId} locale={locale} bundle={bundle} />
        ))}
      </PanelSection>
    </div>
  );
}
