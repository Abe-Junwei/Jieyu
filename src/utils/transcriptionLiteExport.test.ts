import { describe, expect, it } from 'vitest';
import {
  formatSubtitleTimestamp,
  serializeTranscriptionLiteExport,
  toTranscriptionLiteExportCues,
} from './transcriptionLiteExport';

const CUES = [
  {
    startSec: 1.5,
    endSec: 2,
    text: 'first line',
    speaker: 'A',
    gloss: 'run',
  },
  {
    startSec: 3,
    endSec: 4.25,
    text: 'say "hello", then go',
    speaker: 'B',
    gloss: '',
  },
];

describe('transcriptionLiteExport', () => {
  it('formats SRT timestamps with a comma and VTT timestamps with a period', () => {
    expect(formatSubtitleTimestamp(1.5, ',')).toBe('00:00:01,500');
    expect(formatSubtitleTimestamp(1.5, '.')).toBe('00:00:01.500');
    expect(formatSubtitleTimestamp(-2, ',')).toBe('00:00:00,000');
  });

  it('builds cues from units using default text, speaker map, and word glosses', () => {
    const cues = toTranscriptionLiteExportCues(
      [
        {
          id: 'u-2',
          startTime: 3,
          endTime: 4,
          speakerId: 'spk-b',
          transcription: { default: 'second' },
        },
        {
          id: 'u-1',
          startTime: 1,
          endTime: 0.5,
          speaker: 'A',
          transcription: { default: 'first' },
          words: [{ gloss: { eng: 'go' } }, { gloss: { eng: 'out' } }],
        },
      ],
      new Map([['spk-b', 'Bee']]),
    );
    expect(cues).toEqual([
      { startSec: 1, endSec: 1, text: 'first', speaker: 'A', gloss: 'go out' },
      { startSec: 3, endSec: 4, text: 'second', speaker: 'Bee', gloss: '' },
    ]);
  });

  it('serializes SubRip with numbered cues and comma timestamps', () => {
    const payload = serializeTranscriptionLiteExport(CUES, 'srt');
    expect(payload.extension).toBe('srt');
    expect(payload.mime).toBe('application/x-subrip');
    expect(payload.body).toBe(
      [
        '1',
        '00:00:01,500 --> 00:00:02,000',
        'first line',
        '',
        '2',
        '00:00:03,000 --> 00:00:04,250',
        'say "hello", then go',
        '',
      ].join('\n'),
    );
  });

  it('serializes WebVTT with a WEBVTT header and period timestamps', () => {
    const payload = serializeTranscriptionLiteExport(
      [{ ...CUES[0]!, text: 'a --> b <tag> & c' }],
      'vtt',
    );
    expect(payload.extension).toBe('vtt');
    expect(payload.body).toBe(
      ['WEBVTT', '', '00:00:01.500 --> 00:00:02.000', 'a → b &lt;tag> &amp; c', ''].join('\n'),
    );
  });

  it('serializes RFC 4180 CSV with a UTF-8 BOM and quoted commas', () => {
    const payload = serializeTranscriptionLiteExport(CUES, 'csv');
    expect(payload.extension).toBe('csv');
    expect(payload.body.startsWith('\uFEFF')).toBe(true);
    expect(payload.body).toContain('start,end,speaker,text,gloss');
    expect(payload.body).toContain('1.500,2.000,A,first line,run');
    expect(payload.body).toContain('3.000,4.250,B,"say ""hello"", then go",');
  });

  it('serializes TSV without raw tabs in fields', () => {
    const payload = serializeTranscriptionLiteExport(
      [{ startSec: 0, endSec: 1, text: 'a\tb', speaker: 's', gloss: 'g\nx' }],
      'tsv',
    );
    expect(payload.extension).toBe('tsv');
    const lines = payload.body
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\n');
    expect(lines[0]).toBe('start\tend\tspeaker\ttext\tgloss');
    expect(lines[1]).toBe('0.000\t1.000\ts\ta b\tg x');
  });
});
