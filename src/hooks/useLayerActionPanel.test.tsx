// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useLayerActionPanel, type UseLayerActionPanelInput } from './useLayerActionPanel';

afterEach(cleanup);

const makeInput = (overrides: Partial<UseLayerActionPanelInput> = {}): UseLayerActionPanelInput => ({
  createLayer: vi.fn(async () => true),
  deleteLayer: vi.fn(async () => {}),
  deletableLayers: [],
  focusedLayerRowId: '',
  isLayerRailCollapsed: false,
  ...overrides,
});

describe('handleCreateTranscriptionFromPanel', () => {
  it('calls createLayer with language id and alias, then resets form and closes panel', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setLayerActionPanel('create-transcription');
      result.current.setQuickTranscriptionLangId('zho');
      result.current.setQuickTranscriptionAlias('普通话');
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(createLayer).toHaveBeenCalledOnce();
    expect(createLayer).toHaveBeenCalledWith('transcription', { languageId: 'zho', alias: '普通话' });
    expect(result.current.layerActionPanel).toBeNull();
    expect(result.current.quickTranscriptionLangId).toBe('');
    expect(result.current.quickTranscriptionAlias).toBe('');
  });

  it('resolves __custom__ selection from the customLang field', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setQuickTranscriptionLangId('__custom__');
      result.current.setQuickTranscriptionCustomLang('  xzh  ');
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('transcription', { languageId: 'xzh' });
  });

  it('omits alias from the call when alias is blank', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setQuickTranscriptionLangId('eng');
      // alias stays empty
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('transcription', { languageId: 'eng' });
  });

  it('keeps panel open when createLayer returns false', async () => {
    const createLayer = vi.fn(async () => false);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setLayerActionPanel('create-transcription');
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(result.current.layerActionPanel).toBe('create-transcription');
  });
});

describe('handleCreateTranslationFromPanel', () => {
  it('calls createLayer with language id, alias, and modality', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setQuickTranslationLangId('eng');
      result.current.setQuickTranslationAlias('EN');
      result.current.setQuickTranslationModality('audio');
    });
    await act(async () => {
      await result.current.handleCreateTranslationFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('translation', {
      languageId: 'eng',
      alias: 'EN',
      constraint: 'symbolic_association',
    }, 'audio');
    expect(result.current.layerActionPanel).toBeNull();
    expect(result.current.quickTranslationModality).toBe('text'); // resets to default
  });

  it('resolves __custom__ language and defaults to text modality', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setQuickTranslationLangId('__custom__');
      result.current.setQuickTranslationCustomLang('fra');
    });
    await act(async () => {
      await result.current.handleCreateTranslationFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('translation', {
      languageId: 'fra',
      constraint: 'symbolic_association',
    }, 'text');
  });

  it('passes selected translation constraint to createLayer', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer })));

    await act(async () => {
      result.current.setQuickTranslationLangId('eng');
      result.current.setQuickTranslationConstraint('independent_boundary');
    });
    await act(async () => {
      await result.current.handleCreateTranslationFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('translation', {
      languageId: 'eng',
      constraint: 'independent_boundary',
    }, 'text');
  });
});

describe('transcription constraint behavior', () => {
  it('omits transcription constraint when creating first transcription layer', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ createLayer, deletableLayers: [] })));

    await act(async () => {
      result.current.setQuickTranscriptionLangId('zho');
      result.current.setQuickTranscriptionConstraint('independent_boundary');
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('transcription', { languageId: 'zho' });
  });

  it('passes transcription constraint when there is already a transcription layer', async () => {
    const createLayer = vi.fn(async () => true);
    const { result } = renderHook(() => useLayerActionPanel(makeInput({
      createLayer,
      deletableLayers: [{ id: 'trc-1', layerType: 'transcription' }],
    })));

    await act(async () => {
      result.current.setQuickTranscriptionLangId('eng');
      result.current.setQuickTranscriptionConstraint('independent_boundary');
    });
    await act(async () => {
      await result.current.handleCreateTranscriptionFromPanel();
    });

    expect(createLayer).toHaveBeenCalledWith('transcription', {
      languageId: 'eng',
      constraint: 'independent_boundary',
    });
  });
});

describe('handleDeleteLayerFromPanel', () => {
  it('does nothing when no delete target is selected', async () => {
    const deleteLayer = vi.fn(async () => {});
    const { result } = renderHook(() => useLayerActionPanel(makeInput({ deleteLayer })));

    await act(async () => {
      await result.current.handleDeleteLayerFromPanel();
    });

    expect(deleteLayer).not.toHaveBeenCalled();
  });

  it('calls deleteLayer with the selected layer id and closes panel', async () => {
    const deleteLayer = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useLayerActionPanel(makeInput({
        deleteLayer,
        deletableLayers: [{ id: 'layer-a' }, { id: 'layer-b' }],
      }))
    );

    // Effect syncs quickDeleteLayerId to first deletable layer
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe('layer-a'));

    await act(async () => {
      result.current.setLayerActionPanel('delete');
    });
    await act(async () => {
      await result.current.handleDeleteLayerFromPanel();
    });

    expect(deleteLayer).toHaveBeenCalledOnce();
    expect(deleteLayer).toHaveBeenCalledWith('layer-a', { keepUtterances: false });
    expect(result.current.layerActionPanel).toBeNull();
  });
});

describe('quickDeleteLayerId sync effect', () => {
  it('sets to first deletable layer on initial render', async () => {
    const { result } = renderHook(() =>
      useLayerActionPanel(makeInput({
        deletableLayers: [{ id: 'x' }, { id: 'y' }],
      }))
    );
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe('x'));
  });

  it('prefers focusedLayerRowId when it is among deletable layers', async () => {
    const { result } = renderHook(() =>
      useLayerActionPanel(makeInput({
        deletableLayers: [{ id: 'x' }, { id: 'y' }],
        focusedLayerRowId: 'y',
      }))
    );
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe('y'));
  });

  it('falls back to first layer when focused row is not in deletable list', async () => {
    const { result } = renderHook(() =>
      useLayerActionPanel(makeInput({
        deletableLayers: [{ id: 'x' }],
        focusedLayerRowId: 'nonexistent',
      }))
    );
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe('x'));
  });

  it('clears quickDeleteLayerId when deletable layers becomes empty', async () => {
    const { result, rerender } = renderHook(
      (input: UseLayerActionPanelInput) => useLayerActionPanel(input),
      { initialProps: makeInput({ deletableLayers: [{ id: 'x' }] }) },
    );
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe('x'));

    rerender(makeInput({ deletableLayers: [] }));
    await waitFor(() => expect(result.current.quickDeleteLayerId).toBe(''));
  });
});

describe('panel close effects', () => {
  it('closes panel when isLayerRailCollapsed becomes true', async () => {
    const { result, rerender } = renderHook(
      (input: UseLayerActionPanelInput) => useLayerActionPanel(input),
      { initialProps: makeInput({ isLayerRailCollapsed: false }) },
    );

    await act(async () => {
      result.current.setLayerActionPanel('create-transcription');
    });
    expect(result.current.layerActionPanel).toBe('create-transcription');

    rerender(makeInput({ isLayerRailCollapsed: true }));
    await waitFor(() => expect(result.current.layerActionPanel).toBeNull());
  });

  it('keeps panel open when unrelated props rerender', async () => {
    const { result, rerender } = renderHook(
      (input: UseLayerActionPanelInput) => useLayerActionPanel(input),
      { initialProps: makeInput({ focusedLayerRowId: 'layer-a' }) },
    );

    await act(async () => {
      result.current.setLayerActionPanel('create-translation');
    });
    expect(result.current.layerActionPanel).toBe('create-translation');

    rerender(makeInput({ focusedLayerRowId: 'layer-b' }));
    expect(result.current.layerActionPanel).toBe('create-translation');
  });

  it('closes panel on Escape key press', async () => {
    const { result } = renderHook(() => useLayerActionPanel(makeInput()));

    await act(async () => {
      result.current.setLayerActionPanel('create-transcription');
    });
    expect(result.current.layerActionPanel).toBe('create-transcription');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await waitFor(() => expect(result.current.layerActionPanel).toBeNull());
  });

  it('does not close panel on non-Escape key press', async () => {
    const { result } = renderHook(() => useLayerActionPanel(makeInput()));

    await act(async () => {
      result.current.setLayerActionPanel('delete');
    });

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(result.current.layerActionPanel).toBe('delete');
  });
});
