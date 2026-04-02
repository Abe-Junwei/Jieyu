import type {
  LayerDocType,
  MediaItemDocType,
  UtteranceDocType,
} from '../db';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import { TimelineTranslationAudioControls } from './TimelineTranslationAudioControls';
import { t, useLocale } from '../i18n';

type SaveStatus = 'dirty' | 'saving' | 'error' | undefined;

interface TranscriptionTimelineTextTranslationItemProps {
  utt: UtteranceDocType;
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
  style: React.CSSProperties;
  dir: string | undefined;
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
  setEditingCellKey: React.Dispatch<React.SetStateAction<string | null>>;
  setCellSaveStatus: (cellKey: string, status?: 'dirty' | 'saving' | 'error') => void;
  runSaveWithStatus: (cellKey: string, saveTask: () => Promise<void>) => Promise<void>;
  focusedTranslationDraftKeyRef: React.MutableRefObject<string | null>;
  onFocusLayer: (layerId: string) => void;
  navigateUtteranceFromInput: (e: React.KeyboardEvent<HTMLInputElement>, direction: -1 | 1) => void;
  handleAnnotationClick: (
    uttId: string,
    uttStartTime: number,
    layerId: string,
    e: React.MouseEvent,
  ) => void;
  handleAnnotationContextMenu: ((
    uttId: string,
    utt: Pick<UtteranceDocType, 'id' | 'startTime' | 'endTime' | 'speaker' | 'speakerId' | 'ai_metadata'>,
    layerId: string,
    e: React.MouseEvent,
  ) => void) | undefined;
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
  style,
  dir,
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
  setEditingCellKey,
  setCellSaveStatus,
  runSaveWithStatus,
  focusedTranslationDraftKeyRef,
  onFocusLayer,
  navigateUtteranceFromInput,
  handleAnnotationClick,
  handleAnnotationContextMenu,
}: TranscriptionTimelineTextTranslationItemProps) {
  const locale = useLocale();
  const layerSupportsAudio = !usesOwnSegments
    && (layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio));
  const isAudioOnlyLayer = layer.modality === 'audio';
  const showAudioTools = layerSupportsAudio && layer.modality === 'mixed';
  const isCurrentRecording = recording && recordingUtteranceId === utt.id && recordingLayerId === layer.id;
  const audioActionDisabled = recording && !isCurrentRecording;
  const audioControls = layerSupportsAudio ? (
    <TimelineTranslationAudioControls
      isRecording={isCurrentRecording}
      disabled={audioActionDisabled}
      compact={!isAudioOnlyLayer}
      {...(audioMedia ? { mediaItem: audioMedia } : {})}
      onStartRecording={() => startRecordingForUtterance?.(utt, layer)}
      {...(stopRecording ? { onStopRecording: stopRecording } : {})}
      {...(audioMedia && deleteVoiceTranslation ? { onDeleteRecording: () => deleteVoiceTranslation(utt, layer) } : {})}
    />
  ) : undefined;

  const retrySave = () => {
    if (draft === text) {
      setCellSaveStatus(cellKey);
      return;
    }
    void runSaveWithStatus(cellKey, async () => {
      await saveTextTranslationForUtterance(utt.id, draft, layer.id);
    });
  };

  return (
    <div
      className={`timeline-text-item${isActive ? ' timeline-text-item-active' : ''}${isEditing ? ' timeline-text-item-editing' : ''}${isDimmed ? ' timeline-text-item-dimmed' : ''}${saveStatus ? ` timeline-text-item-${saveStatus}` : ''}${showAudioTools ? ' timeline-text-item-has-tools' : ''}${isAudioOnlyLayer ? ' timeline-text-item-audio-only' : ''}`}
      style={style}
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
                  await saveTextTranslationForUtterance(utt.id, value, layer.id);
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
              navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
              return;
            }
            if (e.key === 'Enter') {
              navigateUtteranceFromInput(e, e.shiftKey ? -1 : 1);
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
                await saveTextTranslationForUtterance(utt.id, value, layer.id);
              });
            } else {
              setCellSaveStatus(cellKey);
            }
          }}
        />
      )}
    </div>
  );
}
