import { t, type Locale } from '../i18n';
import { getLayerActionLabels } from '../i18n/layerActionLabels';
import type { EmptyTimelinePolicy } from '../utils/emptyTimelinePolicy';

export interface TranscriptionPageTimelineEmptyStateProps {
  locale: Locale;
  policy: EmptyTimelinePolicy;
  onCreateTranscriptionLayer: () => void;
  onOpenImportFile: () => void;
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

  if (policy.emptyReason === 'no_layers') {
    return (
      <div className="timeline-empty-actions-shell">
        <div className="timeline-empty-actions-row">
          {policy.primaryCta === 'create_layer' ? (
            <button type="button" className="btn" onClick={onCreateTranscriptionLayer}>
              {layerActionLabels.createTranscriptionLayer}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onOpenImportFile}>
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
            {t(locale, 'transcription.timeline.empty.importFile')}
          </button>
        </div>
      </div>
    );
  }

  if (policy.emptyReason === 'no_units_with_wave') {
    return <>{t(locale, 'transcription.timeline.empty.noUnitWithWave')}</>;
  }

  return <>{t(locale, 'transcription.timeline.empty.startWork')}</>;
}
