import type { LayerDocType, MediaItemDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { recordingScopeUnitId, resolveVoiceRecordingSourceUnit } from '../utils/recordingScopeUnitId';
import { useTranslationSidebarTextDraftAutosave } from '../hooks/useTimelineLaneTextDraftAutosave';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { readNonEmptyAudioBlobFromMediaItem } from '../utils/translationRecordingMediaBlob';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { TimelineLaneDraftEditorCell } from './transcription/TimelineLaneDraftEditorCell';
import { t, useLocale } from '../i18n';
import { SelfCertaintyIcon } from './SelfCertaintyIcon';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

type SaveStatus = 'dirty' | 'saving' | 'error' | undefined;

interface TranscriptionTimelineTextTranslationItemProps {
  utt: TimelineUnitView;
  layer: LayerDocType;
  text: string;
  draft: string;
  draftKey: string;
  cellKey: string;
  isActive: boolean;
  isEditing: boolean;
  isDimmed: boolean;
  saveStatus: SaveStatus;
  usesOwnSegments: boolean;
  unitById: Map<string, LayerUnitDocType>;
  segmentById: Map<string, LayerUnitDocType>;
  layoutStyle: React.CSSProperties;
  dir: string | undefined;
  audioMedia: MediaItemDocType | undefined;
  recording: boolean;
  recordingUnitId: string | null | undefined;
  recordingLayerId: string | null | undefined;
  startRecordingForUnit: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
  stopRecording: (() => void) | undefined;
  deleteVoiceTranslation: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
  transcribeVoiceTranslation?: (
    unit: LayerUnitDocType,
    layer: LayerDocType,
    options?: { signal?: AbortSignal; audioBlob?: Blob },
  ) => Promise<void>;
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  setTranslationDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setEditingCellKey: React.Dispatch<React.SetStateAction<string | null>>;
  setCellSaveStatus: (cellKey: string, status?: 'dirty' | 'saving' | 'error') => void;
  runSaveWithStatus: (cellKey: string, saveTask: () => Promise<void>) => Promise<void>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
  onFocusLayer: (layerId: string) => void;
  navigateUnitFromInput: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, direction: -1 | 1) => void;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  handleAnnotationContextMenu: ((
    uttId: string,
    utt: TimelineUnitView,
    layerId: string,
    e: React.MouseEvent,
  ) => void) | undefined;
  /** 来自宿主 unit 的确信角标（segment 翻译行经父组件解析） */
  selfCertainty?: UnitSelfCertainty;
  selfCertaintyTitle?: string;
  selfCertaintyAmbiguous?: boolean;
  selfCertaintyAmbiguousTitle?: string;
}

export function TranscriptionTimelineTextTranslationItem({
  utt,
  layer,
  text,
  draft,
  draftKey,
  cellKey,
  isActive,
  isEditing,
  isDimmed,
  saveStatus,
  usesOwnSegments,
  unitById,
  segmentById,
  layoutStyle,
  dir,
  audioMedia,
  recording,
  recordingUnitId,
  recordingLayerId,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
  transcribeVoiceTranslation,
  saveSegmentContentForLayer,
  saveUnitLayerText,
  scheduleAutoSave,
  clearAutoSaveTimer,
  setTranslationDrafts,
  setEditingCellKey,
  setCellSaveStatus,
  runSaveWithStatus,
  focusedTranslationDraftKeyRef,
  onFocusLayer,
  navigateUnitFromInput,
  handleAnnotationClick,
  handleAnnotationContextMenu,
  selfCertainty,
  selfCertaintyTitle,
  selfCertaintyAmbiguous,
  selfCertaintyAmbiguousTitle,
}: TranscriptionTimelineTextTranslationItemProps) {
  const locale = useLocale();
  const { handleDraftChange, handleDraftBlur, clearDraftDebounce } = useTranslationSidebarTextDraftAutosave({
    usesOwnSegments,
    layerId: layer.id,
    unitId: utt.id,
    draftKey,
    cellKey,
    text,
    setTranslationDrafts,
    setCellSaveStatus,
    scheduleAutoSave,
    clearAutoSaveTimer,
    runSaveWithStatus,
    saveSegmentContentForLayer,
    saveUnitLayerText,
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
      {...(layer.modality === 'mixed' && transcribeVoiceTranslation && sourceUnit && audioMedia
        ? {
          onTranscribeRecording: () => {
            const b = readNonEmptyAudioBlobFromMediaItem(audioMedia);
            return transcribeVoiceTranslation(sourceUnit, layer, b ? { audioBlob: b } : undefined);
          },
        }
        : {})}
    />
  ) : undefined;
  const showAudioTools = Boolean(audioControls) && !isAudioOnlyLayer;

  const retrySave = () => {
    if (draft === text) {
      setCellSaveStatus(cellKey);
      return;
    }
    if (usesOwnSegments) {
      if (!saveSegmentContentForLayer) {
        setCellSaveStatus(cellKey);
        return;
      }
      void runSaveWithStatus(cellKey, async () => {
        await saveSegmentContentForLayer(utt.id, layer.id, draft);
      });
      return;
    }
    void runSaveWithStatus(cellKey, async () => {
      await saveUnitLayerText(utt.id, draft, layer.id);
    });
  };

  return (
    <TimelineStyledContainer
      className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${!draft.trim() && !isEditing ? ' timeline-text-item-empty' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${showAudioTools ? ' timeline-text-item-has-tools' : ''}${isAudioOnlyLayer ? ' timeline-text-item-audio-only' : ''}${selfCertainty || selfCertaintyAmbiguous ? ' timeline-text-item-has-self-certainty' : ''}`}
      layoutStyle={layoutStyle}
      dir={dir}
      onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e)}
      onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
    >
      {isAudioOnlyLayer && audioControls ? (
        <div className="timeline-translation-audio-card timeline-translation-audio-card-text">{audioControls}</div>
      ) : (
        <TimelineLaneDraftEditorCell
          bubbleClick
          inputClassName="timeline-text-input"
          value={draft}
          {...(dir !== undefined ? { dir } : {})}
          {...(!isAudioOnlyLayer ? { saveStatus } : {})}
          onRetry={retrySave}
          {...(showAudioTools && audioControls ? { tools: audioControls } : {})}
          toolsClassName="timeline-text-item-tools"
          placeholder={usesOwnSegments ? t(locale, 'transcription.timeline.placeholder.segment') : t(locale, 'transcription.timeline.placeholder.translation')}
          onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
          onFocus={() => {
            focusedTranslationDraftKeyRef.current = draftKey;
            setEditingCellKey(cellKey);
            onFocusLayer(layer.id);
          }}
          onChange={handleDraftChange}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Tab') {
              navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
              return;
            }
            if (e.key === 'Enter') {
              navigateUnitFromInput(e, e.shiftKey ? -1 : 1);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              clearDraftDebounce();
              setTranslationDrafts((prev) => ({ ...prev, [draftKey]: text }));
              setCellSaveStatus(cellKey);
              focusedTranslationDraftKeyRef.current = null;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            setEditingCellKey((prev) => (prev === cellKey ? null : prev));
            handleDraftBlur(e);
          }}
        />
      )}
      {selfCertainty && selfCertaintyTitle ? (
        <SelfCertaintyIcon
          certainty={selfCertainty}
          className="timeline-annotation-self-certainty"
          title={selfCertaintyTitle}
          ariaLabel={selfCertaintyTitle}
        />
      ) : null}
      {!selfCertainty && selfCertaintyAmbiguous ? (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty-ambiguous"
          role="img"
          aria-label={selfCertaintyAmbiguousTitle}
          title={selfCertaintyAmbiguousTitle}
        >
          <span className="timeline-annotation-self-certainty-icon" aria-hidden>
            !
          </span>
        </span>
      ) : null}
    </TimelineStyledContainer>
  );
}
