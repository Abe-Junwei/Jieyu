import { t, type Locale } from '../i18n';
import { getLayerActionLabels } from '../i18n/layerActionLabels';

interface TranscriptionPageTimelineEmptyStateProps {
  locale: Locale;
  layersCount: number;
  hasSelectedMedia: boolean;
  onCreateTranscriptionLayer: () => void;
  onOpenImportFile: () => void;
}

export function TranscriptionPageTimelineEmptyState({
  locale,
  layersCount,
  hasSelectedMedia,
  onCreateTranscriptionLayer,
  onOpenImportFile,
}: TranscriptionPageTimelineEmptyStateProps) {
  const layerActionLabels = getLayerActionLabels(locale);
  if (layersCount === 0) {
    return (
      <div className="timeline-empty-actions-shell">
        <div className="timeline-empty-actions-row">
          <button
            type="button"
            className="btn"
            onClick={onCreateTranscriptionLayer}
          >
            {layerActionLabels.createTranscriptionLayer}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onOpenImportFile}
          >
            <svg className="timeline-empty-action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {t(locale, 'transcription.timeline.empty.importFile')}
          </button>
        </div>
      </div>
    );
  }
  if (hasSelectedMedia) {
    return <>{t(locale, 'transcription.timeline.empty.noUtteranceWithWave')}</>;
  }
  return <>{t(locale, 'transcription.timeline.empty.startWork')}</>;
}
