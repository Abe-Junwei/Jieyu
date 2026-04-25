import { describe, expect, it, vi } from 'vitest';
import { getAiToolSegmentExecutionToolNames } from '../ai/policy/aiToolPolicyMatrix';
import { segmentAdapter } from './useAiToolCallHandler.segmentAdapter';

describe('segmentAdapter', () => {
  it('keeps handles aligned with policy SSOT', () => {
    expect(segmentAdapter.handles).toEqual(getAiToolSegmentExecutionToolNames());
    expect(segmentAdapter.handles).not.toContain('auto_gloss_unit');
  });

  it('executes merge_transcription_segments with requested segmentIds', async () => {
    const mergeSelectedSegments = vi.fn<(segmentIds: Iterable<string>) => Promise<void>>(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-2', 'seg-1', 'seg-1'] },
      },
      locale: 'zh-CN',
      mergeSelectedSegments,
    } as any);

    expect(result.ok).toBe(true);
    expect(mergeSelectedSegments).toHaveBeenCalledTimes(1);
    expect(Array.from(mergeSelectedSegments.mock.calls[0]?.[0] ?? [])).toEqual(['seg-2', 'seg-1']);
  });

  it('writes transcription text through saveSegmentContentForLayer when segmentId is provided', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'set_transcription_text',
        arguments: {
          segmentId: 'seg-1',
          text: 'updated text',
        },
      },
      locale: 'zh-CN',
      selectedLayerId: 'trl-1',
      transcriptionLayers: [{ id: 'trl-1' }],
      saveSegmentContentForLayer,
    } as any);

    expect(result.ok).toBe(true);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'trl-1', 'updated text');
  });
});
