import { describe, expect, it } from 'vitest';
import { exportToToolbox, importFromToolbox } from './ToolboxService';
import type { UtteranceDocType, TranslationLayerDocType, UtteranceTextDocType } from '../db';

function makeUtterance(id: string, start: number, end: number, text: string): UtteranceDocType {
  return {
    id,
    textId: 'text1',
    mediaId: 'media1',
    transcription: { default: text },
    startTime: start,
    endTime: end,
    annotationStatus: 'raw',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeLayer(id: string, key: string): TranslationLayerDocType {
  return {
    id,
    textId: 'text1',
    key,
    name: { eng: key },
    layerType: 'translation',
    languageId: 'en',
    modality: 'text',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeTranslation(id: string, utteranceId: string, layerId: string, text: string): UtteranceTextDocType {
  return {
    id,
    utteranceId,
    tierId: layerId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ToolboxService', () => {
  it('exports tx marker from utterance_texts default transcription layer when available', () => {
    const trcLayer: TranslationLayerDocType = {
      id: 'tl_trc',
      textId: 'text1',
      key: 'default_trc',
      name: { eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const u1 = makeUtterance('u1', 0, 1, 'legacy-cache');
    const trcText = makeTranslation('utr1', 'u1', 'tl_trc', 'fresh-layer-text');

    const out = exportToToolbox({
      utterances: [u1],
      layers: [trcLayer],
      translations: [trcText],
    });

    expect(out).toContain('\\tx fresh-layer-text');
    expect(out).not.toContain('\\tx legacy-cache');
  });

  it('imports tx + mb/ge/ps + ft marker stream', () => {
    const txt = `\\ref r1
\\ts 0.000
\\te 2.500
\\tx nga jongs
\\mb nga jongs
\\ge 1SG come.PST
\\ps PRON V
\\ft I came

\\ref r2
\\ts 2.500
\\te 5.000
\\tx de ring
\\ft today
`;

    const result = importFromToolbox(txt);
    expect(result.utterances).toHaveLength(2);
    expect(result.utterances[0]!.transcription).toBe('nga jongs');
    expect(result.utterances[0]!.tokens).toHaveLength(2);
    expect(result.utterances[0]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('1SG');
    expect(result.additionalTiers.get('Toolbox Free Translation')).toHaveLength(2);
  });

  it('exports toolbox markers from utterances + words + translation', () => {
    const u1: UtteranceDocType = makeUtterance('u1', 0, 3.4, 'nga-jongs');
    const layer = makeLayer('tl_en', 'English');
    const tr = makeTranslation('tr1', 'u1', 'tl_en', 'I came');
    const tokens = [
      {
        id: 'tok_1',
        textId: 'text1',
        utteranceId: 'u1',
        form: { default: 'nga-jongs' },
        tokenIndex: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const morphemes = [
      {
        id: 'morph_1',
        textId: 'text1',
        utteranceId: 'u1',
        tokenId: 'tok_1',
        form: { default: 'nga' },
        gloss: { eng: '1SG' },
        pos: 'PRON',
        morphemeIndex: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'morph_2',
        textId: 'text1',
        utteranceId: 'u1',
        tokenId: 'tok_1',
        form: { default: 'jongs' },
        gloss: { eng: 'come.PST' },
        pos: 'V',
        morphemeIndex: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const out = exportToToolbox({ utterances: [u1], layers: [layer], translations: [tr], tokens, morphemes });
    expect(out).toContain('\\ref u1');
    expect(out).toContain('\\ts 0.000');
    expect(out).toContain('\\te 3.400');
    expect(out).toContain('\\tx nga-jongs');
    expect(out).toContain('\\mb nga-jongs');
    expect(out).toContain('\\ge 1SG-come.PST');
    expect(out).toContain('\\ps PRON-V');
    expect(out).toContain('\\ft I came');
  });

  it('round-trips exported toolbox back into utterances', () => {
    const u1: UtteranceDocType = makeUtterance('u1', 1.125, 2.875, 'tɕʰa mo');
    const tokens = [
      {
        id: 'tok_a',
        textId: 'text1',
        utteranceId: 'u1',
        form: { default: 'tɕʰa' },
        tokenIndex: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'tok_b',
        textId: 'text1',
        utteranceId: 'u1',
        form: { default: 'mo' },
        tokenIndex: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const morphemes = [
      {
        id: 'morph_a',
        textId: 'text1',
        utteranceId: 'u1',
        tokenId: 'tok_a',
        form: { default: 'tɕʰa' },
        gloss: { eng: 'tea' },
        morphemeIndex: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'morph_b',
        textId: 'text1',
        utteranceId: 'u1',
        tokenId: 'tok_b',
        form: { default: 'mo' },
        gloss: { eng: 'hot' },
        morphemeIndex: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const exported = exportToToolbox({ utterances: [u1], layers: [], translations: [], tokens, morphemes });
    const imported = importFromToolbox(exported);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(1.125, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2.875, 3);
    expect(imported.utterances[0]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('tea');
  });

  it('handles multiline continuation for marker values', () => {
    const txt = `\\ref r1
\\tx this is
continued line
\\ts 0
\\te 1
`;
    const result = importFromToolbox(txt);
    expect(result.utterances).toHaveLength(1);
    expect(result.utterances[0]!.transcription).toBe('this is continued line');
  });
});
