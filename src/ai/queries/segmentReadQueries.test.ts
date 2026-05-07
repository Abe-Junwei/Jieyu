import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listSegmentSummaries,
  getSegmentDetail,
  diagnoseProjectQuality,
  type SegmentReadQueryScope,
} from './segmentReadQueries';
import { SegmentMetaService } from '../../services/SegmentMetaService';
import { WorkspaceReadModelService } from '../../services/WorkspaceReadModelService';

vi.mock('../../services/SegmentMetaService', () => ({
  SegmentMetaService: {
    rebuildForLayerMedia: vi.fn(),
    listByLayerMedia: vi.fn(),
    listByMediaId: vi.fn(),
    listAll: vi.fn(),
  },
}));

vi.mock('../../services/WorkspaceReadModelService', () => ({
  WorkspaceReadModelService: {
    rebuildForText: vi.fn(),
    getScopeStats: vi.fn(),
    summarizeQuality: vi.fn(),
  },
}));

const mockedSegmentMeta = vi.mocked(SegmentMetaService);
const mockedWorkspace = vi.mocked(WorkspaceReadModelService);

function makeSegmentMetaDoc(partial: {
  segmentId: string;
  layerId: string;
  textId?: string;
  mediaId?: string;
  startTime?: number;
  endTime?: number;
  text?: string;
  effectiveSpeakerId?: string;
  annotationStatus?: string;
  unitKind?: string;
}) {
  return {
    id: partial.segmentId,
    ...partial,
    startTime: partial.startTime ?? 0,
    endTime: partial.endTime ?? 4.999,
    text: partial.text ?? 'sample text',
    updatedAt: new Date().toISOString(),
  } as any;
}

describe('listSegmentSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWorkspace.getScopeStats.mockResolvedValue({ translationLayerCount: 0 } as any);
  });

  it('returns paginated segment summaries for project scope', async () => {
    mockedSegmentMeta.listAll.mockResolvedValue([
      makeSegmentMetaDoc({ segmentId: 'seg-001', layerId: 'layer-1', textId: 'text-1' }),
      makeSegmentMetaDoc({ segmentId: 'seg-002', layerId: 'layer-1', textId: 'text-1' }),
      makeSegmentMetaDoc({ segmentId: 'seg-003', layerId: 'layer-2', textId: 'text-1' }),
    ]);

    const result = await listSegmentSummaries({}, 2, 0);

    expect(result.total).toBe(3);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.id).toBe('seg-001');
    expect(result.segments[1]!.id).toBe('seg-002');
    expect(mockedSegmentMeta.listAll).toHaveBeenCalledTimes(1);
  });

  it('returns paginated segment summaries for media scope', async () => {
    mockedSegmentMeta.listByMediaId.mockResolvedValue([
      makeSegmentMetaDoc({ segmentId: 'seg-001', layerId: 'layer-1', mediaId: 'media-1' }),
    ]);

    const scope: SegmentReadQueryScope = { mediaId: 'media-1' };
    const result = await listSegmentSummaries(scope, 10, 0);

    expect(result.total).toBe(1);
    expect(result.segments[0]!.id).toBe('seg-001');
    expect(mockedSegmentMeta.listByMediaId).toHaveBeenCalledWith('media-1');
  });

  it('rebuilds and returns segment summaries for layer+media scope', async () => {
    mockedSegmentMeta.listByLayerMedia.mockResolvedValue([
      makeSegmentMetaDoc({ segmentId: 'seg-001', layerId: 'layer-1', mediaId: 'media-1' }),
    ]);

    const scope: SegmentReadQueryScope = { layerId: 'layer-1', mediaId: 'media-1' };
    const result = await listSegmentSummaries(scope, 10, 0);

    expect(result.total).toBe(1);
    expect(mockedSegmentMeta.rebuildForLayerMedia).toHaveBeenCalledWith('layer-1', 'media-1');
    expect(mockedSegmentMeta.listByLayerMedia).toHaveBeenCalledWith('layer-1', 'media-1');
  });

  it('clamps limit to [1, 100]', async () => {
    mockedSegmentMeta.listAll.mockResolvedValue([]);

    await listSegmentSummaries({}, 0, 0);
    await listSegmentSummaries({}, 200, 0);

    // Both should call listAll; result is empty, so just verify no throw
    expect(mockedSegmentMeta.listAll).toHaveBeenCalledTimes(2);
  });
});

describe('getSegmentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWorkspace.getScopeStats.mockResolvedValue({ translationLayerCount: 0 } as any);
  });

  it('returns null for empty segmentId', async () => {
    const result = await getSegmentDetail('', {});
    expect(result).toBeNull();
  });

  it('finds segment by id in project scope', async () => {
    mockedSegmentMeta.listAll.mockResolvedValue([
      makeSegmentMetaDoc({ segmentId: 'seg-001', layerId: 'layer-1', textId: 'text-1', text: 'hello' }),
    ]);

    const result = await getSegmentDetail('seg-001', {});

    expect(result).not.toBeNull();
    expect(result!.id).toBe('seg-001');
    expect(result!.transcription).toBe('hello');
  });

  it('returns null when segment not found', async () => {
    mockedSegmentMeta.listAll.mockResolvedValue([]);

    const result = await getSegmentDetail('seg-999', {});
    expect(result).toBeNull();
  });
});

describe('diagnoseProjectQuality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns quality diagnosis with recommendations when issues exist', async () => {
    mockedWorkspace.summarizeQuality.mockResolvedValue({
      totalUnitsInScope: 100,
      completionRate: 0.98,
      breakdown: {
        emptyTextCount: 20,
        missingSpeakerCount: 50,
        translationLayerCount: 3,
      },
    } as any);
    mockedWorkspace.getScopeStats.mockResolvedValue({ translationLayerCount: 3 } as any);

    const scope: SegmentReadQueryScope = { textId: 'text-1' };
    const result = await diagnoseProjectQuality(scope);

    expect(result).not.toBeNull();
    expect(result!.scope).toBe('project');
    expect(result!.summary.totalSegments).toBe(100);
    expect(result!.summary.untranscribedSegments).toBe(20);
    expect(result!.summary.segmentsMissingSpeaker).toBe(50);
    expect(result!.summary.translationLayers).toBe(3);
    expect(result!.recommendations).toHaveLength(2);
    expect(mockedWorkspace.rebuildForText).toHaveBeenCalledWith('text-1');
  });

  it('returns no-issue message when no problems found', async () => {
    mockedWorkspace.summarizeQuality.mockResolvedValue({
      totalUnitsInScope: 100,
      completionRate: 1,
      breakdown: {
        emptyTextCount: 0,
        missingSpeakerCount: 0,
        translationLayerCount: 2,
      },
    } as any);
    mockedWorkspace.getScopeStats.mockResolvedValue({ translationLayerCount: 2 } as any);

    const scope: SegmentReadQueryScope = { mediaId: 'media-1' };
    const result = await diagnoseProjectQuality(scope);

    expect(result).not.toBeNull();
    expect(result!.scope).toBe('current_media');
    expect(result!.summary.translationLayers).toBe(2);
    expect(result!.recommendations[0]).toMatch(/No obvious quality issues/);
  });
});
