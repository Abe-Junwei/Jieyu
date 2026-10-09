import { describe, expect, it } from 'vitest';
import {
  escapeXml,
  finalizeXmlExport,
  formatXmlSanitizeNotice,
  sanitizeXmlDocument,
} from './xmlSafeText';

describe('xmlSafeText (JY-08)', () => {
  it('maps U+000B to a newline and removes other XML 1.0 illegal code points', () => {
    const input = `a\u000Bb\u0001c\u0000d\uFFFEe\uFFFF\uD800f\uDFFFg`;
    expect(sanitizeXmlDocument(input)).toEqual({
      xml: 'a\nbcdefg',
      report: { lineBreaks: 1, removed: 6 },
    });
  });

  it('keeps tab, newline, carriage return, IPA, combining marks, astral and BiDi characters', () => {
    const legal = '\t\n\r ˈʔa˥˩ ŋ̍ Ca\u0301c 𐐷 👩🏽‍🔬 \u200Fשלום\u200E ক্‍ষ \uE000 \uFFFD';
    expect(sanitizeXmlDocument(legal)).toEqual({
      xml: legal,
      report: { lineBreaks: 0, removed: 0 },
    });
  });

  it('only calls back when something changed', () => {
    const calls: unknown[] = [];
    expect(finalizeXmlExport('<a>ok</a>', (report) => calls.push(report))).toBe('<a>ok</a>');
    expect(finalizeXmlExport('<a>\u0002</a>', (report) => calls.push(report))).toBe('<a></a>');
    expect(calls).toEqual([{ lineBreaks: 0, removed: 1 }]);
  });

  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });

  it('formats a notice only for the parts that happened', () => {
    const translate = (key: string, params: Record<string, number>) => `${key}:${params.count}`;
    expect(formatXmlSanitizeNotice(null, translate)).toBe('');
    expect(formatXmlSanitizeNotice({ lineBreaks: 0, removed: 2 }, translate)).toBe(
      'transcription.importExport.exportDone.xmlIllegalCharsRemoved:2',
    );
    expect(formatXmlSanitizeNotice({ lineBreaks: 3, removed: 1 }, translate)).toBe(
      'transcription.importExport.exportDone.xmlSoftLineBreaks:3 transcription.importExport.exportDone.xmlIllegalCharsRemoved:1',
    );
  });
});
