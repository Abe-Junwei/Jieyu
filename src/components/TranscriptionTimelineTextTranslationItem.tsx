import type { LayerDocType, MediaItemDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { TimelineStyledContainer } from './transcription/TimelineStyledContainer';
import { t, useLocale } from '../i18n';
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
  layoutStyle: React.CSSProperties;
  dir: string | undefined;
  audioMedia: MediaItemDocType | undefined;
  recording: boolean;
  recordingUnitId: string | null | undefined;
  recordingLayerId: string | null | undefined;
  startRecordingForUnit: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
  stopRecording: (() => void) | undefined;
  deleteVoiceTranslation: ((unit: LayerUnitDocType, layer: LayerDocType) => Promise<void>) | undefined;
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
  navigateUnitFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
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
  layoutStyle,
  dir,
  audioMedia,
  recording,
  recordingUnitId,
  recordingLayerId,
  startRecordingForUnit,
  stopRecording,
  deleteVoiceTranslation,
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
}: TranscriptionTimelineTextTranslationItemProps) {
  const locale = useLocale();
  const layerSupportsAudio = !usesOwnSegments
    && (layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio));
  const isAudioOnlyLayer = layer.modality === 'audio';
  const showAudioTools = layerSupportsAudio && layer.modality === 'mixed';
  const isCurrentRecording = recording && recordingUnitId === utt.id && recordingLayerId === layer.id;
  const audioActionDisabled = recording && !isCurrentRecording;
  const sourceUnit = utt.kind === 'segment'
    ? (utt.parentUnitId ? unitById.get(utt.parentUnitId) : undefined)
    : unitById.get(utt.id);
  const audioControls = layerSupportsAudio ? (
    <TimelineTranslationAudioControls
      isRecording={isCurrentRecording}
      disabled={audioActionDisabled}
      compact={!isAudioOnlyLayer}
      {...(audioMedia ? { mediaItem: audioMedia } : {})}
      onStartRecording={() => {
        if (!sourceUnit) return;
        void startRecordingForUnit?.(sourceUnit, layer);
      }}
      {...(stopRecording ? { onStopRecording: stopRecording } : {})}
      {...(audioMedia && deleteVoiceTranslation && sourceUnit
        ? { onDeleteRecording: () => deleteVoiceTranslation(sourceUnit, layer) }
        : {})}
    />
  ) : undefined;

  const retrySave = () => {
    if (draft === text) {
      setCellSaveStatus(cellKey);
      return;
    }
    void runSaveWithStatus(cellKey, async () => {
      await saveUnitLayerText(utt.id, draft, layer.id);
    });
  };

  return (
    <TimelineStyledContainer
      className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${!draft.trim() && !isEditing ? ' timeline-text-item-empty' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${showAudioTools ? ' timeline-text-item-has-tools' : ''}${isAudioOnlyLayer ? ' timeline-text-item-audio-only' : ''}${selfCertainty ? ' timeline-text-item-has-self-certainty' : ''}`}
      layoutStyle={layoutStyle}
      dir={dir}
      onClick={(e) => handleAnnotationClick(utt.id, utt.startTime, layer.id, e)}
      onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
    >
      {!isAudioOnlyLayer && saveStatus === 'error' ? (
        <button
          type="button"
          className="timeline-text-item-status-dot timeline-text-item-status-dot-error timeline-text-item-status-dot-action"
          title={t(locale, 'transcription.timeline.save.retry')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            retrySave();
          }}
        />
      ) : !isAudioOnlyLayer && saveStatus ? (
        <span
          className={`timeline-text-item-status-dot timeline-text-item-status-dot-${saveStatus}`}
          title={saveStatus === 'saving' ? t(locale, 'transcription.timeline.save.saving') : t(locale, 'transcription.timeline.save.unsaved')}
        />
      ) : null}
      {showAudioTools && audioControls ? <div className="timeline-text-item-tools">{audioControls}</div> : null}
      {isAudioOnlyLayer && audioControls ? (
        <div className="timeline-translation-audio-card timeline-translation-audio-card-text">{audioControls}</div>
      ) : (
        <input
          type="text"
          className="timeline-text-input"
          placeholder={usesOwnSegments ? t(locale, 'transcription.timeline.placeholder.segment') : t(locale, 'transcription.timeline.placeholder.translation')}
          value={draft}
          dir={dir}
          onContextMenu={(e) => handleAnnotationContextMenu?.(utt.id, utt, layer.id, e)}
          onFocus={() => {
            focusedTranslationDraftKeyRef.current = draftKey;
            setEditingCellKey(cellKey);
            onFocusLayer(layer.id);
          }}
          onChange={(e) => {
            const value = normalizeSingleLine(e.target.value);
            setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
            if (usesOwnSegments) {
              if (!saveSegmentContentForLayer) return;
              setCellSaveStatus(cellKey, 'dirty');
              scheduleAutoSave(`seg-${layer.id}-${utt.id}`, async () => {
                await runSaveWithStatus(cellKey, async () => {
                  await saveSegmentContentForLayer(utt.id, layer.id, value);
                });
              });
              return;
            }
            if (value.trim() && value !== text) {
              setCellSaveStatus(cellKey, 'dirty');
              scheduleAutoSave(`tr-${layer.id}-${utt.id}`, async () => {
                await runSaveWithStatus(cellKey, async () => {
                  await saveUnitLayerText(utt.id, value, layer.id);
                });
              });
            } else {
              clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
              setCellSaveStatus(cellKey);
            }
          }}
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
              clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
              setTranslationDrafts((prev) => ({ ...prev, [draftKey]: text }));
              setCellSaveStatus(cellKey);
              focusedTranslationDraftKeyRef.current = null;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            setEditingCellKey((prev) => (prev === cellKey ? null : prev));
            const value = normalizeSingleLine(e.target.value);
            if (usesOwnSegments) {
              clearAutoSaveTimer(`seg-${layer.id}-${utt.id}`);
              if (value !== text && saveSegmentContentForLayer) {
                void runSaveWithStatus(cellKey, async () => {
                  await saveSegmentContentForLayer(utt.id, layer.id, value);
                });
              } else {
                setCellSaveStatus(cellKey);
              }
              return;
            }
            clearAutoSaveTimer(`tr-${layer.id}-${utt.id}`);
            if (value !== text) {
              void runSaveWithStatus(cellKey, async () => {
                await saveUnitLayerText(utt.id, value, layer.id);
              });
            } else {
              setCellSaveStatus(cellKey);
            }
          }}
        />
      )}
      {selfCertainty === 'certain' && selfCertaintyTitle ? (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--certain"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <span aria-hidden className="timeline-annotation-self-certainty-icon">✓</span>
        </span>
      ) : null}
      {selfCertainty === 'not_understood' && selfCertaintyTitle ? (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--not-understood"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <span aria-hidden className="timeline-annotation-self-certainty-icon">?</span>
        </span>
      ) : null}
      {selfCertainty === 'uncertain' && selfCertaintyTitle ? (
        <span
          className="timeline-annotation-self-certainty timeline-annotation-self-certainty--uncertain"
          title={selfCertaintyTitle}
          aria-label={selfCertaintyTitle}
        >
          <span className="timeline-annotation-self-certainty-wavy" aria-hidden>
            {'\u2248'}
          </span>
        </span>
      ) : null}
    </TimelineStyledContainer>
  );
}
