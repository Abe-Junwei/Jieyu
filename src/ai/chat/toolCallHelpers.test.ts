import { describe, expect, it } from 'vitest';
import type { AiChatToolCall, AiPromptContext } from '../../hooks/useAiChat';
import {
  buildClarifyCandidates,
  extractClarifySplitPositionPatch,
  planToolCallTargets,
  resolveSelectionTargetPatchForTool,
  shouldAllowDeicticExecutionIntent,
  validateToolCallArguments,
} from './toolCallHelpers';

function makeSegmentContext(extraShortTerm: Partial<NonNullable<AiPromptContext['shortTerm']>> = {}): AiPromptContext {
  return {
    shortTerm: {
      activeUtteranceUnitId: 'utt_owner_001',
      activeSegmentUnitId: 'seg_real_007',
      selectedUnitKind: 'segment',
      recentEdits: [],
      ...extraShortTerm,
    },
    longTerm: {
      projectStats: {
        utteranceCount: 3,
        translationLayerCount: 1,
        aiConfidenceAvg: null,
      },
      topLexemes: [],
      recommendations: [],
    },
  };
}

describe('planToolCallTargets', () => {
  it('prefers current segmentId over hallucinated utteranceId for segment-backed text edits', () => {
    const call: AiChatToolCall = {
      name: 'set_transcription_text',
      arguments: {
        utteranceId: 'utt_fake_999',
        text: 'hello',
      },
    };
    const context = makeSegmentContext({
      selectedLayerId: 'layer_seg',
      selectedLayerType: 'transcription',
      selectedTranscriptionLayerId: 'layer_seg',
      selectedText: '旧文本',
    });

    const planned = planToolCallTargets(call, '__TOOL_SET_TEXT_HALLUCINATED_UTTERANCE__', context);

    expect(planned.decision).toBe('resolved');
    expect(planned.call.arguments.segmentId).toBe('seg_real_007');
    expect(planned.call.arguments.utteranceId).toBeUndefined();
  });

  it('prefers current segmentId over hallucinated utteranceId for segment create and split tools', () => {
    const context = makeSegmentContext({
      selectedLayerId: 'layer_seg',
      selectedLayerType: 'transcription',
      selectedTranscriptionLayerId: 'layer_seg',
      selectedText: '旧文本',
      audioTimeSec: 2.5,
    });

    const createPlan = planToolCallTargets({
      name: 'create_transcription_segment',
      arguments: { utteranceId: 'utt_fake_999' },
    }, '__TOOL_CREATE_SEGMENT_HALLUCINATED_UTTERANCE__', context);
    const splitPlan = planToolCallTargets({
      name: 'split_transcription_segment',
      arguments: { utteranceId: 'utt_fake_999' },
    }, '__TOOL_SPLIT_SEGMENT_HALLUCINATED_UTTERANCE__', context);

    expect(createPlan.decision).toBe('resolved');
    expect(createPlan.call.arguments.segmentId).toBe('seg_real_007');
    expect(createPlan.call.arguments.utteranceId).toBeUndefined();

    expect(splitPlan.decision).toBe('resolved');
    expect(splitPlan.call.arguments.segmentId).toBe('seg_real_007');
    expect(splitPlan.call.arguments.utteranceId).toBeUndefined();
    expect(splitPlan.call.arguments.splitTime).toBe(2.5);
  });

  it('restores segmentId for split clarification reply when current selection is segment-backed', () => {
    const context = makeSegmentContext({ audioTimeSec: 12 });

    expect(extractClarifySplitPositionPatch('这里', context)).toEqual({
      segmentId: 'seg_real_007',
      splitTime: 12,
    });
  });

  it('allows deictic execution intent for create and split tools with segment-only selection', () => {
    const context = makeSegmentContext();
    const messages = [{
      id: 'assistant-1',
      role: 'assistant' as const,
      content: '还不能安全执行，缺少目标句段。',
    }];

    expect(shouldAllowDeicticExecutionIntent('这个', 'create_transcription_segment', context, messages)).toBe(true);
    expect(shouldAllowDeicticExecutionIntent('这个', 'split_transcription_segment', context, messages)).toBe(true);
  });

  it.each([
    ['create_transcription_segment', { segmentId: 'seg_real_007' }],
    ['split_transcription_segment', { segmentId: 'seg_real_007' }],
    ['merge_prev', { segmentId: 'seg_real_007' }],
    ['merge_next', { segmentId: 'seg_real_007' }],
    ['delete_transcription_segment', { segmentId: 'seg_real_007' }],
    ['set_transcription_text', { segmentId: 'seg_real_007' }],
    ['set_translation_text', { segmentId: 'seg_real_007' }],
    ['clear_translation_segment', { segmentId: 'seg_real_007' }],
    ['auto_gloss_utterance', { utteranceId: 'utt_owner_001' }],
  ] as const)('resolves current selection target patch for %s', (callName, expectedPatch) => {
    expect(resolveSelectionTargetPatchForTool(callName, makeSegmentContext())).toEqual(expectedPatch);
  });

  it('does not fall back to activeUtteranceUnitId for segment-only tools when no segment is selected', () => {
    const context = makeSegmentContext({
      activeSegmentUnitId: '',
      selectedUnitKind: 'utterance',
    });

    expect(resolveSelectionTargetPatchForTool('delete_transcription_segment', context)).toBeNull();
  });

  it('builds clarify candidates from the same segment-aware selection target helper', () => {
    expect(buildClarifyCandidates(
      'split_transcription_segment',
      'missing-utterance-target',
      makeSegmentContext(),
    )).toEqual([
      {
        key: '1',
        label: '当前选中句段（seg_real_007）',
        argsPatch: { segmentId: 'seg_real_007' },
      },
    ]);
  });

  it('does not require utteranceId for merge_prev when the tool relies on current selection context', () => {
    expect(validateToolCallArguments({
      name: 'merge_prev',
      arguments: {},
    })).toBeNull();
  });

  it('accepts segmentId-only merge_next calls without falling back to utteranceId validation', () => {
    expect(validateToolCallArguments({
      name: 'merge_next',
      arguments: { segmentId: 'seg_real_007' },
    })).toBeNull();
  });

  it.each([
    'auto_gloss_segment',
    'auto_translate_segment',
    'suggest_segment_improvement',
    'analyze_segment_quality',
  ] as const)('accepts segmentId-only arguments for %s without reintroducing utteranceId validation', (name) => {
    expect(validateToolCallArguments({
      name,
      arguments: { segmentId: 'seg_real_007' },
    })).toBeNull();
  });

  it.each([
    'merge_prev',
    'merge_next',
  ] as const)('plans %s against the current segment selection when the model omits ids', (name) => {
    const planned = planToolCallTargets({
      name,
      arguments: {},
    }, '__TOOL_MERGE_SELECTION__', makeSegmentContext());

    expect(planned.decision).toBe('resolved');
    expect(planned.call.arguments).toEqual({ segmentId: 'seg_real_007' });
  });

  it('rewrites legacy utteranceIds batch merge payloads to selected segmentIds in segment context', () => {
    const planned = planToolCallTargets({
      name: 'merge_transcription_segments',
      arguments: { utteranceIds: ['utt_fake_1', 'utt_fake_2'] },
    }, '__TOOL_MERGE_SELECTION__', makeSegmentContext({ selectedUnitIds: ['seg_real_007', 'seg_real_008'] }));

    expect(planned.decision).toBe('resolved');
    expect(planned.call.arguments.segmentIds).toEqual(['seg_real_007', 'seg_real_008']);
    expect(planned.call.arguments.utteranceIds).toBeUndefined();
  });
});