import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../types/jieyuDbDocTypes';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type {
  SpeakerActionDialogState,
  SpeakerFilterOption,
} from '../hooks/speakerManagement/types';
import type { SpeakerFormat, SpeakerTranslate } from '../hooks/speakerManagement/speakerI18n';
import { reportValidationError } from '../utils/validationErrorReporter';
import { resolveTranscriptionUnitTarget } from './transcriptionUnitTargetResolver';
import {
  buildSegmentSpeakerExportRows,
  downloadSpeakerSegmentExport,
  getSegmentIdsForSpeakerKey as resolveSegmentIdsForSpeakerKey,
  resolveSegmentSpeakerExportName,
} from './speakerActionRoutingHandlers.helpers';

export interface UseSpeakerActionFilterRoutingHandlersInput {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  handleSelectSpeakerUnits: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  selectedTimelineUnit: TimelineUnit | null;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setActiveSpeakerFilterKey: Dispatch<SetStateAction<string>>;
  setSegmentSpeakerDialogState: Dispatch<SetStateAction<SpeakerActionDialogState | null>>;
  formatTime: (seconds: number) => string;
  setSaveState: (state: SaveState) => void;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
}

export function useSpeakerActionFilterRoutingHandlers({
  activeSpeakerManagementLayer,
  segmentsByLayer,
  segmentContentByLayer,
  resolveExplicitSpeakerKeyForSegment,
  speakerFilterOptionsForActions,
  handleSelectSpeakerUnits,
  handleClearSpeakerAssignments,
  handleExportSpeakerSegments,
  selectedTimelineUnit,
  selectTimelineUnit,
  setSelectedUnitIds,
  setActiveSpeakerFilterKey,
  setSegmentSpeakerDialogState,
  formatTime,
  setSaveState,
  t,
  tf,
}: UseSpeakerActionFilterRoutingHandlersInput) {
  const getSegmentIdsForSpeakerKey = useCallback(
    (speakerKey: string) =>
      resolveSegmentIdsForSpeakerKey({
        activeSpeakerManagementLayer,
        segmentsByLayer,
        resolveExplicitSpeakerKeyForSegment,
        speakerKey,
      }),
    [activeSpeakerManagementLayer, resolveExplicitSpeakerKeyForSegment, segmentsByLayer],
  );

  const speakerFilterOptionByKeyForActions = useMemo(
    () => new Map(speakerFilterOptionsForActions.map((option) => [option.key, option] as const)),
    [speakerFilterOptionsForActions],
  );

  const handleSelectSpeakerUnitsRouted = useCallback(
    (speakerKey: string) => {
      if (!activeSpeakerManagementLayer) {
        handleSelectSpeakerUnits(speakerKey);
        return;
      }

      const ids = getSegmentIdsForSpeakerKey(speakerKey);
      if (ids.length === 0) {
        selectTimelineUnit(null);
        setSelectedUnitIds(new Set());
        return;
      }

      const primary =
        selectedTimelineUnit?.kind === 'segment' && ids.includes(selectedTimelineUnit.unitId)
          ? selectedTimelineUnit.unitId
          : ids[0]!;
      selectTimelineUnit(
        resolveTranscriptionUnitTarget({
          layerId: activeSpeakerManagementLayer.id,
          unitId: primary,
          preferredKind: 'segment',
        }),
      );
      setSelectedUnitIds(new Set(ids));
      setActiveSpeakerFilterKey(speakerKey);
    },
    [
      activeSpeakerManagementLayer,
      getSegmentIdsForSpeakerKey,
      handleSelectSpeakerUnits,
      selectTimelineUnit,
      selectedTimelineUnit,
      setActiveSpeakerFilterKey,
      setSelectedUnitIds,
    ],
  );

  const handleClearSpeakerAssignmentsRouted = useCallback(
    (speakerKey: string) => {
      if (!activeSpeakerManagementLayer) {
        handleClearSpeakerAssignments(speakerKey);
        return;
      }

      const target = speakerFilterOptionByKeyForActions.get(speakerKey);
      const ids = getSegmentIdsForSpeakerKey(speakerKey);
      if (ids.length === 0) {
        reportValidationError({
          message: t('transcription.error.validation.clearSpeakerNoTarget'),
          i18nKey: 'transcription.error.validation.clearSpeakerNoTarget',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
        return;
      }

      setSegmentSpeakerDialogState({
        mode: 'clear',
        speakerKey,
        speakerName: target?.name ?? t('transcription.speaker.common.unnamed'),
        affectedCount: ids.length,
      });
    },
    [
      activeSpeakerManagementLayer,
      getSegmentIdsForSpeakerKey,
      handleClearSpeakerAssignments,
      setSaveState,
      setSegmentSpeakerDialogState,
      speakerFilterOptionByKeyForActions,
      t,
    ],
  );

  const handleExportSpeakerSegmentsRouted = useCallback(
    (speakerKey: string) => {
      if (!activeSpeakerManagementLayer) {
        handleExportSpeakerSegments(speakerKey);
        return;
      }

      const speakerName = resolveSegmentSpeakerExportName({
        speakerKey,
        speakerFilterOptionByKey: speakerFilterOptionByKeyForActions,
        t,
      });
      const rows = buildSegmentSpeakerExportRows({
        activeSpeakerManagementLayer,
        segmentsByLayer,
        segmentContentByLayer,
        resolveExplicitSpeakerKeyForSegment,
        speakerKey,
        formatTime,
      });

      if (rows.length === 0) {
        reportValidationError({
          message: t('transcription.error.validation.exportSpeakerNoSegments'),
          i18nKey: 'transcription.error.validation.exportSpeakerNoSegments',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
        return;
      }

      if (typeof window === 'undefined') {
        reportValidationError({
          message: t('transcription.error.validation.exportSpeakerUnsupportedEnv'),
          i18nKey: 'transcription.error.validation.exportSpeakerUnsupportedEnv',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, ...(meta ? { errorMeta: meta } : {}) }),
        });
        return;
      }

      setSaveState(downloadSpeakerSegmentExport({ speakerName, rows, t, tf }));
    },
    [
      activeSpeakerManagementLayer,
      formatTime,
      handleExportSpeakerSegments,
      resolveExplicitSpeakerKeyForSegment,
      segmentContentByLayer,
      segmentsByLayer,
      setSaveState,
      speakerFilterOptionByKeyForActions,
      t,
      tf,
    ],
  );

  return {
    getSegmentIdsForSpeakerKey,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleSelectSpeakerUnitsRouted,
  };
}
