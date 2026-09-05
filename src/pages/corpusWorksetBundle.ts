import { strToU8, zipSync } from 'fflate';
import {
  assessCorpusExportLength,
  formatCorpusWorksetHtml,
  formatCorpusWorksetMarkdown,
  formatCorpusWorksetPlain,
  type CorpusWorksetExportPayload,
} from './corpusWorksetExport';

export const CORPUS_WORKSET_BUNDLE_KIND = 'jieyu-corpus-workset-bundle';

export type CorpusWorksetBundleManifest = {
  kind: typeof CORPUS_WORKSET_BUNDLE_KIND;
  version: 1;
  exportedAt: string;
  textId: string;
  mediaId: string | null;
  unitCount: number;
  unitIds: string[];
  formats: ['text/plain', 'text/markdown', 'text/html'];
};

export type CorpusWorksetBundleBuildResult =
  | { ok: true; bytes: Uint8Array; manifest: CorpusWorksetBundleManifest }
  | { ok: false; reason: 'empty' | 'too-long' };

function worksetBundleReadme(manifest: CorpusWorksetBundleManifest): string {
  const lines = ['Jieyu corpus workset bundle', '', `textId: ${manifest.textId}`];
  if (manifest.mediaId !== null && manifest.mediaId.length > 0) {
    lines.push(`mediaId: ${manifest.mediaId}`);
  }
  lines.push(
    `units: ${manifest.unitCount}`,
    `exportedAt: ${manifest.exportedAt}`,
    '',
    'Files: README.txt, snippets.txt, snippets.md, snippets.html, manifest.json',
  );
  return lines.join('\n');
}

export function buildCorpusWorksetBundleZip(
  payload: CorpusWorksetExportPayload,
  exportedAt: string,
): CorpusWorksetBundleBuildResult {
  if (payload.units.length === 0) return { ok: false, reason: 'empty' };
  const plain = formatCorpusWorksetPlain(payload);
  const markdown = formatCorpusWorksetMarkdown(payload);
  const html = formatCorpusWorksetHtml(payload);
  const size = assessCorpusExportLength(plain.length + markdown.length + html.length);
  if (size !== 'ok') return { ok: false, reason: size };
  const manifest: CorpusWorksetBundleManifest = {
    kind: CORPUS_WORKSET_BUNDLE_KIND,
    version: 1,
    exportedAt,
    textId: payload.textId,
    mediaId: payload.mediaId.length > 0 ? payload.mediaId : null,
    unitCount: payload.units.length,
    unitIds: payload.units.map((unit) => unit.unitId),
    formats: ['text/plain', 'text/markdown', 'text/html'],
  };
  const files: Record<string, Uint8Array> = {
    'README.txt': strToU8(worksetBundleReadme(manifest)),
    'snippets.txt': strToU8(plain),
    'snippets.md': strToU8(markdown),
    'snippets.html': strToU8(html),
    'manifest.json': strToU8(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  return { ok: true, bytes: zipSync(files), manifest };
}

export function corpusWorksetBundleFileName(textId: string): string {
  const safe = textId.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `jieyu-workset-${safe.length > 0 ? safe : 'export'}.zip`;
}

export function downloadCorpusWorksetBundle(bytes: Uint8Array, textId: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = corpusWorksetBundleFileName(textId);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}
