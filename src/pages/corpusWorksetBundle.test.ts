// @vitest-environment jsdom

import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCorpusWorksetBundleZip,
  CORPUS_WORKSET_BUNDLE_KIND,
  corpusWorksetBundleFileName,
  downloadCorpusWorksetBundle,
} from './corpusWorksetBundle';
import {
  buildCorpusWorksetExportPayload,
  CORPUS_EXPORT_MAX_CHARS,
  toCorpusWorksetExportUnit,
} from './corpusWorksetExport';

const UNIT = toCorpusWorksetExportUnit({
  id: 'uid-1',
  textId: 'tid-1',
  mediaId: 'mid-1',
  startTime: 1.5,
  endTime: 2,
  text: 'first sentence',
  fallbackTextId: 'tid-1',
  fallbackMediaId: 'mid-1',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('corpusWorksetBundle', () => {
  it('zips readme, snippets, and manifest for a non-empty workset', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1'],
      units: [UNIT],
    });
    const result = buildCorpusWorksetBundleZip(payload, '2026-09-05T00:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const files = unzipSync(result.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'README.txt',
      'manifest.json',
      'snippets.html',
      'snippets.md',
      'snippets.txt',
    ]);
    const readme = strFromU8(files['README.txt'] ?? new Uint8Array());
    expect(readme).toContain('Jieyu corpus workset bundle');
    expect(readme).toContain('textId: tid-1');
    expect(readme).toContain('mediaId: mid-1');
    const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as {
      kind: string;
      unitIds: string[];
      mediaId: string | null;
    };
    expect(manifest.kind).toBe(CORPUS_WORKSET_BUNDLE_KIND);
    expect(manifest.unitIds).toEqual(['uid-1']);
    expect(manifest.mediaId).toBe('mid-1');
    expect(strFromU8(files['snippets.txt'] ?? new Uint8Array())).toContain('first sentence');
    expect(strFromU8(files['snippets.md'] ?? new Uint8Array())).toContain(
      '/transcription?textId=tid-1&mediaId=mid-1&unitId=uid-1',
    );
    expect(strFromU8(files['snippets.html'] ?? new Uint8Array())).toContain(
      'data-jieyu-workset="1"',
    );
  });

  it('does not build a zip for an empty workset', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: [],
      units: [UNIT],
    });
    expect(buildCorpusWorksetBundleZip(payload, '2026-09-05T00:00:00.000Z')).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('rejects a workset over the export cap', () => {
    const payload = buildCorpusWorksetExportPayload({
      textId: 'tid-1',
      mediaId: 'mid-1',
      basketUnitIds: ['uid-1'],
      units: [
        toCorpusWorksetExportUnit({
          id: 'uid-1',
          textId: 'tid-1',
          mediaId: 'mid-1',
          startTime: 0,
          endTime: 1,
          text: 'x'.repeat(CORPUS_EXPORT_MAX_CHARS),
          fallbackTextId: 'tid-1',
          fallbackMediaId: 'mid-1',
        }),
      ],
    });
    expect(buildCorpusWorksetBundleZip(payload, '2026-09-05T00:00:00.000Z')).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('sanitizes the download file name and triggers a zip download', () => {
    expect(corpusWorksetBundleFileName('tid 1/../x')).toBe('jieyu-workset-tid_1_x.zip');
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:workset');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.fn();
    const originalCreate = Document.prototype.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreate(tagName);
      if (tagName === 'a') {
        el.click = click;
      }
      return el;
    });
    expect(downloadCorpusWorksetBundle(new Uint8Array([1, 2, 3]), 'tid-1')).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:workset');
  });
});
