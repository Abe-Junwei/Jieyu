/**
 * C3a/C3b lite outbound: SubRip (SRT), W3C WebVTT, RFC 4180 CSV, TSV.
 *
 * Research: reuse SubRip + WebVTT cue conventions (no STYLE/NOTE/positioning) and
 * RFC 4180 quoting; do not add a caption library. Rows come from the same
 * `layer_units` read model as EAF/TextGrid export — serialize only, never write back.
 */

export const TRANSCRIPTION_LITE_EXPORT_FORMATS = ['srt', 'vtt', 'csv', 'tsv'] as const;

export type TranscriptionLiteExportFormat = (typeof TRANSCRIPTION_LITE_EXPORT_FORMATS)[number];

export type TranscriptionLiteExportCue = {
  startSec: number;
  endSec: number;
  text: string;
  speaker: string;
  gloss: string;
};

export type TranscriptionLiteExportPayload = {
  body: string;
  extension: 'srt' | 'vtt' | 'csv' | 'tsv';
  mime: string;
};

const LITE_EXPORT_META: Record<
  TranscriptionLiteExportFormat,
  { extension: TranscriptionLiteExportPayload['extension']; mime: string }
> = {
  srt: { extension: 'srt', mime: 'application/x-subrip' },
  vtt: { extension: 'vtt', mime: 'text/vtt' },
  csv: { extension: 'csv', mime: 'text/csv;charset=utf-8' },
  tsv: { extension: 'tsv', mime: 'text/tab-separated-values;charset=utf-8' },
};

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function clampNonNegative(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return seconds;
}

export function formatSubtitleTimestamp(seconds: number, millisecondSeparator: ',' | '.'): string {
  const totalMs = Math.round(clampNonNegative(seconds) * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}${millisecondSeparator}${pad(ms, 3)}`;
}

function firstLocalizedValue(value: Record<string, string> | undefined): string {
  if (!value) return '';
  const preferred = value.default ?? value.eng ?? value.zho ?? value.en ?? value.zh;
  if (typeof preferred === 'string' && preferred.trim().length > 0) return preferred;
  for (const entry of Object.values(value)) {
    if (typeof entry === 'string' && entry.trim().length > 0) return entry;
  }
  return '';
}

function joinWordGlosses(
  words: Array<{ gloss?: Record<string, string> | undefined }> | undefined,
): string {
  if (!words || words.length === 0) return '';
  return words
    .map((word) => firstLocalizedValue(word.gloss))
    .filter((gloss) => gloss.length > 0)
    .join(' ');
}

export function toTranscriptionLiteExportCues(
  units: Array<{
    id: string;
    startTime: number;
    endTime: number;
    speakerId?: string | undefined;
    speaker?: string | undefined;
    transcription?: Record<string, string> | undefined;
    words?: Array<{ gloss?: Record<string, string> | undefined }> | undefined;
  }>,
  speakerNameById: ReadonlyMap<string, string>,
): TranscriptionLiteExportCue[] {
  return [...units]
    .sort((a, b) => {
      const startDelta = a.startTime - b.startTime;
      if (startDelta !== 0) return startDelta;
      return a.id.localeCompare(b.id);
    })
    .map((unit) => {
      const startSec = clampNonNegative(unit.startTime);
      const endSec = Math.max(startSec, clampNonNegative(unit.endTime));
      const speakerId = unit.speakerId?.trim() ?? '';
      const speakerFromId = speakerId.length > 0 ? (speakerNameById.get(speakerId) ?? '') : '';
      const speakerName = typeof unit.speaker === 'string' ? unit.speaker.trim() : '';
      const speaker = speakerName.length > 0 ? speakerName : speakerFromId;
      return {
        startSec,
        endSec,
        text: firstLocalizedValue(unit.transcription),
        speaker,
        gloss: joinWordGlosses(unit.words),
      };
    });
}

function sanitizeSrtText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sanitizeVttText(text: string): string {
  return sanitizeSrtText(text).replace(/-->/g, '→').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function serializeSrt(cues: TranscriptionLiteExportCue[]): string {
  if (cues.length === 0) return '';
  return `${cues
    .map((cue, index) => {
      const start = formatSubtitleTimestamp(cue.startSec, ',');
      const end = formatSubtitleTimestamp(cue.endSec, ',');
      return `${index + 1}\n${start} --> ${end}\n${sanitizeSrtText(cue.text)}`;
    })
    .join('\n\n')}\n`;
}

function serializeVtt(cues: TranscriptionLiteExportCue[]): string {
  const blocks = cues.map((cue) => {
    const start = formatSubtitleTimestamp(cue.startSec, '.');
    const end = formatSubtitleTimestamp(cue.endSec, '.');
    return `${start} --> ${end}\n${sanitizeVttText(cue.text)}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}${cues.length > 0 ? '\n' : ''}`;
}

function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function tsvField(value: string): string {
  return value
    .replace(/\t/g, ' ')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ');
}

function formatClockSeconds(seconds: number): string {
  return clampNonNegative(seconds).toFixed(3);
}

function serializeCsv(cues: TranscriptionLiteExportCue[]): string {
  const header = 'start,end,speaker,text,gloss';
  const rows = cues.map((cue) =>
    [
      formatClockSeconds(cue.startSec),
      formatClockSeconds(cue.endSec),
      csvField(cue.speaker),
      csvField(cue.text),
      csvField(cue.gloss),
    ].join(','),
  );
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

function serializeTsv(cues: TranscriptionLiteExportCue[]): string {
  const header = 'start\tend\tspeaker\ttext\tgloss';
  const rows = cues.map((cue) =>
    [
      formatClockSeconds(cue.startSec),
      formatClockSeconds(cue.endSec),
      tsvField(cue.speaker),
      tsvField(cue.text),
      tsvField(cue.gloss),
    ].join('\t'),
  );
  return `\uFEFF${[header, ...rows].join('\n')}\n`;
}

export function serializeTranscriptionLiteExport(
  cues: TranscriptionLiteExportCue[],
  format: TranscriptionLiteExportFormat,
): TranscriptionLiteExportPayload {
  const meta = LITE_EXPORT_META[format];
  if (format === 'srt') return { body: serializeSrt(cues), ...meta };
  if (format === 'vtt') return { body: serializeVtt(cues), ...meta };
  if (format === 'csv') return { body: serializeCsv(cues), ...meta };
  return { body: serializeTsv(cues), ...meta };
}

export function downloadTranscriptionExportText(
  filename: string,
  content: string,
  mime: string,
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
