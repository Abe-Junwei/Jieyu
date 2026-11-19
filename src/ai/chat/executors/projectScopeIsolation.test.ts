/**
 * #589：scope 'project' 必须停在当前 workspaceTextId。
 * 两个项目同时在库里时，空索引、不完整索引、缺上下文都不能读出另一个项目。
 * 显式不带 textId 的查询门面仍是合法全库读取。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../db/engine';
import type { SegmentMetaDocType } from '../../../db/types';
import { executeLocalContextToolCall } from '../localContextTools';
import type { AiPromptContext } from '../chatDomain.types';
import type { TimelineUnitView } from '../../../hooks/transcription/timelineUnitView';
import { SegmentMetaService } from '../../../services/SegmentMetaService';
import { listSegmentSummaries } from '../../queries/segmentReadQueries';
import { loadScopedSegmentMetaRows } from './timelineExecutors';

const NOW = '2026-11-19T00:00:00.000Z';

function meta(partial: {
  id: string;
  textId: string;
  mediaId: string;
  layerId: string;
  text: string;
  startTime: number;
  speakerId?: string;
}): SegmentMetaDocType {
  return {
    id: partial.id,
    segmentId: partial.id,
    unitKind: 'segment',
    textId: partial.textId,
    mediaId: partial.mediaId,
    layerId: partial.layerId,
    startTime: partial.startTime,
    endTime: partial.startTime + 1,
    text: partial.text,
    normalizedText: partial.text.toLowerCase(),
    hasText: partial.text.trim().length > 0,
    ...(partial.speakerId ? { effectiveSpeakerId: partial.speakerId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function indexRow(partial: {
  id: string;
  text?: string;
  textId?: string;
  mediaId?: string;
  layerId?: string;
  startTime?: number;
}): TimelineUnitView {
  return {
    id: partial.id,
    kind: 'segment',
    mediaId: partial.mediaId ?? 'media-a',
    layerId: partial.layerId ?? 'layer-a',
    startTime: partial.startTime ?? 0,
    endTime: (partial.startTime ?? 0) + 1,
    text: partial.text ?? partial.id,
    ...(partial.textId ? { textId: partial.textId } : {}),
  };
}

function context(partial: {
  workspaceTextId?: string;
  localUnitIndex?: TimelineUnitView[];
  currentMediaId?: string;
}): AiPromptContext {
  return {
    shortTerm: {
      ...(partial.workspaceTextId ? { workspaceTextId: partial.workspaceTextId } : {}),
      ...(partial.localUnitIndex
        ? { localUnitIndex: partial.localUnitIndex }
        : { localUnitIndex: [] }),
      ...(partial.currentMediaId ? { currentMediaId: partial.currentMediaId } : {}),
    },
    longTerm: {},
  };
}

function matchIds(result: { ok: boolean; result: unknown }): string[] {
  const payload = result.result as { matches?: Array<{ id: string }> } | null;
  return (payload?.matches ?? []).map((row) => row.id);
}

describe('project scope does not read other projects (#589)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.segment_meta.bulkAdd([
      meta({
        id: 'seg-a1',
        textId: 'text-a',
        mediaId: 'media-a',
        layerId: 'layer-a',
        text: 'alpha hello',
        startTime: 0,
        speakerId: 'spk-shared',
      }),
      meta({
        id: 'seg-a2',
        textId: 'text-a',
        mediaId: 'media-a',
        layerId: 'layer-a',
        text: 'alpha second',
        startTime: 1,
      }),
      meta({
        id: 'seg-shared-a',
        textId: 'text-a',
        mediaId: 'media-shared',
        layerId: 'layer-shared',
        text: 'shared alpha',
        startTime: 2,
      }),
      meta({
        id: 'seg-b1',
        textId: 'text-b',
        mediaId: 'media-b',
        layerId: 'layer-b',
        text: 'bravo hello',
        startTime: 0,
        speakerId: 'spk-shared',
      }),
      meta({
        id: 'seg-shared-b',
        textId: 'text-b',
        mediaId: 'media-shared',
        layerId: 'layer-shared',
        text: 'shared bravo',
        startTime: 3,
      }),
    ]);
  });

  it('lists and searches only the workspace project when the unit index is empty', async () => {
    const ctx = context({ workspaceTextId: 'text-a', localUnitIndex: [] });
    const ref = { current: 0 };
    const listAll = vi.spyOn(SegmentMetaService, 'listAll');

    const listed = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'project', limit: 20 } },
      ctx,
      ref,
    );
    const searched = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { scope: 'project', query: 'hello', limit: 20 } },
      ctx,
      ref,
    );
    const detailForeign = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-b1' } },
      ctx,
      ref,
    );
    const detailOwn = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-a2' } },
      ctx,
      ref,
    );
    const timelineRows = await loadScopedSegmentMetaRows(ctx, 'project');

    expect(listed.ok).toBe(true);
    expect(matchIds(listed).sort()).toEqual(['seg-a1', 'seg-a2', 'seg-shared-a']);
    expect(searched.ok).toBe(true);
    expect(matchIds(searched)).toEqual(['seg-a1']);
    expect(detailForeign.ok).toBe(false);
    expect(JSON.stringify(detailForeign.result)).not.toContain('bravo');
    expect(detailOwn.ok).toBe(true);
    expect((detailOwn.result as { id: string }).id).toBe('seg-a2');
    expect(timelineRows?.map((row) => row.segmentId).sort()).toEqual([
      'seg-a1',
      'seg-a2',
      'seg-shared-a',
    ]);
    expect(listAll).not.toHaveBeenCalled();
    listAll.mockRestore();
  });

  it('keeps an explicit workspace when the index is incomplete or names another project', async () => {
    const ctx = context({
      workspaceTextId: 'text-a',
      localUnitIndex: [
        indexRow({
          id: 'seg-b1',
          text: 'bravo hello',
          textId: 'text-b',
          mediaId: 'media-b',
          layerId: 'layer-b',
        }),
        indexRow({ id: 'seg-a1', text: 'alpha hello', textId: 'text-a' }),
        // segmentToView omits textId, so this row has no project ownership.
        indexRow({ id: 'seg-untagged', text: 'bravo hello', startTime: 4 }),
      ],
    });
    const ref = { current: 0 };

    const listed = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'all', limit: 20 } },
      ctx,
      ref,
    );
    const searched = await executeLocalContextToolCall(
      {
        name: 'search_units',
        arguments: { scope: 'global', query: 'hello', speakerId: 'spk-shared', limit: 20 },
      },
      ctx,
      ref,
    );

    expect(listed.ok).toBe(true);
    expect(matchIds(listed)).not.toContain('seg-b1');
    expect(matchIds(listed)).not.toContain('seg-untagged');
    expect(matchIds(listed)).toEqual(expect.arrayContaining(['seg-a1', 'seg-a2']));
    expect(searched.ok).toBe(true);
    expect(matchIds(searched)).toEqual(['seg-a1']);
  });

  it('drops unknown-ownership index rows when the current project has no segment_meta rows', async () => {
    await db.segment_meta.where('textId').equals('text-a').delete();
    const ctx = context({
      workspaceTextId: 'text-a',
      localUnitIndex: [
        indexRow({
          id: 'seg-b1',
          text: 'bravo hello',
          textId: 'text-b',
          mediaId: 'media-b',
          layerId: 'layer-b',
        }),
        indexRow({ id: 'seg-local', text: 'unsaved local', startTime: 4 }),
      ],
    });
    const ref = { current: 0 };

    const listed = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'project', limit: 20 } },
      ctx,
      ref,
    );
    const detail = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-b1' } },
      ctx,
      ref,
    );

    const searched = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { scope: 'project', query: 'unsaved', limit: 20 } },
      ctx,
      ref,
    );
    const detailUntagged = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-local' } },
      ctx,
      ref,
    );

    expect(listed.ok).toBe(true);
    expect(matchIds(listed)).toEqual([]);
    expect(searched.ok).toBe(true);
    expect(matchIds(searched)).toEqual([]);
    expect(detail.ok).toBe(false);
    expect(detailUntagged.ok).toBe(false);
    expect(JSON.stringify(listed)).not.toContain('bravo hello');
    expect(JSON.stringify(listed)).not.toContain('unsaved local');
    expect(JSON.stringify(searched)).not.toContain('unsaved local');
    expect(JSON.stringify(detail)).not.toContain('bravo hello');
    expect(JSON.stringify(detailUntagged)).not.toContain('unsaved local');
  });

  it('does not widen to the whole library when project context has no text id', async () => {
    const ctx = context({
      localUnitIndex: [
        indexRow({
          id: 'seg-b1',
          text: 'bravo hello',
          textId: 'text-b',
          mediaId: 'media-b',
          layerId: 'layer-b',
        }),
        indexRow({ id: 'seg-untagged', text: 'bravo hello', startTime: 4 }),
      ],
    });
    const ref = { current: 0 };
    const listAll = vi.spyOn(SegmentMetaService, 'listAll');
    const search = vi.spyOn(SegmentMetaService, 'searchSegmentMeta');

    const listed = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'project', limit: 20 } },
      ctx,
      ref,
    );
    const searched = await executeLocalContextToolCall(
      { name: 'search_units', arguments: { scope: 'project', query: 'hello', limit: 20 } },
      ctx,
      ref,
    );
    const detail = await executeLocalContextToolCall(
      { name: 'get_unit_detail', arguments: { scope: 'project', unitId: 'seg-b1' } },
      ctx,
      ref,
    );

    expect(listed.ok).toBe(false);
    expect(listed.error).toBe('data_loading');
    expect(searched.ok).toBe(false);
    expect(searched.error).toBe('data_loading');
    expect(detail.ok).toBe(false);
    expect(detail.error).toBe('data_loading');
    expect(JSON.stringify(listed.result)).not.toContain('seg-b1');
    expect(JSON.stringify(searched.result)).not.toContain('bravo');
    expect(JSON.stringify(detail.result)).not.toContain('bravo');
    expect(listAll).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    listAll.mockRestore();
    search.mockRestore();
  });

  it('still reads every project when the query facade is explicitly unscoped', async () => {
    const allRows = await SegmentMetaService.listAll();
    const summaries = await listSegmentSummaries({}, 20, 0);
    const hits = await SegmentMetaService.searchSegmentMeta({ query: 'hello' });

    expect(allRows.map((row) => row.segmentId).sort()).toEqual([
      'seg-a1',
      'seg-a2',
      'seg-b1',
      'seg-shared-a',
      'seg-shared-b',
    ]);
    expect(summaries.total).toBe(5);
    expect(summaries.segments.map((row) => row.id).sort()).toEqual([
      'seg-a1',
      'seg-a2',
      'seg-b1',
      'seg-shared-a',
      'seg-shared-b',
    ]);
    expect(hits.map((row) => row.segmentId).sort()).toEqual(['seg-a1', 'seg-b1']);
  });

  it('does not change current_track when two projects share a media id', async () => {
    const ctx = context({
      workspaceTextId: 'text-a',
      localUnitIndex: [],
      currentMediaId: 'media-shared',
    });
    const ref = { current: 0 };

    const listed = await executeLocalContextToolCall(
      { name: 'list_units', arguments: { scope: 'current_track', limit: 20 } },
      ctx,
      ref,
    );

    expect(listed.ok).toBe(true);
    expect(matchIds(listed)).toEqual(['seg-shared-a', 'seg-shared-b']);
  });
});
