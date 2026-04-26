import type { LayerUnitDocType } from '../db';
import type { LayerDocType } from '../pages/transcriptionAiController.types';
import type { Dispatch, SetStateAction } from 'react';
import { loadOrthographyRuntime } from './loadOrthographyRuntime';
import { listRecentAiToolDecisionLogs } from '../ai/auditReplay';

export const TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX = '\u5237\u65b0 AI \u5de5\u5177\u5ba1\u8ba1\u65e5\u5fd7\u5931\u8d25\uff1a';

export function toSyntheticUnitDoc(unit: {
  id: string;
  mediaId: string;
  textId?: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
  tags?: Record<string, boolean>;
}): LayerUnitDocType {
  return {
    id: unit.id,
    mediaId: unit.mediaId,
    textId: unit.textId ?? '',
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    ...(unit.tags ? { tags: unit.tags } : {}),
    createdAt: '',
    updatedAt: '',
  };
}

export async function bridgeTextForLayerTargetWithFallback(input: {
  text: string;
  layers: LayerDocType[];
  targetLayerId?: string;
  selectedLayerId: string;
}): Promise<string> {
  const { bridgeTextForLayerTarget, resolveFallbackSourceOrthographyId } = await loadOrthographyRuntime();
  const fallbackSourceOrthographyId = resolveFallbackSourceOrthographyId({
    layers: input.layers,
    selectedLayerId: input.selectedLayerId,
  });
  return bridgeTextForLayerTarget({
    text: input.text,
    layers: input.layers,
    ...(input.targetLayerId !== undefined ? { targetLayerId: input.targetLayerId } : {}),
    selectedLayerId: input.selectedLayerId,
    ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
  });
}

export async function refreshRecentAiToolDecisionLogs(input: {
  setAiToolDecisionLogs: Dispatch<SetStateAction<Array<{
    id: string;
    toolName: string;
    decision: string;
    reason?: string;
    reasonLabelEn?: string;
    reasonLabelZh?: string;
    requestId?: string;
    timestamp: string;
    source?: 'human' | 'ai' | 'system';
    executed?: boolean;
    durationMs?: number;
    message?: string;
  }>>>;
  setAiSidebarError: Dispatch<SetStateAction<string | null>>;
}): Promise<void> {
  try {
    const normalized = await listRecentAiToolDecisionLogs(6);
    input.setAiToolDecisionLogs(normalized);
    input.setAiSidebarError((prev) => (prev?.startsWith(TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX) ? null : prev));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.setAiSidebarError(`${TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX}${message}`);
  }
}
