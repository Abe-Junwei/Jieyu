import { t, tf } from '../i18n';
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
      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.createMissingUtteranceId') };
      }
      const baseUtterance = ctx.resolveRequestedUtterance();
      if (!baseUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
      }
      const mediaDuration = typeof ctx.selectedUtteranceMedia?.duration === 'number'
        ? ctx.selectedUtteranceMedia.duration
        : baseUtterance.endTime + 2;
      await ctx.createNextUtterance(baseUtterance, mediaDuration);
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
      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
      }
      const start = Number(targetUtterance.startTime);
      const end = Number(targetUtterance.endTime);
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
      await ctx.splitUtterance(targetUtterance.id, splitTime);
      return { ok: true, message: tf(locale, 'transcription.aiTool.segment.splitDone', { splitTime: splitTime.toFixed(2) }) };
    }

    if (call.name === 'merge_transcription_segments') {
      const requestedSegmentIds = normalizeRequestedIds(call.arguments.segmentIds);
      if (requestedSegmentIds.length < 2) {
        return { ok: false, message: t(locale, 'transcription.error.validation.mergeSelectionRequireAtLeastTwo') };
      }
      const requestedBatchIds = Array.from(new Set(requestedSegmentIds));
      const mergeExecutor = ctx.mergeSelectedSegments ?? ctx.mergeSelectedUtterances;
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
        if (ctx.deleteSelectedUtterances) {
          await ctx.deleteSelectedUtterances(new Set(requestedBatchIds));
        } else {
          for (const targetId of requestedBatchIds) {
            await ctx.deleteUtterance(targetId);
          }
        }
        return {
          ok: true,
          message: tf(locale, 'transcription.utteranceAction.done.deleteSelection', { count: requestedBatchIds.length }),
        };
      }

      if (call.arguments.allSegments === true) {
        const allIds = ctx.utterances.map((utterance) => utterance.id);
        if (allIds.length === 0) {
          return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentEmpty') };
        }
        if (ctx.deleteSelectedUtterances) {
          await ctx.deleteSelectedUtterances(new Set(allIds));
        } else {
          for (const targetId of allIds) {
            await ctx.deleteUtterance(targetId);
          }
        }
        return {
          ok: true,
          message: tf(locale, 'transcription.utteranceAction.done.deleteSelection', { count: allIds.length }),
        };
      }

      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        await ctx.deleteUtterance(requestedSegmentId);
        return { ok: true, message: t(locale, 'transcription.aiTool.segment.deleteDone') };
      }

      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.deleteMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
      }
      await ctx.deleteUtterance(targetUtterance.id);
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
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUtteranceId') };
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
      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
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
      await ctx.saveUtteranceText(targetUtterance.id, transformedText, targetLayerId);
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
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUtteranceId') };
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
      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
      }
      const transformedText = ctx.bridgeTextForLayerWrite
        ? await ctx.bridgeTextForLayerWrite({
            text,
            targetLayerId,
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, transformedText, targetLayerId);
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
          return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUtteranceId') };
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
      if (!ctx.hasRequestedUtteranceTarget()) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { segmentId: ctx.describeRequestedUtteranceTarget() }) };
      }
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, '', targetLayerId);
      const layerLabel = readAnyMultiLangLabel(targetLayer.name) ?? targetLayer.key;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
          segmentId: targetUtterance.id,
          layerLabel,
        }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.segment.unsupportedTool', { toolName: call.name }) };
  },
};
