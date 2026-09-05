import { assessCorpusExportLength, type CorpusExportLengthStatus } from './corpusWorksetExport';

export type CorpusClipboardWriteResult =
  | { ok: true }
  | { ok: false; reason: Exclude<CorpusExportLengthStatus, 'ok'> | 'unavailable' };

function clipboardWriteTextAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';
}

function clipboardItemWriteAvailable(): boolean {
  return (
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  );
}

export async function writeCorpusWorksetClipboard(
  text: string,
): Promise<CorpusClipboardWriteResult> {
  const size = assessCorpusExportLength(text.length);
  if (size !== 'ok') return { ok: false, reason: size };
  if (!clipboardWriteTextAvailable()) return { ok: false, reason: 'unavailable' };
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function writeCorpusWorksetHtmlClipboard(payload: {
  html: string;
  plain: string;
}): Promise<CorpusClipboardWriteResult> {
  const size = assessCorpusExportLength(payload.html.length + payload.plain.length);
  if (size !== 'ok') return { ok: false, reason: size };
  try {
    if (clipboardItemWriteAvailable()) {
      const item = new ClipboardItem({
        'text/html': new Blob([payload.html], { type: 'text/html' }),
        'text/plain': new Blob([payload.plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return { ok: true };
    }
    if (clipboardWriteTextAvailable()) {
      await navigator.clipboard.writeText(payload.plain);
      return { ok: true };
    }
    return { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
