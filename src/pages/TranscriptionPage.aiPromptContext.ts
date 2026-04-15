import type { AiPromptContext } from '../hooks/useAiChat';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import type { WaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';
import { buildWorldModelSnapshot } from '../ai/chat/worldModelSnapshot';

export type { AcousticDiagnosticKey, AcousticPromptSummary } from './transcriptionAcousticSummary';

interface LayerPromptInput {
  id: string;
  key: string;
  name: Record<string, unknown>;
}

interface MediaItemPromptInput {
  id: string;
  filename: string;
}

interface UtteranceTimelineEntry {
  id: string;
  startTime: number;
  endTime: number;
  transcription?: string;
}

const TIMELINE_MAX_CHARS = 800;
const TIMELINE_TEXT_TRUNCATE = 30;

export function buildUtteranceTimelineDigest(utterances: UtteranceTimelineEntry[]): string {
  if (utterances.length === 0) return '';
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);
  const lines: string[] = [];
  let charBudget = TIMELINE_MAX_CHARS;
  for (let i = 0; i < sorted.length; i += 1) {
    const u = sorted[i]!;
    const text = u.transcription
      ? (u.transcription.length > TIMELINE_TEXT_TRUNCATE ? `${u.transcription.slice(0, TIMELINE_TEXT_TRUNCATE)}…` : u.transcription)
      : '';
    const fmt = (sec: number): string => {
      const totalTenths = Math.round(sec * 10);
      const m = Math.floor(totalTenths / 600);
      const s = (totalTenths % 600) / 10;
      return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
    };
    const line = `#${i + 1} ${fmt(u.startTime)}–${fmt(u.endTime)}${text ? ` "${text}"` : ''}`;
    if (charBudget - line.length - 3 < 0) {
      const remaining = sorted.length - i;
      lines.push(`(+${remaining} more, use list_units for full data)`);
      break;
    }
    lines.push(line);
    charBudget -= line.length + 3;
  }
  return lines.join(' | ');
}

interface BuildTranscriptionAiPromptContextParams {
  selectionSnapshot: TranscriptionSelectionSnapshot;
  selectedUnitIds: string[];
  /** Total selected timeline units (may exceed `selectedUnitIds.length` when capped). */
  selectedUnitCount: number;
  /** Current media timeline rows (utterance or segment), single read model. */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  /** Full-project list for local list/search/detail tools. */
  projectUnitsForTools?: ReadonlyArray<TimelineUnitView>;
  unitIndexComplete?: boolean;
  /** Project-wide timeline unit count (utterance + segment read model). */
  unitCount: number;
  /** Current AI operation scope unit count (active layer + current media). */
  currentScopeUnitCount?: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  waveformAnalysis?: WaveformAnalysisPromptSummary;
  acousticSummary?: AcousticPromptSummary;
  observerStage: string | null;
  topLexemes: string[];
  recommendations: string[];
  audioTimeSec?: number;
  layers?: ReadonlyArray<LayerPromptInput>;
  mediaItems?: ReadonlyArray<MediaItemPromptInput>;
  currentMediaId?: string;
  activeLayerIdForEdits?: string;
  recentActions?: string[];
  /** Timeline read-model epoch for destructive tool stale guards. */
  timelineReadModelEpoch?: number;
}

export function buildTranscriptionAiPromptContext({
  selectionSnapshot,
  selectedUnitIds,
  selectedUnitCount,
  currentMediaUnits,
  projectUnitsForTools,
  unitIndexComplete = true,
  unitCount,
  currentScopeUnitCount,
  translationLayerCount,
  aiConfidenceAvg,
  waveformAnalysis,
  acousticSummary,
  observerStage,
  topLexemes,
  recommendations,
  audioTimeSec,
  layers = [],
  mediaItems,
  currentMediaId,
  activeLayerIdForEdits,
  recentActions,
  timelineReadModelEpoch,
}: BuildTranscriptionAiPromptContextParams): AiPromptContext {
  const localUnitIndex =
    (unitIndexComplete || (projectUnitsForTools?.length ?? 0) > 0) && projectUnitsForTools && projectUnitsForTools.length > 0
      ? projectUnitsForTools
      : undefined;

  const allUnits = projectUnitsForTools ?? currentMediaUnits;
  const speakerCount = (() => {
    const ids = new Set(
      allUnits
        .map((unit) => (typeof unit.speakerId === 'string' ? unit.speakerId.trim() : ''))
        .filter((id) => id.length > 0),
    );
    return ids.size > 0 ? ids.size : undefined;
  })();

  const worldModelSnapshot = buildWorldModelSnapshot({
    allUnits,
    currentMediaUnits,
    layers,
    ...(mediaItems ? { mediaItems } : {}),
    ...(currentMediaId !== undefined ? { currentMediaId } : {}),
    selectedUnitIds,
    ...(selectionSnapshot.selectedLayerId !== null ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
    ...(activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits } : {}),
    maxChars: 1000,
  });

  return {
    shortTerm: {
      page: 'transcription',
      ...(selectionSnapshot.activeUnitId ? { activeUnitId: selectionSnapshot.activeUnitId } : {}),
      ...(selectionSnapshot.selectedUnitKind === 'segment' && selectionSnapshot.timelineUnit
        ? { activeSegmentUnitId: selectionSnapshot.timelineUnit.unitId }
        : {}),
      ...(selectionSnapshot.selectedUnitKind ? { selectedUnitKind: selectionSnapshot.selectedUnitKind } : {}),
      ...(selectedUnitCount > 0 ? { selectedUnitCount } : {}),
      ...(selectedUnitIds.length > 0 ? { selectedUnitIds } : {}),
      ...(selectionSnapshot.selectedUnitStartSec !== undefined && selectionSnapshot.selectedUnitEndSec !== undefined
        ? {
            selectedUnitStartSec: selectionSnapshot.selectedUnitStartSec,
            selectedUnitEndSec: selectionSnapshot.selectedUnitEndSec,
          }
        : {}),
      ...(selectionSnapshot.selectedLayerId ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
      ...(selectionSnapshot.selectedLayerType ? { selectedLayerType: selectionSnapshot.selectedLayerType } : {}),
      ...(selectionSnapshot.selectedTranslationLayerId ? { selectedTranslationLayerId: selectionSnapshot.selectedTranslationLayerId } : {}),
      ...(selectionSnapshot.selectedTranscriptionLayerId ? { selectedTranscriptionLayerId: selectionSnapshot.selectedTranscriptionLayerId } : {}),
      ...(currentMediaId !== undefined ? { currentMediaId } : {}),
      ...(selectionSnapshot.selectedText !== null ? { selectedText: selectionSnapshot.selectedText } : {}),
      ...(selectionSnapshot.selectedTimeRangeLabel ? { selectionTimeRange: selectionSnapshot.selectedTimeRangeLabel } : {}),
      ...(audioTimeSec !== undefined ? { audioTimeSec } : {}),
      projectUnitCount: unitCount,
      currentMediaUnitCount: currentMediaUnits.length,
      ...(typeof currentScopeUnitCount === 'number' && Number.isFinite(currentScopeUnitCount)
        ? { currentScopeUnitCount }
        : {}),
      ...(timelineReadModelEpoch !== undefined ? { timelineReadModelEpoch } : {}),
      ...(unitIndexComplete ? {} : { unitIndexComplete: false }),
      ...(worldModelSnapshot ? { worldModelSnapshot } : {}),
      ...(localUnitIndex ? { localUnitIndex } : {}),
      ...(recentActions && recentActions.length > 0 ? { recentActions } : {}),
    },
    longTerm: {
      projectStats: {
        unitCount,
        ...(speakerCount !== undefined ? { speakerCount } : {}),
        translationLayerCount,
        aiConfidenceAvg,
      },
      ...(waveformAnalysis ? { waveformAnalysis } : {}),
      ...(acousticSummary ? { acousticSummary } : {}),
      ...(observerStage ? { observerStage } : {}),
      topLexemes,
      recommendations,
    },
  };
}
