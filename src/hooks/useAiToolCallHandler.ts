import { useCallback, useRef } from 'react';
import type { UtteranceDocType, LayerDocType } from '../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';
import { tf, useLocale } from '../i18n';
import {
  layerMatchesLanguage,
  parseLayerHintFromOpaqueId,
} from './useAiToolCallHandler.helpers';
import type { ExecutionContext, UseAiToolCallHandlerParams as Params, CompensationEntry } from './useAiToolCallHandler.types';
import { AI_TOOL_CALL_ADAPTER_MAP } from './useAiToolCallHandler.adapters';

// ─────────────────────────────────────────────────────────────
//  Hook 主体
//  Main hook
// ─────────────────────────────────────────────────────────────

export function useAiToolCallHandler({
  utterances,
  selectedUnit,
  selectedUnitMedia,
  selectedLayerId,
  transcriptionLayers,
  translationLayers,
  layerLinks,
  createLayer,
  createNextUtterance,
  createTranscriptionSegment,
  splitUtterance,
  splitTranscriptionSegment,
  mergeWithPrevious,
  mergeWithNext,
  mergeSelectedUnits,
  mergeSelectedUtterances,
  mergeSelectedSegments,
  deleteUtterance,
  deleteSelectedUnits,
  deleteSelectedUtterances,
  deleteLayer,
  toggleLayerLink,
  saveUtteranceText,
  saveTextTranslationForUtterance,
  saveSegmentContentForLayer,
  segmentTargets,
  updateTokenPos,
  batchUpdateTokenPosByForm,
  updateTokenGloss,
  executeAction,
  getSegments,
  navigateTo,
  openSearch,
  seekToTime,
  splitAtTime,
  zoomToSegment,
  bridgeTextForLayerWrite,
}: Params): (call: AiChatToolCall) => Promise<AiChatToolResult> {
  const locale = useLocale();
  const utterancesRef = useLatest(utterances);
  const selectedUnitRef = useLatest(selectedUnit);
  const selectedUnitMediaRef = useLatest(selectedUnitMedia);
  const selectedLayerIdRef = useLatest(selectedLayerId);
  const transcriptionLayersRef = useLatest(transcriptionLayers);
  const translationLayersRef = useLatest(translationLayers);
  const layerLinksRef = useLatest(layerLinks);
  const segmentTargetsRef = useLatest(segmentTargets ?? []);

  // 补偿上下文：60 秒内创建的层可被链接失败回滚 | Compensation: layers created within 60s eligible for rollback
  // Map keyed by call.requestId so concurrent calls don't overwrite each other's compensation
  const compensationRef = useRef<Map<string, CompensationEntry>>(new Map());
  const COMPENSATION_TTL_MS = 60_000;

  return useCallback(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
    const currentUtterances = utterancesRef.current;
    const currentSelectedUtterance = selectedUnitRef.current;
    const currentSelectedUnitMedia = selectedUnitMediaRef.current;
    const currentTranscriptionLayers = transcriptionLayersRef.current;
    const currentTranslationLayers = translationLayersRef.current;
    const currentLayerLinks = layerLinksRef.current;
    const orderedUtterances = [...currentUtterances].sort((left, right) => {
      const startDiff = Number(left.startTime) - Number(right.startTime);
      if (startDiff !== 0) return startDiff;
      const endDiff = Number(left.endTime) - Number(right.endTime);
      if (endDiff !== 0) return endDiff;
      return left.id.localeCompare(right.id);
    });
    const segmentOnlyTargetTools = new Set<AiChatToolCall['name']>([
      'create_transcription_segment',
      'split_transcription_segment',
      'merge_transcription_segments',
      'delete_transcription_segment',
      'set_transcription_text',
      'set_translation_text',
      'clear_translation_segment',
      'merge_prev',
      'merge_next',
    ]);
    const resolvePrimaryRequestedTargetId = (): string => {
      if (segmentOnlyTargetTools.has(call.name)) {
        return String(call.arguments.segmentId ?? '').trim();
      }
      return String(call.arguments.utteranceId ?? call.arguments.segmentId ?? '').trim();
    };

    // 预绑定解析函数（已捕获当前 call + 快照数据）
    // Pre-bind resolver helpers (closed over current call + snapshot)
    const hasRequestedUtteranceTarget = (): boolean => {
      const requestedId = resolvePrimaryRequestedTargetId();
      if (requestedId.length > 0) return true;
      const segmentIndex = call.arguments.segmentIndex;
      if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) return true;
      return typeof call.arguments.segmentPosition === 'string' && call.arguments.segmentPosition.length > 0;
    };

    const describeRequestedUtteranceTarget = (): string => {
      const requestedId = resolvePrimaryRequestedTargetId();
      if (requestedId.length > 0) return requestedId;
      const segmentIndex = call.arguments.segmentIndex;
      if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
        return locale === 'zh-CN' ? `\u7b2c${segmentIndex}\u4e2a\u53e5\u6bb5` : `segment #${segmentIndex}`;
      }
      if (call.arguments.segmentPosition === 'last') {
        return locale === 'zh-CN' ? '\u6700\u540e\u4e00\u4e2a\u53e5\u6bb5' : 'last segment';
      }
      if (call.arguments.segmentPosition === 'penultimate') {
        return locale === 'zh-CN' ? '\u5012\u6570\u7b2c\u4e8c\u4e2a\u53e5\u6bb5' : 'penultimate segment';
      }
      if (call.arguments.segmentPosition === 'middle') {
        return locale === 'zh-CN' ? '\u4e2d\u95f4\u90a3\u4e2a\u53e5\u6bb5' : 'middle segment';
      }
      if (call.arguments.segmentPosition === 'previous') {
        return locale === 'zh-CN' ? '\u524d\u4e00\u4e2a\u53e5\u6bb5' : 'previous segment';
      }
      if (call.arguments.segmentPosition === 'next') {
        return locale === 'zh-CN' ? '\u540e\u4e00\u4e2a\u53e5\u6bb5' : 'next segment';
      }
      return '';
    };

    const resolveRequestedUtterance = (): UtteranceDocType | null => {
      const requestedId = resolvePrimaryRequestedTargetId();
      if (requestedId.length > 0) {
        return currentUtterances.find((item) => item.id === requestedId) ?? null;
      }
      const segmentIndex = call.arguments.segmentIndex;
      if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
        return orderedUtterances[segmentIndex - 1] ?? null;
      }
      if (call.arguments.segmentPosition === 'last') {
        return orderedUtterances.length > 0 ? orderedUtterances[orderedUtterances.length - 1] ?? null : null;
      }
      if (call.arguments.segmentPosition === 'penultimate') {
        return orderedUtterances.length > 1 ? orderedUtterances[orderedUtterances.length - 2] ?? null : null;
      }
      if (call.arguments.segmentPosition === 'middle') {
        if (orderedUtterances.length === 0) return null;
        return orderedUtterances[Math.floor((orderedUtterances.length - 1) / 2)] ?? null;
      }
      if (call.arguments.segmentPosition === 'previous' || call.arguments.segmentPosition === 'next') {
        if (!currentSelectedUtterance) return null;
        const anchorIndex = orderedUtterances.findIndex((item) => item.id === currentSelectedUtterance.id);
        if (anchorIndex < 0) return null;
        const offset = call.arguments.segmentPosition === 'previous' ? -1 : 1;
        return orderedUtterances[anchorIndex + offset] ?? null;
      }
      return null;
    };

    const resolveRequestedSegmentTarget = () => {
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length === 0) return null;
      return segmentTargetsRef.current.find((item) => item.id === requestedSegmentId) ?? null;
    };

    const resolveRequestedTranslationLayerId = (): string => {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) return '';
      if (!currentTranslationLayers.some((layer) => layer.id === requestedLayerId)) return '';
      return requestedLayerId;
    };

    const resolveTranscriptionLayerForLink = (): LayerDocType | null => {
      const requestedLayerId = String(call.arguments.transcriptionLayerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranscriptionLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      const requestedLayerKey = String(call.arguments.transcriptionLayerKey ?? '').trim();
      if (requestedLayerKey) {
        return currentTranscriptionLayers.find((layer) => layer.key === requestedLayerKey) ?? null;
      }
      return null;
    };

    const resolveTranslationLayerForLink = (): LayerDocType | null => {
      const requestedLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranslationLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      return null;
    };

    const mergeSelectedBatch = mergeSelectedUnits ?? mergeSelectedUtterances;
    const deleteSelectedBatch = deleteSelectedUnits ?? deleteSelectedUtterances;

    const ctx: ExecutionContext = {
      call,
      locale,
      utterances: currentUtterances,
      selectedUnit: currentSelectedUtterance,
      selectedUnitMedia: currentSelectedUnitMedia,
      selectedLayerId: selectedLayerIdRef.current,
      transcriptionLayers: currentTranscriptionLayers,
      translationLayers: currentTranslationLayers,
      translationLayersRef,
      layerLinks: currentLayerLinks,
      compensationRef,
      COMPENSATION_TTL_MS,
      hasRequestedUtteranceTarget,
      describeRequestedUtteranceTarget,
      resolveRequestedUtterance,
      resolveRequestedSegmentTarget,
      resolveRequestedTranslationLayerId,
      resolveTranscriptionLayerForLink,
      resolveTranslationLayerForLink,
      layerMatchesLanguage,
      parseLayerHintFromOpaqueId,
      createLayer,
      createNextUtterance,
      createTranscriptionSegment,
      splitUtterance,
      splitTranscriptionSegment,
      mergeWithPrevious,
      mergeWithNext,
      mergeSelectedUnits: mergeSelectedBatch,
      mergeSelectedUtterances: mergeSelectedBatch,
      mergeSelectedSegments,
      deleteUtterance,
      deleteSelectedUnits: deleteSelectedBatch,
      deleteSelectedUtterances: deleteSelectedBatch,
      deleteLayer,
      toggleLayerLink,
      saveUtteranceText,
      saveTextTranslationForUtterance,
      saveSegmentContentForLayer,
      updateTokenPos,
      batchUpdateTokenPosByForm,
      updateTokenGloss,
      executeAction,
      getSegments: getSegments!,
      navigateTo: navigateTo!,
      openSearch,
      seekToTime,
      splitAtTime,
      zoomToSegment,
      bridgeTextForLayerWrite,
    };

    const adapter = AI_TOOL_CALL_ADAPTER_MAP[call.name];
    if (!adapter) {
      return { ok: false, message: tf(locale, 'transcription.aiTool.unsupportedTool', { toolName: call.name }) };
    }
    return adapter.execute(ctx);
  }, [
    locale,
    createLayer,
    createNextUtterance,
    createTranscriptionSegment,
    splitUtterance,
    splitTranscriptionSegment,
    mergeWithPrevious,
    mergeWithNext,
    mergeSelectedUnits,
    mergeSelectedUtterances,
    mergeSelectedSegments,
    deleteLayer,
    deleteUtterance,
    deleteSelectedUnits,
    deleteSelectedUtterances,
    toggleLayerLink,
    saveTextTranslationForUtterance,
    saveSegmentContentForLayer,
    saveUtteranceText,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    executeAction,
    getSegments,
    navigateTo,
    openSearch,
    seekToTime,
    splitAtTime,
    zoomToSegment,
    bridgeTextForLayerWrite,
    utterancesRef,
    selectedUnitRef,
    selectedUnitMediaRef,
    selectedLayerIdRef,
    transcriptionLayersRef,
    translationLayersRef,
    layerLinksRef,
    segmentTargetsRef,
  ]);
}
