import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import type { VoiceInteractionMessages } from '../i18n/voiceInteractionMessages';
import {
  computeTranscriptionVoiceSelectionSummary,
  computeTranscriptionVoiceTargetSummary,
} from './transcriptionVoiceInteractionWiring';

const stubMessages = {
  currentIndependentSegment: 'seg',
  currentSentenceWithIndex: (n: number) => `row ${n}`,
  currentUnit: 'unit',
  noUnitSelected: 'none',
  currentPageAction: 'page',
  analysisNoteSuffix: 'note',
  noLayerSelected: 'no layer',
  targetSummary: (layer: string, row: string) => `${layer}|${row}`,
} as unknown as VoiceInteractionMessages;

describe('computeTranscriptionVoiceTargetSummary', () => {
  const layers = [
    {
      id: 'L1',
      layerType: 'transcription',
    },
  ] as unknown as LayerDocType[];

  it('returns page action when non-dictation and no selection', () => {
    expect(
      computeTranscriptionVoiceTargetSummary({
        isNonDictationMode: true,
        selection: {
          activeUnitId: null,
          selectedUnit: null,
          selectedRowMeta: null,
          selectedLayerId: null,
          selectedUnitKind: null,
        },
        layers,
        translationLayers: [],
        formatSidePaneLayerLabel: (l) => l.id,
        messages: stubMessages,
      }),
    ).toBe('page');
  });

  it('returns dictation target summary when dictation mode', () => {
    expect(
      computeTranscriptionVoiceTargetSummary({
        isNonDictationMode: false,
        selection: {
          activeUnitId: 'u1',
          selectedUnit: null,
          selectedRowMeta: { rowNumber: 3, start: 0, end: 1 },
          selectedLayerId: 'L1',
          selectedUnitKind: 'unit',
        },
        layers,
        translationLayers: [],
        defaultTranscriptionLayerId: 'L1',
        formatSidePaneLayerLabel: (l) => l.id,
        messages: stubMessages,
      }),
    ).toBe('L1|row 3');
  });
});

describe('computeTranscriptionVoiceSelectionSummary', () => {
  it('prefers selectedTimeRangeLabel', () => {
    expect(
      computeTranscriptionVoiceSelectionSummary({
        selection: {
          activeUnitId: null,
          selectedUnit: null,
          selectedRowMeta: null,
          selectedLayerId: null,
          selectedUnitKind: null,
          selectedTimeRangeLabel: 'custom',
        },
        formatTime: (s) => `${s}s`,
        unknownSegmentLabel: '?',
      }),
    ).toBe('custom');
  });
});
