import type {
  LayerDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { t, useLocale } from '../i18n';

interface TranscriptionTimelineMediaTranslationRowProps {
  item: TimelineUnitView;
  layer: LayerDocType;
  layerForDisplay: LayerDocType;
  baseLaneHeight: number;
  usesOwnSegments: boolean;
  utteranceById: Map<string, UtteranceDocType>;
  text: string;
  draft: string;
  draftKey: string;
  audioMedia: MediaItemDocType | undefined;
  recording: boolean;
  recordingUtteranceId: string | null | undefined;
  recordingLayerId: string | null | undefined;
  startRecordingForUtterance: ((utterance: UtteranceDocType, layer: LayerDocType) => Promise<void>) | undefined;
  stopRecording: (() => void) | undefined;
  deleteVoiceTranslation: ((utterance: UtteranceDocType, layer: LayerDocType) => Promise<void>) | undefined;
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  saveTextTranslationForUtterance: (utteranceId: string, value: string, layerId: string) => Promise<void>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  setTranslationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
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

export function TranscriptionTimelineMediaTranslationRow({
  item,
  layer,
  layerForDisplay,
  baseLaneHeight,
  usesOwnSegments,
  utteranceById,
  text,
  draft,
  draftKey,
  audioMedia,
  recording,
  recordingUtteranceId,
  recordingLayerId,
  startRecordingForUtterance,
  stopRecording,
  deleteVoiceTranslation,
  saveSegmentContentForLayer,
  saveTextTranslationForUtterance,
  scheduleAutoSave,
  clearAutoSaveTimer,
  setTranslationDrafts,
  focusedTranslationDraftKeyRef,
  renderAnnotationItem,
}: TranscriptionTimelineMediaTranslationRowProps) {
  const locale = useLocale();
  const layerSupportsAudio = !usesOwnSegments
    && (layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio));
  const isAudioOnlyLayer = layer.modality === 'audio';
  const showAudioTools = layerSupportsAudio && layer.modality === 'mixed';
  const isCurrentRecording = recording && recordingUtteranceId === item.id && recordingLayerId === layer.id;
  const audioActionDisabled = recording && !isCurrentRecording;
  const sourceUtterance = item.kind === 'segment'
    ? (item.parentUtteranceId ? utteranceById.get(item.parentUtteranceId) : undefined)
    : utteranceById.get(item.id);
  const audioControls = layerSupportsAudio ? (
    <TimelineTranslationAudioControls
      isRecording={isCurrentRecording}
      disabled={audioActionDisabled}
      compact={!isAudioOnlyLayer}
      {...(audioMedia ? { mediaItem: audioMedia } : {})}
      onStartRecording={() => {
        if (!sourceUtterance) return;
        void startRecordingForUtterance?.(sourceUtterance, layer);
      }}
      {...(stopRecording ? { onStopRecording: stopRecording } : {})}
      {...(audioMedia && deleteVoiceTranslation && sourceUtterance
        ? { onDeleteRecording: () => deleteVoiceTranslation(sourceUtterance, layer) }
        : {})}
    />
  ) : undefined;

  return (
    <TimelineStyledContainer
      className="timeline-annotation-subtrack"
      layoutStyle={{
        top: 0,
        height: baseLaneHeight,
      }}
    >
      {isAudioOnlyLayer && audioControls ? renderAnnotationItem(item, layerForDisplay, '', {
        showSpeaker: false,
        content: <div className="timeline-translation-audio-card">{audioControls}</div>,
        onChange: () => undefined,
        onBlur: () => undefined,
      }) : renderAnnotationItem(item, layerForDisplay, draft, {
        showSpeaker: false,
        placeholder: usesOwnSegments
          ? t(locale, 'transcription.timeline.placeholder.segment')
          : t(locale, 'transcription.timeline.placeholder.translation'),
        ...(audioControls ? { tools: audioControls, hasTrailingTools: showAudioTools } : {}),
        onFocus: () => {
          focusedTranslationDraftKeyRef.current = draftKey;
        },
        onChange: (e) => {
          const value = normalizeSingleLine(e.target.value);
          setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
          if (usesOwnSegments) {
            if (!saveSegmentContentForLayer) return;
            scheduleAutoSave(`seg-${layer.id}-${item.id}`, async () => {
              await saveSegmentContentForLayer(item.id, layer.id, value);
            });
            return;
          }
          if (value.trim() && value !== text) {
            scheduleAutoSave(`tr-${layer.id}-${item.id}`, async () => {
              await saveTextTranslationForUtterance(item.id, value, layer.id);
            });
          } else {
            clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
          }
        },
        onBlur: (e) => {
          focusedTranslationDraftKeyRef.current = null;
          const value = normalizeSingleLine(e.target.value);
          if (usesOwnSegments) {
            clearAutoSaveTimer(`seg-${layer.id}-${item.id}`);
            if (saveSegmentContentForLayer && value !== text) {
              fireAndForget(saveSegmentContentForLayer(item.id, layer.id, value));
            }
            return;
          }
          clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
          if (value !== text) {
            fireAndForget(saveTextTranslationForUtterance(item.id, value, layer.id));
          }
        },
      })}
    </TimelineStyledContainer>
  );
}
