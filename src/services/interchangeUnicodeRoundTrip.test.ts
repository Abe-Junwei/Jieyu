// @vitest-environment jsdom
/**
 * 交换格式 Unicode 往返矩阵（移植自代码审查 interchange.review.test.ts）。
 * 每个格式 × 每类样本逐码位比较；格式固有的改动在 `expectedFor` 里写明。
 * Interchange Unicode round-trip matrix (ported from the review's interchange.review.test.ts).
 * Each format × sample is compared code point by code point; changes a format makes on purpose are
 * spelled out in `expectedFor`.
 */
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../db';
import { exportToEaf, importFromEaf } from './EafService';
import { exportToTrs, importFromTrs } from './TranscriberService';
import { exportToTextGrid, importFromTextGrid } from './TextGridService';
import type { XmlSanitizeReport } from '../utils/xmlSafeText';
import { serializeLexemesToLift } from '../utils/lexiconLiftExport';
import { parseLiftXml } from '../utils/lexiconLiftImport';

const NOW = '2026-10-09T00:00:00.000Z';

export const UNICODE_SAMPLES: Record<string, string> = {
  ipaTone: 'ˈʔa˥˩ tʰɑ̃ŋ˧ ɕʲi˨˩˦ ŋ̍ ə˞',
  nfd: 'Ca\u0301c ve\u0323\u0302 Vie\u0323\u0302t',
  nfc: 'Các vệ Việt',
  astral: '𐐷 𝕏 𠀀 👩🏽‍🔬',
  rtl: '\u200Fשלום عالم 123\u200E',
  xmlSpecial: `a<b & c>"d" 'e'`,
  innerSpaces: 'a  b\tc',
  edgeSpaces: '  lead and trail  ',
  newline: 'line1\nline2',
  zwj: 'ক্‍ষ',
  controlChar: 'bad\u0001char\u000B',
};

function layer(): LayerDocType {
  return {
    id: 'layer_trc',
    textId: 'text_1',
    key: 'trc_default',
    name: { zho: '转写' },
    layerType: 'transcription',
    languageId: 'und',
    modality: 'text',
    isDefault: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function buildUnicodeExportInput(text: string) {
  const units: LayerUnitDocType[] = [
    {
      id: 'utt_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trc',
      unitType: 'unit',
      startTime: 0,
      endTime: 1.5,
      transcription: { default: text },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  const translations: LayerUnitContentDocType[] = [
    {
      id: 'utr_1',
      unitId: 'utt_1',
      layerId: 'layer_trc',
      modality: 'text',
      text,
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
  return { units, layers: [layer()], translations };
}

/** XML 格式：U+000B 软换行写成换行，U+0001 删除（JY-08）| XML: U+000B → newline, U+0001 dropped */
export function expectedXmlText(text: string): string {
  return text.replace(/\u000B/g, '\n').replace(/\u0001/g, '');
}

type XmlCodec = (text: string, onXmlSanitized: (report: XmlSanitizeReport) => void) => string;

const xmlCodecs: Record<string, XmlCodec> = {
  eaf: (text, onXmlSanitized) =>
    importFromEaf(exportToEaf({ ...buildUnicodeExportInput(text), onXmlSanitized })).units[0]
      ?.transcription ?? '',
  trs: (text, onXmlSanitized) => {
    const input = buildUnicodeExportInput(text);
    return (
      importFromTrs(
        exportToTrs({
          units: input.units,
          translations: input.translations,
          transcriptionLayer: input.layers[0]!,
          onXmlSanitized,
        }),
      ).units[0]?.transcription ?? ''
    );
  },
};

const codePoints = (text: string) => [...text].map((char) => char.codePointAt(0)!.toString(16));

describe('XML interchange keeps every legal code point and only rewrites illegal ones (JY-08)', () => {
  for (const [codecName, codec] of Object.entries(xmlCodecs)) {
    for (const [name, text] of Object.entries(UNICODE_SAMPLES)) {
      it(`${codecName}: ${name}`, () => {
        const reports: XmlSanitizeReport[] = [];
        const out = codec(text, (report) => reports.push(report));
        // TRS 的轮次文本前后本来就是排版空白，导入时去掉（格式固有）
        // TRS turn text is surrounded by layout whitespace, trimmed on import (inherent to the format)
        const expected = codecName === 'trs' ? expectedXmlText(text).trim() : expectedXmlText(text);
        expect(codePoints(out)).toEqual(codePoints(expected));
        if (name === 'controlChar') {
          expect(reports).toHaveLength(1);
          expect(reports[0]!.lineBreaks).toBeGreaterThan(0);
          expect(reports[0]!.removed).toBe(reports[0]!.lineBreaks);
        } else {
          expect(reports).toEqual([]);
        }
      });
    }
  }
});

describe('LIFT round trip keeps headwords, IPA and comma-bearing variants (JY-09)', () => {
  for (const [name, text] of Object.entries(UNICODE_SAMPLES)) {
    it(`lift headword: ${name}`, () => {
      const xml = serializeLexemesToLift([
        {
          id: 'lex1',
          textId: 'text_1',
          createdAt: NOW,
          updatedAt: NOW,
          entry: {
            id: 'lex1',
            headword: text,
            senses: [
              { id: 's1', headwordTranslations: [{ langCode: 'en', text: 'gloss, with comma' }] },
            ],
            pronunciations: [{ transcriptions: [{ text: UNICODE_SAMPLES.ipaTone! }] }],
            inflectedForms: [{ text: 'form, a' }, { text: 'form b' }],
          },
        },
      ]);
      const parsed = parseLiftXml(xml, 'text_1');
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const entry = parsed.lexemes[0]!.entry;
      expect({
        headword: codePoints(entry.headword),
        pron: entry.pronunciations?.[0]?.transcriptions?.[0]?.text,
        inflected: entry.inflectedForms?.map((form) => form.text),
        gloss: entry.senses?.[0]?.headwordTranslations?.[0]?.text,
      }).toEqual({
        headword: codePoints(expectedXmlText(text)),
        pron: UNICODE_SAMPLES.ipaTone,
        inflected: ['form, a', 'form b'],
        gloss: 'gloss, with comma',
      });
    });
  }
});

describe('TextGrid keeps every code point, including multi-line text (JY-16)', () => {
  for (const [name, text] of Object.entries(UNICODE_SAMPLES)) {
    it(`textgrid: ${name}`, () => {
      const exported = exportToTextGrid(buildUnicodeExportInput(text) as never);
      const out = importFromTextGrid(exported).units[0]?.transcription ?? '';
      expect(codePoints(out)).toEqual(codePoints(text));
    });
  }

  it('reads quotes and blank lines inside a multi-line Praat string', () => {
    const text = 'say ""hi""\n\n  indented "q"\nend';
    const exported = exportToTextGrid(buildUnicodeExportInput(text) as never);
    expect(importFromTextGrid(exported).units[0]?.transcription).toBe(text);
  });
});
