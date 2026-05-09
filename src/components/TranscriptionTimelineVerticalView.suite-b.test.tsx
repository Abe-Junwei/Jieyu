// @vitest-environment jsdom
import 'fake-indexeddb/auto';

const { mockShowToast } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    showSaveState: vi.fn(),
    showVoiceState: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import {
  TranscriptionEditorContext,
  type TranscriptionEditorContextValue,
} from '../contexts/TranscriptionEditorContext';
import { LocaleProvider } from '../i18n';
import { TranscriptionTimelineVerticalView } from './TranscriptionTimelineVerticalView';
import {
  makeEditorContext,
  makeLayer,
  makeTranslationLayer,
  makeUnit,
} from './TranscriptionTimelineVerticalView.test.fixtures';

afterEach(() => {
  cleanup();
  mockShowToast.mockReset();
});

describe('TranscriptionTimelineVerticalView', () => {
  it('shows per-row layer rails, focuses layers from the rail, and only reveals bundle chips when multiple bundles exist', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '普通话转写')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '英文翻译')];
    const units = [
      {
        ...makeUnit('u1', 'tr-a', 0, 1),
        speaker: 'Alice',
        rootUnitId: 'bundle-a',
      } as LayerUnitDocType,
    ];
    const contextValue = makeEditorContext();

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const sourceRail = screen.getByTestId('paired-reading-source-rail-pr-u1-src-tr-a-u1');
    const targetRail = screen.getByTestId(
      'paired-reading-target-rail-pr-u1-src-tr-a-translation-1',
    );
    expect(sourceRail).toBeTruthy();
    expect(targetRail).toBeTruthy();
    expect(sourceRail.getAttribute('aria-pressed')).toBe('true');
    expect(targetRail.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(targetRail);
    expect(onFocusLayer).toHaveBeenCalledWith('translation-1');
    expect(sourceRail.getAttribute('aria-pressed')).toBe('false');
    expect(targetRail.getAttribute('aria-pressed')).toBe('true');
    expect(
      viewRender.container.querySelector('.timeline-paired-reading-chip-speaker')?.textContent,
    ).toContain('Alice');
    expect(
      viewRender.container.querySelectorAll('.timeline-paired-reading-chip-bundle'),
    ).toHaveLength(0);

    const trA = {
      ...makeLayer('tr-a', 'transcription', '甲转写', 'independent_boundary'),
      sortOrder: 0,
    } as LayerDocType;
    const trB = {
      ...makeLayer('tr-b', 'transcription', '乙转写', 'independent_boundary'),
      sortOrder: 2,
    } as LayerDocType;
    const tlA = { ...makeTranslationLayer('tl-a', 'tr-a'), sortOrder: 1 } as LayerDocType;
    const tlB = { ...makeTranslationLayer('tl-b', 'tr-b'), sortOrder: 3 } as LayerDocType;
    const allLayersOrdered = [trA, tlA, trB, tlB];
    const contextTwoBundles = makeEditorContext();
    contextTwoBundles.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'x' }]])],
      ['tl-b', new Map([['u2', { text: 'y' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextTwoBundles.getUnitTextForLayer = () => 'src';

    viewRender.rerender(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextTwoBundles}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={[trA, trB]}
            translationLayers={[tlA, tlB]}
            allLayersOrdered={allLayersOrdered}
            unitsOnCurrentMedia={[
              { ...makeUnit('u1', 'tr-a', 0, 1), rootUnitId: 'bundle-a' } as LayerUnitDocType,
              { ...makeUnit('u2', 'tr-b', 2, 3), rootUnitId: 'bundle-b' } as LayerUnitDocType,
            ]}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      viewRender.container.querySelectorAll('.timeline-paired-reading-chip-bundle'),
    ).toHaveLength(2);
  });

  it('offers bundle visibility menu aligned with horizontal layer bundles (two independent roots)', async () => {
    const trA = {
      ...makeLayer('tr-a', 'transcription', '普通话转写', 'independent_boundary'),
      sortOrder: 0,
    } as LayerDocType;
    const trB = {
      ...makeLayer('tr-b', 'transcription', '第二转写', 'independent_boundary'),
      sortOrder: 2,
    } as LayerDocType;
    const tlA = { ...makeTranslationLayer('tl-a', 'tr-a', '译甲'), sortOrder: 1 } as LayerDocType;
    const tlB = { ...makeTranslationLayer('tl-b', 'tr-b', '译乙'), sortOrder: 3 } as LayerDocType;
    const allLayersOrdered = [trA, tlA, trB, tlB];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-b', 2, 3)];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'a' }]])],
      ['tl-b', new Map([['u2', { text: 'b' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u1' ? '原文一' : '原文二');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={[trA, trB]}
            translationLayers={[tlA, tlB]}
            allLayersOrdered={allLayersOrdered}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('paired-reading-bundle-filter-btn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('paired-reading-bundle-filter-btn'));
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '全部组块' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /普通话转写/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /第二转写/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /第二转写/ }));
    expect(document.querySelectorAll('[data-paired-reading-group-id]')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('paired-reading-bundle-filter-btn'));
    expect(await screen.findByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '全部组块' }));
    expect(document.querySelectorAll('[data-paired-reading-group-id]')).toHaveLength(2);
  });

  it('shows bundle filter when two horizontal bundles each have comparison rows', () => {
    const trA = {
      ...makeLayer('tr-a', 'transcription', '甲', 'independent_boundary'),
      sortOrder: 0,
    } as LayerDocType;
    const trB = {
      ...makeLayer('tr-b', 'transcription', '乙', 'independent_boundary'),
      sortOrder: 2,
    } as LayerDocType;
    const tlA = { ...makeTranslationLayer('tl-a', 'tr-a'), sortOrder: 1 } as LayerDocType;
    const tlB = { ...makeTranslationLayer('tl-b', 'tr-b'), sortOrder: 3 } as LayerDocType;
    const allLayersOrdered = [trA, tlA, trB, tlB];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-b', 2, 3)];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'a' }]])],
      ['tl-b', new Map([['u2', { text: 'b' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u1' ? '一' : '二');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={[trA, trB]}
            translationLayers={[tlA, tlB]}
            allLayersOrdered={allLayersOrdered}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('paired-reading-bundle-filter-btn')).toBeTruthy();
  });

  it('renders one source rail per source row when a comparison group merges multiple anchors', () => {
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '合并转写')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '合并译文')];
    const units = [
      { ...makeUnit('u1', 'tr-a', 0, 1), rootUnitId: 'bundle-x' } as LayerUnitDocType,
      { ...makeUnit('u2', 'tr-a', 1.02, 2), rootUnitId: 'bundle-x' } as LayerUnitDocType,
    ];
    const contextValue = makeEditorContext();
    const trMap = contextValue.translationTextByLayer.get('translation-1') as Map<
      string,
      { text: string }
    >;
    trMap.set('u1', { text: '' });
    trMap.set('u2', { text: '' });

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('paired-reading-source-rail-pr-u1-src-tr-a-u1')).toBeTruthy();
    expect(screen.getByTestId('paired-reading-source-rail-pr-u1-src-tr-a-u2')).toBeTruthy();

    fireEvent.click(screen.getByTestId('paired-reading-source-rail-pr-u1-src-tr-a-u2'));
    expect(onFocusLayer).toHaveBeenCalledWith('tr-a');
  });

  it('keeps one shared target editor when multiple source rows map to the same translation', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-a', 1.02, 2)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u1',
      { text: '共享译文' },
    );
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u2',
      { text: '共享译文' },
    );

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      viewRender.container.querySelectorAll('textarea.timeline-paired-reading-source-input'),
    ).toHaveLength(2);
    expect(
      viewRender.container.querySelectorAll('textarea.timeline-paired-reading-target-input'),
    ).toHaveLength(1);
    expect(
      viewRender.container.querySelector('.timeline-paired-reading-chip-multi-anchor'),
    ).toBeTruthy();
    expect(
      viewRender.container
        .querySelector('[data-paired-reading-group-id]')
        ?.getAttribute('data-paired-reading-layout'),
    ).toBe('many-to-one');
  });

  it('renders one target row per translation line in one-to-many mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u1',
      { text: '译文一\n译文二' },
    );

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const targetInputs = viewRender.container.querySelectorAll(
      'textarea.timeline-paired-reading-target-input',
    );
    expect(targetInputs).toHaveLength(2);
    expect((targetInputs[0] as HTMLTextAreaElement | undefined)?.value).toBe('译文一');
    expect((targetInputs[1] as HTMLTextAreaElement | undefined)?.value).toBe('译文二');
  });

  it('marks many-to-many and renders every source row plus split target rows in one merged group', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-a', 1.02, 2)];
    const contextValue = makeEditorContext();
    const tr = contextValue.translationTextByLayer.get('translation-1') as Map<
      string,
      { text: string }
    >;
    tr.set('u1', { text: 'L1\nL2' });
    tr.set('u2', { text: 'L1\nL2' });

    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const group = container.querySelector('[data-paired-reading-group-id]');
    expect(group?.getAttribute('data-paired-reading-layout')).toBe('many-to-many');
    expect(
      container.querySelectorAll('textarea.timeline-paired-reading-source-input'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('textarea.timeline-paired-reading-target-input'),
    ).toHaveLength(2);
  });

  it('does not show bundle chips for multiple rootUnitIds on one horizontal layer bundle', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      { ...makeUnit('u1', 'tr-a', 0, 1), rootUnitId: 'bundle-a' } as LayerUnitDocType,
      { ...makeUnit('u2', 'tr-a', 2, 3), rootUnitId: 'bundle-b' } as LayerUnitDocType,
      { ...makeUnit('u3', 'tr-a', 4, 5), rootUnitId: 'bundle-c' } as LayerUnitDocType,
    ];
    const contextValue = makeEditorContext();
    contextValue.getUnitTextForLayer = (unit) => `src-${unit.id}`;
    const tr = contextValue.translationTextByLayer.get('translation-1') as Map<
      string,
      { text: string }
    >;
    tr.clear();
    tr.set('u1', { text: 't1' });
    tr.set('u2', { text: 't2' });
    tr.set('u3', { text: 't3' });

    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(container.querySelectorAll('[data-paired-reading-group-id]')).toHaveLength(3);
    expect(
      container.querySelectorAll('textarea.timeline-paired-reading-source-input'),
    ).toHaveLength(3);
    expect(container.querySelectorAll('.timeline-paired-reading-chip-bundle')).toHaveLength(0);
  });

  it('avoids rendering duplicated target preview lines above the editor', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u1',
      { text: '第一行\n第二行' },
    );

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      viewRender.container.querySelectorAll('.timeline-paired-reading-target-line'),
    ).toHaveLength(0);
    const editors = viewRender.container.querySelectorAll(
      'textarea.timeline-paired-reading-target-input',
    );
    expect(editors).toHaveLength(2);
    expect((editors[0] as HTMLTextAreaElement | undefined)?.value).toBe('第一行');
    expect((editors[1] as HTMLTextAreaElement | undefined)?.value).toBe('第二行');
  });

  it('keeps the transcription column directly editable', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const sourceEditor = viewRender.container.querySelector(
      '.timeline-paired-reading-source-input',
    ) as HTMLTextAreaElement | null;
    expect(sourceEditor).toBeTruthy();
    fireEvent.change(sourceEditor as HTMLTextAreaElement, { target: { value: '直接改写原文' } });
    expect(contextValue.setUnitDrafts).toHaveBeenCalled();
  });

  it('marks only empty comparison editors with the empty-state styling hook', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();

    const filledRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const filledSource = filledRender.container.querySelector(
      '.timeline-paired-reading-source-input',
    ) as HTMLTextAreaElement | null;
    const filledTarget = filledRender.container.querySelector(
      '.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement | null;
    const filledTargetSurface = filledRender.container.querySelector(
      '.timeline-paired-reading-target-surface',
    ) as HTMLDivElement | null;
    expect(filledSource?.className.includes('timeline-paired-reading-source-card-empty')).toBe(
      false,
    );
    expect(filledTarget?.className.includes('timeline-paired-reading-target-input-empty')).toBe(
      false,
    );
    expect(filledTarget?.className.includes('timeline-paired-reading-target-input-filled')).toBe(
      false,
    );
    expect(
      filledTargetSurface?.className.includes('timeline-paired-reading-target-surface-filled'),
    ).toBe(false);
    expect(
      filledTargetSurface?.className.includes('timeline-paired-reading-target-surface-empty'),
    ).toBe(false);

    filledRender.unmount();

    const emptyContext = makeEditorContext();
    emptyContext.getUnitTextForLayer = () => '';
    emptyContext.translationTextByLayer = new Map([
      ['translation-1', new Map([['u1', { text: '' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];

    const emptyRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={emptyContext}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const emptySource = emptyRender.container.querySelector(
      '.timeline-paired-reading-source-input',
    ) as HTMLTextAreaElement | null;
    const emptyTarget = emptyRender.container.querySelector(
      '.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement | null;
    const emptyTargetSurface = emptyRender.container.querySelector(
      '.timeline-paired-reading-target-surface',
    ) as HTMLDivElement | null;
    expect(emptySource?.className.includes('timeline-paired-reading-source-card-empty')).toBe(true);
    expect(emptyTarget?.className.includes('timeline-paired-reading-target-input-empty')).toBe(
      true,
    );
    expect(emptyTarget?.className.includes('timeline-paired-reading-target-input-filled')).toBe(
      false,
    );
    expect(
      emptyTargetSurface?.className.includes('timeline-paired-reading-target-surface-empty'),
    ).toBe(true);
    expect(
      emptyTargetSurface?.className.includes('timeline-paired-reading-target-surface-active'),
    ).toBe(false);
  });

  it('shows shared save feedback and retry affordance for comparison target saves', async () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    const saveUnitLayerText = vi
      .fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValue(undefined);
    contextValue.saveUnitLayerText = saveUnitLayerText;

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const targetEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement;
    fireEvent.change(targetEditor, { target: { value: '新的译文' } });

    const saveCalls = (contextValue.scheduleAutoSave as ReturnType<typeof vi.fn>).mock.calls;
    const scheduledTask = saveCalls[saveCalls.length - 1]?.[1] as (() => Promise<void>) | undefined;
    expect(scheduledTask).toBeTypeOf('function');
    await scheduledTask?.();

    await waitFor(() => {
      expect(
        viewRender.container.querySelector('.timeline-text-item-status-dot-error'),
      ).toBeTruthy();
    });

    fireEvent.click(
      viewRender.container.querySelector(
        '.timeline-text-item-status-dot-error',
      ) as HTMLButtonElement,
    );
    await waitFor(() => {
      expect(saveUnitLayerText).toHaveBeenCalledTimes(2);
    });
  });

  it('routes translation cell click through the resolved anchor when the merged group has multiple sources', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-a', 1.02, 2)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u2',
      { text: 'shared-target' },
    );

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-1"
            activeUnitId="u2"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const targetEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement;
    expect(targetEditor).toBeTruthy();
    fireEvent.click(targetEditor);
    expect(handleAnnotationClick).toHaveBeenCalledWith(
      'u2',
      1.02,
      'translation-1',
      expect.any(Object),
    );
  });

  it('blocks target save with toast when translation uses segments but none overlap the group', async () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    mockShowToast.mockClear();
    const transcriptionLayers = [
      makeLayer('tr-seg', 'transcription', '转写', 'independent_boundary'),
    ];
    const translationLayers = [
      makeTranslationLayer('translation-1', 'tr-seg', '译文', 'independent_boundary'),
    ];
    const parent = makeUnit('parent-1', 'tr-seg', 0, 5);
    const segment = {
      ...makeUnit('seg-1', 'tr-seg', 0, 1),
      parentUnitId: 'parent-1',
    } as LayerUnitDocType;
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([
      ['tr-seg', [segment]],
      ['translation-1', []],
    ]);
    const contextValue = makeEditorContext();
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'seg-1' ? '段内原文' : '');
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'seg-1',
      { text: '段内译文' },
    );
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    contextValue.saveUnitLayerText = saveUnitLayerText;

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={[]}
            segmentParentUnitLookup={[parent]}
            segmentsByLayer={segmentsByLayer}
            segmentContentByLayer={new Map()}
            allLayersOrdered={[...transcriptionLayers, ...translationLayers]}
            defaultTranscriptionLayerId="tr-seg"
            activeSpeakerFilterKey="all"
            focusedLayerRowId="translation-1"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
            saveSegmentContentForLayer={saveSegmentContentForLayer}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const targetEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement;
    expect(targetEditor).toBeTruthy();
    fireEvent.change(targetEditor, { target: { value: '尝试保存的新译文' } });

    const saveCallsSeg = (contextValue.scheduleAutoSave as ReturnType<typeof vi.fn>).mock.calls;
    const scheduledTask = saveCallsSeg[saveCallsSeg.length - 1]?.[1] as
      | (() => Promise<void>)
      | undefined;
    expect(scheduledTask).toBeTypeOf('function');
    await scheduledTask?.();

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('没有可对齐的语段'),
      'error',
      8000,
    );
    expect(saveSegmentContentForLayer).not.toHaveBeenCalled();
    expect(saveUnitLayerText).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        viewRender.container.querySelector('.timeline-text-item-status-dot-error'),
      ).toBeTruthy();
    });
  });
});
