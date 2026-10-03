import '../../styles/components/project-file-list.css';
import { useQuery } from '@tanstack/react-query';
import { t, useLocale, type Locale } from '../../i18n';
import { loadProjectOverview } from '../../services/projectOverview';
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

function formatProgress(locale: Locale, done: number, total: number, rate: ProgressRate): string {
  return `${done}/${total} · ${formatRate(locale, rate)}`;
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

function languages(codes: readonly string[], empty: string): string {
  return codes.length > 0 ? codes.join(', ') : empty;
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
  const fromRecords = sumCounts(props.records.map((row) => countsFromRecord(row)));
  const progress = data?.progress.sentenceCount ? data.progress : fromRecords;
  const audioDurationSec =
    data?.audioDurationSec ?? props.records.reduce((sum, row) => sum + (row.durationSec ?? 0), 0);
  const audioCount =
    data?.audioCount ?? props.records.filter((row) => row.kind === 'transcription_record').length;
  const empty = t(locale, 'app.overview.empty');
  const objectLanguageLabel = languages(data?.objectLanguages ?? [], empty);
  const facts = [
    {
      label: t(locale, 'app.overview.objectLanguages'),
      value: objectLanguageLabel,
      ...(objectLanguageLabel === empty && props.onConfigureLanguages
        ? { configure: true as const }
        : {}),
    },
    {
      label: t(locale, 'app.overview.workingLanguages'),
      value: languages(data?.workingLanguages ?? [], empty),
    },
    {
      label: t(locale, 'app.overview.audioDuration'),
      value: formatDuration(audioDurationSec),
    },
    { label: t(locale, 'app.overview.audioCount'), value: String(audioCount) },
    {
      label: t(locale, 'app.overview.manuscriptCount'),
      value: String(data?.manuscriptCount ?? 0),
    },
    { label: t(locale, 'app.overview.sentences'), value: String(progress.sentenceCount) },
    {
      label: `${t(locale, 'app.overview.speakers')} / ${t(locale, 'app.overview.lexemes')}`,
      value: `${data?.speakerCount ?? 0} / ${data?.lexemeCount ?? 0}`,
    },
  ];
  const bars = [
    {
      label: t(locale, 'app.home.progress.transcription'),
      text: formatProgress(
        locale,
        progress.transcribedCount,
        progress.sentenceCount,
        progress.transcriptionRate,
      ),
      rate: progress.transcriptionRate,
    },
    {
      label: t(locale, 'app.home.progress.translation'),
      text: formatProgress(
        locale,
        progress.translatedCount,
        progress.sentenceCount,
        progress.translationRate,
      ),
      rate: progress.translationRate,
    },
    {
      label: t(locale, 'app.home.progress.annotation'),
      text: formatProgress(
        locale,
        progress.annotatedCount,
        progress.transcribedCount,
        progress.annotationRate,
      ),
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
        <span className="project-overview-caption">{t(locale, 'app.overview.statsCaption')}</span>
      </div>
      <dl className="project-overview-facts">
        {facts.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              {item.value}
              {'configure' in item ? (
                <button
                  type="button"
                  className="project-overview-set"
                  onClick={props.onConfigureLanguages}
                >
                  {t(locale, 'app.overview.configure')}
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <div className="project-overview-bars">
        <div className="project-overview-token">
          <span>{t(locale, 'app.overview.tokens')}</span>
          <strong>{data?.tokenCount ?? 0}</strong>
        </div>
        <div className="project-overview-bar-grid">
          {bars.map((bar) => {
            const pct =
              bar.rate === null ? 0 : Math.round(Math.max(0, Math.min(1, bar.rate)) * 100);
            return (
              <div key={bar.label}>
                <div className="project-overview-bar-label">
                  <span>{bar.label}</span>
                  <span>{bar.text}</span>
                </div>
                <div className="project-overview-track" aria-hidden>
                  <div className="project-overview-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
