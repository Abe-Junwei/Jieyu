import { useCallback, useMemo } from 'react';
import type { ChangeEventHandler, Dispatch, FocusEventHandler, MutableRefObject, SetStateAction } from 'react';
import type { TimelineUnitKind } from './transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import { normalizeSingleLine } from '../utils/transcriptionFormatters';
import {
  timelineTranslationHostDraftAutoSaveKey,
  transcriptionLaneRowDraftAutoSaveKey,
} from '../utils/timelineDraftAutoSaveKeys';

/** 多轨宿主 `TranscriptionTimelineMediaTranscriptionRow`：防抖 + blur 直写 */
export function useTranscriptionMediaLaneRowTextAutosave(params: {
  unitKind: TimelineUnitKind;
  layerId: string;
  unitId: string;
  draftKey: string;
  sourceText: string;
  setUnitDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
}) {
  const {
    unitKind,
    layerId,
    unitId,
    draftKey,
    sourceText,
    setUnitDrafts,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    focusedTranslationDraftKeyRef,
  } = params;

  const rowKey = useMemo(
    () => transcriptionLaneRowDraftAutoSaveKey(unitKind, layerId, unitId),
    [unitKind, layerId, unitId],
  );

  const handleDraftFocus = useCallback(() => {
    focusedTranslationDraftKeyRef.current = draftKey;
  }, [draftKey, focusedTranslationDraftKeyRef]);

  const handleDraftChange = useCallback<ChangeEventHandler<HTMLInputElement>>((e) => {
    const value = normalizeSingleLine(e.target.value);
    setUnitDrafts((prev) => ({ ...prev, [draftKey]: value }));
    if (unitKind === 'segment') {
      if (!saveSegmentContentForLayer) return;
      scheduleAutoSave(rowKey, async () => {
        await saveSegmentContentForLayer(unitId, layerId, value);
      });
      return;
    }
    if (value.trim() && value !== sourceText) {
      scheduleAutoSave(rowKey, async () => {
        await saveUnitLayerText(unitId, value, layerId);
      });
    } else {
      clearAutoSaveTimer(rowKey);
    }
  }, [
    unitKind,
    layerId,
    unitId,
    draftKey,
    sourceText,
    rowKey,
    setUnitDrafts,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveSegmentContentForLayer,
    saveUnitLayerText,
  ]);

  const handleDraftBlur = useCallback<FocusEventHandler<HTMLInputElement>>((e) => {
    focusedTranslationDraftKeyRef.current = null;
    const value = normalizeSingleLine(e.target.value);
    if (unitKind === 'segment') {
      clearAutoSaveTimer(rowKey);
      if (saveSegmentContentForLayer && value !== sourceText) {
        fireAndForget(saveSegmentContentForLayer(unitId, layerId, value));
      }
      return;
    }
    clearAutoSaveTimer(rowKey);
    if (value !== sourceText) {
      fireAndForget(saveUnitLayerText(unitId, value, layerId));
    }
  }, [
    unitKind,
    layerId,
    unitId,
    sourceText,
    rowKey,
    clearAutoSaveTimer,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    focusedTranslationDraftKeyRef,
  ]);

  return { handleDraftFocus, handleDraftChange, handleDraftBlur };
}

/** 侧栏 `TranscriptionTimelineTextTranslationItem`：`runSaveWithStatus` + cell 状态 */
export function useTranslationSidebarTextDraftAutosave(params: {
  usesOwnSegments: boolean;
  layerId: string;
  unitId: string;
  draftKey: string;
  cellKey: string;
  text: string;
  setTranslationDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setCellSaveStatus: (cellKey: string, status?: 'dirty' | 'saving' | 'error') => void;
  scheduleAutoSave: (key: string, task: () => Promise<void>) => void;
  clearAutoSaveTimer: (key: string) => void;
  runSaveWithStatus: (cellKey: string, saveTask: () => Promise<void>) => Promise<void>;
  saveSegmentContentForLayer: ((segmentId: string, layerId: string, value: string) => Promise<void>) | undefined;
  saveUnitLayerText: (unitId: string, value: string, layerId: string) => Promise<void>;
}) {
  const {
    usesOwnSegments,
    layerId,
    unitId,
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
  } = params;

  const debounceKey = useMemo(
    () => timelineTranslationHostDraftAutoSaveKey(usesOwnSegments, layerId, unitId),
    [usesOwnSegments, layerId, unitId],
  );

  const clearDraftDebounce = useCallback(() => {
    clearAutoSaveTimer(debounceKey);
  }, [clearAutoSaveTimer, debounceKey]);

  const handleDraftChange = useCallback<ChangeEventHandler<HTMLInputElement>>((e) => {
    const value = normalizeSingleLine(e.target.value);
    setTranslationDrafts((prev) => ({ ...prev, [draftKey]: value }));
    if (usesOwnSegments) {
      if (!saveSegmentContentForLayer) return;
      setCellSaveStatus(cellKey, 'dirty');
      scheduleAutoSave(debounceKey, async () => {
        await runSaveWithStatus(cellKey, async () => {
          await saveSegmentContentForLayer(unitId, layerId, value);
        });
      });
      return;
    }
    if (value.trim() && value !== text) {
      setCellSaveStatus(cellKey, 'dirty');
      scheduleAutoSave(debounceKey, async () => {
        await runSaveWithStatus(cellKey, async () => {
          await saveUnitLayerText(unitId, value, layerId);
        });
      });
    } else {
      clearAutoSaveTimer(debounceKey);
      setCellSaveStatus(cellKey);
    }
  }, [
    usesOwnSegments,
    draftKey,
    cellKey,
    text,
    debounceKey,
    setTranslationDrafts,
    setCellSaveStatus,
    scheduleAutoSave,
    clearAutoSaveTimer,
    runSaveWithStatus,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    layerId,
    unitId,
  ]);

  const handleDraftBlur = useCallback<FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>>((e) => {
    const value = normalizeSingleLine(e.target.value);
    if (usesOwnSegments) {
      clearAutoSaveTimer(debounceKey);
      if (value !== text && saveSegmentContentForLayer) {
        void runSaveWithStatus(cellKey, async () => {
          await saveSegmentContentForLayer(unitId, layerId, value);
        });
      } else {
        setCellSaveStatus(cellKey);
      }
      return;
    }
    clearAutoSaveTimer(debounceKey);
    if (value !== text) {
      void runSaveWithStatus(cellKey, async () => {
        await saveUnitLayerText(unitId, value, layerId);
      });
    } else {
      setCellSaveStatus(cellKey);
    }
  }, [
    usesOwnSegments,
    cellKey,
    text,
    debounceKey,
    clearAutoSaveTimer,
    runSaveWithStatus,
    saveSegmentContentForLayer,
    saveUnitLayerText,
    setCellSaveStatus,
    layerId,
    unitId,
  ]);

  return { handleDraftChange, handleDraftBlur, clearDraftDebounce };
}
