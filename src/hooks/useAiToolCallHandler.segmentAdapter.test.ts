import { afterEach, describe, expect, it, vi } from 'vitest';

import * as AppIndex from '../app/index';
import { getAiToolSegmentExecutionToolNames } from '../ai/policy/aiToolPolicyMatrix';
import { segmentAdapter } from './useAiToolCallHandler.segmentAdapter';

describe('segmentAdapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps handles aligned with policy SSOT', () => {
    expect(segmentAdapter.handles).toEqual(getAiToolSegmentExecutionToolNames());
    expect(segmentAdapter.handles).not.toContain('auto_gloss_unit');
  });

  it('split_transcription_segment attaches rollback when split returns token and mergeAdjacentSegmentsForAiRollback is provided', async () => {
    const splitTranscriptionSegment = vi.fn(async () => ({
      keepSegmentId: 'seg-a',
      removeSegmentId: 'seg-b',
    }));
    const mergeAdjacentSegmentsForAiRollback = vi.fn(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'split_transcription_segment',
        arguments: { segmentId: 'seg-2', splitTime: 2.5 },
      },
      locale: 'zh-CN',
      segmentTargets: [
        { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: 'x' },
      ],
      resolveRequestedSegmentTarget: () => ({
        id: 'seg-2',
        kind: 'segment',
        startTime: 2,
        endTime: 3,
        text: 'x',
      }),
      splitTranscriptionSegment,
      mergeAdjacentSegmentsForAiRollback,
    } as any);

    expect(result.ok).toBe(true);
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(mergeAdjacentSegmentsForAiRollback).toHaveBeenCalledWith('seg-a', 'seg-b');
  });

  it('rejects merge_transcription_segments when structural rollback selection exceeds env cap', async () => {
    vi.stubEnv('JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS', '2');
    const mergeSelectedSegments = vi.fn(async () => {});
    const silentSegmentGraphSyncForAi = vi.fn(async () => {});
    const seg = (id: string) => ({
      id,
      unitType: 'segment' as const,
      startTime: 0,
      endTime: 0.5,
      textId: 't1',
      mediaId: 'm1',
      transcription: {},
      createdAt: '',
      updatedAt: '',
    });

    const result = await segmentAdapter.execute({
      call: {
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a', 'seg-b', 'seg-c'] },
      },
      locale: 'zh-CN',
      units: [seg('seg-a'), { ...seg('seg-b'), startTime: 0.6, endTime: 1.1 }, { ...seg('seg-c'), startTime: 1.2, endTime: 2 }],
      mergeSelectedSegments,
      silentSegmentGraphSyncForAi,
    } as any);

    expect(result.ok).toBe(false);
    expect(String(result.message)).toContain('2');
    expect(mergeSelectedSegments).not.toHaveBeenCalled();
  });

  it('executes merge_transcription_segments with requested segmentIds', async () => {
    const mergeSelectedSegments = vi.fn<(segmentIds: Iterable<string>) => Promise<void>>(async () => {});
    const silentSegmentGraphSyncForAi = vi.fn(async () => {});
    const seg1 = {
      id: 'seg-1',
      unitType: 'segment' as const,
      startTime: 0,
      endTime: 0.95,
      textId: 't1',
      mediaId: 'm1',
      transcription: {},
      createdAt: '',
      updatedAt: '',
    };
    const seg2 = { ...seg1, id: 'seg-2', startTime: 1.05, endTime: 2 };

    const result = await segmentAdapter.execute({
      call: {
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-2', 'seg-1', 'seg-1'] },
      },
      locale: 'zh-CN',
      units: [seg1, seg2],
      mergeSelectedSegments,
      silentSegmentGraphSyncForAi,
    } as any);

    expect(result.ok).toBe(true);
    expect(mergeSelectedSegments).toHaveBeenCalledTimes(1);
    expect(Array.from(mergeSelectedSegments.mock.calls[0]?.[0] ?? [])).toEqual(['seg-2', 'seg-1']);
  });

  it('merge_transcription_segments exposes rollback that splits in reverse order when silent sync is wired', async () => {
    const splitSegment = vi.fn(async () => ({}));
    vi.spyOn(AppIndex, 'getTranscriptionAppService').mockReturnValue({ splitSegment } as any);
    const mergeSelectedSegments = vi.fn(async () => {});
    const silentSegmentGraphSyncForAi = vi.fn(async () => {});

    const seg1 = {
      id: 'seg-1',
      unitType: 'segment' as const,
      startTime: 0,
      endTime: 0.95,
      textId: 't1',
      mediaId: 'm1',
      transcription: {},
      createdAt: '',
      updatedAt: '',
    };
    const seg2 = { ...seg1, id: 'seg-2', startTime: 1.05, endTime: 2 };

    const result = await segmentAdapter.execute({
      call: {
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-2', 'seg-1'] },
      },
      locale: 'zh-CN',
      units: [seg1, seg2],
      mergeSelectedSegments,
      silentSegmentGraphSyncForAi,
    } as any);

    expect(result.ok).toBe(true);
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(splitSegment).toHaveBeenCalledTimes(1);
    expect(splitSegment).toHaveBeenCalledWith('seg-1', 1);
    expect(silentSegmentGraphSyncForAi).toHaveBeenCalledTimes(1);
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
    expect(result.rollback).toBeUndefined();
  });

  it('set_transcription_text exposes rollback that restores prior segment text when readSegmentLayerText is provided', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'set_transcription_text',
        arguments: { segmentId: 'seg-1', text: 'next' },
      },
      locale: 'zh-CN',
      selectedLayerId: 'trl-1',
      transcriptionLayers: [{ id: 'trl-1' }],
      saveSegmentContentForLayer,
      readSegmentLayerText: () => 'prior',
    } as any);

    expect(result.ok).toBe(true);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'trl-1', 'next');
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(saveSegmentContentForLayer).toHaveBeenLastCalledWith('seg-1', 'trl-1', 'prior');
  });

  it('clear_translation_segment exposes rollback for segment path when readSegmentLayerText is provided', async () => {
    const saveSegmentContentForLayer = vi.fn(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'clear_translation_segment',
        arguments: { layerId: 'tl-1', segmentId: 'seg-1' },
      },
      locale: 'zh-CN',
      translationLayers: [{ id: 'tl-1', key: 'en', name: { default: 'EN' } }],
      resolveRequestedTranslationLayerId: () => 'tl-1',
      saveSegmentContentForLayer,
      readSegmentLayerText: () => 'was-filled',
    } as any);

    expect(result.ok).toBe(true);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'tl-1', '');
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(saveSegmentContentForLayer).toHaveBeenLastCalledWith('seg-1', 'tl-1', 'was-filled');
  });

  it('clear_translation_segment exposes rollback for unit path when readUnitLayerText is provided', async () => {
    const saveUnitLayerText = vi.fn(async () => {});

    const result = await segmentAdapter.execute({
      call: {
        name: 'clear_translation_segment',
        arguments: { layerId: 'tl-1' },
      },
      locale: 'zh-CN',
      translationLayers: [{ id: 'tl-1', key: 'en', name: { default: 'EN' } }],
      resolveRequestedTranslationLayerId: () => 'tl-1',
      hasRequestedUnitTarget: () => true,
      resolveRequestedUnit: () => ({ id: 'u-1', startTime: 0, endTime: 1 }),
      describeRequestedUnitTarget: () => 'u-1',
      saveUnitLayerText,
      readUnitLayerText: () => 'old layer text',
    } as any);

    expect(result.ok).toBe(true);
    expect(saveUnitLayerText).toHaveBeenCalledWith('u-1', '', 'tl-1');
    expect(typeof result.rollback).toBe('function');
    await result.rollback!();
    expect(saveUnitLayerText).toHaveBeenLastCalledWith('u-1', 'old layer text', 'tl-1');
  });
});
