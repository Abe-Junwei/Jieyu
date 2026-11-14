import type { AcousticRuntimeStatus } from '../contexts/AiPanelContext';
import type { AcousticFeatureResult } from '../utils/acousticOverlayTypes';
import {
  buildAcousticPromptSummary,
  type AcousticPromptSummary,
} from './transcriptionAcousticSummary';

export function resolveCurrentAcousticMediaKey(
  selectedMediaUrl: string | undefined,
  selectedTimelineMediaId: string | undefined,
): string | null {
  if (selectedMediaUrl === undefined || selectedMediaUrl.length === 0) return null;
  return selectedTimelineMediaId ?? selectedMediaUrl;
}

/** Ready analysis is visible only when its mediaKey is the media currently loaded. */
export function selectReadyAcousticAnalysis(
  analysis: AcousticFeatureResult | null,
  status: AcousticRuntimeStatus,
  currentMediaKey: string | null,
): AcousticFeatureResult | null {
  if (status.state !== 'ready' || analysis === null || currentMediaKey === null) return null;
  if (analysis.mediaKey !== currentMediaKey) return null;
  return analysis;
}

export function summarizeVisibleAnalysis(
  analysis: AcousticFeatureResult | null,
  selectionStartSec?: number,
  selectionEndSec?: number,
): AcousticPromptSummary | null {
  const summary = buildAcousticPromptSummary(analysis, selectionStartSec, selectionEndSec);
  if (!summary || !analysis) return null;
  return { ...summary, sourceMediaKey: analysis.mediaKey };
}

/** Drops another timeline media's summary and omits `sourceMediaKey` from the prompt payload. */
export function acousticPromptSummaryField(
  acousticSummary: AcousticPromptSummary | null | undefined,
  currentMediaId: string | undefined,
): { acousticSummary?: AcousticPromptSummary } {
  if (!acousticSummary) return {};
  const sourceMediaKey = acousticSummary.sourceMediaKey;
  if (typeof sourceMediaKey !== 'string' || sourceMediaKey.length === 0) {
    return { acousticSummary };
  }
  if (typeof currentMediaId === 'string' && sourceMediaKey !== currentMediaId) {
    return {};
  }
  const summary: AcousticPromptSummary = { ...acousticSummary };
  delete summary.sourceMediaKey;
  return { acousticSummary: summary };
}
