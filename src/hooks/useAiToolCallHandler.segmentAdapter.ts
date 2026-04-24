import { t, tf } from '../i18n';
import { mediaDurationSecForTimeBounds } from '../utils/timelineMediaDurationForBounds';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { normalizeRequestedIds } from './useAiToolCallHandler.helpers';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

export const segmentAdapter: ToolObjectAdapter = {
  handles: [
    'create_transcription_segment',
    'split_transcription_segment',
    'merge_transcription_segments',
    'delete_transcription_segment',
    'set_transcription_text',
    'set_translation_text',
    'clear_translation_segment',
  ],
  async execute(ctx) {
    const { call, locale } = ctx;

    if (call.name === 'create_transcription_segment') {
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0 && ctx.createTranscriptionSegment) {
        const targetSegment = ctx.resolveRequestedSegmentTarget();
        if (!targetSegment) {
          return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: requestedSegmentId }) };
        }
        await ctx.createTranscriptionSegment(targetSegment.id);
        return { ok: true, message: t(locale, 'transcription.aiTool.segment.createDone') };
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
      await ctx.createAdjacentUnit(baseUnit, mediaDuration);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.createDone') };
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
        await ctx.splitTranscriptionSegment(targetSegment.id, splitTime);
        return { ok: true, message: tf(locale, 'transcription.aiTool.segment.splitDone', { splitTime: splitTime.toFixed(2) }) };
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
      const mergeExecutor = ctx.mergeSelectedSegments ?? ctx.mergeSelectedUnits ?? ctx.mergeSelectedUnits;
      if (!mergeExecutor) {
        return { ok: false, message: t(locale, 'transcription.aiTool.voice.actionUnsupported') };
      }
      try {
        await mergeExecutor(new Set(requestedBatchIds));
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.mergeSelectionDone', { count: requestedBatchIds.length }),
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
        const deleteBatch = ctx.deleteSelectedUnits ?? ctx.deleteSelectedUnits;
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
        };
      }

      if (call.arguments.allSegments === true) {
        const allIds = ctx.units.map((unit) => unit.id);
        if (allIds.length === 0) {
          return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentEmpty') };
        }
        const deleteBatchAll = ctx.deleteSelectedUnits ?? ctx.deleteSelectedUnits;
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
        };
      }

      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        await ctx.deleteUnit(requestedSegmentId);
        return { ok: true, message: t(locale, 'transcription.aiTool.segment.deleteDone') };
      }

      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.deleteMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      await ctx.deleteUnit(targetUnit.id);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.deleteDone') };
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
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, transformedText);
        return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone') };
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
      const transformedText = ctx.bridgeTextForLayerWrite
        ? await ctx.bridgeTextForLayerWrite({
            text,
            ...(targetLayerId !== undefined ? { targetLayerId } : {}),
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveUnitText(targetUnit.id, transformedText, targetLayerId);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone') };
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
        const transformedText = ctx.bridgeTextForLayerWrite
          ? await ctx.bridgeTextForLayerWrite({
              text,
              targetLayerId,
              selectedLayerId: ctx.selectedLayerId,
            })
          : text;
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, transformedText);
        return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranslationDone') };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      const transformedText = ctx.bridgeTextForLayerWrite
        ? await ctx.bridgeTextForLayerWrite({
            text,
            targetLayerId,
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveUnitLayerText(targetUnit.id, transformedText, targetLayerId);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranslationDone') };
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
        await ctx.saveSegmentContentForLayer(requestedSegmentId, targetLayerId, '');
        const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
            segmentId: requestedSegmentId,
            layerLabel,
          }),
        };
      }
      if (!ctx.hasRequestedUnitTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUnitId') };
      }
      const targetUnit = ctx.resolveRequestedUnit();
      if (!targetUnit) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUnitTarget() }) };
      }
      await ctx.saveUnitLayerText(targetUnit.id, '', targetLayerId);
      const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
          segmentId: targetUnit.id,
          layerLabel,
        }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.segment.unsupportedTool', { toolName: call.name }) };
  },
};
