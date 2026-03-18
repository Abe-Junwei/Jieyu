import type { TranslationLayerDocType, UtteranceDocType } from '../../db';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';

type TranscriptionTimelineTextOnlyProps = {
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedUtteranceId: string;
  flashLayerRowId: string;
  defaultTranscriptionLayerId?: string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleAnnotationClick: (uttId: string, layerId: string, e: React.MouseEvent) => void;
};

export function TranscriptionTimelineTextOnly({
  transcriptionLayers,
  translationLayers,
  utterancesOnCurrentMedia,
  selectedUtteranceId,
  flashLayerRowId,
  defaultTranscriptionLayerId,
  scrollContainerRef,
  handleAnnotationClick,
}: TranscriptionTimelineTextOnlyProps) {
  const {
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    renderLaneLabel,
    getUtteranceTextForLayer,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUtteranceText,
    saveTextTranslationForUtterance,
  } = useTranscriptionEditorContext();

  const horizontalVirtualizer = useVirtualizer({
    count: utterancesOnCurrentMedia.length,
    horizontal: true,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 180,
    overscan: 10,
  });

  const virtualItems = horizontalVirtualizer.getVirtualItems();
  const totalSize = horizontalVirtualizer.getTotalSize();

  return (
    <div className="timeline-content timeline-content-text-only">
      {transcriptionLayers.map((layer) => (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''}`}
        >
          <span className="timeline-lane-label">{renderLaneLabel(layer)}</span>
          <div className="timeline-lane-text-only-track" style={{ width: `${totalSize}px` }}>
          {virtualItems.map((virtualItem) => {
            const utt = utterancesOnCurrentMedia[virtualItem.index];
            if (!utt) return null;
            const sourceText = getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
            return (
              <div
                key={utt.id}
                className={`timeline-text-item${utt.id === selectedUtteranceId ? ' timeline-text-item-active' : ''}`}
                style={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                }}
                onClick={(e) => handleAnnotationClick(utt.id, layer.id, e)}
              >
                <input
                  type="text"
                  className="timeline-text-input"
                  value={draft}
                  onChange={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (value !== sourceText) {
                      scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
                        await saveUtteranceText(utt.id, value, layer.id);
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                    if (value !== sourceText) {
                      fireAndForget(saveUtteranceText(utt.id, value, layer.id));
                    }
                  }}
                />
              </div>
            );
          })}
          </div>
        </div>
      ))}
      {translationLayers.map((layer) => (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-text-only timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''}`}
        >
          <span className="timeline-lane-label">{renderLaneLabel(layer)}</span>
          <div className="timeline-lane-text-only-track" style={{ width: `${totalSize}px` }}>
          {virtualItems.map((virtualItem) => {
            const utt = utterancesOnCurrentMedia[virtualItem.index];
            if (!utt) return null;
            const text = translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '';
            const draftKey = `${layer.id}-${utt.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            return (
              <div
                key={utt.id}
                className={`timeline-text-item${utt.id === selectedUtteranceId ? ' timeline-text-item-active' : ''}`}
                style={{
                  width: `${virtualItem.size}px`,
                  transform: `translateX(${virtualItem.start}px)`,
                }}
                onClick={(e) => handleAnnotationClick(utt.id, layer.id, e)}
              >
                <input
                  type="text"
                  className="timeline-text-input"
                  placeholder="翻译"
                  value={draft}
                  onFocus={() => { focusedTranslationDraftKeyRef.current = draftKey; }}
                  onChange={(e) => {
                    const value = normalizeSingleLine(e.target.value);
                    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                    if (value.trim() && value !== text) {
                      scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                        await saveTextTranslationForUtterance(utt.id, value, layer.id);
                      });
                    } else {
                      clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                    }
                  }}
                  onBlur={(e) => {
                    focusedTranslationDraftKeyRef.current = null;
                    const value = normalizeSingleLine(e.target.value);
                    clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                    if (value !== text) {
                      fireAndForget(saveTextTranslationForUtterance(utt.id, value, layer.id));
                    }
                  }}
                />
              </div>
            );
          })}
          </div>
        </div>
      ))}
    </div>
  );
}