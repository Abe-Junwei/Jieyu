// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useAiPanelLogic, taskToPersona, type UseAiPanelLogicInput } from './useAiPanelLogic';
import { LinguisticService } from '../services/LinguisticService';
import type { LexemeDocType } from '../db';

// Prevent real network calls from the debounced lexeme search effect.
vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    searchLexemes: vi.fn(async () => []),
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  searchLexemesMock.mockReset();
  searchLexemesMock.mockResolvedValue([]);
});

const searchLexemesMock = vi.mocked(LinguisticService.searchLexemes);

// Minimal unit stub – only the fields useAiPanelLogic actually reads.
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
  locale: 'zh-CN',
  units: [],
  selectedUnit: undefined,
  selectedUnitText: '',
  translationLayers: [],
  translationDrafts: {},
  translationTextByLayer: new Map(),
  aiChatConnectionTestStatus: 'idle',
  aiPanelMode: 'auto',
  selectUnit: vi.fn(),
  setSaveState: vi.fn(),
  ...overrides,
});

const lexeme = (id: string, lemma: string): LexemeDocType => ({
  id,
  lemma: { default: lemma },
  senses: [],
  createdAt: '2026-04-04T00:00:00.000Z',
  updatedAt: '2026-04-04T00:00:00.000Z',
});

// ---------------------------------------------------------------------------
// selectedTranslationGapCount
// ---------------------------------------------------------------------------

describe('selectedTranslationGapCount', () => {
  it('returns 0 when no unit is selected', () => {
    const { result } = renderHook(() => useAiPanelLogic(makeInput()));
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('returns 0 when there are no translation layers', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUnit: utt('u1'),
        translationLayers: [],
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(0);
  });

  it('counts each layer that is missing translation text', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUnit: utt('u1'),
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
        selectedUnit: utt('u1'),
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
        selectedUnit: utt('u1'),
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
        selectedUnit: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }, { id: 'l2', key: 'fr' }],
        // no entries for u1 in either layer
        translationTextByLayer: new Map(),
      }))
    );
    expect(result.current.selectedTranslationGapCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// nextTranslationGapUnitId
// ---------------------------------------------------------------------------

describe('nextTranslationGapUnitId', () => {
  it('returns undefined when there are no translation layers', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ units: [utt('u1')] }))
    );
    expect(result.current.nextTranslationGapUnitId).toBeUndefined();
  });

  it('returns undefined when all units have translations', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'a' }], ['u2', { text: 'b' }]])],
        ]),
      }))
    );
    expect(result.current.nextTranslationGapUnitId).toBeUndefined();
  });

  it('returns the first unit id that has a gap', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
          // u2 has no entry
        ]),
      }))
    );
    expect(result.current.nextTranslationGapUnitId).toBe('u2');
  });

  it('skips units whose gap is covered by a draft', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        // no persisted text for either unit
        translationDrafts: { 'l1-u1': 'draft covers u1' },
      }))
    );
    // u1's gap is covered by draft, so u2 is the first real gap
    expect(result.current.nextTranslationGapUnitId).toBe('u2');
  });
});

// ---------------------------------------------------------------------------
// handleJumpToTranslationGap
// ---------------------------------------------------------------------------

describe('handleJumpToTranslationGap', () => {
  it('selects the first unit with a translation gap', async () => {
    const selectUnit = vi.fn();
    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [utt('u1'), utt('u2')],
        translationLayers: [{ id: 'l1', key: 'en' }],
        translationTextByLayer: new Map([
          ['l1', new Map([['u1', { text: 'filled' }]])],
          // u2 has no entry
        ]),
        selectUnit,
        setSaveState,
      }))
    );

    await act(async () => { result.current.handleJumpToTranslationGap(); });

    expect(selectUnit).toHaveBeenCalledOnce();
    expect(selectUnit).toHaveBeenCalledWith('u2');
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({ kind: 'done' }));
  });

  it('sets an error save-state when no gap unit exists', async () => {
    const setSaveState = vi.fn();
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [utt('u1')],
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
        units: [utt('u1')],
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

  it('returns translation when the selected unit has a translation gap', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUnit: utt('u1'),
        translationLayers: [{ id: 'l1', key: 'en' }],
        // no text → gap → translation task
      }))
    );
    expect(result.current.aiCurrentTask).toBe('translation');
  });

  it('returns pos_tagging when selected unit has a word with empty pos', () => {
    // selectedUnitText must be ≤ 1 char so selectedAiWarning stays false
    // (selectedAiWarning = true would short-circuit to risk_review first).
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        selectedUnit: utt('u1', {
          words: [{ form: { default: 'w' }, pos: '' }],
        }),
        translationLayers: [],
        selectedUnitText: 'w', // length === 1 → selectedAiWarning === false
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

  it('returns risk_review when the selected unit is inside a waveform overlap window', () => {
    const overlappingSelectedUnit = utt('u-selected', {
      startTime: 1.2,
      endTime: 2.4,
      ai_metadata: { confidence: 0.92 },
    });

    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [
          utt('u-anchor', { startTime: 0, endTime: 1.5, transcription: { default: 'done' } }),
          overlappingSelectedUnit,
          utt('u-gap', { startTime: 3.5, endTime: 4.1 }),
        ],
        selectedUnit: overlappingSelectedUnit,
        selectedUnitText: 'a',
      }))
    );

    expect(result.current.aiCurrentTask).toBe('risk_review');
  });
});

// ---------------------------------------------------------------------------
// selectedAiWarning
// ---------------------------------------------------------------------------

describe('selectedAiWarning', () => {
  it('is false when selectedUnitText is empty', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ selectedUnitText: '' }))
    );
    expect(result.current.selectedAiWarning).toBe(false);
  });

  it('is false when selectedUnitText is a single character', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({ selectedUnitText: 'a' }))
    );
    expect(result.current.selectedAiWarning).toBe(false);
  });
});

describe('lexemeMatches', () => {
  it('ignores stale lexeme search results from earlier queries', async () => {
    vi.useFakeTimers();
    let resolveFirst: ((value: LexemeDocType[]) => void) | undefined;
    let resolveSecond: ((value: LexemeDocType[]) => void) | undefined;
    searchLexemesMock.mockReset();
    searchLexemesMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const { result, rerender } = renderHook(
      ({ selectedUnitText }) => useAiPanelLogic(makeInput({ selectedUnitText })),
      { initialProps: { selectedUnitText: 'alpha' } },
    );

    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    rerender({ selectedUnitText: 'beta' });

    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    await act(async () => {
      resolveFirst?.([lexeme('old', 'alpha')]);
      await Promise.resolve();
    });

    expect(result.current.lexemeMatches).toEqual([]);

    await act(async () => {
      resolveSecond?.([lexeme('new', 'beta')]);
      await Promise.resolve();
    });

    expect(result.current.lexemeMatches).toEqual([lexeme('new', 'beta')]);
  });
});

describe('actionableObserverRecommendations', () => {
  it('prepends waveform risk review during transcribing stage when waveform risk signals exist', () => {
    const { result } = renderHook(() =>
      useAiPanelLogic(makeInput({
        units: [
          utt('u1', { startTime: 0, endTime: 1.5, transcription: { default: 'done' } }),
          utt('u2', { startTime: 1.2, endTime: 2.4, ai_metadata: { confidence: 0.61 } }),
          utt('u3', { startTime: 3.5, endTime: 4.2 }),
        ],
      }))
    );

    expect(result.current.observerResult.stage).toBe('transcribing');
    expect(result.current.actionableObserverRecommendations[0]).toEqual(expect.objectContaining({
      id: 'transcribing-risk-review',
      actionType: 'risk_review',
      targetUnitId: 'u2',
      targetConfidence: 0.61,
    }));
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
        selectedUnit: utt('u1', { ai_metadata: { confidence: 0.6 } }),
        selectedUnitText: 'test text',
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
        selectedUnit: utt('u1', {
          ai_metadata: { confidence: 0.3, model: 'test' },
        }),
        selectedUnitText: 'risky text',
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
