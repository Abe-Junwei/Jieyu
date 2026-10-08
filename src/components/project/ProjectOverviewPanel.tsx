import '../../styles/components/project-file-list.css';
import { useQuery } from '@tanstack/react-query';
import { t, useLocale, type Locale } from '../../i18n';
import { loadProjectOverview } from '../../services/projectOverview';
import { lookupLanguageCatalogEntriesByIds } from '../../services/LanguageCatalogSearchService';
import {
  sumCounts,
  type ProgressRate,
  type ProjectProgressCounts,
} from '../../utils/projectOverviewStats';
import type { TranscriptionRecordProgressRow } from '../../utils/homeTranscriptionRecordProgress';
import { WorkbenchGlyph } from './workbenchGlyphs';

function formatRate(locale: Locale, rate: ProgressRate): string {
  if (rate === null) return t(locale, 'app.home.progress.na');
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function countsFromRecord(row: TranscriptionRecordProgressRow): ProjectProgressCounts {
  const sentenceCount = row.sentenceCount ?? row.transcriptionUnitCount ?? 0;
  const rateCount = (rate: ProgressRate) => (rate === null ? 0 : Math.round(rate * sentenceCount));
  return {
    sentenceCount,
    transcribedCount: row.transcribedCount ?? rateCount(row.transcriptionRate),
    translatedCount: row.translatedCount ?? rateCount(row.translationRate),
    annotatedCount: row.annotatedCount ?? rateCount(row.annotationRate),
    transcriptionRate: row.transcriptionRate,
    translationRate: row.translationRate,
    annotationRate: row.annotationRate,
  };
}

export function ProjectOverviewPanel(props: {
  textId: string;
  records: TranscriptionRecordProgressRow[];
  onConfigureLanguages?: () => void;
}) {
  const locale = useLocale();
  const overview = useQuery({
    queryKey: ['project-overview', props.textId, locale],
    queryFn: () => loadProjectOverview(props.textId, locale),
    enabled: props.textId.trim().length > 0,
  });
  const data = overview.data ?? null;
  const languageCodes = [...(data?.objectLanguages ?? []), ...(data?.workingLanguages ?? [])];
  const languageLabels = useQuery({
    queryKey: ['project-overview-language-labels', locale, languageCodes],
    queryFn: () => lookupLanguageCatalogEntriesByIds(languageCodes, locale),
    enabled: languageCodes.length > 0,
  });
  const languageNameByCode = new Map(
    (languageLabels.data ?? []).map((entry) => [
      entry.languageCode,
      entry.byLocale?.[locale] || entry.localName || entry.englishName,
    ]),
  );
  const formatLanguages = (codes: readonly string[]) =>
    codes.length > 0
      ? codes.map((code) => `${languageNameByCode.get(code) ?? code} (${code})`).join(', ')
      : empty;
  const fromRecords = sumCounts(props.records.map((row) => countsFromRecord(row)));
  const progress = data?.progress.sentenceCount ? data.progress : fromRecords;
  const audioDurationSec =
    data?.audioDurationSec ?? props.records.reduce((sum, row) => sum + (row.durationSec ?? 0), 0);
  const audioCount =
    data?.audioCount ?? props.records.filter((row) => row.kind === 'transcription_record').length;
  const empty = t(locale, 'app.overview.empty');
  const details = [
    { label: t(locale, 'app.overview.manuscriptCount'), value: String(data?.manuscriptCount ?? 0) },
    { label: t(locale, 'app.overview.sentences'), value: String(progress.sentenceCount) },
    {
      label: `${t(locale, 'app.overview.speakers')} / ${t(locale, 'app.overview.lexemes')}`,
      value: `${data?.speakerCount ?? 0} / ${data?.lexemeCount ?? 0}`,
    },
  ];
  const bars = [
    {
      label: t(locale, 'app.home.progress.translation'),
      rate: progress.translationRate,
    },
    {
      label: t(locale, 'app.home.progress.annotation'),
      rate: progress.annotationRate,
    },
  ];
  return (
    <section className="project-overview" aria-label={t(locale, 'app.overview.title')}>
      <div className="project-overview-head">
        <h3 className="project-overview-title">
          <WorkbenchGlyph name="overview" />
          {t(locale, 'app.overview.title')}
        </h3>
        {props.onConfigureLanguages ? (
          <button
            type="button"
            className="project-overview-configure"
            onClick={props.onConfigureLanguages}
          >
            {t(locale, 'app.overview.configure')}
          </button>
        ) : null}
      </div>
      <div className="project-overview-facts">
        <dl>
          <dt>{t(locale, 'app.overview.objectLanguages')}</dt>
          <dd>{formatLanguages(data?.objectLanguages ?? [])}</dd>
        </dl>
        <dl>
          <dt>{t(locale, 'app.overview.workingLanguages')}</dt>
          <dd>{formatLanguages(data?.workingLanguages ?? [])}</dd>
        </dl>
        <dl className="project-overview-recordings">
          <dt>{t(locale, 'app.overview.audioCount')}</dt>
          <dd>{audioCount}</dd>
          <dt>{t(locale, 'app.overview.audioDuration')}</dt>
          <dd>{formatDuration(audioDurationSec)}</dd>
        </dl>
        <div className="project-overview-progress">
          <span className="project-overview-progress-title">
            {t(locale, 'app.home.progress.transcription')}
          </span>
          <strong>{formatRate(locale, progress.transcriptionRate)}</strong>
          <span className="project-overview-progress-count">
            {progress.transcribedCount}/{progress.sentenceCount}
          </span>
          {bars.map((bar) => {
            const pct =
              bar.rate === null ? 0 : Math.round(Math.max(0, Math.min(1, bar.rate)) * 100);
            return (
              <div className="project-overview-mini-bar" key={bar.label}>
                <div className="project-overview-bar-label">
                  <span>{bar.label}</span>
                  <span>{formatRate(locale, bar.rate)}</span>
                </div>
                <div className="project-overview-track" aria-hidden>
                  <div className="project-overview-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <dl className="project-overview-details">
        {details.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
        <div>
          <dt>{t(locale, 'app.overview.tokens')}</dt>
          <dd>{data?.tokenCount ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}
