import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayerDocType, MediaItemDocType, LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { recordingScopeUnitId, resolveVoiceRecordingSourceUnit } from '../utils/recordingScopeUnitId';
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
  unitById: Map<string, LayerUnitDocType>;
  segmentById: Map<string, LayerUnitDocType>;
  text: string;
  draft: string;
  draftKey: string;
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
        saveStatus?: 'dirty' | 'saving' | 'error';
        onRetrySave?: () => void;
      },
  ) => React.ReactNode;
}

export function TranscriptionTimelineMediaTranslationRow({
  item,
  layer,
  layerForDisplay,
  baseLaneHeight,
  usesOwnSegments,
  unitById,
  segmentById,
  text,
  draft,
  draftKey,
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
  focusedTranslationDraftKeyRef,
  renderAnnotationItem,
}: TranscriptionTimelineMediaTranslationRowProps) {
  const locale = useLocale();
  const [saveStatus, setSaveStatus] = useState<'dirty' | 'saving' | 'error' | undefined>(undefined);
  const latestDraftRef = useRef(draft);
  const rowCellKey = `media-tr-${layer.id}-${item.id}`;
  const setRowSaveStatus = useCallback((status?: 'dirty' | 'saving' | 'error') => {
    setSaveStatus(status);
  }, []);
  const runSaveWithStatus = useCallback(async (saveTask: () => Promise<void>) => {
    setRowSaveStatus('saving');
    try {
      await saveTask();
      setRowSaveStatus(undefined);
    } catch (err) {
      console.error('[Jieyu] TranscriptionTimelineMediaTranslationRow: save failed', { cellKey: rowCellKey, err });
      setRowSaveStatus('error');
    }
  }, [rowCellKey, setRowSaveStatus]);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  const layerSupportsAudio = layer.modality === 'audio' || layer.modality === 'mixed' || Boolean(layer.acceptsAudio);
  const isAudioOnlyLayer = layer.modality === 'audio';
  const showAudioTools = layerSupportsAudio && !isAudioOnlyLayer;
  const recordingScopeId = recordingScopeUnitId(item);
  const isCurrentRecording = recording && recordingUnitId === recordingScopeId && recordingLayerId === layer.id;
  const audioActionDisabled = recording && !isCurrentRecording;
  const sourceUnit = resolveVoiceRecordingSourceUnit(item, unitById, segmentById);
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

  const retrySave = useCallback(() => {
    const value = normalizeSingleLine(latestDraftRef.current);
    if (value === text) {
      setRowSaveStatus(undefined);
      return;
    }
    void runSaveWithStatus(async () => {
      if (usesOwnSegments && saveSegmentContentForLayer) {
        await saveSegmentContentForLayer(item.id, layer.id, value);
        return;
      }
      await saveUnitLayerText(item.id, value, layer.id);
    });
  }, [item.id, layer.id, runSaveWithStatus, saveSegmentContentForLayer, saveUnitLayerText, setRowSaveStatus, text, usesOwnSegments]);

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
        ...(saveStatus ? { saveStatus } : {}),
        onRetrySave: retrySave,
        onFocus: () => {
          focusedTranslationDraftKeyRef.current = draftKey;
        },
        onChange: (e) => {
          const value = normalizeSingleLine(e.target.value);
          latestDraftRef.current = value;
          setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
          if (usesOwnSegments) {
            if (!saveSegmentContentForLayer) return;
            if (value !== text) {
              setRowSaveStatus('dirty');
              scheduleAutoSave(`seg-${layer.id}-${item.id}`, async () => {
                await runSaveWithStatus(async () => {
                  await saveSegmentContentForLayer(item.id, layer.id, value);
                });
              });
            } else {
              clearAutoSaveTimer(`seg-${layer.id}-${item.id}`);
              setRowSaveStatus(undefined);
            }
            return;
          }
          if (value.trim() && value !== text) {
            setRowSaveStatus('dirty');
            scheduleAutoSave(`tr-${layer.id}-${item.id}`, async () => {
              await runSaveWithStatus(async () => {
                await saveUnitLayerText(item.id, value, layer.id);
              });
            });
          } else {
            clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
            setRowSaveStatus(undefined);
          }
        },
        onBlur: (e) => {
          focusedTranslationDraftKeyRef.current = null;
          const value = normalizeSingleLine(e.target.value);
          if (usesOwnSegments) {
            clearAutoSaveTimer(`seg-${layer.id}-${item.id}`);
            if (saveSegmentContentForLayer && value !== text) {
              fireAndForget(runSaveWithStatus(async () => {
                await saveSegmentContentForLayer(item.id, layer.id, value);
              }));
            } else {
              setRowSaveStatus(undefined);
            }
            return;
          }
          clearAutoSaveTimer(`tr-${layer.id}-${item.id}`);
          if (value !== text) {
            fireAndForget(runSaveWithStatus(async () => {
              await saveUnitLayerText(item.id, value, layer.id);
            }));
          } else {
            setRowSaveStatus(undefined);
          }
        },
      })}
    </TimelineStyledContainer>
  );
}
