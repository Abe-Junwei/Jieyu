/**
 * 项目文件面板随库刷新：导入后「项目文件」不应停在「暂无文件」。
 * The project file pane follows the DB: after an import it must not stay on "no files yet".
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MediaItemDocType } from '../db';
import { observeProjectFileSources } from './projectFileOps';
import { registerImportedSource } from './sourceRecordService';

const TEXT_ID = 'text_files_observe';
const OTHER_TEXT_ID = 'text_files_other';
const NOW = '2026-10-09T08:00:00.000Z';

function media(id: string, textId: string): MediaItemDocType {
  return {
    id,
    textId,
    filename: `${id}.wav`,
    duration: 10,
    isOfflineCached: false,
    createdAt: NOW,
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
  };
}

describe('observeProjectFileSources', () => {
  let stop: (() => void) | undefined;

  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.texts.clear(),
      db.media_items.clear(),
      db.source_records.clear(),
      db.layer_units.clear(),
    ]);
    for (const id of [TEXT_ID, OTHER_TEXT_ID]) {
      await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW });
    }
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('fires once initially, then on media / source record changes of this project only', async () => {
    const onChange = vi.fn();
    stop = observeProjectFileSources(TEXT_ID, onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    await db.media_items.put(media('media_obs_1', TEXT_ID));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));

    await registerImportedSource({ textId: TEXT_ID, originalName: 'phrase.eaf', format: 'eaf' });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(3));

    // 其它项目的写入不触发 | Writes to another project do not fire
    await db.media_items.put(media('media_other_1', OTHER_TEXT_ID));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('does nothing for an empty textId', () => {
    const onChange = vi.fn();
    stop = observeProjectFileSources('  ', onChange);
    expect(onChange).not.toHaveBeenCalled();
  });
});
