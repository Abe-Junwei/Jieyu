import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_HANDLERS } from './tools';
import * as segmentReadQueries from '../../queries/segmentReadQueries';

vi.mock('../../queries/segmentReadQueries', () => ({
  listSegmentSummaries: vi.fn(),
  getSegmentDetail: vi.fn(),
  diagnoseProjectQuality: vi.fn(),
}));

const mockedList = vi.mocked(segmentReadQueries.listSegmentSummaries);
const mockedDetail = vi.mocked(segmentReadQueries.getSegmentDetail);
const mockedDiagnose = vi.mocked(segmentReadQueries.diagnoseProjectQuality);

const RUNTIME_TEXT = { textId: 'workspace-text-1' };

describe('jieyu_list_segments handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns real segment summaries from facade', async () => {
    mockedList.mockResolvedValue({
      segments: [
        { id: 'seg-001', kind: 'segment', layerId: 'layer-1', startTime: 0, endTime: 4.999, transcription: 'hello' },
      ],
      total: 1,
    });

    const handler = TOOL_HANDLERS['jieyu_list_segments']!;
    const result = await handler({ limit: 10, offset: 0 }, RUNTIME_TEXT);

    expect(mockedList).toHaveBeenCalledWith({ textId: 'workspace-text-1' }, 10, 0);
    expect(result.isError).toBeUndefined();
    const text = result.content[0]!.text;
    expect(text).toContain('seg-001');
    expect(text).toContain('hello');
  });

  it('returns error when MCP runtime scope is empty', async () => {
    const handler = TOOL_HANDLERS['jieyu_list_segments']!;
    const result = await handler({ limit: 10, offset: 0 }, undefined);

    expect(mockedList).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('SEGMENT_READ_SCOPE_REQUIRED');
  });

  it('clamps limit to [1, 100]', async () => {
    mockedList.mockResolvedValue({ segments: [], total: 0 });

    const handler = TOOL_HANDLERS['jieyu_list_segments']!;
    await handler({ limit: 200 }, RUNTIME_TEXT);

    expect(mockedList).toHaveBeenCalledWith({ textId: 'workspace-text-1' }, 100, 0);
  });
});

describe('jieyu_get_segment_detail handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns segment detail when found', async () => {
    mockedDetail.mockResolvedValue({
      id: 'seg-001',
      kind: 'segment',
      layerId: 'layer-1',
      startTime: 0,
      endTime: 4.999,
      transcription: 'hello world',
    });

    const handler = TOOL_HANDLERS['jieyu_get_segment_detail']!;
    const result = await handler({ segmentId: 'seg-001' }, RUNTIME_TEXT);

    expect(mockedDetail).toHaveBeenCalledWith('seg-001', { textId: 'workspace-text-1' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain('hello world');
  });

  it('returns error when segmentId is missing', async () => {
    const handler = TOOL_HANDLERS['jieyu_get_segment_detail']!;
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('segmentId is required');
  });

  it('returns error when segment not found', async () => {
    mockedDetail.mockResolvedValue(null);

    const handler = TOOL_HANDLERS['jieyu_get_segment_detail']!;
    const result = await handler({ segmentId: 'seg-999' }, RUNTIME_TEXT);

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Segment not found');
  });

  it('returns scope error when runtime context is empty', async () => {
    const handler = TOOL_HANDLERS['jieyu_get_segment_detail']!;
    const result = await handler({ segmentId: 'seg-001' }, undefined);

    expect(mockedDetail).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('SEGMENT_READ_SCOPE_REQUIRED');
  });
});

describe('jieyu_diagnose_quality handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns quality diagnosis from facade', async () => {
    mockedDiagnose.mockResolvedValue({
      scope: 'project',
      summary: {
        totalSegments: 100,
        transcribedSegments: 95,
        untranscribedSegments: 5,
        segmentsWithSpeaker: 90,
        segmentsMissingSpeaker: 10,
        translationLayers: 2,
      },
      recommendations: ['5 segments remain untranscribed.'],
    });

    const handler = TOOL_HANDLERS['jieyu_diagnose_quality']!;
    const result = await handler({}, RUNTIME_TEXT);

    expect(mockedDiagnose).toHaveBeenCalledWith({ textId: 'workspace-text-1' });
    expect(result.isError).toBeUndefined();
    const text = result.content[0]!.text;
    expect(text).toContain('100');
    expect(text).toContain('untranscribed');
  });

  it('returns error when diagnosis is unavailable', async () => {
    mockedDiagnose.mockResolvedValue(null);

    const handler = TOOL_HANDLERS['jieyu_diagnose_quality']!;
    const result = await handler({}, RUNTIME_TEXT);

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Quality diagnosis unavailable');
  });

  it('returns scope error when runtime context is empty', async () => {
    const handler = TOOL_HANDLERS['jieyu_diagnose_quality']!;
    const result = await handler({}, undefined);

    expect(mockedDiagnose).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('SEGMENT_READ_SCOPE_REQUIRED');
  });

  it('omits currentMediaId from diagnose scope when args.scope is project (default)', async () => {
    mockedDiagnose.mockResolvedValue({
      scope: 'project',
      summary: { totalSegments: 1, transcribedSegments: 1, untranscribedSegments: 0, segmentsWithSpeaker: 1, segmentsMissingSpeaker: 0, translationLayers: 0 },
      recommendations: [],
    });

    const handler = TOOL_HANDLERS['jieyu_diagnose_quality']!;
    await handler({}, { textId: 't1', currentMediaId: 'media-99' });

    expect(mockedDiagnose).toHaveBeenCalledWith({ textId: 't1' });
  });

  it('passes mediaId to diagnose facade when args.scope is current_media and runtime has currentMediaId', async () => {
    mockedDiagnose.mockResolvedValue({
      scope: 'media',
      summary: { totalSegments: 2, transcribedSegments: 2, untranscribedSegments: 0, segmentsWithSpeaker: 2, segmentsMissingSpeaker: 0, translationLayers: 0 },
      recommendations: [],
    });

    const handler = TOOL_HANDLERS['jieyu_diagnose_quality']!;
    await handler({ scope: 'current_media' }, { textId: 't1', currentMediaId: 'media-42' });

    expect(mockedDiagnose).toHaveBeenCalledWith({ textId: 't1', mediaId: 'media-42' });
  });
});
