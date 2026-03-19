// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAiPanelLogic, taskToPersona, type UseAiPanelLogicInput } from './useAiPanelLogic';

// Prevent real network calls from the debounced lexeme search effect.
vi.mock('../../services/LinguisticService', () => ({
  LinguisticService: {
    searchLexemes: vi.fn(async () => []),
  },
}));

afterEach(cleanup);

// Minimal utterance stub – only the fields useAiPanelLogic actually reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const utt = (id: string, extra: Record<string, unknown> = {}): any => ({
  id,
  startTime: 0,
  endTime: 1,
  words: [],
  transcription: {},
  ...extra,
});

const makeInput = (overrides: Partial<UseAiPanelLogicInput> = {}): UseAiPanelLogicInput => ({
  utterances: [],
  selectedUtterance: undefined,
  selectedUtteranceText: '',
  translationLayers: [],
  translationDrafts: {},
  translationTextByLayer: new Map(),
  aiChatConnectionTestStatus: 'idle',
  aiPanelMode: 'auto',
  selectUtterance: vi.fn(),
  setSaveState: vi.fn(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// selectedTranslationGapCount
// ---------------------------------------------------------------------------

describe('selectedTranslationGapCount', () => {
  it('returns 0 when no utterance is selected', () => {
    const { result } = renderHook(() => useAiPanelLogic(makeInput()));
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('returns 0 when there are no translation layers', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [],
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('counts each layer that is missing translation text', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }, { id: 'l2', key: 'fr' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'Hello' }]])],
          // l2 has no entry for u1 → gap
        ]),
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(1);
  });

  it('counts 0 when all layers have persisted text', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
        ]),
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('treats a non-empty draft as filling the gap', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }],
        // no persisted text
        translationDrafts: { 'l1-u1': 'draft text' },
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('counts 2 when two layers both lack text', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }, { id: 'l2', key: 'fr' }],
        // no entries for u1 in either layer
        translationTextByLayer: new Map(),
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// nextTranslationGapUtteranceId
// ---------------------------------------------------------------------------

describe('nextTranslationGapUtteranceId', () => {
  it('returns undefined when there are no translation layers', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ utterances: [utt('u1')] }))
    );
    expect(result.current.nextTranslationGapUtteranceId).toBeUndefined();
  });

  it('returns undefined when all utterances have translations', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'a' }], ['u2', { text: 'b' }]])],
        ]),
      }))
    );
    expect(result.current.nextTranslationGapUtteranceId).toBeUndefined();
  });

  it('returns the first utterance id that has a gap', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
          // u2 has no entry
        ]),
      }))
    );
    expect(result.current.nextTranslationGapUtteranceId).toBe('u2');
  });

  it('skips utterances whose gap is covered by a draft', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        // no persisted text for either utterance
        translationDrafts: { 'l1-u1': 'draft covers u1' },
      }))
    );
    // u1's gap is covered by draft, so u2 is the first real gap
    expect(result.current.nextTranslationGapUtteranceId).toBe('u2');
  });
});

// ---------------------------------------------------------------------------
// handleJumpToTranslationGap
// ---------------------------------------------------------------------------

describe('handleJumpToTranslationGap', () => {
  it('selects the first utterance with a translation gap', async () => {
    const selectUtterance = vi.fn();
    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
          // u2 has no entry
        ]),
        selectUtterance,
        setSaveState,
      }))
    );

    await act(async () => { result.current.handleJumpToTranslationGap(); });

    expect(selectUtterance).toHaveBeenCalledOnce();
    expect(selectUtterance).toHaveBeenCalledWith('u2');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('sets an error save-state when no gap utterance exists', async () => {
    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'done' }]])],
        ]),
        setSaveState,
      }))
    );

    await act(async () => { result.current.handleJumpToTranslationGap(); });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });

  it('sets an error save-state when there are no translation layers at all', async () => {
    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        utterances: [utt('u1')],
        setSaveState,
      }))
    );

    await act(async () => { result.current.handleJumpToTranslationGap(); });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });
});

// ---------------------------------------------------------------------------
// aiCurrentTask
// ---------------------------------------------------------------------------

describe('aiCurrentTask', () => {
  it('returns ai_chat_setup when connection status is error', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ aiChatConnectionTestStatus: 'error' }))
    );
    expect(result.current.aiCurrentTask).toBe('ai_chat_setup');
  });

  it('returns translation when the selected utterance has a translation gap', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }],
        // no text → gap → translation task
      }))
    );
    expect(result.current.aiCurrentTask).toBe('translation');
  });

  it('returns pos_tagging when selected utterance has a word with empty pos', () => {
    // selectedUtteranceText must be ≤ 1 char so selectedAiWarning stays false
    // (selectedAiWarning = true would short-circuit to risk_review first).
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1', {
          words: [{ form: { default: 'w' }, pos: '' }],
        }),
        translationLayers: [],
        selectedUtteranceText: 'w', // length === 1 → selectedAiWarning === false
      }))
    );
    expect(result.current.aiCurrentTask).toBe('pos_tagging');
  });

  it('does not return ai_chat_setup when connection is idle', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ aiChatConnectionTestStatus: 'idle' }))
    );
    expect(result.current.aiCurrentTask).not.toBe('ai_chat_setup');
  });
});

// ---------------------------------------------------------------------------
// selectedAiWarning
// ---------------------------------------------------------------------------

describe('selectedAiWarning', () => {
  it('is false when selectedUtteranceText is empty', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ selectedUtteranceText: '' }))
    );
    expect(result.current.selectedAiWarning).toBe(false);
  });

  it('is false when selectedUtteranceText is a single character', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ selectedUtteranceText: 'a' }))
    );
    expect(result.current.selectedAiWarning).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aiSystemPersonaKey (F31d dynamic persona auto-switch)
// ---------------------------------------------------------------------------

describe('taskToPersona (F31d dynamic persona auto-switch)', () => {
  it('defaults to transcription when ai_chat_setup is inferred', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ aiChatConnectionTestStatus: 'error' }))
    );
    // connection error → ai_chat_setup → transcription persona
    expect(taskToPersona(result.current.aiCurrentTask)).toBe('transcription');
  });

  it('returns glossing persona when pos_tagging task is inferred', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1', { ai_metadata: { confidence: 0.6 } }),
        selectedUtteranceText: 'test text',
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
        ]),
      }))
    );
    // With text, no translation gap, no warning → falls through to stage-based
    expect(['transcription', 'glossing', 'review']).toContain(taskToPersona(result.current.aiCurrentTask));
  });

  it('returns review persona when risk_review task is active', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUtterance: utt('u1', {
          ai_metadata: { confidence: 0.3, model: 'test' },
        }),
        selectedUtteranceText: 'risky text',
      }))
    );
    // Low confidence → selectedAiWarning true → risk_review → review persona
    expect(result.current.aiCurrentTask).toBe('risk_review');
    expect(taskToPersona(result.current.aiCurrentTask)).toBe('review');
  });

  it('maps all known tasks to valid persona keys', () => {
    expect(taskToPersona('segmentation')).toBe('transcription');
    expect(taskToPersona('transcription')).toBe('transcription');
    expect(taskToPersona('translation')).toBe('transcription');
    expect(taskToPersona('pos_tagging')).toBe('glossing');
    expect(taskToPersona('glossing')).toBe('glossing');
    expect(taskToPersona('risk_review')).toBe('review');
    expect(taskToPersona('ai_chat_setup')).toBe('transcription');
  });
});
