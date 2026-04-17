// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { db, type LayerDocType, type LayerUnitDocType, type SpeakerDocType } from '../db';
import { SegmentMetaService } from '../services/SegmentMetaService';
import { getSidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { SidePaneSidebarSegmentList } from './SidePaneSidebarSegmentList';

const messages = getSidePaneSidebarMessages('zh-CN');

beforeEach(async () => {
  await db.open();
  await db.segment_meta.clear();
});

function makeLayer(partial: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'name'>): LayerDocType {
  return {
    id: partial.id,
    textId: partial.textId ?? 'text-1',
    key: partial.key ?? partial.id,
    layerType: partial.layerType ?? 'transcription',
    name: partial.name,
    languageId: partial.languageId ?? 'eng',
    modality: partial.modality ?? 'text',
    ...(partial.orthographyId !== undefined ? { orthographyId: partial.orthographyId } : {}),
    ...(partial.parentLayerId !== undefined ? { parentLayerId: partial.parentLayerId } : {}),
    ...(partial.constraint !== undefined ? { constraint: partial.constraint } : {}),
    ...(partial.sortOrder !== undefined ? { sortOrder: partial.sortOrder } : {}),
    createdAt: partial.createdAt ?? '2026-04-16T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-04-16T00:00:00.000Z',
  };
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  };
}

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    startTime,
    endTime,
    transcription: { default: id === 'utt-1' ? '第一句' : '第二句' },
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  };
}

function makeSpeaker(id: string, name: string): SpeakerDocType {
  return {
    id,
    name,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  };
}

describe('SidePaneSidebarSegmentList', () => {
  it('shows source-layer segments for a dependent selected layer and navigates on click', async () => {
    const onSelectTimelineUnit = vi.fn();
    const rootLayer = makeLayer({ id: 'root', name: { 'en-US': 'English' }, constraint: 'independent_boundary' });
    const dependentLayer = makeLayer({ id: 'dependent', name: { 'en-US': 'English Translation' }, parentLayerId: 'root', constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'seg-1',
        unitKind: 'segment',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'dependent',
        startTime: 0,
        endTime: 1.5,
        text: '',
      },
      {
        segmentId: 'seg-2',
        unitKind: 'segment',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'dependent',
        startTime: 1.5,
        endTime: 3,
        text: '',
      },
    ]);

    render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="dependent"
        messages={messages}
        layers={[rootLayer, dependentLayer]}
        defaultTranscriptionLayerId="root"
        segmentsByLayer={new Map([['root', [makeSegment('seg-1', 'root', 0, 1.5), makeSegment('seg-2', 'root', 1.5, 3)]]])}
        unitsOnCurrentMedia={[]}
        onSelectTimelineUnit={onSelectTimelineUnit}
      />,
    );

    const emptyRows = await screen.findAllByText('无内容');
    expect(emptyRows).toHaveLength(2);
    fireEvent.click(emptyRows[0] as HTMLElement);
    expect(onSelectTimelineUnit).toHaveBeenCalledWith({ layerId: 'root', unitId: 'seg-1', kind: 'segment' });
  });

  it('falls back to unit-kind rows for non-segment-backed layers', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const units = [makeUnit('utt-1', 0, 1), makeUnit('utt-2', 1, 2)];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '第二句',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={units}
      />,
    );

    const scoped = within(view.container);
    expect(await scoped.findByText('第一句')).toBeTruthy();
    expect(scoped.getByText('第二句')).toBeTruthy();
  });

  it('renders source segments even before segment_meta has hydrated', async () => {
    const onSelectTimelineUnit = vi.fn();
    const rootLayer = makeLayer({ id: 'root', name: { 'en-US': 'English' }, constraint: 'independent_boundary' });

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="root"
        messages={messages}
        layers={[rootLayer]}
        defaultTranscriptionLayerId="root"
        segmentsByLayer={new Map([['root', [makeSegment('seg-1', 'root', 0, 1.5), makeSegment('seg-2', 'root', 1.5, 3)]]])}
        unitsOnCurrentMedia={[]}
        onSelectTimelineUnit={onSelectTimelineUnit}
      />,
    );

    const scoped = within(view.container);
    const emptyRows = await scoped.findAllByText('无内容');
    expect(emptyRows.length).toBeGreaterThanOrEqual(2);
    const rowButtons = view.container.querySelectorAll<HTMLButtonElement>('.app-side-pane-segment-list-item-btn');
    expect(rowButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(rowButtons[0] as HTMLElement);
    expect(onSelectTimelineUnit).toHaveBeenCalledWith({ layerId: 'root', unitId: 'seg-1', kind: 'segment' });
  });

  it('keeps segment_meta text visible for segment-backed rows when fallback rows have no inline text', async () => {
    const rootLayer = makeLayer({ id: 'root', name: { 'en-US': 'English' }, constraint: 'independent_boundary' });
    const translationLayer = makeLayer({ id: 'translation', name: { 'en-US': 'Translation' }, parentLayerId: 'root', constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'seg-1',
        unitKind: 'segment',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'translation',
        startTime: 0,
        endTime: 1,
        text: '翻译内容',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="translation"
        messages={messages}
        layers={[rootLayer, translationLayer]}
        defaultTranscriptionLayerId="root"
        segmentsByLayer={new Map([['root', [makeSegment('seg-1', 'root', 0, 1)]]])}
        unitsOnCurrentMedia={[makeUnit('utt-1', 0, 1)]}
      />,
    );

    const scoped = within(view.container);
    expect(await scoped.findByText('翻译内容')).toBeTruthy();
    expect(scoped.queryByText('无内容')).toBeNull();
  });

  it('uses the live per-layer text resolver for segment-backed rows', async () => {
    const rootLayer = makeLayer({ id: 'root', name: { 'en-US': 'English' }, constraint: 'independent_boundary' });
    const translationLayer = makeLayer({ id: 'translation', name: { 'en-US': 'Translation' }, parentLayerId: 'root', constraint: 'symbolic_association' });

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="translation"
        messages={messages}
        layers={[rootLayer, translationLayer]}
        defaultTranscriptionLayerId="root"
        segmentsByLayer={new Map([['root', [makeSegment('seg-1', 'root', 0, 1)]]])}
        unitsOnCurrentMedia={[{ ...makeUnit('utt-1', 0, 1), transcription: { default: '' } }]}
        getUnitTextForLayer={(unit, layerId) => (
          unit.id === 'utt-1' && layerId === 'translation' ? '啊啊啊' : ''
        )}
      />,
    );

    const scoped = within(view.container);
    expect(await scoped.findByText('啊啊啊')).toBeTruthy();
    expect(scoped.queryByText('无内容')).toBeNull();
  });

  it('uses live segment content for segment-backed rows when the timeline text lives in segmentContentByLayer', async () => {
    const rootLayer = makeLayer({ id: 'root', name: { 'en-US': 'English' }, constraint: 'independent_boundary' });
    const translationLayer = makeLayer({ id: 'translation', name: { 'en-US': 'Translation' }, parentLayerId: 'root', constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'seg-1',
        unitKind: 'segment',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'translation',
        startTime: 0,
        endTime: 1,
        text: '',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="translation"
        messages={messages}
        layers={[rootLayer, translationLayer]}
        defaultTranscriptionLayerId="root"
        segmentsByLayer={new Map([['root', [makeSegment('seg-1', 'root', 0, 1)]]])}
        segmentContentByLayer={new Map([[
          'translation',
          new Map([['seg-1', {
            id: 'content-1',
            textId: 'text-1',
            layerId: 'translation',
            segmentId: 'seg-1',
            text: '哆呵',
            createdAt: '2026-04-16T00:00:00.000Z',
            updatedAt: '2026-04-16T00:00:00.000Z',
          }]]),
        ]])}
        unitsOnCurrentMedia={[]}
      />,
    );

    const scoped = within(view.container);
    expect(await scoped.findByText('哆呵')).toBeTruthy();
    expect(scoped.queryByText('无内容')).toBeNull();
  });

  it('shows the latest edited unit text immediately while segment_meta catches up', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '旧内容',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={[{ ...makeUnit('utt-1', 0, 1), transcription: { default: '旧内容' } }]}
      />,
    );

    const scoped = within(view.container);
    expect(await scoped.findByText('旧内容')).toBeTruthy();

    view.rerender(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={[{ ...makeUnit('utt-1', 0, 1), transcription: { default: '新内容' } }]}
      />,
    );

    expect(await scoped.findByText('新内容')).toBeTruthy();
    expect(scoped.queryByText('旧内容')).toBeNull();
  });

  it('builds filter facets from effective metadata and narrows the visible segment list', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const units = [
      { ...makeUnit('utt-1', 0, 1), speakerId: 'speaker-a', selfCertainty: 'certain' as const },
      { ...makeUnit('utt-2', 1, 2), speakerId: 'speaker-b', selfCertainty: 'uncertain' as const },
    ];
    const speakers = [makeSpeaker('speaker-a', 'Alice'), makeSpeaker('speaker-b', 'Bob')];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
        effectiveSpeakerId: 'speaker-a',
        effectiveSpeakerName: 'Alice',
        noteCategoryKeys: ['todo'],
        effectiveSelfCertainty: 'certain',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '第二句',
        effectiveSpeakerId: 'speaker-b',
        effectiveSpeakerName: 'Bob',
        noteCategoryKeys: ['comment'],
        effectiveSelfCertainty: 'uncertain',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={units}
        speakers={speakers}
      />,
    );

    const scoped = within(view.container);

    expect(await scoped.findByText('Alice')).toBeTruthy();
    expect(await scoped.findByText('待办')).toBeTruthy();
    expect(await scoped.findByText('确定')).toBeTruthy();

    fireEvent.click(await scoped.findByRole('button', { name: '筛选' }));
    const filterPanel = view.container.querySelector('.app-side-pane-segment-list-filter-panel') as HTMLElement;
    const panelScope = within(filterPanel);
    fireEvent.click(panelScope.getByRole('button', { name: '说话人' }));
    fireEvent.click(panelScope.getByRole('button', { name: /Alice/ }));
    fireEvent.click(panelScope.getByRole('button', { name: '备注分类' }));
    fireEvent.click(panelScope.getByRole('button', { name: /待办/ }));
    fireEvent.click(panelScope.getByRole('button', { name: '确信度' }));
    fireEvent.click(panelScope.getByRole('button', { name: /^确定/ }));

    expect(scoped.getByText('第一句')).toBeTruthy();
    expect(scoped.queryByText('第二句')).toBeNull();
  });

  it('matches the keyword field against actual segment text instead of derived status labels', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '这里有字',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '普通文本',
      },
      {
        segmentId: 'utt-3',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 2,
        endTime: 3,
        text: '',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={[
          { ...makeUnit('utt-1', 0, 1), transcription: { default: '这里有字' } },
          { ...makeUnit('utt-2', 1, 2), transcription: { default: '普通文本' } },
          { ...makeUnit('utt-3', 2, 3), transcription: { default: '' } },
        ]}
      />,
    );

    const scoped = within(view.container);
    const keywordInput = await scoped.findByLabelText(messages.segmentListFilterPlaceholder);

    fireEvent.change(keywordInput, { target: { value: '有' } });
    expect(scoped.getByText('这里有字')).toBeTruthy();
    expect(scoped.queryByText('普通文本')).toBeNull();
    expect(scoped.queryByText('无内容')).toBeNull();

    fireEvent.change(keywordInput, { target: { value: '无' } });
    expect(scoped.queryByText('这里有字')).toBeNull();
    expect(scoped.queryByText('普通文本')).toBeNull();
    expect(scoped.queryByText('无内容')).toBeNull();
    expect(scoped.getByText(messages.segmentListNoMatches)).toBeTruthy();
  });

  it('surfaces extended metadata facets from segment_meta and filters by them', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const units = [makeUnit('utt-1', 0, 1), makeUnit('utt-2', 1, 2)];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
        annotationStatus: 'verified',
        sourceType: 'human',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '',
        annotationStatus: 'raw',
        sourceType: 'ai',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={units}
      />,
    );

    const scoped = within(view.container);

    fireEvent.click(await scoped.findByRole('button', { name: '筛选' }));
    const filterPanel = view.container.querySelector('.app-side-pane-segment-list-filter-panel') as HTMLElement;
    const panelScope = within(filterPanel);
    expect(panelScope.getByRole('button', { name: '内容状态' })).toBeTruthy();
    expect(panelScope.getByRole('button', { name: '标注状态' })).toBeTruthy();
    expect(panelScope.getByRole('button', { name: '来源' })).toBeTruthy();

    fireEvent.click(panelScope.getByRole('button', { name: '内容状态' }));
    fireEvent.click(panelScope.getByRole('button', { name: /有内容/ }));
    fireEvent.click(panelScope.getByRole('button', { name: '标注状态' }));
    fireEvent.click(panelScope.getByRole('button', { name: /已校验/ }));
    fireEvent.click(panelScope.getByRole('button', { name: '来源' }));
    fireEvent.click(panelScope.getByRole('button', { name: /人工/ }));

    expect(scoped.getByText('第一句')).toBeTruthy();
    expect(scoped.queryByText('无内容')).toBeNull();
  });

  it('shows compact metadata list and supports multi-select chips', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '甲',
        annotationStatus: 'verified',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '乙',
        annotationStatus: 'raw',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        unitsOnCurrentMedia={[
          { ...makeUnit('utt-1', 0, 1), transcription: { default: '甲' } },
          { ...makeUnit('utt-2', 1, 2), transcription: { default: '乙' } },
        ]}
      />,
    );

    const scoped = within(view.container);
    fireEvent.click(await scoped.findByRole('button', { name: '筛选' }));
    const filterPanel = view.container.querySelector('.app-side-pane-segment-list-filter-panel') as HTMLElement;
    const panelScope = within(filterPanel);
    fireEvent.click(panelScope.getByRole('button', { name: '标注状态' }));
    fireEvent.click(panelScope.getByRole('button', { name: /原始/ }));
    fireEvent.click(panelScope.getByRole('button', { name: /已校验/ }));

    expect(scoped.getByText('甲')).toBeTruthy();
    expect(scoped.getByText('乙')).toBeTruthy();
  });

  it('renders selected filters as tags inside the search shell', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const speakers = [makeSpeaker('speaker-a', 'Alice')];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
        effectiveSpeakerId: 'speaker-a',
        effectiveSpeakerName: 'Alice',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        speakers={speakers}
        unitsOnCurrentMedia={[{ ...makeUnit('utt-1', 0, 1), speakerId: 'speaker-a', transcription: { default: '第一句' } }]}
      />,
    );

    const scoped = within(view.container);
    fireEvent.click(await scoped.findByRole('button', { name: '筛选' }));
    const filterPanel = view.container.querySelector('.app-side-pane-segment-list-filter-panel') as HTMLElement;
    const panelScope = within(filterPanel);
    fireEvent.click(panelScope.getByRole('button', { name: '说话人' }));
    fireEvent.click(panelScope.getByRole('button', { name: /Alice/ }));

    const searchShell = view.container.querySelector('.app-side-pane-segment-list-search-shell') as HTMLElement;
    const searchScope = within(searchShell);
    const tagButton = searchScope.getByRole('button', { name: 'Alice' });
    expect(tagButton.className).toContain('app-side-pane-segment-list-search-tag');
  });

  it('shows loading when media scope is pending and renders facet filters after context hydration', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const units = [{ ...makeUnit('utt-1', 0, 1), speakerId: 'speaker-a', selfCertainty: 'certain' as const }];
    const speakers = [makeSpeaker('speaker-a', 'Alice')];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'unit',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
        effectiveSpeakerId: 'speaker-a',
        effectiveSpeakerName: 'Alice',
        noteCategoryKeys: ['todo'],
        effectiveSelfCertainty: 'certain',
      },
    ]);

    const view = render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        speakers={speakers}
      />,
    );
    const scoped = within(view.container);

    expect(await scoped.findByText('正在加载语段…')).toBeTruthy();

    view.rerender(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        unitsOnCurrentMedia={units}
        speakers={speakers}
      />,
    );

    expect(await scoped.findByText('第一句')).toBeTruthy();
    fireEvent.click(await scoped.findByRole('button', { name: '筛选' }));
    const filterPanel = view.container.querySelector('.app-side-pane-segment-list-filter-panel') as HTMLElement;
    const panelScope = within(filterPanel);
    expect(panelScope.getByRole('button', { name: '说话人' })).toBeTruthy();
    expect(panelScope.getByRole('button', { name: '备注分类' })).toBeTruthy();
    expect(panelScope.getByRole('button', { name: '确信度' })).toBeTruthy();
    expect(scoped.queryByText('正在加载语段…')).toBeNull();
  });
});
