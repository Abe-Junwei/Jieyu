import { describe, expect, it } from 'vitest';
import { LeipzigValidator } from '../ai/LeipzigValidator';
import {
  collectIgtGlossTokens,
  escapeLatexIgtText,
  formatGb4eColumn,
  serializeTranscriptionIgtLatex,
  toTranscriptionIgtLatexExamples,
} from './transcriptionIgtLatexExport';

const GOLDEN_UNIT = {
  id: 'u-1',
  startTime: 1,
  endTime: 2,
  transcription: { default: 'na-wapa-naka' },
  words: [
    {
      form: { default: 'na-wapa-naka' },
      gloss: { eng: '3.SG-see-PST' },
    },
  ],
};

describe('transcriptionIgtLatexExport', () => {
  it('serializes a gb4e exe with aligned gll columns and glt', () => {
    const payload = serializeTranscriptionIgtLatex([GOLDEN_UNIT], {
      layers: [{ id: 'trn-1', layerType: 'translation' }],
      translations: [{ unitId: 'u-1', layerId: 'trn-1', modality: 'text', text: 'He saw.' }],
    });
    expect(payload.extension).toBe('tex');
    expect(payload.mime).toBe('application/x-tex');
    expect(payload.body).toBe(
      [
        '% jieyu-igt-gb4e',
        '% Requires: \\usepackage{gb4e}',
        '\\begin{exe}',
        '\\ex',
        '\\gll na-wapa-naka \\\\',
        '     3.SG-see-PST \\\\',
        "\\glt `He saw.'",
        '\\end{exe}',
        '',
      ].join('\n'),
    );
  });

  it('aligns surface and gloss token counts and wraps multi-word glosses', () => {
    const examples = toTranscriptionIgtLatexExamples([
      {
        id: 'u-2',
        startTime: 0,
        endTime: 1,
        words: [
          { form: { default: 'went out' }, gloss: { eng: 'leave' } },
          { form: { default: 'dog' }, gloss: { eng: '' } },
        ],
      },
    ]);
    expect(examples[0]?.surfaceTokens).toHaveLength(examples[0]?.glossTokens.length ?? 0);
    expect(formatGb4eColumn('went out')).toBe('{went out}');
    expect(formatGb4eColumn('')).toBe('{}');
  });

  it('falls back to whitespace-split transcription when words are missing', () => {
    const examples = toTranscriptionIgtLatexExamples([
      {
        id: 'u-3',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'foo bar' },
      },
    ]);
    expect(examples[0]).toEqual({
      surfaceTokens: ['foo', 'bar'],
      glossTokens: ['', ''],
      translation: '',
    });
  });

  it('escapes LaTeX specials and skips empty unit lists', () => {
    expect(escapeLatexIgtText('a_b%c')).toBe('a\\_b\\%c');
    const payload = serializeTranscriptionIgtLatex([
      {
        id: 'u-4',
        startTime: 0,
        endTime: 1,
        words: [{ form: { default: 'foo_bar' }, gloss: { eng: 'run' } }],
      },
    ]);
    expect(payload.body).toContain('\\gll foo\\_bar \\\\');
    expect(serializeTranscriptionIgtLatex([]).body).toBe('');
  });

  it('uses LeipzigValidator on well-formed gloss tokens', () => {
    const examples = toTranscriptionIgtLatexExamples([GOLDEN_UNIT]);
    const validator = new LeipzigValidator();
    for (const gloss of collectIgtGlossTokens(examples)) {
      expect(validator.validateGloss(gloss).valid).toBe(true);
    }
  });
});
