import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AnchorDocType, LayerUnitDocType, LayerUnitContentDocType } from '../../db/types';
import { StorageReadbackError, storagePort } from '../../db/storagePort';
import {
  readTranscriptionContentById,
  rereadTranscriptionRegexSplit,
} from '../../db/storagePortTranscriptionUnits';
import { LinguisticService } from '../../services/LinguisticService';
import { formatTime } from '../../utils/transcriptionFormatters';
import { reportActionError } from '../../utils/actionErrorReporter';
import { reportValidationError } from '../../utils/validationErrorReporter';
import type { SaveState } from './transcriptionTypes';
import {
  formatRollbackFailureMessage,
  getUndoLabel,
  resolveUnitActionErrorDetail,
} from './useTranscriptionUnitActions.helpers';
import type { Locale } from '../../i18n';
import { t, tf } from '../../i18n';
import { createLogger } from '../../observability/logger';
import { buildSegmentationProjection } from '../../services/LayerSegmentationTextService';
import { scheduleSegmentMetaSyncForUnitIds } from '../../services/segmentMetaSyncBestEffort';
import { planRegexSplit } from './regexSplitPlan';
import { mergeUnitSelfCertaintyConservative } from '../../utils/unitSelfCertainty';
import { hasTimelineGapOverlapAfterTransforms } from '../../utils/timelineBatchOverlapValidation';

const log = createLogger('useTranscriptionUnitActions');

type BatchActionsInput = {
  allowOverlapInTranscription: boolean;
  locale: Locale;
  translations: LayerUnitContentDocType[];
  unitsOnCurrentMediaRef: MutableRefObject<LayerUnitDocType[]>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (removedUnitIds: Set<string>) => Promise<void>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  reassignTranslations: (
    survivorId: string,
    removedId: string,
    now: string,
  ) => Promise<{
    newTranslations: LayerUnitContentDocType[];
    updatedTranslations: LayerUnitContentDocType[];
  }>;
  selectUnitPrimary: (id: string) => void;
  setSaveState: (s: SaveState) => void;
  setTranslations: Dispatch<SetStateAction<LayerUnitContentDocType[]>>;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  setUnitDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setAnchors?: Dispatch<SetStateAction<AnchorDocType[]>>;
};

export function createTranscriptionUnitBatchActions(input: BatchActionsInput) {
  const {
    allowOverlapInTranscription,
    locale,
    translations,
    unitsOnCurrentMediaRef,
    pushUndo,
    rollbackUndo,
    updateAnchorTime,
    pruneOrphanAnchors,
    getUnitTextForLayer,
    reassignTranslations,
    selectUnitPrimary,
    setSaveState,
    setTranslations,
    setUnits,
    setUnitDrafts,
    setAnchors,
  } = input;

  const offsetSelectedTimes = async (ids: Set<string>, deltaSec: number) => {
    const targets = unitsOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) < 0.0005) return;

    const minSpan = 0.05;
    const gap = 0.02;
    const transformed = new Map<string, { startTime: number; endTime: number }>();
    for (const u of targets) {
      const startTime = Number((u.startTime + deltaSec).toFixed(3));
      const endTime = Number((u.endTime + deltaSec).toFixed(3));
      if (startTime < 0 || endTime - startTime < minSpan) {
        reportValidationError({
          message: t(locale, 'transcription.error.validation.offsetInvalidRange'),
          i18nKey: 'transcription.error.validation.offsetInvalidRange',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      if (hasTimelineGapOverlapAfterTransforms(unitsOnCurrentMediaRef.current, transformed, gap)) {
        reportValidationError({
          message: t(locale, 'transcription.error.validation.offsetOverlap'),
          i18nKey: 'transcription.error.validation.offsetOverlap',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
    }

    pushUndo(getUndoLabel(locale, 'offsetSelectedTimes'));
    try {
      const now = new Date().toISOString();
      const updatedRows = targets.map((u) => {
        const next = transformed.get(u.id)!;
        return {
          ...u,
          startTime: next.startTime,
          endTime: next.endTime,
          updatedAt: now,
        } as LayerUnitDocType;
      });
      await LinguisticService.units.saveBatch(updatedRows);

      await Promise.all(
        updatedRows.map(async (u) => {
          const startAnchorId = u.startAnchorId ?? '';
          const endAnchorId = u.endAnchorId ?? '';
          if (startAnchorId.length > 0) await updateAnchorTime(startAnchorId, u.startTime);
          if (endAnchorId.length > 0) await updateAnchorTime(endAnchorId, u.endTime);
        }),
      );

      const byId = new Map(updatedRows.map((row) => [row.id, row]));
      setUnits((prev) => prev.map((u) => byId.get(u.id) ?? u));
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.offsetSelection', {
          count: updatedRows.length,
          delta: `${deltaSec >= 0 ? '+' : ''}${deltaSec.toFixed(3)}s`,
        }),
      });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after offsetSelectedTimes failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = resolveUnitActionErrorDetail(locale, error);
      log.error('offsetSelectedTimes failed', {
        targetCount: targets.length,
        deltaSec,
        error: message,
      });
      reportActionError({
        actionLabel: getUndoLabel(locale, 'offsetSelectedTimes'),
        error,
        i18nKey: 'transcription.error.action.offsetBatchFailed',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage(locale, 'offsetSelectedTimes', error),
      });
    }
  };

  const scaleSelectedTimes = async (ids: Set<string>, factor: number, anchorTime?: number) => {
    const targets = unitsOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!Number.isFinite(factor) || factor <= 0) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.scaleFactorInvalid'),
        i18nKey: 'transcription.error.validation.scaleFactorInvalid',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const pivot = Number.isFinite(anchorTime ?? NaN) ? Number(anchorTime) : targets[0]!.startTime;
    const minSpan = 0.05;
    const gap = 0.02;
    const transformed = new Map<string, { startTime: number; endTime: number }>();
    for (const u of targets) {
      const startTime = Number((pivot + (u.startTime - pivot) * factor).toFixed(3));
      const endTime = Number((pivot + (u.endTime - pivot) * factor).toFixed(3));
      if (startTime < 0 || endTime - startTime < minSpan) {
        reportValidationError({
          message: t(locale, 'transcription.error.validation.scaleInvalidRange'),
          i18nKey: 'transcription.error.validation.scaleInvalidRange',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      if (hasTimelineGapOverlapAfterTransforms(unitsOnCurrentMediaRef.current, transformed, gap)) {
        reportValidationError({
          message: t(locale, 'transcription.error.validation.scaleOverlap'),
          i18nKey: 'transcription.error.validation.scaleOverlap',
          setErrorState: ({ message, meta }) =>
            setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
    }

    pushUndo(getUndoLabel(locale, 'scaleSelectedTimes'));
    try {
      const now = new Date().toISOString();
      const updatedRows = targets.map((u) => {
        const next = transformed.get(u.id)!;
        return {
          ...u,
          startTime: next.startTime,
          endTime: next.endTime,
          updatedAt: now,
        } as LayerUnitDocType;
      });
      await LinguisticService.units.saveBatch(updatedRows);

      await Promise.all(
        updatedRows.map(async (u) => {
          const startAnchorId = u.startAnchorId ?? '';
          const endAnchorId = u.endAnchorId ?? '';
          if (startAnchorId.length > 0) await updateAnchorTime(startAnchorId, u.startTime);
          if (endAnchorId.length > 0) await updateAnchorTime(endAnchorId, u.endTime);
        }),
      );

      const byId = new Map(updatedRows.map((row) => [row.id, row]));
      setUnits((prev) => prev.map((u) => byId.get(u.id) ?? u));
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.scaleSelection', {
          count: updatedRows.length,
          factor: `x${factor.toFixed(3)}`,
        }),
      });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after scaleSelectedTimes failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = resolveUnitActionErrorDetail(locale, error);
      log.error('scaleSelectedTimes failed', {
        targetCount: targets.length,
        factor,
        ...(anchorTime !== undefined && { anchorTime }),
        error: message,
      });
      reportActionError({
        actionLabel: getUndoLabel(locale, 'scaleSelectedTimes'),
        error,
        i18nKey: 'transcription.error.action.scaleBatchFailed',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage(locale, 'scaleSelectedTimes', error),
      });
    }
  };

  const splitByRegex = async (ids: Set<string>, pattern: string, flags = '') => {
    const rawPattern = pattern.trim();
    if (!rawPattern) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.regexPatternRequired'),
        i18nKey: 'transcription.error.validation.regexPatternRequired',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const normalizedFlags = [...new Set(`${flags}g`.split(''))].join('');
    let splitter: RegExp;
    try {
      splitter = new RegExp(rawPattern, normalizedFlags);
    } catch {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.regexPatternInvalid'),
        i18nKey: 'transcription.error.validation.regexPatternInvalid',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targets = unitsOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;

    const now = new Date().toISOString();
    const plan = planRegexSplit(
      targets.map((unit) => ({ unit, fullText: getUnitTextForLayer(unit) || '' })),
      translations,
      splitter,
      now,
    );
    if (plan.units.length === 0) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.regexNoSplitCandidates'),
        i18nKey: 'transcription.error.validation.regexNoSplitCandidates',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const projections = plan.projectionSources.map(({ unit, translation }) =>
      buildSegmentationProjection(unit, translation, now),
    );
    const storedContents = await Promise.all(
      plan.contents.map(async (row) => {
        const stored = await readTranscriptionContentById(row.id);
        if (!stored) return row;
        const text = row.text;
        return text === undefined
          ? { ...stored, updatedAt: now }
          : { ...stored, text, updatedAt: now };
      }),
    );
    const writtenUnits = [...plan.units, ...projections.map((row) => row.segment)];
    const writtenContents = [...storedContents, ...projections.map((row) => row.content)];

    pushUndo(getUndoLabel(locale, 'splitByRegex'));
    try {
      const { resizedSegmentIds } = await storagePort().commitRegexSplit({
        anchors: plan.anchors,
        units: writtenUnits,
        contents: writtenContents,
        resizeSegmentsOf: plan.firstUnitIds,
      });
      const updatedIds = new Set(plan.firstUnitIds);
      setUnits((prev) => [
        ...prev.map((unit) => plan.units.find((next) => next.id === unit.id) ?? unit),
        ...plan.units.filter((unit) => !updatedIds.has(unit.id)),
      ]);
      setTranslations((prev) => {
        const written = new Map(plan.contents.map((row) => [row.id, row]));
        const merged = prev.map((row) => written.get(row.id) ?? row);
        const known = new Set(merged.map((row) => row.id));
        return [...merged, ...plan.contents.filter((row) => !known.has(row.id))];
      });
      setUnitDrafts((prev) => ({ ...prev, ...plan.drafts }));
      if (plan.anchors.length > 0) {
        setAnchors?.((prev) => [...prev, ...plan.anchors]);
      }
      const firstInsert = plan.units.find((unit) => !updatedIds.has(unit.id));
      if (firstInsert) selectUnitPrimary(firstInsert.id);
      scheduleSegmentMetaSyncForUnitIds(
        [...writtenUnits.map((unit) => unit.id), ...resizedSegmentIds],
        'useTranscriptionUnitActions.splitByRegex',
      );
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.regexSplitSelection', {
          count: plan.units.length,
        }),
      });
    } catch (error) {
      if (error instanceof StorageReadbackError) {
        try {
          const splitUnitIds = plan.units.map((unit) => unit.id);
          // 编辑器里的正文是按父句段映射过的视图行，不能直接塞库里的分词行
          const {
            units: unitsFound,
            contents: contentsFound,
            anchors: anchorsFound,
          } = await rereadTranscriptionRegexSplit({
            writtenUnitIds: writtenUnits.map((unit) => unit.id),
            splitUnitIds,
            anchorIds: plan.anchors.map((row) => row.id),
          });
          setUnits((prev) => {
            const known = new Set(prev.map((unit) => unit.id));
            return [
              ...prev.map((unit) => unitsFound.find((row) => row.id === unit.id) ?? unit),
              ...unitsFound.filter((row) => row.unitType !== 'segment' && !known.has(row.id)),
            ];
          });
          const splitIdSet = new Set(splitUnitIds);
          setTranslations((prev) => [
            ...prev.filter((row) => !splitIdSet.has(row.unitId ?? '')),
            ...contentsFound,
          ]);
          if (anchorsFound.length > 0) {
            setAnchors?.((prev) => {
              const known = new Set(prev.map((row) => row.id));
              return [...prev, ...anchorsFound.filter((row) => !known.has(row.id))];
            });
          }
        } catch (rereadError) {
          log.warn('Reread after regex split read-back failure also failed', {
            error: rereadError instanceof Error ? rereadError.message : String(rereadError),
          });
        }
        setSaveState({
          kind: 'error',
          message: t(locale, 'transcription.error.action.regexSplitUnconfirmed'),
        });
        return;
      }
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after splitByRegex failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = resolveUnitActionErrorDetail(locale, error);
      log.error('splitByRegex failed', {
        targetCount: targets.length,
        pattern: rawPattern,
        flags: normalizedFlags,
        error: message,
      });
      reportActionError({
        actionLabel: getUndoLabel(locale, 'splitByRegex'),
        error,
        i18nKey: 'transcription.error.action.regexSplitBatchFailed',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage(locale, 'splitByRegex', error),
      });
    }
  };

  const mergeSelectedUnits = async (ids: Set<string>) => {
    const sorted = unitsOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (sorted.length < 2) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo'),
        i18nKey: 'transcription.error.validation.mergeSelectionRequireAtLeastTwo',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'mergeSelectedUnits'));
    try {
      const now = new Date().toISOString();
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const mergedCertainty = mergeUnitSelfCertaintyConservative(
        sorted.map((u) => u.selfCertainty),
      );

      const updated: LayerUnitDocType = {
        ...first,
        endTime: last.endTime,
        endAnchorId: last.endAnchorId ?? first.endAnchorId,
        updatedAt: now,
      } as LayerUnitDocType;
      if (mergedCertainty === undefined) {
        delete updated.selfCertainty;
      } else {
        updated.selfCertainty = mergedCertainty;
      }
      await LinguisticService.units.save(updated);

      const toRemove = sorted.slice(1);
      let allNewTranslations: LayerUnitContentDocType[] = [];
      let allUpdatedTranslations: LayerUnitContentDocType[] = [];
      for (const u of toRemove) {
        const { newTranslations, updatedTranslations } = await reassignTranslations(
          first.id,
          u.id,
          now,
        );
        allNewTranslations = [...allNewTranslations, ...newTranslations];
        allUpdatedTranslations = [...allUpdatedTranslations, ...updatedTranslations];
      }

      const removeIds = new Set(toRemove.map((u) => u.id));
      const updatedIds = new Set(allUpdatedTranslations.map((t) => t.id));
      setUnits((prev) =>
        prev.filter((u) => !removeIds.has(u.id)).map((u) => (u.id === first.id ? updated : u)),
      );
      setTranslations((prev) => [
        ...prev.filter((t) => !(t.unitId && removeIds.has(t.unitId)) && !updatedIds.has(t.id)),
        ...allUpdatedTranslations,
        ...allNewTranslations,
      ]);
      selectUnitPrimary(first.id);

      await pruneOrphanAnchors(removeIds);
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.mergeSelection', {
          count: sorted.length,
          start: formatTime(updated.startTime),
          end: formatTime(updated.endTime),
        }),
      });
    } catch (error) {
      if (rollbackUndo) {
        try {
          await rollbackUndo();
        } catch (rollbackError) {
          log.warn('Rollback after mergeSelectedUnits failure also failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          });
        }
      }
      const message = resolveUnitActionErrorDetail(locale, error);
      log.error('mergeSelectedUnits failed', {
        targetCount: sorted.length,
        error: message,
      });
      reportActionError({
        actionLabel: getUndoLabel(locale, 'mergeSelectedUnits'),
        error,
        i18nKey: 'transcription.error.action.mergeSelectionFailed',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
        fallbackMessage: formatRollbackFailureMessage(locale, 'mergeSelectedUnits', error),
      });
    }
  };

  return {
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
  };
}
