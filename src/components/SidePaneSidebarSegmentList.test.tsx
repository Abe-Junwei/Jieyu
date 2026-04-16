// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { db, type LayerDocType, type LayerSegmentDocType, type SpeakerDocType, type UtteranceDocType } from '../db';
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

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerSegmentDocType {
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

function makeUtterance(id: string, startTime: number, endTime: number): UtteranceDocType {
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
        utterancesOnCurrentMedia={[]}
        onSelectTimelineUnit={onSelectTimelineUnit}
      />,
    );

    const emptyRows = await screen.findAllByText('无内容');
    expect(emptyRows).toHaveLength(2);
    fireEvent.click(emptyRows[0] as HTMLElement);
    expect(onSelectTimelineUnit).toHaveBeenCalledWith({ layerId: 'root', unitId: 'seg-1', kind: 'segment' });
  });

  it('falls back to utterance-kind rows for non-segment-backed layers', async () => {
    const onSelectTimelineUnit = vi.fn();
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const utterances = [makeUtterance('utt-1', 0, 1), makeUtterance('utt-2', 1, 2)];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'utterance',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 0,
        endTime: 1,
        text: '第一句',
      },
      {
        segmentId: 'utt-2',
        unitKind: 'utterance',
        textId: 'text-1',
        mediaId: 'media-1',
        layerId: 'plain',
        startTime: 1,
        endTime: 2,
        text: '第二句',
      },
    ]);

    render(
      <SidePaneSidebarSegmentList
        focusedLayerRowId="plain"
        messages={messages}
        layers={[plainLayer]}
        defaultTranscriptionLayerId="plain"
        segmentsByLayer={new Map()}
        utterancesOnCurrentMedia={utterances}
        onSelectTimelineUnit={onSelectTimelineUnit}
      />,
    );

    expect(await screen.findByText('第一句')).toBeTruthy();
    fireEvent.click(await screen.findByText('第二句'));
    expect(onSelectTimelineUnit).toHaveBeenCalledWith({ layerId: 'plain', unitId: 'utt-2', kind: 'utterance' });
  });

  it('builds filter facets from effective metadata and narrows the visible segment list', async () => {
    const plainLayer = makeLayer({ id: 'plain', name: { 'en-US': 'Plain Layer' }, constraint: 'symbolic_association' });
    const utterances = [
      { ...makeUtterance('utt-1', 0, 1), speakerId: 'speaker-a', selfCertainty: 'certain' as const },
      { ...makeUtterance('utt-2', 1, 2), speakerId: 'speaker-b', selfCertainty: 'uncertain' as const },
    ];
    const speakers = [makeSpeaker('speaker-a', 'Alice'), makeSpeaker('speaker-b', 'Bob')];

    await SegmentMetaService.upsertDocs([
      {
        segmentId: 'utt-1',
        unitKind: 'utterance',
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
        unitKind: 'utterance',
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
        utterancesOnCurrentMedia={utterances}
        speakers={speakers}
      />,
    );

    const scoped = within(view.container);

    expect(await scoped.findByText('Alice')).toBeTruthy();
    expect(scoped.getByText('待办')).toBeTruthy();
    expect(scoped.getByText('确定')).toBeTruthy();

    fireEvent.change(scoped.getByLabelText('按说话人筛选'), { target: { value: 'speaker-a' } });
    fireEvent.change(scoped.getByLabelText('按备注分类筛选'), { target: { value: 'todo' } });
    fireEvent.change(scoped.getByLabelText('按确信度筛选'), { target: { value: 'certain' } });

    expect(scoped.getByText('第一句')).toBeTruthy();
    expect(scoped.queryByText('第二句')).toBeNull();
  });
});
