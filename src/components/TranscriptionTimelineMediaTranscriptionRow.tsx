import type { LayerDocType, MediaItemDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TimelineAnnotationItemProps } from './TimelineAnnotationItem';
import type { TimelineUnitKind } from '../hooks/transcriptionTypes';
import { useTranscriptionMediaLaneRowTextAutosave } from '../hooks/useTimelineLaneTextDraftAutosave';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { recordingScopeUnitId, resolveVoiceRecordingSourceUnit } from '../utils/recordingScopeUnitId';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
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
  unitById: Map<string, LayerUnitDocType>;
  segmentById: Map<string, LayerUnitDocType>;
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
  audioMedia?: MediaItemDocType;
  recording?: boolean;
  recordingUnitId?: string | null;
  recordingLayerId?: string | null;
  startRecordingForUnit?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
  stopRecording?: () => void;
  deleteVoiceTranslation?: (unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>;
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
        saveStatus?: 'dirty' | 'saving' | 'error';
        onRetrySave?: () => void;
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
  unitById,
  segmentById,
  saveSegmentContentForLayer,
  scheduleAutoSave,
  clearAutoSaveTimer,
  saveUnitLayerText,
  setUnitDrafts,
  focusedTranslationDraftKeyRef,
  audioMedia,
  recording = false,
  recordingUnitId = null,
  recordingLayerId = null,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  renderAnnotationItem,
}: TranscriptionTimelineMediaTranscriptionRowProps) {
  const locale = useLocale();
  const { handleDraftFocus, handleDraftChange, handleDraftBlur } = useTranscriptionMediaLaneRowTextAutosave({
    unitKind,
    layerId: layer.id,
    unitId: utt.id,
    draftKey,
    sourceText,
    setUnitDrafts,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    focusedTranslationDraftKeyRef,
  });
  const layerSupportsAudio = layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
  const isAudioOnlyLayer = layer.modality === 'audio';
  const sourceUnit = resolveVoiceRecordingSourceUnit(utt, unitById, segmentById);
  const recordingScopeIds = (() => {
    const ids = [recordingScopeUnitId(utt), sourceUnit?.id, utt.id].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    return Array.from(new Set(ids));
  })();
  const isCurrentRecording = recording
    && recordingLayerId === layer.id
    && recordingScopeIds.includes((recordingUnitId ?? '').trim());
  const audioActionDisabled = recording && !isCurrentRecording;
  const audioControls = layerSupportsAudio && sourceUnit ? (
    <TimelineTranslationAudioControls
      isRecording={isCurrentRecording}
      disabled={audioActionDisabled}
      compact={!isAudioOnlyLayer}
      {...(audioMedia ? { mediaItem: audioMedia } : {})}
      onStartRecording={() => {
        void startRecordingForUnit?.(sourceUnit, layer);
      }}
      {...(stopRecording ? { onStopRecording: stopRecording } : {})}
      {...(audioMedia && deleteVoiceTranslation && sourceUnit
        ? { onDeleteRecording: () => deleteVoiceTranslation(sourceUnit, layer) }
        : {})}
    />
  ) : undefined;
  const showAudioTools = Boolean(audioControls) && !isAudioOnlyLayer;

  if (isAudioOnlyLayer && audioControls) {
    return (
      <TimelineStyledContainer
        className="timeline-annotation-subtrack"
        layoutStyle={{
          top: subTrackTop,
          height: baseLaneHeight,
        }}
      >
        {renderAnnotationItem(utt, layerForDisplay, '', {
          ...(overlapCycleItems ? { overlapCycleItems } : {}),
          ...(overlapCycleStatus ? { overlapCycleStatus } : {}),
          showSpeaker: false,
          content: <div className="timeline-translation-audio-card">{audioControls}</div>,
          onChange: () => undefined,
          onBlur: () => undefined,
        })}
      </TimelineStyledContainer>
    );
  }

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
        ...(audioControls ? { tools: audioControls, hasTrailingTools: showAudioTools } : {}),
        onFocus: handleDraftFocus,
        onChange: handleDraftChange,
        onBlur: handleDraftBlur,
      })}
    </TimelineStyledContainer>
  );
}
