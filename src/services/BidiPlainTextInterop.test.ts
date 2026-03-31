// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LayerDocType, OrthographyDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { exportToTextGrid, importFromTextGrid } from './TextGridService';
import { exportToFlextext, importFromFlextext } from './FlexService';
import { exportToToolbox, importFromToolbox } from './ToolboxService';
import { exportToTrs, importFromTrs } from './TranscriberService';

const NOW = '2026-03-31T00:00:00.000Z';
const RTL_ISOLATE = '\u2067';
const POP_DIRECTIONAL_ISOLATE = '\u2069';
const MIXED_RTL_TEXT = 'مرحبا (123)';

function makeOrthography(): OrthographyDocType {
  return {
    id: 'ortho-ar',
    languageId: 'ara',
    name: { zho: '阿拉伯语正字法' },
    scriptTag: 'Arab',
    direction: 'rtl',
    bidiPolicy: {
      isolateInlineRuns: true,
      preferDirAttribute: true,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeTranscriptionLayer(): LayerDocType {
  return {
    id: 'trc-1',
    textId: 'text-1',
    key: 'trc_1',
    name: { zho: '转写', eng: 'Transcription' },
    layerType: 'transcription',
    languageId: 'ara',
    orthographyId: 'ortho-ar',
    modality: 'text',
    acceptsAudio: false,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeUtterance(): UtteranceDocType {
  return {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    transcription: { default: MIXED_RTL_TEXT },
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceDocType;
}

function makeUtteranceText(layerId: string, text: string): UtteranceTextDocType {
  return {
    id: `utr-${layerId}`,
    utteranceId: 'utt-1',
    layerId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceTextDocType;
}

describe('plain-text bidi export interop', () => {
  it('TextGrid wraps exported RTL text and strips controls on import', () => {
    const layer = makeTranscriptionLayer();
    const orthography = makeOrthography();
    const textGrid = exportToTextGrid({
      utterances: [makeUtterance()],
      layers: [layer],
      translations: [makeUtteranceText(layer.id, MIXED_RTL_TEXT)],
      orthographies: [orthography],
    });

    expect(textGrid).toContain(`${RTL_ISOLATE}${MIXED_RTL_TEXT}${POP_DIRECTIONAL_ISOLATE}`);

    const imported = importFromTextGrid(textGrid);
    expect(imported.utterances[0]?.transcription).toBe(MIXED_RTL_TEXT);
  });

  it('FLEx wraps exported RTL phrase text and strips controls on import', () => {
    const layer = makeTranscriptionLayer();
    const orthography = makeOrthography();
    const flex = exportToFlextext({
      utterances: [makeUtterance()],
      layers: [layer],
      translations: [makeUtteranceText(layer.id, MIXED_RTL_TEXT)],
      orthographies: [orthography],
    });

    expect(flex).toContain(`${RTL_ISOLATE}${MIXED_RTL_TEXT}${POP_DIRECTIONAL_ISOLATE}`);

    const imported = importFromFlextext(flex);
    expect(imported.utterances[0]?.transcription).toBe(MIXED_RTL_TEXT);
  });

  it('Toolbox wraps exported RTL marker text and strips controls on import', () => {
    const layer = makeTranscriptionLayer();
    const orthography = makeOrthography();
    const toolbox = exportToToolbox({
      utterances: [makeUtterance()],
      layers: [layer],
      translations: [makeUtteranceText(layer.id, MIXED_RTL_TEXT)],
      orthographies: [orthography],
    });

    expect(toolbox).toContain(`${RTL_ISOLATE}${MIXED_RTL_TEXT}${POP_DIRECTIONAL_ISOLATE}`);

    const imported = importFromToolbox(toolbox);
    expect(imported.utterances[0]?.transcription).toBe(MIXED_RTL_TEXT);
  });

  it('TRS wraps exported RTL sync text and strips controls on import', () => {
    const layer = makeTranscriptionLayer();
    const orthography = makeOrthography();
    const trs = exportToTrs({
      utterances: [makeUtterance()],
      orthographies: [orthography],
      transcriptionLayer: layer,
    });

    expect(trs).toContain(`${RTL_ISOLATE}${MIXED_RTL_TEXT}${POP_DIRECTIONAL_ISOLATE}`);

    const imported = importFromTrs(trs);
    expect(imported.utterances[0]?.transcription).toBe(MIXED_RTL_TEXT);
  });
});