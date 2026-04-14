import type { AiPromptContext } from '../hooks/useAiChat';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import type { WaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import type { AcousticPromptSummary } from './transcriptionAcousticSummary';

export type { AcousticDiagnosticKey, AcousticPromptSummary } from './transcriptionAcousticSummary';

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

function timelineUnitsToDigestEntries(units: ReadonlyArray<TimelineUnitView>): UtteranceTimelineEntry[] {
  return units.map((u) => ({
    id: u.id,
    startTime: u.startTime,
    endTime: u.endTime,
    transcription: u.text,
  }));
}

interface BuildTranscriptionAiPromptContextParams {
  selectionSnapshot: TranscriptionSelectionSnapshot;
  selectedUnitIds: string[];
  /** Current media timeline rows (utterance or segment), single read model. */
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  /** Full-project list for local list/search/detail tools. */
  projectUnitsForTools?: ReadonlyArray<TimelineUnitView>;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  waveformAnalysis?: WaveformAnalysisPromptSummary;
  acousticSummary?: AcousticPromptSummary;
  observerStage: string | null;
  topLexemes: string[];
  recommendations: string[];
  audioTimeSec?: number;
  recentEdits: string[];
}

export function buildTranscriptionAiPromptContext({
  selectionSnapshot,
  selectedUnitIds,
  currentMediaUnits,
  projectUnitsForTools,
  utteranceCount,
  translationLayerCount,
  aiConfidenceAvg,
  waveformAnalysis,
  acousticSummary,
  observerStage,
  topLexemes,
  recommendations,
  audioTimeSec,
  recentEdits,
}: BuildTranscriptionAiPromptContextParams): AiPromptContext {
  const digestEntries = timelineUnitsToDigestEntries(currentMediaUnits);
  const unitTimeline = buildUtteranceTimelineDigest(digestEntries);
  const localUnitIndex =
    projectUnitsForTools && projectUnitsForTools.length > 0
      ? projectUnitsForTools
      : undefined;
  const localUtteranceIndex = localUnitIndex
    ? localUnitIndex.map((u) => ({
        id: u.id,
        ...(u.textId !== undefined ? { textId: u.textId } : {}),
        ...(u.mediaId ? { mediaId: u.mediaId } : {}),
        startTime: u.startTime,
        endTime: u.endTime,
        transcription: u.text,
        ...(u.speakerId !== undefined ? { speakerId: u.speakerId } : {}),
        ...(u.annotationStatus !== undefined ? { annotationStatus: u.annotationStatus } : {}),
      }))
    : undefined;

  return {
    shortTerm: {
      page: 'transcription',
      ...(selectionSnapshot.activeUtteranceUnitId ? { activeUtteranceUnitId: selectionSnapshot.activeUtteranceUnitId } : {}),
      ...(selectionSnapshot.selectedUnitKind === 'segment' && selectionSnapshot.timelineUnit
        ? { activeSegmentUnitId: selectionSnapshot.timelineUnit.unitId }
        : {}),
      ...(selectionSnapshot.selectedUnitKind ? { selectedUnitKind: selectionSnapshot.selectedUnitKind } : {}),
      ...(selectedUnitIds.length > 0 ? { selectedUnitIds } : {}),
      ...(selectionSnapshot.selectedUnitStartSec !== undefined && selectionSnapshot.selectedUnitEndSec !== undefined
        ? {
            selectedUtteranceStartSec: selectionSnapshot.selectedUnitStartSec,
            selectedUtteranceEndSec: selectionSnapshot.selectedUnitEndSec,
          }
        : {}),
      ...(selectionSnapshot.selectedLayerId ? { selectedLayerId: selectionSnapshot.selectedLayerId } : {}),
      ...(selectionSnapshot.selectedLayerType ? { selectedLayerType: selectionSnapshot.selectedLayerType } : {}),
      ...(selectionSnapshot.selectedTranslationLayerId ? { selectedTranslationLayerId: selectionSnapshot.selectedTranslationLayerId } : {}),
      ...(selectionSnapshot.selectedTranscriptionLayerId ? { selectedTranscriptionLayerId: selectionSnapshot.selectedTranscriptionLayerId } : {}),
      selectedText: selectionSnapshot.selectedText,
      ...(selectionSnapshot.selectedTimeRangeLabel ? { selectionTimeRange: selectionSnapshot.selectedTimeRangeLabel } : {}),
      ...(audioTimeSec !== undefined ? { audioTimeSec } : {}),
      projectUnitCount: utteranceCount,
      currentMediaUnitCount: currentMediaUnits.length,
      ...(unitTimeline ? { unitTimeline } : {}),
      ...(localUnitIndex ? { localUnitIndex } : {}),
      // Compatibility fields kept for one transition cycle.
      projectUtteranceCount: utteranceCount,
      utterancesOnCurrentMediaCount: currentMediaUnits.length,
      ...(unitTimeline ? { utteranceTimeline: unitTimeline } : {}),
      ...(localUtteranceIndex ? { localUtteranceIndex } : {}),
      recentEdits,
    },
    longTerm: {
      projectStats: {
        unitCount: utteranceCount,
        utteranceCount,
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
