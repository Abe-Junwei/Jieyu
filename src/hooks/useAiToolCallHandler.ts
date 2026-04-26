import { useCallback, useRef } from 'react';
import type { LayerUnitDocType, LayerDocType } from '../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';
import { tf, useLocale } from '../i18n';
import { layerMatchesLanguage, parseLayerHintFromOpaqueId } from './useAiToolCallHandler.helpers';
import type { ExecutionContext, UseAiToolCallHandlerParams as Params, CompensationEntry } from './useAiToolCallHandler.types';
import { AI_TOOL_CALL_ADAPTER_MAP } from './useAiToolCallHandler.adapters';
import { isAiToolSegmentExecutionWithExplicitTarget } from '../ai/policy/aiToolPolicyMatrix';

// ─────────────────────────────────────────────────────────────
//  Hook 主体
//  Main hook
// ─────────────────────────────────────────────────────────────

export function useAiToolCallHandler({
  units,
  selectedUnit,
  selectedUnitMedia,
  selectedLayerId,
  transcriptionLayers,
  translationLayers,
  layerLinks,
  createLayer,
  createAdjacentUnit,
  createTranscriptionSegment,
  splitUnit,
  splitTranscriptionSegment,
  mergeAdjacentSegmentsForAiRollback,
  silentSegmentGraphSyncForAi,
  mergeWithPrevious,
  mergeWithNext,
  mergeSelectedUnits,
  mergeSelectedSegments,
  deleteUnit,
  deleteSelectedUnits,
  deleteLayer,
  toggleLayerLink,
  rebindTranslationLayerHost,
  saveUnitText,
  saveUnitLayerText,
  saveSegmentContentForLayer,
  readSegmentLayerText,
  readUnitLayerText,
  readTokenPos,
  readTokenGloss,
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
  const unitsRef = useLatest(units);
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
    const currentUnits = unitsRef.current;
    const currentSelectedUnit = selectedUnitRef.current;
    const currentSelectedUnitMedia = selectedUnitMediaRef.current;
    const currentTranscriptionLayers = transcriptionLayersRef.current;
    const currentTranslationLayers = translationLayersRef.current;
    const currentLayerLinks = layerLinksRef.current;
    const orderedUnits = [...currentUnits].sort((left, right) => {
      const startDiff = Number(left.startTime) - Number(right.startTime);
      if (startDiff !== 0) return startDiff;
      const endDiff = Number(left.endTime) - Number(right.endTime);
      if (endDiff !== 0) return endDiff;
      return left.id.localeCompare(right.id);
    });
    const isSegmentOnlyTargetTool = (toolName: AiChatToolCall['name']): boolean => (
      isAiToolSegmentExecutionWithExplicitTarget(toolName) && toolName !== 'auto_gloss_unit'
    ) || toolName === 'merge_prev' || toolName === 'merge_next';
    const resolvePrimaryRequestedTargetId = (): string => {
      if (isSegmentOnlyTargetTool(call.name)) {
        return String(call.arguments.segmentId ?? '').trim();
      }
      return String(call.arguments.unitId ?? call.arguments.segmentId ?? '').trim();
    };

    // 预绑定解析函数（已捕获当前 call + 快照数据）
    // Pre-bind resolver helpers (closed over current call + snapshot)
    const hasRequestedUnitTarget = (): boolean => {
      const requestedId = resolvePrimaryRequestedTargetId();
      if (requestedId.length > 0) return true;
      const segmentIndex = call.arguments.segmentIndex;
      if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) return true;
      return typeof call.arguments.segmentPosition === 'string' && call.arguments.segmentPosition.length > 0;
    };

    const describeRequestedUnitTarget = (): string => {
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

    const resolveRequestedUnit = (): LayerUnitDocType | null => {
      const requestedId = resolvePrimaryRequestedTargetId();
      if (requestedId.length > 0) {
        return currentUnits.find((item) => item.id === requestedId) ?? null;
      }
      const segmentIndex = call.arguments.segmentIndex;
      if (typeof segmentIndex === 'number' && Number.isInteger(segmentIndex) && segmentIndex >= 1) {
        return orderedUnits[segmentIndex - 1] ?? null;
      }
      if (call.arguments.segmentPosition === 'last') {
        return orderedUnits.length > 0 ? orderedUnits[orderedUnits.length - 1] ?? null : null;
      }
      if (call.arguments.segmentPosition === 'penultimate') {
        return orderedUnits.length > 1 ? orderedUnits[orderedUnits.length - 2] ?? null : null;
      }
      if (call.arguments.segmentPosition === 'middle') {
        if (orderedUnits.length === 0) return null;
        return orderedUnits[Math.floor((orderedUnits.length - 1) / 2)] ?? null;
      }
      if (call.arguments.segmentPosition === 'previous' || call.arguments.segmentPosition === 'next') {
        if (!currentSelectedUnit) return null;
        const anchorIndex = orderedUnits.findIndex((item) => item.id === currentSelectedUnit.id);
        if (anchorIndex < 0) return null;
        const offset = call.arguments.segmentPosition === 'previous' ? -1 : 1;
        return orderedUnits[anchorIndex + offset] ?? null;
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

    const mergeSelectedBatch = mergeSelectedUnits;
    const deleteSelectedBatch = deleteSelectedUnits;

    const ctx: ExecutionContext = {
      call,
      locale,
      units: currentUnits,
      selectedUnit: currentSelectedUnit,
      selectedUnitMedia: currentSelectedUnitMedia,
      selectedLayerId: selectedLayerIdRef.current,
      transcriptionLayers: currentTranscriptionLayers,
      translationLayers: currentTranslationLayers,
      translationLayersRef,
      layerLinks: currentLayerLinks,
      compensationRef,
      COMPENSATION_TTL_MS,
      hasRequestedUnitTarget,
      describeRequestedUnitTarget,
      resolveRequestedUnit,
      resolveRequestedSegmentTarget,
      resolveRequestedTranslationLayerId,
      resolveTranscriptionLayerForLink,
      resolveTranslationLayerForLink,
      layerMatchesLanguage,
      parseLayerHintFromOpaqueId,
      createLayer,
      createAdjacentUnit,
      createTranscriptionSegment,
      splitUnit,
      splitTranscriptionSegment,
      ...(mergeAdjacentSegmentsForAiRollback ? { mergeAdjacentSegmentsForAiRollback } : {}),
      ...(silentSegmentGraphSyncForAi ? { silentSegmentGraphSyncForAi } : {}),
      mergeWithPrevious,
      mergeWithNext,
      mergeSelectedUnits: mergeSelectedBatch,
      mergeSelectedSegments,
      deleteUnit,
      deleteSelectedUnits: deleteSelectedBatch,
      deleteLayer,
      toggleLayerLink,
      ...(rebindTranslationLayerHost ? { rebindTranslationLayerHost } : {}),
      saveUnitText,
      saveUnitLayerText,
      saveSegmentContentForLayer,
      ...(readSegmentLayerText ? { readSegmentLayerText } : {}),
      ...(readUnitLayerText ? { readUnitLayerText } : {}),
      ...(readTokenPos ? { readTokenPos } : {}),
      ...(readTokenGloss ? { readTokenGloss } : {}),
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
    createAdjacentUnit,
    createTranscriptionSegment,
    splitUnit,
  splitTranscriptionSegment,
  mergeAdjacentSegmentsForAiRollback,
  silentSegmentGraphSyncForAi,
  mergeWithPrevious,
    mergeWithNext,
    mergeSelectedUnits,
    mergeSelectedSegments,
    deleteLayer,
    deleteUnit,
    deleteSelectedUnits,
    toggleLayerLink,
    rebindTranslationLayerHost,
    saveUnitLayerText,
    saveSegmentContentForLayer,
    readSegmentLayerText,
    readUnitLayerText,
    readTokenPos,
    readTokenGloss,
    saveUnitText,
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
    unitsRef,
    selectedUnitRef,
    selectedUnitMediaRef,
    selectedLayerIdRef,
    transcriptionLayersRef,
    translationLayersRef,
    layerLinksRef,
    segmentTargetsRef,
  ]);
}
