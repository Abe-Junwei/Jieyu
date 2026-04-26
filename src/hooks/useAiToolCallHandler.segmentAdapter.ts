import type { LayerUnitDocType } from '../db';
import { getDb } from '../db';
import { getTranscriptionAppService } from '../app/index';
import { t, tf } from '../i18n';
import { getAiToolSegmentExecutionToolNames } from '../ai/policy/aiToolPolicyMatrix';
import {
  captureAiCanonicalClusterRollbackSnapshot,
  getAiStructuralRollbackMaxSelectionIds,
  restoreAiCanonicalClusterRollbackSnapshot,
} from '../services/AiCanonicalClusterRollbackSnapshot';
import { reinsertLayerSegmentGraphSubset, snapshotLayerSegmentGraphBySegmentIds } from '../services/LayerSegmentGraphService';
import { mediaDurationSecForTimeBounds } from '../utils/timelineMediaDurationForBounds';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { normalizeRequestedIds } from './useAiToolCallHandler.helpers';
import type { AiSegmentSplitRollbackToken, ExecutionContext, ToolObjectAdapter } from './useAiToolCallHandler.types';

function segmentMergeBoundarySplitTime(leftEnd: number, rightStart: number): number {
  return Number(((leftEnd + rightStart) / 2).toFixed(3));
}

function resolveOrderedSegmentMergeSnapshot(
  ctx: Pick<ExecutionContext, 'units'>,
  requestedBatchIds: readonly string[],
): LayerUnitDocType[] | null {
  const idSet = new Set(requestedBatchIds);
  const rows = (ctx.units ?? []).filter((u) => idSet.has(u.id));
  if (rows.length !== requestedBatchIds.length) return null;
  if (!rows.every((u) => u.unitType === 'segment')) return null;
  return [...rows].sort((a, b) => a.startTime - b.startTime);
}

function buildSilentMergeSegmentRollback(
  ctx: Pick<ExecutionContext, 'silentSegmentGraphSyncForAi'>,
  sorted: LayerUnitDocType[],
): (() => Promise<void>) | undefined {
  if (sorted.length < 2) return undefined;
  const sync = ctx.silentSegmentGraphSyncForAi;
  if (!sync) return undefined;
  const survivorId = sorted[0]!.id;
  return async () => {
    const app = getTranscriptionAppService();
    for (let k = sorted.length - 1; k >= 1; k -= 1) {
      const prev = sorted[k - 1]!;
      const cur = sorted[k]!;
      const splitTime = segmentMergeBoundarySplitTime(prev.endTime, cur.startTime);
      await app.splitSegment(survivorId, splitTime);
      await sync();
    }
  };
}

async function buildSegmentDeleteGraphRollback(
  ctx: Pick<ExecutionContext, 'silentSegmentGraphSyncForAi'>,
  segmentIds: readonly string[],
): Promise<(() => Promise<void>) | undefined> {
  if (segmentIds.length === 0) return undefined;
  if (segmentIds.length > getAiStructuralRollbackMaxSelectionIds()) return undefined;
  const sync = ctx.silentSegmentGraphSyncForAi;
  if (!sync) return undefined;
  const db = await getDb();
  const snapshot = await snapshotLayerSegmentGraphBySegmentIds(db, segmentIds);
  if (snapshot.units.length !== segmentIds.length) return undefined;
  return async () => {
    const dbInst = await getDb();
    await reinsertLayerSegmentGraphSubset(dbInst, snapshot);
    await sync();
  };
}

async function buildSilentCanonicalMergeRollback(
  ctx: Pick<ExecutionContext, 'silentSegmentGraphSyncForAi'>,
  canonicalIds: readonly string[],
): Promise<(() => Promise<void>) | undefined> {
  const sync = ctx.silentSegmentGraphSyncForAi;
  if (!sync) return undefined;
  const db = await getDb();
  const snap = await captureAiCanonicalClusterRollbackSnapshot(db, canonicalIds);
  if (!snap) return undefined;
  return async () => {
    const dbInst = await getDb();
    await restoreAiCanonicalClusterRollbackSnapshot(dbInst, snap);
    await sync();
  };
}

/**
 * Partition timeline ids into standalone segment rows vs canonical hosts, snapshot both, restore canonical cluster first then segment-only graph.
 */
async function buildCombinedTimelineSelectionDeleteRollback(
  ctx: Pick<ExecutionContext, 'units' | 'silentSegmentGraphSyncForAi'>,
  timelineUnitIds: readonly string[],
): Promise<(() => Promise<void>) | undefined> {
  const sync = ctx.silentSegmentGraphSyncForAi;
  if (!sync) return undefined;
  if (timelineUnitIds.length > getAiStructuralRollbackMaxSelectionIds()) return undefined;
  const unitById = new Map((ctx.units ?? []).map((u) => [u.id, u] as const));

  const segmentLaneIds: string[] = [];
  const canonicalLaneIds: string[] = [];
  for (const id of timelineUnitIds) {
    const row = unitById.get(id);
    if (!row) {
      segmentLaneIds.push(id);
      continue;
    }
    if (row.unitType === 'segment') {
      segmentLaneIds.push(id);
    } else {
      canonicalLaneIds.push(id);
    }
  }

  const canonicalSet = new Set(canonicalLaneIds);
  const standaloneSegmentIds = segmentLaneIds.filter((sid) => {
    const parent = unitById.get(sid)?.parentUnitId?.trim();
    return !parent || !canonicalSet.has(parent);
  });

  const db = await getDb();
  const segmentRb = standaloneSegmentIds.length > 0
    ? await buildSegmentDeleteGraphRollback(ctx, standaloneSegmentIds)
    : undefined;
  const canonSnap = canonicalLaneIds.length > 0
    ? await captureAiCanonicalClusterRollbackSnapshot(db, canonicalLaneIds)
    : null;
  if (canonicalLaneIds.length > 0 && !canonSnap) return undefined;
  if (standaloneSegmentIds.length > 0 && !segmentRb) return undefined;
  if (!canonSnap && !segmentRb) return undefined;

  return async () => {
    if (canonSnap) {
      const dbInst = await getDb();
      await restoreAiCanonicalClusterRollbackSnapshot(dbInst, canonSnap);
    }
    if (segmentRb) {
      await segmentRb();
    }
    await sync();
  };
}

function isAiSegmentSplitRollbackToken(value: unknown): value is AiSegmentSplitRollbackToken {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.keepSegmentId === 'string'
    && typeof v.removeSegmentId === 'string'
    && v.keepSegmentId.length > 0
    && v.removeSegmentId.length > 0;
}

export const segmentAdapter: ToolObjectAdapter = {
  handles: getAiToolSegmentExecutionToolNames(),
  async execute(ctx) {
    const { call, locale } = ctx;

    if (call.name === 'create_transcription_segment') {
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0 && ctx.createTranscriptionSegment) {
        const targetSegment = ctx.resolveRequestedSegmentTarget();
        if (!targetSegment) {
          return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: requestedSegmentId }) };
        }
        const created = await ctx.createTranscriptionSegment(targetSegment.id);
        const newId = typeof created === 'string' && created.trim().length > 0 ? created.trim() : '';
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.createDone'),
          ...(newId
            ? {
                rollback: async () => {
                  await ctx.deleteUnit(newId);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.createMissingUnitId') };
      }
      const baseUnit = ctx.resolveRequestedUnit();
      if (!baseUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const cap = mediaDurationSecForTimeBounds(ctx.selectedUnitMedia);
      const mediaDuration = cap === Number.POSITIVE_INFINITY ? baseUnit.endTime + 2 : cap;
      const createdAdjacent = await ctx.createAdjacentUnit(baseUnit, mediaDuration);
      const adjacentId = typeof createdAdjacent === 'string' && createdAdjacent.trim().length > 0 ? createdAdjacent.trim() : '';
      return {
        ok: true,
        message: t(locale, 'transcription.aiTool.segment.createDone'),
        ...(adjacentId
          ? {
              rollback: async () => {
                await ctx.deleteUnit(adjacentId);
              },
            }
          : {}),
      };
    }

    if (call.name === 'split_transcription_segment') {
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0 && ctx.splitTranscriptionSegment) {
        const targetSegment = ctx.resolveRequestedSegmentTarget();
        if (!targetSegment) {
          return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: requestedSegmentId }) };
        }
        const start = Number(targetSegment.startTime);
        const end = Number(targetSegment.endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitInvalidRange') };
        }
        const providedSplitTime = call.arguments.splitTime;
        if (typeof providedSplitTime !== 'number' || !Number.isFinite(providedSplitTime)) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingTime') };
        }
        const splitTime = providedSplitTime;
        const minSpan = 0.05;
        if (splitTime <= start + minSpan || splitTime >= end - minSpan) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.splitOutOfRange', {
              minTime: (start + minSpan).toFixed(2),
              maxTime: (end - minSpan).toFixed(2),
            }),
          };
        }
        const splitHint = await ctx.splitTranscriptionSegment(targetSegment.id, splitTime);
        const token = isAiSegmentSplitRollbackToken(splitHint) ? splitHint : null;
        const mergeRollback = ctx.mergeAdjacentSegmentsForAiRollback;
        const rollback = token && mergeRollback
          ? async () => {
              await mergeRollback(token.keepSegmentId, token.removeSegmentId);
            }
          : undefined;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.splitDone', { splitTime: splitTime.toFixed(2) }),
          ...(rollback ? { rollback } : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const start = Number(targetUnit.startTime);
      const end = Number(targetUnit.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitInvalidRange') };
      }
      const providedSplitTime = call.arguments.splitTime;
      if (typeof providedSplitTime !== 'number' || !Number.isFinite(providedSplitTime)) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingTime') };
      }
      const splitTime = providedSplitTime;
      const minSpan = 0.05;
      if (splitTime <= start + minSpan || splitTime >= end - minSpan) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.splitOutOfRange', {
            minTime: (start + minSpan).toFixed(2),
            maxTime: (end - minSpan).toFixed(2),
          }),
        };
      }
      await ctx.splitUnit(targetUnit.id, splitTime);
      return { ok: true, message: tf(locale, 'transcription.aiTool.segment.splitDone', { splitTime: splitTime.toFixed(2) }) };
    }

    if (call.name === 'merge_transcription_segments') {
      const requestedSegmentIds = normalizeRequestedIds(call.arguments.segmentIds);
      if (requestedSegmentIds.length < 2) {
        return { ok: false, message: t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo') };
      }
      const requestedBatchIds = Array.from(new Set(requestedSegmentIds));
      const maxStructuralTargets = getAiStructuralRollbackMaxSelectionIds();
      if (requestedBatchIds.length > maxStructuralTargets) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.structuralRollbackTooManyTargets', {
            count: requestedBatchIds.length,
            max: maxStructuralTargets,
          }),
        };
      }
      const mergeExecutor = ctx.mergeSelectedSegments ?? ctx.mergeSelectedUnits;
      if (!mergeExecutor) {
        return { ok: false, message: t(locale, 'transcription.aiTool.voice.actionUnsupported') };
      }
      const mergeSnapshot = resolveOrderedSegmentMergeSnapshot(ctx, requestedBatchIds);
      const mergeRollback = mergeSnapshot
        ? buildSilentMergeSegmentRollback(ctx, mergeSnapshot)
        : await buildSilentCanonicalMergeRollback(ctx, requestedBatchIds);
      if (!mergeRollback) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
        };
      }
      try {
        await mergeExecutor(new Set(requestedBatchIds));
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.mergeSelectionDone', { count: requestedBatchIds.length }),
          rollback: mergeRollback,
        };
      } catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error);
        return { ok: false, message };
      }
    }

    if (call.name === 'delete_transcription_segment') {
      const requestedSegmentIds = normalizeRequestedIds(call.arguments.segmentIds);
      const requestedBatchIds = Array.from(new Set(requestedSegmentIds));
      if (requestedBatchIds.length > 0) {
        const maxStructuralTargets = getAiStructuralRollbackMaxSelectionIds();
        if (requestedBatchIds.length > maxStructuralTargets) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.structuralRollbackTooManyTargets', {
              count: requestedBatchIds.length,
              max: maxStructuralTargets,
            }),
          };
        }
        const deleteRollback = await buildCombinedTimelineSelectionDeleteRollback(ctx, requestedBatchIds)
          ?? await buildSegmentDeleteGraphRollback(ctx, requestedBatchIds);
        if (!deleteRollback) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
          };
        }
        const deleteBatch = ctx.deleteSelectedUnits;
        if (deleteBatch) {
          await deleteBatch(new Set(requestedBatchIds));
        } else {
          for (const targetId of requestedBatchIds) {
            await ctx.deleteUnit(targetId);
          }
        }
        return {
          ok: true,
          message: tf(locale, 'transcription.unitAction.done.deleteSelection', { count: requestedBatchIds.length }),
          rollback: deleteRollback,
        };
      }

      if (call.arguments.allSegments === true) {
        const allIds = ctx.units.map((unit) => unit.id);
        if (allIds.length === 0) {
          return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentEmpty') };
        }
        const maxStructuralTargets = getAiStructuralRollbackMaxSelectionIds();
        if (allIds.length > maxStructuralTargets) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.structuralRollbackTooManyTargets', {
              count: allIds.length,
              max: maxStructuralTargets,
            }),
          };
        }
        const deleteRollbackAll = await buildCombinedTimelineSelectionDeleteRollback(ctx, allIds);
        if (!deleteRollbackAll) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
          };
        }
        const deleteBatchAll = ctx.deleteSelectedUnits;
        if (deleteBatchAll) {
          await deleteBatchAll(new Set(allIds));
        } else {
          for (const targetId of allIds) {
            await ctx.deleteUnit(targetId);
          }
        }
        return {
          ok: true,
          message: tf(locale, 'transcription.unitAction.done.deleteSelection', { count: allIds.length }),
          rollback: deleteRollbackAll,
        };
      }

      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        const singleRollback = await buildCombinedTimelineSelectionDeleteRollback(ctx, [requestedSegmentId])
          ?? await buildSegmentDeleteGraphRollback(ctx, [requestedSegmentId]);
        if (!singleRollback) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
          };
        }
        await ctx.deleteUnit(requestedSegmentId);
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.deleteDone'),
          rollback: singleRollback,
        };
      }

      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.deleteMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const unitDeleteRollback = targetUnit.unitType === 'segment'
        ? await buildSegmentDeleteGraphRollback(ctx, [targetUnit.id])
        : await buildCombinedTimelineSelectionDeleteRollback(ctx, [targetUnit.id]);
      if (!unitDeleteRollback) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
        };
      }
      await ctx.deleteUnit(targetUnit.id);
      return {
        ok: true,
        message: t(locale, 'transcription.aiTool.segment.deleteDone'),
        rollback: unitDeleteRollback,
      };
    }

    if (call.name === 'set_transcription_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingText') };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        const targetLayerId = ctx.transcriptionLayers.some((layer) => layer.id === ctx.selectedLayerId)
          ? ctx.selectedLayerId
          : (ctx.transcriptionLayers.length === 1 ? ctx.transcriptionLayers[0]!.id : '');
        if (!targetLayerId || !ctx.saveSegmentContentForLayer) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUnitId') };
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, transformedText);
        const save = ctx.saveSegmentContentForLayer;
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone'),
          ...(ctx.readSegmentLayerText && save
            ? {
                rollback: async () => {
                  await save(requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const targetLayerId = ctx.transcriptionLayers.some((layer) => layer.id === ctx.selectedLayerId)
        ? ctx.selectedLayerId
        : undefined;
      const previous = ctx.readUnitLayerText?.(targetUnit.id, targetLayerId) ?? '';
      const transformedText = ctx.bridgeTextForLayerWrite
        ? await ctx.bridgeTextForLayerWrite({
            text,
            ...(targetLayerId !== undefined ? { targetLayerId } : {}),
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveUnitText(targetUnit.id, transformedText, targetLayerId);
      return {
        ok: true,
        message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone'),
        ...(ctx.readUnitLayerText
          ? {
              rollback: async () => {
                await ctx.saveUnitText(targetUnit.id, previous, targetLayerId);
              },
            }
          : {}),
      };
    }

    if (call.name === 'set_translation_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingText') };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingLayerId') };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: requestedLayerId }) };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        if (!ctx.saveSegmentContentForLayer) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUnitId') };
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, transformedText);
        const save = ctx.saveSegmentContentForLayer;
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.setTranslationDone'),
          ...(ctx.readSegmentLayerText && save
            ? {
                rollback: async () => {
                  await save(requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const previous = ctx.readUnitLayerText?.(targetUnit.id, targetLayerId) ?? '';
      const transformedText = ctx.bridgeTextForLayerWrite
        ? await ctx.bridgeTextForLayerWrite({
            text,
            targetLayerId,
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveUnitLayerText(targetUnit.id, transformedText, targetLayerId);
      return {
        ok: true,
        message: t(locale, 'transcription.aiTool.segment.setTranslationDone'),
        ...(ctx.readUnitLayerText
          ? {
              rollback: async () => {
                await ctx.saveUnitLayerText(targetUnit.id, previous, targetLayerId);
              },
            }
          : {}),
      };
    }

    if (call.name === 'clear_translation_segment') {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingLayerId') };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: requestedLayerId }) };
      }
      const targetLayer = ctx.translationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: targetLayerId }) };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        if (!ctx.saveSegmentContentForLayer) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUnitId') };
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, '');
        const save = ctx.saveSegmentContentForLayer;
        const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
            segmentId: requestedSegmentId,
            layerLabel,
          }),
          ...(ctx.readSegmentLayerText && save
            ? {
                rollback: async () => {
                  await save(requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const previous = ctx.readUnitLayerText?.(targetUnit.id, targetLayerId) ?? '';
      await ctx.saveUnitLayerText(targetUnit.id, '', targetLayerId);
      const saveLayer = ctx.saveUnitLayerText;
      const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
          segmentId: targetUnit.id,
          layerLabel,
        }),
        ...(ctx.readUnitLayerText && saveLayer
          ? {
              rollback: async () => {
                await saveLayer(targetUnit.id, previous, targetLayerId);
              },
            }
          : {}),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.segment.unsupportedTool', { toolName: call.name }) };
  },
};
