import type { LayerUnitDocType } from '../../db/types';
import {
  captureCanonicalClusterRollback,
  readSegmentLayerStoredText,
  reinsertSegmentGraphForRollback,
  restoreCanonicalClusterRollback,
  snapshotSegmentGraphForRollback,
} from '../../db/storagePortChatSegments';
import {
  createdUnitId,
  presentUnitCount,
  splitBoundaryLanded,
  unitIdsForText,
  unitPresence,
  unitTextId,
} from './aiWriteReadback';
import { getTranscriptionAppService } from '../../app/TranscriptionAppService';
import { t, tf } from '../../i18n';
import { getAiToolSegmentExecutionToolNames } from '../../ai/policy/aiToolPolicyMatrix';
import { getAiStructuralRollbackMaxSelectionIds } from '../../services/AiCanonicalClusterRollbackSnapshot';
import { mediaDurationSecForTimeBounds } from '../../utils/timelineMediaDurationForBounds';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import { normalizeRequestedIds } from './useAiToolCallHandler.helpers';
import type {
  AiSegmentSplitRollbackToken,
  ExecutionContext,
  ToolObjectAdapter,
} from './useAiToolCallHandler.types';

/**
 * 第 5 批：按语段写文本后读库核对。语段不在工作台（例如属于另一份文稿）时保存会静默跳过，
 * 这时不能回报“完成”。读不了库（没有 IndexedDB 的环境）时返回 undefined，不拦。
 * Batch 5: after a per-segment text write, read the stored text back. The save silently skips a segment
 * that is not in the workspace (e.g. another document's), and the tool must not report success then.
 * Returns undefined when the database cannot be read (no IndexedDB), which does not block.
 */
async function segmentLayerTextLanded(
  segmentId: string,
  layerId: string,
  expected: string,
): Promise<boolean | undefined> {
  try {
    const stored = await readSegmentLayerStoredText(segmentId, layerId);
    return stored === expected.trim();
  } catch {
    return undefined;
  }
}

function segmentNotWritten(locale: Parameters<typeof tf>[0], segmentId: string) {
  return {
    ok: false as const,
    message: tf(locale, 'transcription.aiTool.segment.segmentNotWritten', { segmentId }),
  };
}

type SegmentLayerSave = (segmentId: string, layerId: string, text: string) => Promise<unknown>;

async function deleteUnitsObserved(
  ctx: Pick<ExecutionContext, 'deleteSelectedUnits' | 'deleteUnit'>,
  ids: readonly string[],
  locale: Parameters<typeof tf>[0],
  rollback: () => Promise<void>,
  batch: boolean,
) {
  const doneMessage = batch
    ? tf(locale, 'transcription.unitAction.done.deleteSelection', { count: ids.length })
    : t(locale, 'transcription.aiTool.segment.deleteDone');
  let thrown: unknown;
  try {
    if (ctx.deleteSelectedUnits) {
      await ctx.deleteSelectedUnits(new Set(ids));
    } else {
      for (const id of ids) await ctx.deleteUnit(id);
    }
  } catch (error) {
    thrown = error;
  }
  if (!thrown) {
    return {
      ok: true as const,
      message: doneMessage,
      rollback,
    };
  }
  const presence = await unitPresence(ids);
  if (presence === 'all-absent') {
    return {
      ok: true as const,
      message: doneMessage,
      rollback,
    };
  }
  if (presence === 'all-present') {
    return {
      ok: false as const,
      message: tf(locale, 'transcription.aiTool.segment.deleteNotWritten', {
        segmentId: ids.join('、'),
      }),
    };
  }
  throw thrown;
}

async function createUnitObserved(
  anchorUnitId: string,
  create: () => Promise<unknown>,
): Promise<string | null | undefined> {
  const textId = await unitTextId(anchorUnitId);
  const before = textId ? await unitIdsForText(textId) : undefined;
  try {
    const created = await create();
    return typeof created === 'string' && created.trim().length > 0 ? created.trim() : '';
  } catch (error) {
    const landed = await createdUnitId(textId, before);
    if (typeof landed === 'string') return landed;
    if (landed === null) return null;
    throw error;
  }
}

/** 保存抛错后再读库：行已是目标文本则提交已落地，行仍是旧值则未写入，库读不了则把原错误抛回去。 */
async function commitSegmentLayerText(
  save: SegmentLayerSave,
  segmentId: string,
  layerId: string,
  text: string,
): Promise<'landed' | 'absent'> {
  try {
    await save(segmentId, layerId, text);
  } catch (error) {
    const landed = await segmentLayerTextLanded(segmentId, layerId, text);
    if (landed === true) return 'landed';
    if (landed === false) return 'absent';
    throw error;
  }
  if ((await segmentLayerTextLanded(segmentId, layerId, text)) === false) return 'absent';
  return 'landed';
}

async function restoreSegmentLayerText(
  save: SegmentLayerSave,
  segmentId: string,
  layerId: string,
  previous: string,
): Promise<void> {
  await save(segmentId, layerId, previous);
  if ((await segmentLayerTextLanded(segmentId, layerId, previous)) !== true) {
    throw new Error('rollback readback mismatch');
  }
}

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
  const snapshot = await snapshotSegmentGraphForRollback(segmentIds);
  if (snapshot.units.length !== segmentIds.length) return undefined;
  return async () => {
    await reinsertSegmentGraphForRollback(snapshot);
    await sync();
  };
}

async function buildSilentCanonicalMergeRollback(
  ctx: Pick<ExecutionContext, 'silentSegmentGraphSyncForAi'>,
  canonicalIds: readonly string[],
): Promise<(() => Promise<void>) | undefined> {
  const sync = ctx.silentSegmentGraphSyncForAi;
  if (!sync) return undefined;
  const snap = await captureCanonicalClusterRollback(canonicalIds);
  if (!snap) return undefined;
  return async () => {
    await restoreCanonicalClusterRollback(snap);
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

  const segmentRb =
    standaloneSegmentIds.length > 0
      ? await buildSegmentDeleteGraphRollback(ctx, standaloneSegmentIds)
      : undefined;
  const canonSnap =
    canonicalLaneIds.length > 0 ? await captureCanonicalClusterRollback(canonicalLaneIds) : null;
  if (canonicalLaneIds.length > 0 && !canonSnap) return undefined;
  if (standaloneSegmentIds.length > 0 && !segmentRb) return undefined;
  if (!canonSnap && !segmentRb) return undefined;

  return async () => {
    if (canonSnap) {
      await restoreCanonicalClusterRollback(canonSnap);
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
  return (
    typeof v.keepSegmentId === 'string' &&
    typeof v.removeSegmentId === 'string' &&
    v.keepSegmentId.length > 0 &&
    v.removeSegmentId.length > 0
  );
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
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
              segmentId: requestedSegmentId,
            }),
          };
        }
        const newId = await createUnitObserved(targetSegment.id, () =>
          ctx.createTranscriptionSegment!(targetSegment.id),
        );
        if (newId === null) {
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.createNotWritten') };
        }
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
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.createMissingUnitId'),
        };
      }
      const baseUnit = ctx.resolveRequestedUnit();
      if (!baseUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
      }
      const cap = mediaDurationSecForTimeBounds(ctx.selectedUnitMedia);
      const mediaDuration = cap === Number.POSITIVE_INFINITY ? baseUnit.endTime + 2 : cap;
      const adjacentId = await createUnitObserved(baseUnit.id, () =>
        ctx.createAdjacentUnit(baseUnit, mediaDuration),
      );
      if (adjacentId === null) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.createNotWritten') };
      }
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
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
              segmentId: requestedSegmentId,
            }),
          };
        }
        const start = Number(targetSegment.startTime);
        const end = Number(targetSegment.endTime);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.splitInvalidRange'),
          };
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
        let splitHint: unknown;
        try {
          splitHint = await ctx.splitTranscriptionSegment(targetSegment.id, splitTime);
        } catch (error) {
          const landed = await splitBoundaryLanded(targetSegment.id, splitTime, end);
          if (landed === true) {
            return {
              ok: true,
              message: tf(locale, 'transcription.aiTool.segment.splitDone', {
                splitTime: splitTime.toFixed(2),
              }),
            };
          }
          if (landed === false) {
            return {
              ok: false,
              message: tf(locale, 'transcription.aiTool.segment.splitNotWritten', {
                segmentId: targetSegment.id,
              }),
            };
          }
          throw error;
        }
        const token = isAiSegmentSplitRollbackToken(splitHint) ? splitHint : null;
        const mergeRollback = ctx.mergeAdjacentSegmentsForAiRollback;
        const rollback =
          token && mergeRollback
            ? async () => {
                await mergeRollback(token.keepSegmentId, token.removeSegmentId);
              }
            : undefined;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.splitDone', {
            splitTime: splitTime.toFixed(2),
          }),
          ...(rollback ? { rollback } : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
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
      try {
        await ctx.splitUnit(targetUnit.id, splitTime);
      } catch (error) {
        const landed = await splitBoundaryLanded(targetUnit.id, splitTime, end);
        if (landed === true) {
          return {
            ok: true,
            message: tf(locale, 'transcription.aiTool.segment.splitDone', {
              splitTime: splitTime.toFixed(2),
            }),
          };
        }
        if (landed === false) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.segment.splitNotWritten', {
              segmentId: targetUnit.id,
            }),
          };
        }
        throw error;
      }
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.segment.splitDone', {
          splitTime: splitTime.toFixed(2),
        }),
      };
    }

    if (call.name === 'merge_transcription_segments') {
      const requestedSegmentIds = normalizeRequestedIds(call.arguments.segmentIds);
      if (requestedSegmentIds.length < 2) {
        return {
          ok: false,
          message: t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo'),
        };
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
          message: tf(locale, 'transcription.aiTool.segment.mergeSelectionDone', {
            count: requestedBatchIds.length,
          }),
          rollback: mergeRollback,
        };
      } catch (error) {
        const present = await presentUnitCount(requestedBatchIds);
        if (present === 1) {
          return {
            ok: true,
            message: tf(locale, 'transcription.aiTool.segment.mergeSelectionDone', {
              count: requestedBatchIds.length,
            }),
            rollback: mergeRollback,
          };
        }
        if (present === requestedBatchIds.length) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error);
          return { ok: false, message };
        }
        throw error;
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
        const deleteRollback =
          (await buildCombinedTimelineSelectionDeleteRollback(ctx, requestedBatchIds)) ??
          (await buildSegmentDeleteGraphRollback(ctx, requestedBatchIds));
        if (!deleteRollback) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
          };
        }
        return deleteUnitsObserved(ctx, requestedBatchIds, locale, deleteRollback, true);
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
        return deleteUnitsObserved(ctx, allIds, locale, deleteRollbackAll, true);
      }

      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        const singleRollback =
          (await buildCombinedTimelineSelectionDeleteRollback(ctx, [requestedSegmentId])) ??
          (await buildSegmentDeleteGraphRollback(ctx, [requestedSegmentId]));
        if (!singleRollback) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
          };
        }
        return deleteUnitsObserved(ctx, [requestedSegmentId], locale, singleRollback, false);
      }

      if (!ctx.hasRequestedUnitTarget()) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.deleteMissingUnitId'),
        };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
      }
      const unitDeleteRollback =
        targetUnit.unitType === 'segment'
          ? await buildSegmentDeleteGraphRollback(ctx, [targetUnit.id])
          : await buildCombinedTimelineSelectionDeleteRollback(ctx, [targetUnit.id]);
      if (!unitDeleteRollback) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.cannotCaptureStructuredRollback'),
        };
      }
      return deleteUnitsObserved(ctx, [targetUnit.id], locale, unitDeleteRollback, false);
    }

    if (call.name === 'set_transcription_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingText'),
        };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        const targetLayerId = ctx.transcriptionLayers.some(
          (layer) => layer.id === ctx.selectedLayerId,
        )
          ? ctx.selectedLayerId
          : ctx.transcriptionLayers.length === 1
            ? ctx.transcriptionLayers[0]!.id
            : '';
        if (!targetLayerId || !ctx.saveSegmentContentForLayer) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUnitId'),
          };
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        const save = ctx.saveSegmentContentForLayer;
        if (
          (await commitSegmentLayerText(
            save,
            requestedSegmentId,
            targetLayerId,
            transformedText,
          )) === 'absent'
        ) {
          return segmentNotWritten(locale, requestedSegmentId);
        }
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone'),
          ...(ctx.readSegmentLayerText
            ? {
                rollback: async () => {
                  await restoreSegmentLayerText(save, requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUnitId'),
        };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
      }
      const targetLayerId = ctx.transcriptionLayers.some(
        (layer) => layer.id === ctx.selectedLayerId,
      )
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
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.setTranslationMissingText'),
        };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.setTranslationMissingLayerId'),
        };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', {
            layerId: requestedLayerId,
          }),
        };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        if (!ctx.saveSegmentContentForLayer) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUnitId'),
          };
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        const save = ctx.saveSegmentContentForLayer;
        if (
          (await commitSegmentLayerText(
            save,
            requestedSegmentId,
            targetLayerId,
            transformedText,
          )) === 'absent'
        ) {
          return segmentNotWritten(locale, requestedSegmentId);
        }
        return {
          ok: true,
          message: t(locale, 'transcription.aiTool.segment.setTranslationDone'),
          ...(ctx.readSegmentLayerText
            ? {
                rollback: async () => {
                  await restoreSegmentLayerText(save, requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUnitId'),
        };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
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
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingLayerId'),
        };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', {
            layerId: requestedLayerId,
          }),
        };
      }
      const targetLayer = ctx.translationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', {
            layerId: targetLayerId,
          }),
        };
      }
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        if (!ctx.saveSegmentContentForLayer) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUnitId'),
          };
        }
        // 清空写空串时读回仍是空，segmentLayerTextLanded 挡不住「语段不在当前工作台」的假成功。
        // Clearing writes ''; an absent segment still reads back '', so membership must be checked first.
        if (!(ctx.units ?? []).some((unit) => unit.id === requestedSegmentId)) {
          return segmentNotWritten(locale, requestedSegmentId);
        }
        const previous = ctx.readSegmentLayerText?.(requestedSegmentId, targetLayerId) ?? '';
        const save = ctx.saveSegmentContentForLayer;
        if (
          (await commitSegmentLayerText(save, requestedSegmentId, targetLayerId, '')) === 'absent'
        ) {
          return segmentNotWritten(locale, requestedSegmentId);
        }
        const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
            segmentId: requestedSegmentId,
            layerLabel,
          }),
          ...(ctx.readSegmentLayerText
            ? {
                rollback: async () => {
                  await restoreSegmentLayerText(save, requestedSegmentId, targetLayerId, previous);
                },
              }
            : {}),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUnitId'),
        };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
            segmentId: ctx.describeRequestedUnitTarget(),
          }),
        };
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

    return {
      ok: false,
      message: tf(locale, 'transcription.aiTool.segment.unsupportedTool', { toolName: call.name }),
    };
  },
};
