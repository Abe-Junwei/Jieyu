import type { TranslationLayerDocType, UtteranceDocType } from '../../db';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import { useTranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';

type LassoRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TranscriptionTimelineMediaLanesProps = {
  playerDuration: number;
  zoomPxPerSec: number;
  lassoRect: LassoRect | null;
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  timelineRenderUtterances: UtteranceDocType[];
  flashLayerRowId: string;
  defaultTranscriptionLayerId: string | undefined;
  renderAnnotationItem: (
    utt: UtteranceDocType,
    layer: TranslationLayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>,
  ) => React.ReactNode;
};

export function TranscriptionTimelineMediaLanes({
  playerDuration,
  zoomPxPerSec,
  lassoRect,
  transcriptionLayers,
  translationLayers,
  timelineRenderUtterances,
  flashLayerRowId,
  defaultTranscriptionLayerId,
  renderAnnotationItem,
}: TranscriptionTimelineMediaLanesProps) {
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
  return (
    <div className="timeline-content" style={{ width: playerDuration * zoomPxPerSec }}>
      {lassoRect && (
        <div
          className="timeline-lasso-rect"
          style={{
            left: lassoRect.x,
            top: lassoRect.y,
            width: lassoRect.w,
            height: lassoRect.h,
          }}
        />
      )}
      {transcriptionLayers.map((layer) => (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''}`}
        >
          <span className="timeline-lane-label">{renderLaneLabel(layer)}</span>
          {timelineRenderUtterances.map((utt) => {
            const sourceText = getUtteranceTextForLayer(utt, layer.id);
            const draftKey = `trc-${layer.id}-${utt.id}`;
            const legacyDraft = layer.id === defaultTranscriptionLayerId ? utteranceDrafts[utt.id] : undefined;
            const draft = utteranceDrafts[draftKey] ?? legacyDraft ?? sourceText;
            return renderAnnotationItem(utt, layer, draft, {
              onChange: (e) => {
                const value = normalizeSingleLine(e.target.value);
                setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
                if (value !== sourceText) {
                  scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
                    await saveUtteranceText(utt.id, value, layer.id);
                  });
                }
              },
              onBlur: (e) => {
                const value = normalizeSingleLine(e.target.value);
                clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
                if (value !== sourceText) {
                  fireAndForget(saveUtteranceText(utt.id, value, layer.id));
                }
              },
            });
          })}
        </div>
      ))}
      {translationLayers.map((layer) => (
        <div
          key={`tl-${layer.id}`}
          className={`timeline-lane timeline-lane-translation ${layer.id === flashLayerRowId ? 'timeline-lane-flash' : ''}`}
        >
          <span className="timeline-lane-label">{renderLaneLabel(layer)}</span>
          {timelineRenderUtterances.map((utt) => {
            const text = translationTextByLayer.get(layer.id)?.get(utt.id)?.text ?? '';
            const draftKey = `${layer.id}-${utt.id}`;
            const draft = translationDrafts[draftKey] ?? text;
            return renderAnnotationItem(utt, layer, draft, {
              placeholder: '翻译',
              onFocus: () => {
                focusedTranslationDraftKeyRef.current = draftKey;
              },
              onChange: (e) => {
                const value = normalizeSingleLine(e.target.value);
                setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
                if (value.trim() && value !== text) {
                  scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                    await saveTextTranslationForUtterance(utt.id, value, layer.id);
                  });
                } else {
                  clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                }
              },
              onBlur: (e) => {
                focusedTranslationDraftKeyRef.current = null;
                const value = normalizeSingleLine(e.target.value);
                clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
                if (value !== text) {
                  fireAndForget(saveTextTranslationForUtterance(utt.id, value, layer.id));
                }
              },
            });
          })}
        </div>
      ))}
    </div>
  );
}