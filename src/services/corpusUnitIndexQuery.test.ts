import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { projectCorpusUnitIndexRows } from './corpusUnitIndexQuery';

function unit(partial: {
  id: string;
  textId?: string;
  mediaId?: string;
  layerId?: string;
  startTime: number;
  endTime?: number;
  defaultText?: string;
}): LayerUnitDocType {
  return {
    id: partial.id,
    textId: partial.textId ?? 'tid-1',
    mediaId: partial.mediaId,
    layerId: partial.layerId,
    startTime: partial.startTime,
    endTime: partial.endTime ?? partial.startTime + 1,
    createdAt: '',
    updatedAt: '',
    ...(partial.defaultText !== undefined
      ? { transcription: { default: partial.defaultText } }
      : {}),
  };
}

describe('projectCorpusUnitIndexRows', () => {
  it('sorts by mediaId, then startTime, then unit id', () => {
    const rows = projectCorpusUnitIndexRows([
      unit({ id: 'u-b', mediaId: 'mid-2', startTime: 1, defaultText: 'b' }),
      unit({ id: 'u-a2', mediaId: 'mid-1', startTime: 2, defaultText: 'a2' }),
      unit({ id: 'u-a1', mediaId: 'mid-1', startTime: 1, defaultText: 'a1' }),
      unit({ id: 'u-a0', mediaId: 'mid-1', startTime: 1, defaultText: 'a0' }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['u-a0', 'u-a1', 'u-a2', 'u-b']);
  });

  it('projects default text and empty media/layer fallbacks', () => {
    const [row] = projectCorpusUnitIndexRows([
      unit({ id: 'u-empty', startTime: 0, defaultText: 'hello' }),
    ]);
    expect(row).toMatchObject({
      id: 'u-empty',
      textId: 'tid-1',
      mediaId: '',
      layerId: '',
      defaultText: 'hello',
    });
  });

  it('keeps units from more than one media', () => {
    const rows = projectCorpusUnitIndexRows([
      unit({ id: 'u-1', mediaId: 'mid-1', startTime: 0, defaultText: 'one' }),
      unit({ id: 'u-2', mediaId: 'mid-2', startTime: 0, defaultText: 'two' }),
    ]);
    expect(rows.map((row) => row.mediaId)).toEqual(['mid-1', 'mid-2']);
  });
});
