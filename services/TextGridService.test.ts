import { describe, it, expect } from 'vitest';
import { exportToTextGrid, importFromTextGrid } from './TextGridService';
import type { TextGridExportInput } from './TextGridService';
import type {
  UtteranceDocType,
  TranslationLayerDocType,
  UtteranceTextDocType,
} from '../db';

// ── Helpers ──────────────────────────────────────────────────

function makeUtterance(id: string, start: number, end: number, text: string): UtteranceDocType {
  return {
    id,
    textId: 'text1',
    mediaId: 'media1',
    transcription: { default: text },
    startTime: start,
    endTime: end,
    annotationStatus: 'raw',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeLayer(
  id: string,
  key: string,
  layerType: 'transcription' | 'translation',
  overrides?: Partial<TranslationLayerDocType>,
): TranslationLayerDocType {
  return {
    id,
    textId: 'text_1',
    key,
    name: { eng: key },
    layerType,
    languageId: 'en',
    modality: 'text',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as TranslationLayerDocType;
}

function makeTranslation(
  uttId: string,
  layerId: string,
  text: string,
): UtteranceTextDocType {
  return {
    id: `utr_${uttId}_${layerId}`,
    utteranceId: uttId,
    tierId: layerId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  } as UtteranceTextDocType;
}

// ── Tests ────────────────────────────────────────────────────

describe('TextGridService', () => {
  describe('importFromTextGrid', () => {
    it('parses utterances from the first IntervalTier', () => {
      const tg = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 3
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 3
        intervals: size = 2
        intervals [1]:
            xmin = 0
            xmax = 1.5
            text = "Hello"
        intervals [2]:
            xmin = 1.5
            xmax = 3
            text = "World"
`;
      const result = importFromTextGrid(tg);
      expect(result.utterances).toHaveLength(2);
      expect(result.utterances[0]).toEqual({ startTime: 0, endTime: 1.5, transcription: 'Hello' });
      expect(result.utterances[1]).toEqual({ startTime: 1.5, endTime: 3, transcription: 'World' });
    });

    it('parses additional tiers', () => {
      const tg = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 2
tiers? <exists>
size = 3
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 2
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 2
            text = "你好"
    item [2]:
        class = "IntervalTier"
        name = "English"
        xmin = 0
        xmax = 2
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 2
            text = "Hello"
    item [3]:
        class = "IntervalTier"
        name = "IPA"
        xmin = 0
        xmax = 2
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 2
            text = "ni xau"
`;
      const result = importFromTextGrid(tg);
      expect(result.utterances).toHaveLength(1);
      expect(result.additionalTiers.size).toBe(2);
      expect(result.additionalTiers.get('English')![0]!.text).toBe('Hello');
      expect(result.additionalTiers.get('IPA')![0]!.text).toBe('ni xau');
    });

    it('filters out empty intervals from utterances', () => {
      const tg = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 3
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 3
        intervals: size = 3
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "Hello"
        intervals [2]:
            xmin = 1
            xmax = 2
            text = ""
        intervals [3]:
            xmin = 2
            xmax = 3
            text = "World"
`;
      const result = importFromTextGrid(tg);
      expect(result.utterances).toHaveLength(2);
    });

    it('ignores PointTier and still parses IntervalTier items', () => {
      const tg = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 3
tiers? <exists>
size = 2
item []:
    item [1]:
        class = "PointTier"
        name = "events"
        xmin = 0
        xmax = 3
        points: size = 1
        points [1]:
            number = 1.2
            mark = "clap"
    item [2]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 3
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 3
            text = "hello"
`;

      const result = importFromTextGrid(tg);
      expect(result.utterances).toHaveLength(1);
      expect(result.utterances[0]!.transcription).toBe('hello');
      expect(result.additionalTiers.size).toBe(0);
    });

    it('throws when interval count is malformed', () => {
      const tg = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription"
        xmin = 0
        xmax = 1
        intervals: size = NaN
`;

      expect(() => importFromTextGrid(tg)).toThrow(/invalid interval count/i);
    });
  });

  describe('exportToTextGrid', () => {
    it('exports transcription as first tier', () => {
      const input: TextGridExportInput = {
        utterances: [makeUtterance('u1', 0, 1.5, 'Hello'), makeUtterance('u2', 1.5, 3, 'World')],
        layers: [],
        translations: [],
      };
      const tg = exportToTextGrid(input);
      expect(tg).toContain('name = "transcription"');
      expect(tg).toContain('text = "Hello"');
      expect(tg).toContain('text = "World"');
      expect(tg).toContain('size = 1'); // only one tier
    });

    it('includes translation layers as additional tiers', () => {
      const layer = makeLayer('l1', 'English', 'translation');
      const input: TextGridExportInput = {
        utterances: [makeUtterance('u1', 0, 2, '你好')],
        layers: [layer],
        translations: [makeTranslation('u1', 'l1', 'Hello')],
      };
      const tg = exportToTextGrid(input);
      expect(tg).toContain('size = 2'); // two tiers
      expect(tg).toContain('name = "English"');
      expect(tg).toContain('text = "Hello"');
    });

    it('includes non-default transcription layers as additional tiers', () => {
      const defaultTrc = makeLayer('ld', 'trc_default', 'transcription', { isDefault: true });
      const ipaTrc = makeLayer('li', 'IPA', 'transcription');
      const input: TextGridExportInput = {
        utterances: [makeUtterance('u1', 0, 2, '你好')],
        layers: [defaultTrc, ipaTrc],
        translations: [makeTranslation('u1', 'li', 'ni xau')],
      };
      const tg = exportToTextGrid(input);
      expect(tg).toContain('size = 2'); // transcription + IPA
      expect(tg).toContain('name = "IPA"');
      expect(tg).toContain('text = "ni xau"');
      // Default transcription layer should NOT appear as additional tier
      expect(tg).not.toContain('name = "trc_default"');
    });

    it('returns empty string for no utterances', () => {
      expect(exportToTextGrid({ utterances: [], layers: [], translations: [] })).toBe('');
    });
  });

  describe('TextGrid round-trip', () => {
    it('export → import preserves utterances and tier data', () => {
      const layer = makeLayer('l1', 'English', 'translation');
      const input: TextGridExportInput = {
        utterances: [
          makeUtterance('u1', 0, 1.5, '你好'),
          makeUtterance('u2', 1.5, 3, '世界'),
        ],
        layers: [layer],
        translations: [
          makeTranslation('u1', 'l1', 'Hello'),
          makeTranslation('u2', 'l1', 'World'),
        ],
      };

      const tg = exportToTextGrid(input);
      const result = importFromTextGrid(tg);

      expect(result.utterances).toHaveLength(2);
      expect(result.utterances[0]!.transcription).toBe('你好');
      expect(result.utterances[0]!.startTime).toBe(0);
      expect(result.utterances[0]!.endTime).toBe(1.5);
      expect(result.utterances[1]!.transcription).toBe('世界');

      expect(result.additionalTiers.size).toBe(1);
      const eng = result.additionalTiers.get('English')!;
      expect(eng).toHaveLength(2);
      expect(eng[0]!.text).toBe('Hello');
      expect(eng[1]!.text).toBe('World');
    });

    it('export → import round-trip preserves non-default transcription layers', () => {
      const defaultTrc = makeLayer('ld', 'trc_default', 'transcription', { isDefault: true });
      const ipaTrc = makeLayer('li', 'IPA', 'transcription');
      const input: TextGridExportInput = {
        utterances: [makeUtterance('u1', 0, 2, '你好世界')],
        layers: [defaultTrc, ipaTrc],
        translations: [makeTranslation('u1', 'li', 'ni xau shi jie')],
      };

      const tg = exportToTextGrid(input);
      const result = importFromTextGrid(tg);

      expect(result.utterances[0]!.transcription).toBe('你好世界');
      expect(result.additionalTiers.size).toBe(1);
      const ipa = result.additionalTiers.get('IPA')!;
      expect(ipa[0]!.text).toBe('ni xau shi jie');
    });
  });
});
