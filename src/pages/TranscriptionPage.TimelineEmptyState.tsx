import type { ReactNode } from 'react';
import { t, type Locale } from '../i18n';
import { getLayerActionLabels } from '../i18n/layerActionLabels';
import type { EmptyTimelinePolicy } from '../utils/emptyTimelinePolicy';

export interface TranscriptionPageTimelineEmptyStateProps {
  locale: Locale;
  policy: EmptyTimelinePolicy;
  onCreateTranscriptionLayer: () => void;
  onOpenImportFile: () => void;
}

function TimelineEmptyCard({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="timeline-empty-actions-shell entry-card">
      <div className="timeline-empty-actions-copy">
        {kicker ? (
          <span className="timeline-empty-actions-kicker entry-card__kicker">{kicker}</span>
        ) : null}
        <h2 className="entry-card__title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ImportFileIcon() {
  return (
    <svg
      className="timeline-empty-action-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function TranscriptionPageTimelineEmptyState({
  locale,
  policy,
  onCreateTranscriptionLayer,
  onOpenImportFile,
}: TranscriptionPageTimelineEmptyStateProps) {
  if (!policy.showEmptyChrome) {
    return null;
  }

  const layerActionLabels = getLayerActionLabels(locale);
  const importLabel = t(locale, 'transcription.timeline.empty.importFile');

  if (policy.emptyReason === 'no_units_with_wave') {
    return <TimelineEmptyCard title={t(locale, 'transcription.timeline.empty.noUnitWithWave')} />;
  }

  if (policy.emptyReason === 'no_media') {
    return (
      <TimelineEmptyCard title={t(locale, 'transcription.timeline.empty.startWork')}>
        <div className="timeline-empty-actions-row">
          <button type="button" className="btn btn-primary" onClick={onOpenImportFile}>
            <ImportFileIcon />
            {importLabel}
          </button>
        </div>
      </TimelineEmptyCard>
    );
  }

  return (
    <TimelineEmptyCard
      kicker={t(locale, 'transcription.timeline.empty.noLayer')}
      title={t(locale, 'transcription.timeline.empty.startWork')}
    >
      <div className="timeline-empty-actions-row">
        {policy.primaryCta === 'create_layer' ? (
          <button type="button" className="btn btn-primary" onClick={onCreateTranscriptionLayer}>
            {layerActionLabels.createTranscriptionLayer}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onOpenImportFile}>
          <ImportFileIcon />
          {importLabel}
        </button>
      </div>
    </TimelineEmptyCard>
  );
}
