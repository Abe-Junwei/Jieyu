import type { LayerDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { t, useLocale } from '../i18n';

interface TranscriptionTimelineMediaTranscriptionRowProps {
  utt: TimelineUnitView;
  layer: LayerDocType;
  layerForDisplay: LayerDocType;
  baseLaneHeight: number;
  subTrackTop?: number;
  draft: string;
  draftKey: string;
  sourceText: string;
  unitKind: TimelineUnitKind;
  overlapCycleItems?: Array<{ id: string; startTime: number }>;
  overlapCycleStatus?: { index: number; total: number };
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveUtteranceText: (utteranceId: string, value: string, layerId: string) => Promise<void>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  renderAnnotationItem: (
    utt: TimelineUnitView,
    layer: LayerDocType,
    draft: string,
    extra: Pick<TimelineAnnotationItemProps, 'onChange' | 'onBlur'>
      & Partial<Pick<TimelineAnnotationItemProps, 'onFocus' | 'placeholder'>>
      & {
        showSpeaker?: boolean;
        overlapCycleItems?: Array<{ id: string; startTime: number }>;
        overlapCycleStatus?: { index: number; total: number };
        content?: React.ReactNode;
        tools?: React.ReactNode;
        hasTrailingTools?: boolean;
      },
  ) => React.ReactNode;
}

export function TranscriptionTimelineMediaTranscriptionRow({
  utt,
  layer,
  layerForDisplay,
  baseLaneHeight,
  subTrackTop = 0,
  draft,
  draftKey,
  sourceText,
  unitKind,
  overlapCycleItems,
  overlapCycleStatus,
  saveSegmentContentForLayer,
  scheduleAutoSave,
  clearAutoSaveTimer,
  saveUtteranceText,
  setUtteranceDrafts,
  renderAnnotationItem,
}: TranscriptionTimelineMediaTranscriptionRowProps) {
  const locale = useLocale();
  return (
    <TimelineStyledContainer
      className="timeline-annotation-subtrack"
      layoutStyle={{
        top: subTrackTop,
        height: baseLaneHeight,
      }}
    >
      {renderAnnotationItem(utt, layerForDisplay, draft, {
        ...(overlapCycleItems ? { overlapCycleItems } : {}),
        ...(overlapCycleStatus ? { overlapCycleStatus } : {}),
        ...(unitKind === 'segment' ? { placeholder: t(locale, 'transcription.timeline.placeholder.segment') } : {}),
        onChange: (e) => {
          const value = normalizeSingleLine(e.target.value);
          setUtteranceDrafts((prev) => ({ ...prev, [draftKey]: value }));
          if (unitKind === 'segment') {
            if (!saveSegmentContentForLayer) return;
            scheduleAutoSave(`seg-${layer.id}-${utt.id}`, async () => {
              await saveSegmentContentForLayer(utt.id, layer.id, value);
            });
            return;
          }
          if (value !== sourceText) {
            scheduleAutoSave(`utt-${layer.id}-${utt.id}`, async () => {
              await saveUtteranceText(utt.id, value, layer.id);
            });
          }
        },
        onBlur: (e) => {
          const value = normalizeSingleLine(e.target.value);
          if (unitKind === 'segment') {
            clearAutoSaveTimer(`seg-${layer.id}-${utt.id}`);
            if (saveSegmentContentForLayer && value !== sourceText) {
              fireAndForget(saveSegmentContentForLayer(utt.id, layer.id, value));
            }
            return;
          }
          clearAutoSaveTimer(`utt-${layer.id}-${utt.id}`);
          if (value !== sourceText) {
            fireAndForget(saveUtteranceText(utt.id, value, layer.id));
          }
        },
      })}
    </TimelineStyledContainer>
  );
}
