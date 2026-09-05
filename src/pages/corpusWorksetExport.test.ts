import { describe, expect, it } from 'vitest';
import {
  assessCorpusExportLength,
  buildCorpusWorksetExportPayload,
  CORPUS_EXPORT_MAX_CHARS,
  formatCorpusWorksetHtml,
  formatCorpusWorksetMarkdown,
  formatCorpusWorksetPlain,
  toCorpusWorksetExportUnit,
} from './corpusWorksetExport';

const UNITS = [
  toCorpusWorksetExportUnit({
    id: 'uid-1',
    textId: 'tid-1',
    mediaId: 'mid-1',
    layerId: 'lid-a',
    startTime: 1.5,
    endTime: 2,
    text: 'first sentence about tone',
    fallbackTextId: 'tid-1',
    fallbackMediaId: 'mid-1',
  }),
  toCorpusWorksetExportUnit({
    id: 'uid-2',
    textId: 'tid-1',
    mediaId: 'mid-1',
    startTime: 3,
    endTime: 4,
    text: 'second sentence',
    fallbackTextId: 'tid-1',
    fallbackMediaId: 'mid-1',
  }),
];

describe('corpusWorksetExport', () => {
  it('formats plain text with ids, time codes, and basket order', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-2', 'uid-1'],
      units: UNITS,
    });
    expect(formatCorpusWorksetPlain(payload)).toBe(
      [
        'textId: tid-1',
        'mediaId: mid-1',
        '',
        '00:03.0-00:04.0\tuid-2\tmid-1\tsecond sentence',
        '00:01.5-00:02.0\tuid-1\tmid-1\tlid-a\tfirst sentence about tone',
      ].join('\n'),
    );
  });

  it('formats markdown with transcription deep links', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1'],
      units: UNITS,
    });
    const markdown = formatCorpusWorksetMarkdown(payload);
    expect(markdown).toContain('# Corpus workset');
    expect(markdown).toContain('- textId: `tid-1`');
    expect(markdown).toContain('- mediaId: `mid-1`');
    expect(markdown).toContain('## uid-1');
    expect(markdown).toContain('- time: `00:01.5-00:02.0`');
    expect(markdown).toContain('- layerId: `lid-a`');
    expect(markdown).toContain('- href: `/transcription?textId=tid-1&mediaId=mid-1&unitId=uid-1`');
    expect(markdown).toContain('first sentence about tone');
    expect(markdown).not.toContain('uid-2');
  });

  it('omits a single header mediaId when the workset spans media', () => {
    const first = UNITS.find((unit) => unit.unitId === 'uid-1');
    expect(first).toBeTruthy();
    if (!first) return;
    const mixed = [
      first,
      toCorpusWorksetExportUnit({
        id: 'uid-3',
        textId: 'tid-1',
        mediaId: 'mid-2',
        startTime: 5,
        endTime: 6,
        text: 'other media',
        fallbackTextId: 'tid-1',
        fallbackMediaId: 'mid-2',
      }),
    ];
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1', 'uid-3'],
      units: mixed,
    });
    expect(payload.mediaId).toBe('');
    const plain = formatCorpusWorksetPlain(payload);
    expect(plain.startsWith('textId: tid-1\n\n')).toBe(true);
    expect(plain).toContain('\tuid-1\tmid-1\t');
    expect(plain).toContain('\tuid-3\tmid-2\t');
    const markdown = formatCorpusWorksetMarkdown(payload);
    const header = markdown.slice(0, markdown.indexOf('##'));
    expect(header).toContain('- textId: `tid-1`');
    expect(header).not.toContain('mediaId');
    expect(markdown).toContain('- mediaId: `mid-1`');
    expect(markdown).toContain('- mediaId: `mid-2`');
    expect(markdown).toContain('/transcription?textId=tid-1&mediaId=mid-2&unitId=uid-3');
  });

  it('ignores filtered-out units that are not in the basket', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1'],
      units: UNITS,
    });
    expect(payload.units.map((unit) => unit.unitId)).toEqual(['uid-1']);
    expect(formatCorpusWorksetPlain(payload)).not.toContain('second sentence');
  });

  it('returns empty strings for an empty workset', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: [],
      units: UNITS,
    });
    expect(formatCorpusWorksetPlain(payload)).toBe('');
    expect(formatCorpusWorksetMarkdown(payload)).toBe('');
    expect(formatCorpusWorksetHtml(payload)).toBe('');
  });

  it('formats html with escaped text and transcription deep links', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1'],
      units: [
        toCorpusWorksetExportUnit({
          id: 'uid-1',
          textId: 'tid-1',
          mediaId: 'mid-1',
          startTime: 1.5,
          endTime: 2,
          text: 'tone <script>alert(1)</script> & "q"',
          fallbackTextId: 'tid-1',
          fallbackMediaId: 'mid-1',
        }),
      ],
    });
    const html = formatCorpusWorksetHtml(payload);
    expect(html).toContain('data-jieyu-workset="1"');
    expect(html).toContain('<p>textId: tid-1 · mediaId: mid-1</p>');
    expect(html).toContain('href="/transcription?textId=tid-1&amp;mediaId=mid-1&amp;unitId=uid-1"');
    expect(html).toContain('00:01.5-00:02.0');
    expect(html).toContain('<code>uid-1</code>');
    expect(html).toContain('tone &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;');
    expect(html).not.toContain('<script>');
  });

  it('omits the html header mediaId when the workset spans media', () => {
    const first = UNITS.find((unit) => unit.unitId === 'uid-1');
    expect(first).toBeTruthy();
    if (!first) return;
    const mixed = [
      first,
      toCorpusWorksetExportUnit({
        id: 'uid-3',
        textId: 'tid-1',
        mediaId: 'mid-2',
        startTime: 5,
        endTime: 6,
        text: 'other media',
        fallbackTextId: 'tid-1',
        fallbackMediaId: 'mid-2',
      }),
    ];
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1', 'uid-3'],
      units: mixed,
    });
    const html = formatCorpusWorksetHtml(payload);
    expect(html).toContain('<p>textId: tid-1</p>');
    expect(html).not.toContain(' · mediaId:');
    expect(html).toContain('<code>mid-1</code>');
    expect(html).toContain('<code>mid-2</code>');
    expect(html).toContain('/transcription?textId=tid-1&amp;mediaId=mid-2&amp;unitId=uid-3');
  });

  it('classifies empty and over-cap export lengths', () => {
    expect(assessCorpusExportLength(0)).toBe('empty');
    expect(assessCorpusExportLength(CORPUS_EXPORT_MAX_CHARS)).toBe('ok');
    expect(assessCorpusExportLength(CORPUS_EXPORT_MAX_CHARS + 1)).toBe('too-long');
  });
});
