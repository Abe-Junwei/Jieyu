import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getDb } from '../db';
import type { AnchorDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { newId, formatTime } from '../utils/transcriptionFormatters';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import type { SaveState } from './transcriptionTypes';
import { formatRollbackFailureMessage, getUndoLabel, resolveUnitActionErrorDetail } from './useTranscriptionUnitActions.helpers';
import type { Locale } from '../i18n';
import { t, tf } from '../i18n';
import { createLogger } from '../observability/logger';
import { syncUnitTextToSegmentationV2 } from '../services/LayerSegmentationTextService';
import { mergeUnitSelfCertaintyConservative } from '../utils/unitSelfCertainty';

const log = createLogger('useTranscriptionUnitActions');

type BatchActionsInput = {
  allowOverlapInTranscription: boolean;
  locale: Locale;
  translations: LayerUnitContentDocType[];
  unitsOnCurrentMediaRef: MutableRefObject<LayerUnitDocType[]>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUnitIds: Set<string>) => Promise<void>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  reassignTranslations: (
    survivorId: string,
    removedId: string,
    db: Awaited<ReturnType<typeof getDb>>,
    now: string,
  ) => Promise<{ newTranslations: LayerUnitContentDocType[]; updatedTranslations: LayerUnitContentDocType[] }>;
  selectUnitPrimary: (id: string) => void;
  setSaveState: (s: SaveState) => void;
  setTranslations: Dispatch<SetStateAction<LayerUnitContentDocType[]>>;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  setUnitDrafts: Dispatch<SetStateAction<Record<string, string>>>;
};

export function createTranscriptionUnitBatchActions(input: BatchActionsInput) {
  const {
    allowOverlapInTranscription,
    locale,
    translations,
    unitsOnCurrentMediaRef,
    pushUndo,
    rollbackUndo,
    createAnchor,
    updateAnchorTime,
    pruneOrphanAnchors,
    getUnitTextForLayer,
    reassignTranslations,
    selectUnitPrimary,
    setSaveState,
    setTranslations,
    setUnits,
    setUnitDrafts,
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
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      const timeline = unitsOnCurrentMediaRef.current
        .map((u) => {
          const next = transformed.get(u.id);
          return next ? { ...u, ...next } : u;
        })
        .sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
          reportValidationError({
            message: t(locale, 'transcription.error.validation.offsetOverlap'),
            i18nKey: 'transcription.error.validation.offsetOverlap',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
      }
    }

    pushUndo(getUndoLabel(locale, 'offsetSelectedTimes'));
    try {
      const db = await getDb();
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
      await LinguisticService.saveUnitsBatch(updatedRows);

      await Promise.all(updatedRows.map(async (u) => {
        if (u.startAnchorId) await updateAnchorTime(db, u.startAnchorId, u.startTime);
        if (u.endAnchorId) await updateAnchorTime(db, u.endAnchorId, u.endTime);
      }));

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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const pivot = Number.isFinite(anchorTime ?? NaN)
      ? Number(anchorTime)
      : targets[0]!.startTime;
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
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
        return;
      }
      transformed.set(u.id, { startTime, endTime });
    }

    if (!allowOverlapInTranscription) {
      const timeline = unitsOnCurrentMediaRef.current
        .map((u) => {
          const next = transformed.get(u.id);
          return next ? { ...u, ...next } : u;
        })
        .sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < timeline.length; i++) {
        if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
          reportValidationError({
            message: t(locale, 'transcription.error.validation.scaleOverlap'),
            i18nKey: 'transcription.error.validation.scaleOverlap',
            setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          });
          return;
        }
      }
    }

    pushUndo(getUndoLabel(locale, 'scaleSelectedTimes'));
    try {
      const db = await getDb();
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
      await LinguisticService.saveUnitsBatch(updatedRows);

      await Promise.all(updatedRows.map(async (u) => {
        if (u.startAnchorId) await updateAnchorTime(db, u.startAnchorId, u.startTime);
        if (u.endAnchorId) await updateAnchorTime(db, u.endAnchorId, u.endTime);
      }));

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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const normalizedFlags = [...new Set(`${flags}g`.split(''))].join('');
    let splitter: RegExp;
    try {
      splitter = new RegExp(rawPattern, normalizedFlags);
    } catch (err) {
      console.error('[Jieyu] useTranscriptionUnitActions: regex compilation failed', { rawPattern, flags, err });
      reportValidationError({
        message: t(locale, 'transcription.error.validation.regexPatternInvalid'),
        i18nKey: 'transcription.error.validation.regexPatternInvalid',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targets = unitsOnCurrentMediaRef.current
      .filter((u) => ids.has(u.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;

    const minSpan = 0.05;
    const db = await getDb();
    const now = new Date().toISOString();
    const updates: LayerUnitDocType[] = [];
    const inserts: LayerUnitDocType[] = [];
    const copiedTranslations: LayerUnitContentDocType[] = [];
    const nextDraftEntries: Record<string, string> = {};

    for (const target of targets) {
      if (!target.mediaId) continue;

      const fullText = (getUnitTextForLayer(target) || '').trim();
      if (!fullText) continue;
      const segments = fullText
        .split(splitter)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (segments.length < 2) continue;

      const totalChars = Math.max(1, segments.reduce((sum, part) => sum + part.length, 0));
      const duration = target.endTime - target.startTime;
      const bounds: Array<{ start: number; end: number }> = [];
      let cursor = target.startTime;
      for (let i = 0; i < segments.length; i++) {
        if (i === segments.length - 1) {
          bounds.push({ start: cursor, end: target.endTime });
          break;
        }
        const ratio = segments[i]!.length / totalChars;
        const segDuration = Math.max(minSpan, Number((duration * ratio).toFixed(3)));
        const next = Number((cursor + segDuration).toFixed(3));
        bounds.push({ start: cursor, end: next });
        cursor = next;
      }

      if (bounds.some((item) => item.end - item.start < minSpan)) {
        continue;
      }

      const first = bounds[0]!;
      const preservedSelfCertainty = target.selfCertainty;
      const updatedFirst: LayerUnitDocType = {
        ...target,
        startTime: Number(first.start.toFixed(3)),
        endTime: Number(first.end.toFixed(3)),
        updatedAt: now,
      } as LayerUnitDocType;
      if (preservedSelfCertainty === undefined) {
        delete updatedFirst.selfCertainty;
      } else {
        updatedFirst.selfCertainty = preservedSelfCertainty;
      }
      updates.push(updatedFirst);
      nextDraftEntries[target.id] = segments[0]!;

      let prevEndAnchorId = updatedFirst.endAnchorId;
      for (let i = 1; i < bounds.length; i++) {
        const bound = bounds[i]!;
        const id = newId('utt');
        const startAnchorId = prevEndAnchorId;
        let endAnchorId = target.endAnchorId;
        if (i < bounds.length - 1) {
          const splitAnchor = await createAnchor(db, target.mediaId, Number(bound.end.toFixed(3)));
          endAnchorId = splitAnchor.id;
          prevEndAnchorId = splitAnchor.id;
        }
        const nextUnit: LayerUnitDocType = {
          ...target,
          id,
          startTime: Number(bound.start.toFixed(3)),
          endTime: Number(bound.end.toFixed(3)),
          startAnchorId,
          endAnchorId,
          annotationStatus: 'raw',
          createdAt: now,
          updatedAt: now,
        } as LayerUnitDocType;
        if (preservedSelfCertainty === undefined) {
          delete nextUnit.selfCertainty;
        } else {
          nextUnit.selfCertainty = preservedSelfCertainty;
        }
        inserts.push(nextUnit);
        nextDraftEntries[id] = segments[i]!;

        const origTranslations = translations.filter((t) => t.unitId === target.id);
        for (const ot of origTranslations) {
          const copy: LayerUnitContentDocType = {
            ...ot,
            id: newId('utr'),
            unitId: id,
            createdAt: now,
            updatedAt: now,
          } as LayerUnitContentDocType;
          await syncUnitTextToSegmentationV2(db, nextUnit, copy);
          copiedTranslations.push(copy);
        }
      }
    }

    if (updates.length === 0 && inserts.length === 0) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.regexNoSplitCandidates'),
        i18nKey: 'transcription.error.validation.regexNoSplitCandidates',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'splitByRegex'));
    try {
      await LinguisticService.saveUnitsBatch([...updates, ...inserts]);
      const updateMap = new Map(updates.map((u) => [u.id, u]));
      setUnits((prev) => [
        ...prev.map((u) => updateMap.get(u.id) ?? u),
        ...inserts,
      ]);
      setTranslations((prev) => [...prev, ...copiedTranslations]);
      setUnitDrafts((prev) => ({ ...prev, ...nextDraftEntries }));
      if (inserts.length > 0) {
        selectUnitPrimary(inserts[0]!.id);
      }
      setSaveState({
        kind: 'done',
        message: tf(locale, 'transcription.unitAction.done.regexSplitSelection', {
          count: updates.length + inserts.length,
        }),
      });
    } catch (error) {
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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    pushUndo(getUndoLabel(locale, 'mergeSelectedUnits'));
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const mergedCertainty = mergeUnitSelfCertaintyConservative(sorted.map((u) => u.selfCertainty));

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
      await LinguisticService.saveUnit(updated);

      const toRemove = sorted.slice(1);
      let allNewTranslations: LayerUnitContentDocType[] = [];
      let allUpdatedTranslations: LayerUnitContentDocType[] = [];
      for (const u of toRemove) {
        const { newTranslations, updatedTranslations } = await reassignTranslations(first.id, u.id, db, now);
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

      await pruneOrphanAnchors(db, removeIds);
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
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
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
