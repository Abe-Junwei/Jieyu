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

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../db';
import {
  TranscriptionEditorContext,
  type TranscriptionEditorContextValue,
} from '../contexts/TranscriptionEditorContext';
import { LocaleProvider } from '../i18n';
import { TranscriptionTimelineVerticalView } from './TranscriptionTimelineVerticalView';
import {
  makeEditorContext,
  makeLayer,
  makeLayerLink,
  makeTranslationLayer,
  makeUnit,
} from './TranscriptionTimelineVerticalView.test.fixtures';

afterEach(() => {
  cleanup();
  mockShowToast.mockReset();
});

describe('TranscriptionTimelineVerticalView', () => {
  it('uses segment rows for independent-boundary transcription so comparison is not empty', () => {
    const transcriptionLayers = [
      makeLayer('tr-seg', 'transcription', '转写轨', 'independent_boundary'),
    ];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-seg')];
    const parent = makeUnit('parent-1', 'tr-seg', 0, 5);
    const segment = {
      ...makeUnit('seg-1', 'tr-seg', 0, 1),
      parentUnitId: 'parent-1',
      speakerId: 'spk-a',
    } as LayerUnitDocType;
    const segmentsByLayer = new Map<string, LayerUnitDocType[]>([['tr-seg', [segment]]]);

    const contextValue = makeEditorContext();
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'seg-1' ? '段内原文' : '');
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'seg-1',
      { text: '段内译文' },
    );

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={[]}
            segmentParentUnitLookup={[parent]}
            segmentsByLayer={segmentsByLayer}
            allLayersOrdered={[...transcriptionLayers, ...translationLayers]}
            defaultTranscriptionLayerId="tr-seg"
            activeSpeakerFilterKey="all"
            focusedLayerRowId="tr-seg"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('timeline-paired-reading-view')).toBeTruthy();
    expect(screen.getByDisplayValue('段内原文')).toBeTruthy();
    const targetEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement | null;
    expect(targetEditor?.value).toBe('段内译文');
  });

  it("routes grouped source-card clicks through each item's owning layer", () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [
      makeLayer('tr-a', 'transcription'),
      makeLayer('tr-b', 'transcription'),
    ];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-b', 1.02, 2)];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
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

    const sourceEditors = screen.getAllByDisplayValue(/fixture-vertical-src-u[12]/);
    fireEvent.click(sourceEditors[1] as HTMLTextAreaElement);

    expect(handleAnnotationClick).toHaveBeenCalledWith('u2', 1.02, 'tr-b', expect.any(Object));
    expect(onFocusLayer).toHaveBeenCalledWith('tr-b');
  });

  it('filters translation lanes by layer links when translation parent is empty', () => {
    const transcriptionLayers = [
      makeLayer('tr-a', 'transcription', '转写A', 'independent_boundary'),
      makeLayer('tr-b', 'transcription', '转写B', 'independent_boundary'),
    ];
    const translationLayers = [
      makeLayer('tl-a', 'translation', '译文A', 'symbolic_association'),
      makeLayer('tl-b', 'translation', '译文B', 'symbolic_association'),
    ];
    const layerLinks = [
      makeLayerLink('link-a', 'tr-a', 'tr-a', 'tl-a'),
      makeLayerLink('link-b', 'tr-b', 'tr-b', 'tl-b'),
    ];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    contextValue.getUnitTextForLayer = () => 'fixture-vertical-src-u1';
    contextValue.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'A译文' }]])],
      ['tl-b', new Map([['u1', { text: 'B译文' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            layerLinks={layerLinks}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByDisplayValue('A译文')).toBeTruthy();
    expect(screen.queryByDisplayValue('B译文')).toBeNull();
  });

  it('syncs the active comparison group when the selected unit changes outside the component', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-a', 2, 3)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set(
      'u2',
      { text: 'target-b' },
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

    const scoped = within(viewRender.container);
    fireEvent.click(scoped.getByDisplayValue('fixture-vertical-src-u1'));
    let activeGroup = viewRender.container.querySelector('.timeline-paired-reading-group-active');
    expect(activeGroup).toBeTruthy();
    expect(
      within(activeGroup as HTMLElement).getByDisplayValue('fixture-vertical-src-u1'),
    ).toBeTruthy();

    viewRender.rerender(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            activeUnitId="u2"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    activeGroup = viewRender.container.querySelector('.timeline-paired-reading-group-active');
    expect(activeGroup).toBeTruthy();
    expect(
      within(activeGroup as HTMLElement).getByDisplayValue('fixture-vertical-src-u2'),
    ).toBeTruthy();
  });

  it('marks the target column active when external selection is synced from the translation side', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-1"
            activeUnitId="u1"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      viewRender.container.querySelector('.timeline-paired-reading-target-column-active'),
    ).toBeTruthy();
  });

  it('shows self-certainty badges for comparison source segments just like horizontal mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            resolveSelfCertaintyForUnit={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'tr-a' ? 'certain' : undefined
            }
            resolveSelfCertaintyAmbiguityForUnit={() => false}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      viewRender.container.querySelector('.timeline-annotation-self-certainty--certain'),
    ).toBeTruthy();
  });

  it('shows note indicators for comparison source cards and routes clicks to the note popover handler', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const handleNoteClick = vi.fn();

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClick}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'tr-a' ? { count: 2, layerId: 'tr-a' } : null
            }
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteIcon = viewRender.container.querySelector(
      '.timeline-paired-reading-note-icon',
    ) as SVGElement | null;
    expect(noteIcon).toBeTruthy();

    fireEvent.click(noteIcon as SVGElement);
    expect(handleNoteClick).toHaveBeenCalledWith('u1', 'tr-a', expect.any(Object));
  });

  it('keeps note click target stable with and without self-certainty badges', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const handleNoteClickWithoutCertainty = vi.fn();

    const withoutCertaintyRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClickWithoutCertainty}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'tr-a' ? { count: 1, layerId: 'tr-a' } : null
            }
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteWithoutCertainty = withoutCertaintyRender.container.querySelector(
      '.timeline-paired-reading-note-icon',
    ) as SVGElement | null;
    expect(noteWithoutCertainty).toBeTruthy();
    expect(
      withoutCertaintyRender.container.querySelector('.timeline-annotation-self-certainty'),
    ).toBeFalsy();

    fireEvent.click(noteWithoutCertainty as SVGElement);
    expect(handleNoteClickWithoutCertainty).toHaveBeenCalledWith('u1', 'tr-a', expect.any(Object));

    cleanup();

    const handleNoteClickWithCertainty = vi.fn();
    const withCertaintyRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClickWithCertainty}
            resolveSelfCertaintyForUnit={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'tr-a' ? 'certain' : undefined
            }
            resolveSelfCertaintyAmbiguityForUnit={() => false}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'tr-a' ? { count: 1, layerId: 'tr-a' } : null
            }
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteWithCertainty = withCertaintyRender.container.querySelector(
      '.timeline-paired-reading-note-icon',
    ) as SVGElement | null;
    expect(noteWithCertainty).toBeTruthy();
    expect(
      withCertaintyRender.container.querySelector('.timeline-annotation-self-certainty--certain'),
    ).toBeTruthy();

    fireEvent.click(noteWithCertainty as SVGElement);
    expect(handleNoteClickWithCertainty).toHaveBeenCalledWith('u1', 'tr-a', expect.any(Object));
  });

  it('keeps target-side save feedback on a separate slot when vertical cards also show note markers', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    const saveUnitLayerText = vi.fn().mockRejectedValueOnce(new Error('save failed'));
    contextValue.saveUnitLayerText = saveUnitLayerText;

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-1"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) =>
              unitId === 'u1' && layerId === 'translation-1'
                ? { count: 1, layerId: 'translation-1' }
                : null
            }
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

    const targetSurface = viewRender.container.querySelector(
      '.timeline-paired-reading-target-surface',
    ) as HTMLDivElement | null;
    expect(
      targetSurface?.className.includes('timeline-paired-reading-target-surface-has-side-badges'),
    ).toBe(true);

    await waitFor(() => {
      expect(
        viewRender.container.querySelector('.timeline-text-item-status-dot-error'),
      ).toBeTruthy();
    });
  });

  it('prefers the speaker display name over raw internal speaker ids in vertical mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      {
        ...makeUnit('u1', 'tr-a', 0, 1),
        speakerId: 'speaker_1776609229183_gqqm9y',
      },
    ] as LayerUnitDocType[];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            speakerVisualByUnitId={{
              u1: { name: '说话人甲', color: '#4f7cff' },
            }}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(viewRender.container.textContent).toContain('说话人甲');
    expect(viewRender.container.textContent).not.toContain('speaker_1776609229183_gqqm9y');
  });

  it('keeps single-line comparison editors on the shared compact height baseline', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
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

    const sourceEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-source-input',
    ) as HTMLTextAreaElement | null;
    const targetEditor = viewRender.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement | null;
    const comparisonView = within(viewRender.container).getByTestId('timeline-paired-reading-view');
    const comparisonGroup = viewRender.container.querySelector(
      '.timeline-paired-reading-group',
    ) as HTMLDivElement | null;
    const resizeHandle = viewRender.container.querySelector(
      '.timeline-paired-reading-target-column .timeline-draft-editor-resize-handle-bottom',
    ) as HTMLDivElement | null;

    expect(sourceEditor?.getAttribute('rows')).toBe('1');
    expect(targetEditor?.getAttribute('rows')).toBe('1');
    expect(
      comparisonView.style.getPropertyValue('--timeline-paired-reading-editor-min-height'),
    ).toBe('63px');
    expect(
      comparisonGroup?.style.getPropertyValue('--timeline-paired-reading-editor-min-height'),
    ).toBe('');
    expect(resizeHandle).toBeTruthy();

    fireEvent.pointerDown(resizeHandle as HTMLDivElement, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 118 });

    expect(
      comparisonView.style.getPropertyValue('--timeline-paired-reading-editor-min-height'),
    ).toBe('63px');
    expect(
      comparisonGroup?.style.getPropertyValue('--timeline-paired-reading-editor-min-height'),
    ).toBe('81px');

    fireEvent.pointerUp(window);
  });

  it('resizes only the current comparison group instead of all groups', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1), makeUnit('u2', 'tr-a', 2, 3)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
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

    const groups = Array.from(
      viewRender.container.querySelectorAll('.timeline-paired-reading-group'),
    ) as HTMLDivElement[];
    expect(groups.length).toBeGreaterThanOrEqual(2);

    const firstHandle = groups[0]?.querySelector(
      '.timeline-draft-editor-resize-handle-bottom',
    ) as HTMLDivElement | null;
    expect(firstHandle).toBeTruthy();

    await act(async () => {
      fireEvent.pointerDown(firstHandle as HTMLDivElement, { clientY: 100 });
    });
    await act(async () => {
      fireEvent.pointerMove(window, { clientY: 118 });
    });

    expect(
      groups[0]?.style.getPropertyValue('--timeline-paired-reading-editor-min-height'),
    ).not.toBe('');
    expect(groups[1]?.style.getPropertyValue('--timeline-paired-reading-editor-min-height')).toBe(
      '',
    );

    fireEvent.pointerUp(window);
  });

  it('keeps vertical-mode headers and segment blocks on one shared width splitter', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
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

    const comparisonView = within(viewRender.container).getByTestId('timeline-paired-reading-view');
    const splitter = viewRender.container.querySelector(
      '.timeline-paired-reading-global-splitter',
    ) as HTMLDivElement | null;

    expect(splitter).toBeTruthy();
    expect(comparisonView.style.getPropertyValue('--timeline-paired-reading-left-grow')).toBe('50');
    expect(comparisonView.style.getPropertyValue('--timeline-paired-reading-right-grow')).toBe(
      '50',
    );

    fireEvent.pointerDown(splitter as HTMLDivElement, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(
      Number(comparisonView.style.getPropertyValue('--timeline-paired-reading-left-grow')),
    ).toBeGreaterThan(50);
    expect(
      Number(comparisonView.style.getPropertyValue('--timeline-paired-reading-right-grow')),
    ).toBeLessThan(50);
  });

  it('resets comparison column widths to 1:1 when the splitter receives a second pointer down (double-click)', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
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

    const comparisonView = within(viewRender.container).getByTestId('timeline-paired-reading-view');
    const splitter = viewRender.container.querySelector(
      '.timeline-paired-reading-global-splitter',
    ) as HTMLDivElement | null;

    expect(splitter).toBeTruthy();

    fireEvent.pointerDown(splitter as HTMLDivElement, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(
      Number(comparisonView.style.getPropertyValue('--timeline-paired-reading-left-grow')),
    ).toBeGreaterThan(50);

    fireEvent.pointerDown(splitter as HTMLDivElement, {
      button: 0,
      clientX: 100,
      pointerId: 2,
      detail: 2,
    });

    expect(comparisonView.style.getPropertyValue('--timeline-paired-reading-left-grow')).toBe('50');
    expect(comparisonView.style.getPropertyValue('--timeline-paired-reading-right-grow')).toBe(
      '50',
    );
    expect(localStorage.getItem('jieyu:paired-reading-column-left-grow')).toBe('50');
  });
});
