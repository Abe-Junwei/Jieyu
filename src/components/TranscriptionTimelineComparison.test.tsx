// @vitest-environment jsdom

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
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerLinkDocType, LayerUnitContentDocType, LayerUnitDocType, MediaItemDocType } from '../db';
import { TranscriptionEditorContext, type TranscriptionEditorContextValue } from '../contexts/TranscriptionEditorContext';
import { LocaleProvider } from '../i18n';
import { TranscriptionTimelineComparison } from './TranscriptionTimelineComparison';

function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
  displayName = id,
  constraint: LayerDocType['constraint'] = 'symbolic_association',
  extras?: Pick<LayerDocType, 'parentLayerId'>,
): LayerDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': displayName },
    languageId: 'language-1',
    createdAt: now,
    updatedAt: now,
    layerType,
    constraint,
    modality: 'text',
    ...(extras ?? {}),
  };
}

function makeTranslationLayer(
  id: string,
  parentTranscriptionId: string,
  displayName = id,
  constraint: LayerDocType['constraint'] = 'symbolic_association',
): LayerDocType {
  return makeLayer(id, 'translation', displayName, constraint, { parentLayerId: parentTranscriptionId });
}

function makeUnit(id: string, layerId: string, startTime: number, endTime: number): LayerUnitDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime,
    endTime,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

function makeLayerLink(
  id: string,
  transcriptionLayerKey: string,
  hostTranscriptionLayerId: string,
  layerId: string,
  isPreferred = true,
): LayerLinkDocType {
  const now = '2026-04-19T00:00:00.000Z';
  return {
    id,
    transcriptionLayerKey,
    hostTranscriptionLayerId,
    layerId,
    linkType: 'free',
    isPreferred,
    createdAt: now,
  };
}

afterEach(() => {
  cleanup();
  mockShowToast.mockReset();
});

function makeEditorContext(): TranscriptionEditorContextValue {
  return {
    unitDrafts: {},
    setUnitDrafts: vi.fn(),
    translationDrafts: {},
    setTranslationDrafts: vi.fn(),
    translationTextByLayer: new Map([
      ['translation-1', new Map([
        ['u1', { text: 'shared-target' }],
        ['u2', { text: 'shared-target' }],
      ])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'],
    focusedTranslationDraftKeyRef: createRef<string | null>() as React.MutableRefObject<string | null>,
    scheduleAutoSave: vi.fn(),
    clearAutoSaveTimer: vi.fn(),
    saveUnitText: vi.fn(async () => undefined),
    saveUnitLayerText: vi.fn(async () => undefined),
    getUnitTextForLayer: (unit) => (unit.id === 'u1' ? '第一条原文' : '第二条原文'),
    renderLaneLabel: (layer) => (typeof layer.name === 'string' ? layer.name : layer.name?.['zh-CN'] ?? layer.id),
    createLayer: vi.fn(async () => true),
    updateLayerMetadata: vi.fn(async () => true),
    deleteLayer: vi.fn(async () => undefined),
    deleteLayerWithoutConfirm: vi.fn(async () => undefined),
    checkLayerHasContent: vi.fn(async () => 0),
  };
}

describe('TranscriptionTimelineComparison', () => {
  it('uses segment rows for independent-boundary transcription so comparison is not empty', () => {
    const transcriptionLayers = [makeLayer('tr-seg', 'transcription', '转写轨', 'independent_boundary')];
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
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('seg-1', { text: '段内译文' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(screen.getByTestId('timeline-comparison-view')).toBeTruthy();
    expect(screen.getByDisplayValue('段内原文')).toBeTruthy();
    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement | null;
    expect(targetEditor?.value).toBe('段内译文');
  });

  it('routes grouped source-card clicks through each item\'s owning layer', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [
      makeLayer('tr-a', 'transcription'),
      makeLayer('tr-b', 'transcription'),
    ];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-b', 1.02, 2),
    ];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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

    const sourceEditors = screen.getAllByDisplayValue(/第一条原文|第二条原文/);
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
    contextValue.getUnitTextForLayer = () => '第一条原文';
    contextValue.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'A译文' }]])],
      ['tl-b', new Map([['u1', { text: 'B译文' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-a', 2, 3),
    ];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u2', { text: 'target-b' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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
    fireEvent.click(scoped.getByDisplayValue('第一条原文'));
    let activeGroup = viewRender.container.querySelector('.timeline-comparison-group-active');
    expect(activeGroup).toBeTruthy();
    expect(within(activeGroup as HTMLElement).getByDisplayValue('第一条原文')).toBeTruthy();

    viewRender.rerender(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    activeGroup = viewRender.container.querySelector('.timeline-comparison-group-active');
    expect(activeGroup).toBeTruthy();
    expect(within(activeGroup as HTMLElement).getByDisplayValue('第二条原文')).toBeTruthy();
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
          <TranscriptionTimelineComparison
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

    expect(viewRender.container.querySelector('.timeline-comparison-target-column-active')).toBeTruthy();
  });

  it('shows self-certainty badges for comparison source segments just like horizontal mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            resolveSelfCertaintyForUnit={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'tr-a' ? 'certain' : undefined
            )}
            resolveSelfCertaintyAmbiguityForUnit={() => false}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(viewRender.container.querySelector('.timeline-annotation-self-certainty--certain')).toBeTruthy();
  });

  it('shows note indicators for comparison source cards and routes clicks to the note popover handler', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const handleNoteClick = vi.fn();

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClick}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'tr-a' ? { count: 2, layerId: 'tr-a' } : null
            )}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteIcon = viewRender.container.querySelector('.timeline-comparison-note-icon') as SVGElement | null;
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
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClickWithoutCertainty}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'tr-a' ? { count: 1, layerId: 'tr-a' } : null
            )}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteWithoutCertainty = withoutCertaintyRender.container.querySelector('.timeline-comparison-note-icon') as SVGElement | null;
    expect(noteWithoutCertainty).toBeTruthy();
    expect(withoutCertaintyRender.container.querySelector('.timeline-annotation-self-certainty')).toBeFalsy();

    fireEvent.click(noteWithoutCertainty as SVGElement);
    expect(handleNoteClickWithoutCertainty).toHaveBeenCalledWith('u1', 'tr-a', expect.any(Object));

    cleanup();

    const handleNoteClickWithCertainty = vi.fn();
    const withCertaintyRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            handleNoteClick={handleNoteClickWithCertainty}
            resolveSelfCertaintyForUnit={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'tr-a' ? 'certain' : undefined
            )}
            resolveSelfCertaintyAmbiguityForUnit={() => false}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'tr-a' ? { count: 1, layerId: 'tr-a' } : null
            )}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const noteWithCertainty = withCertaintyRender.container.querySelector('.timeline-comparison-note-icon') as SVGElement | null;
    expect(noteWithCertainty).toBeTruthy();
    expect(withCertaintyRender.container.querySelector('.timeline-annotation-self-certainty--certain')).toBeTruthy();

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
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-1"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            resolveNoteIndicatorTarget={(unitId: string, layerId?: string) => (
              unitId === 'u1' && layerId === 'translation-1' ? { count: 1, layerId: 'translation-1' } : null
            )}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement;
    fireEvent.change(targetEditor, { target: { value: '新的译文' } });

    const saveCalls = (contextValue.scheduleAutoSave as ReturnType<typeof vi.fn>).mock.calls;
    const scheduledTask = saveCalls[saveCalls.length - 1]?.[1] as (() => Promise<void>) | undefined;
    expect(scheduledTask).toBeTypeOf('function');
    await scheduledTask?.();

    const targetSurface = viewRender.container.querySelector('.timeline-comparison-target-surface') as HTMLDivElement | null;
    expect(targetSurface?.className.includes('timeline-comparison-target-surface-has-side-badges')).toBe(true);

    await waitFor(() => {
      expect(viewRender.container.querySelector('.timeline-text-item-status-dot-error')).toBeTruthy();
    });
  });

  it('prefers the speaker display name over raw internal speaker ids in vertical mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [{
      ...makeUnit('u1', 'tr-a', 0, 1),
      speakerId: 'speaker_1776609229183_gqqm9y',
    }] as LayerUnitDocType[];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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
          <TranscriptionTimelineComparison
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

    const sourceEditor = viewRender.container.querySelector('textarea.timeline-comparison-source-input') as HTMLTextAreaElement | null;
    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement | null;
    const comparisonView = within(viewRender.container).getByTestId('timeline-comparison-view');
    const comparisonGroup = viewRender.container.querySelector('.timeline-comparison-group') as HTMLDivElement | null;
    const resizeHandle = viewRender.container.querySelector('.timeline-comparison-target-column .timeline-draft-editor-resize-handle-bottom') as HTMLDivElement | null;

    expect(sourceEditor?.getAttribute('rows')).toBe('1');
    expect(targetEditor?.getAttribute('rows')).toBe('1');
    expect(comparisonView.style.getPropertyValue('--timeline-comparison-editor-min-height')).toBe('63px');
    expect(comparisonGroup?.style.getPropertyValue('--timeline-comparison-editor-min-height')).toBe('');
    expect(resizeHandle).toBeTruthy();

    fireEvent.pointerDown(resizeHandle as HTMLDivElement, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 118 });

    expect(comparisonView.style.getPropertyValue('--timeline-comparison-editor-min-height')).toBe('63px');
    expect(comparisonGroup?.style.getPropertyValue('--timeline-comparison-editor-min-height')).toBe('81px');

    fireEvent.pointerUp(window);
  });

  it('resizes only the current comparison group instead of all groups', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-a', 2, 3),
    ];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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

    const groups = Array.from(viewRender.container.querySelectorAll('.timeline-comparison-group')) as HTMLDivElement[];
    expect(groups.length).toBeGreaterThanOrEqual(2);

    const firstHandle = groups[0]?.querySelector('.timeline-draft-editor-resize-handle-bottom') as HTMLDivElement | null;
    expect(firstHandle).toBeTruthy();

    await act(async () => {
      fireEvent.pointerDown(firstHandle as HTMLDivElement, { clientY: 100 });
    });
    await act(async () => {
      fireEvent.pointerMove(window, { clientY: 118 });
    });

    expect(groups[0]?.style.getPropertyValue('--timeline-comparison-editor-min-height')).not.toBe('');
    expect(groups[1]?.style.getPropertyValue('--timeline-comparison-editor-min-height')).toBe('');

    fireEvent.pointerUp(window);
  });

  it('keeps vertical-mode headers and segment blocks on one shared width splitter', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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

    const comparisonView = within(viewRender.container).getByTestId('timeline-comparison-view');
    const splitter = viewRender.container.querySelector('.timeline-comparison-global-splitter') as HTMLDivElement | null;

    expect(splitter).toBeTruthy();
    expect(comparisonView.style.getPropertyValue('--timeline-comparison-left-grow')).toBe('50');
    expect(comparisonView.style.getPropertyValue('--timeline-comparison-right-grow')).toBe('50');

    fireEvent.pointerDown(splitter as HTMLDivElement, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(Number(comparisonView.style.getPropertyValue('--timeline-comparison-left-grow'))).toBeGreaterThan(50);
    expect(Number(comparisonView.style.getPropertyValue('--timeline-comparison-right-grow'))).toBeLessThan(50);
  });

  it('resets comparison column widths to 1:1 when the splitter receives a second pointer down (double-click)', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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

    const comparisonView = within(viewRender.container).getByTestId('timeline-comparison-view');
    const splitter = viewRender.container.querySelector('.timeline-comparison-global-splitter') as HTMLDivElement | null;

    expect(splitter).toBeTruthy();

    fireEvent.pointerDown(splitter as HTMLDivElement, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(Number(comparisonView.style.getPropertyValue('--timeline-comparison-left-grow'))).toBeGreaterThan(50);

    fireEvent.pointerDown(splitter as HTMLDivElement, { button: 0, clientX: 100, pointerId: 2, detail: 2 });

    expect(comparisonView.style.getPropertyValue('--timeline-comparison-left-grow')).toBe('50');
    expect(comparisonView.style.getPropertyValue('--timeline-comparison-right-grow')).toBe('50');
    expect(localStorage.getItem('jieyu:comparison-column-left-grow')).toBe('50');
  });

  it('shows per-row layer rails, focuses layers from the rail, and only reveals bundle chips when multiple bundles exist', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '普通话转写')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '英文翻译')];
    const units = [
      { ...makeUnit('u1', 'tr-a', 0, 1), speaker: 'Alice', rootUnitId: 'bundle-a' } as LayerUnitDocType,
    ];
    const contextValue = makeEditorContext();

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const sourceRail = screen.getByTestId('comparison-source-rail-cmp-u1-u1');
    const targetRail = screen.getByTestId('comparison-target-rail-cmp-u1-translation-1');
    expect(sourceRail).toBeTruthy();
    expect(targetRail).toBeTruthy();
    expect(sourceRail.getAttribute('aria-pressed')).toBe('true');
    expect(targetRail.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(targetRail);
    expect(onFocusLayer).toHaveBeenCalledWith('translation-1');
    expect(sourceRail.getAttribute('aria-pressed')).toBe('false');
    expect(targetRail.getAttribute('aria-pressed')).toBe('true');
    expect(viewRender.container.querySelector('.timeline-comparison-chip-speaker')?.textContent).toContain('Alice');
    expect(viewRender.container.querySelectorAll('.timeline-comparison-chip-bundle')).toHaveLength(0);

    const trA = { ...makeLayer('tr-a', 'transcription', '甲转写', 'independent_boundary'), sortOrder: 0 } as LayerDocType;
    const trB = { ...makeLayer('tr-b', 'transcription', '乙转写', 'independent_boundary'), sortOrder: 2 } as LayerDocType;
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
          <TranscriptionTimelineComparison
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

    expect(viewRender.container.querySelectorAll('.timeline-comparison-chip-bundle')).toHaveLength(2);
  });

  it('offers bundle visibility menu aligned with horizontal layer bundles (two independent roots)', async () => {
    const trA = { ...makeLayer('tr-a', 'transcription', '普通话转写', 'independent_boundary'), sortOrder: 0 } as LayerDocType;
    const trB = { ...makeLayer('tr-b', 'transcription', '第二转写', 'independent_boundary'), sortOrder: 2 } as LayerDocType;
    const tlA = { ...makeTranslationLayer('tl-a', 'tr-a', '译甲'), sortOrder: 1 } as LayerDocType;
    const tlB = { ...makeTranslationLayer('tl-b', 'tr-b', '译乙'), sortOrder: 3 } as LayerDocType;
    const allLayersOrdered = [trA, tlA, trB, tlB];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-b', 2, 3),
    ];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-a', new Map([['u1', { text: 'a' }]])],
      ['tl-b', new Map([['u2', { text: 'b' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u1' ? '原文一' : '原文二');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(screen.getByTestId('comparison-bundle-filter-btn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('comparison-bundle-filter-btn'));
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '全部组块' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /普通话转写/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /第二转写/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /第二转写/ }));
    expect(document.querySelectorAll('[data-comparison-group-id]')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('comparison-bundle-filter-btn'));
    expect(await screen.findByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: '全部组块' }));
    expect(document.querySelectorAll('[data-comparison-group-id]')).toHaveLength(2);
  });

  it('shows bundle filter when two horizontal bundles each have comparison rows', () => {
    const trA = { ...makeLayer('tr-a', 'transcription', '甲', 'independent_boundary'), sortOrder: 0 } as LayerDocType;
    const trB = { ...makeLayer('tr-b', 'transcription', '乙', 'independent_boundary'), sortOrder: 2 } as LayerDocType;
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
          <TranscriptionTimelineComparison
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

    expect(screen.getByTestId('comparison-bundle-filter-btn')).toBeTruthy();
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
    const trMap = contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>;
    trMap.set('u1', { text: '' });
    trMap.set('u2', { text: '' });

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(screen.getByTestId('comparison-source-rail-cmp-u1-u1')).toBeTruthy();
    expect(screen.getByTestId('comparison-source-rail-cmp-u1-u2')).toBeTruthy();

    fireEvent.click(screen.getByTestId('comparison-source-rail-cmp-u1-u2'));
    expect(onFocusLayer).toHaveBeenCalledWith('tr-a');
  });


  it('keeps one shared target editor when multiple source rows map to the same translation', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-a', 1.02, 2),
    ];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u1', { text: '共享译文' });
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u2', { text: '共享译文' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(viewRender.container.querySelectorAll('textarea.timeline-comparison-source-input')).toHaveLength(2);
    expect(viewRender.container.querySelectorAll('textarea.timeline-comparison-target-input')).toHaveLength(1);
    expect(viewRender.container.querySelector('.timeline-comparison-chip-multi-anchor')).toBeTruthy();
    expect(
      viewRender.container.querySelector('[data-comparison-group-id]')?.getAttribute('data-comparison-layout'),
    ).toBe('many-to-one');
  });

  it('renders one target row per translation line in one-to-many mode', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u1', { text: '译文一\n译文二' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const targetInputs = viewRender.container.querySelectorAll('textarea.timeline-comparison-target-input');
    expect(targetInputs).toHaveLength(2);
    expect((targetInputs[0] as HTMLTextAreaElement | undefined)?.value).toBe('译文一');
    expect((targetInputs[1] as HTMLTextAreaElement | undefined)?.value).toBe('译文二');
  });

  it('marks many-to-many and renders every source row plus split target rows in one merged group', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-a', 1.02, 2),
    ];
    const contextValue = makeEditorContext();
    const tr = contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>;
    tr.set('u1', { text: 'L1\nL2' });
    tr.set('u2', { text: 'L1\nL2' });

    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const group = container.querySelector('[data-comparison-group-id]');
    expect(group?.getAttribute('data-comparison-layout')).toBe('many-to-many');
    expect(container.querySelectorAll('textarea.timeline-comparison-source-input')).toHaveLength(2);
    expect(container.querySelectorAll('textarea.timeline-comparison-target-input')).toHaveLength(2);
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
    const tr = contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>;
    tr.clear();
    tr.set('u1', { text: 't1' });
    tr.set('u2', { text: 't2' });
    tr.set('u3', { text: 't3' });

    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(container.querySelectorAll('[data-comparison-group-id]')).toHaveLength(3);
    expect(container.querySelectorAll('textarea.timeline-comparison-source-input')).toHaveLength(3);
    expect(container.querySelectorAll('.timeline-comparison-chip-bundle')).toHaveLength(0);
  });

  it('avoids rendering duplicated target preview lines above the editor', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u1', { text: '第一行\n第二行' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    expect(viewRender.container.querySelectorAll('.timeline-comparison-target-line')).toHaveLength(0);
    const editors = viewRender.container.querySelectorAll('textarea.timeline-comparison-target-input');
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
          <TranscriptionTimelineComparison
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

    const sourceEditor = viewRender.container.querySelector('.timeline-comparison-source-input') as HTMLTextAreaElement | null;
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
          <TranscriptionTimelineComparison
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

    const filledSource = filledRender.container.querySelector('.timeline-comparison-source-input') as HTMLTextAreaElement | null;
    const filledTarget = filledRender.container.querySelector('.timeline-comparison-target-input') as HTMLTextAreaElement | null;
    const filledTargetSurface = filledRender.container.querySelector('.timeline-comparison-target-surface') as HTMLDivElement | null;
    expect(filledSource?.className.includes('timeline-comparison-source-card-empty')).toBe(false);
    expect(filledTarget?.className.includes('timeline-comparison-target-input-empty')).toBe(false);
    expect(filledTarget?.className.includes('timeline-comparison-target-input-filled')).toBe(false);
    expect(filledTargetSurface?.className.includes('timeline-comparison-target-surface-filled')).toBe(false);
    expect(filledTargetSurface?.className.includes('timeline-comparison-target-surface-empty')).toBe(false);

    filledRender.unmount();

    const emptyContext = makeEditorContext();
    emptyContext.getUnitTextForLayer = () => '';
    emptyContext.translationTextByLayer = new Map([
      ['translation-1', new Map([['u1', { text: '' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];

    const emptyRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={emptyContext}>
          <TranscriptionTimelineComparison
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

    const emptySource = emptyRender.container.querySelector('.timeline-comparison-source-input') as HTMLTextAreaElement | null;
    const emptyTarget = emptyRender.container.querySelector('.timeline-comparison-target-input') as HTMLTextAreaElement | null;
    const emptyTargetSurface = emptyRender.container.querySelector('.timeline-comparison-target-surface') as HTMLDivElement | null;
    expect(emptySource?.className.includes('timeline-comparison-source-card-empty')).toBe(true);
    expect(emptyTarget?.className.includes('timeline-comparison-target-input-empty')).toBe(true);
    expect(emptyTarget?.className.includes('timeline-comparison-target-input-filled')).toBe(false);
    expect(emptyTargetSurface?.className.includes('timeline-comparison-target-surface-empty')).toBe(true);
    expect(emptyTargetSurface?.className.includes('timeline-comparison-target-surface-active')).toBe(false);
  });

  it('shows shared save feedback and retry affordance for comparison target saves', async () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const contextValue = makeEditorContext();
    const saveUnitLayerText = vi.fn()
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValue(undefined);
    contextValue.saveUnitLayerText = saveUnitLayerText;

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement;
    fireEvent.change(targetEditor, { target: { value: '新的译文' } });

    const saveCalls = (contextValue.scheduleAutoSave as ReturnType<typeof vi.fn>).mock.calls;
    const scheduledTask = saveCalls[saveCalls.length - 1]?.[1] as (() => Promise<void>) | undefined;
    expect(scheduledTask).toBeTypeOf('function');
    await scheduledTask?.();

    await waitFor(() => {
      expect(viewRender.container.querySelector('.timeline-text-item-status-dot-error')).toBeTruthy();
    });

    fireEvent.click(viewRender.container.querySelector('.timeline-text-item-status-dot-error') as HTMLButtonElement);
    await waitFor(() => {
      expect(saveUnitLayerText).toHaveBeenCalledTimes(2);
    });
  });

  it('routes translation cell click through the resolved anchor when the merged group has multiple sources', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [
      makeUnit('u1', 'tr-a', 0, 1),
      makeUnit('u2', 'tr-a', 1.02, 2),
    ];
    const contextValue = makeEditorContext();
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('u2', { text: 'shared-target' });

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement;
    expect(targetEditor).toBeTruthy();
    fireEvent.click(targetEditor);
    expect(handleAnnotationClick).toHaveBeenCalledWith('u2', 1.02, 'translation-1', expect.any(Object));
  });

  it('blocks target save with toast when translation uses segments but none overlap the group', async () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    mockShowToast.mockClear();
    const transcriptionLayers = [makeLayer('tr-seg', 'transcription', '转写', 'independent_boundary')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-seg', '译文', 'independent_boundary')];
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
    (contextValue.translationTextByLayer.get('translation-1') as Map<string, { text: string }>).set('seg-1', { text: '段内译文' });
    const saveSegmentContentForLayer = vi.fn(async () => undefined);
    const saveUnitLayerText = vi.fn(async () => undefined);
    contextValue.saveUnitLayerText = saveUnitLayerText;

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
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

    const targetEditor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement;
    expect(targetEditor).toBeTruthy();
    fireEvent.change(targetEditor, { target: { value: '尝试保存的新译文' } });

    const saveCallsSeg = (contextValue.scheduleAutoSave as ReturnType<typeof vi.fn>).mock.calls;
    const scheduledTask = saveCallsSeg[saveCallsSeg.length - 1]?.[1] as (() => Promise<void>) | undefined;
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
      expect(viewRender.container.querySelector('.timeline-text-item-status-dot-error')).toBeTruthy();
    });
  });

  it('switches compact modes and keeps recording actions hidden by default', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const viewRender = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
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
    const view = scoped.getByTestId('timeline-comparison-view');
    expect(view.getAttribute('data-compact-mode')).toBe('both');
    expect(scoped.queryByRole('button', { name: /组备注/ })).toBeNull();
    expect(scoped.queryByRole('button', { name: /开始录音翻译|Start recording translation/i })).toBeNull();

    fireEvent.click(scoped.getByRole('button', { name: /仅原文/ }));
    expect(view.getAttribute('data-compact-mode')).toBe('source');

    fireEvent.click(scoped.getByRole('button', { name: /仅翻译/ }));
    expect(view.getAttribute('data-compact-mode')).toBe('target');
  });

  it('shows enabled recording action for mixed translation layers in comparison view', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [{
      ...makeTranslationLayer('translation-mixed', 'tr-a'),
      modality: 'mixed' as const,
      acceptsAudio: true,
    } as LayerDocType];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const startRecordingForUnit = vi.fn(async () => undefined);

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-mixed"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            startRecordingForUnit={startRecordingForUnit}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const button = screen.getByRole('button', { name: /开始录音翻译|Start recording translation/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      expect.objectContaining({ id: 'translation-mixed' }),
    );
  });

  it('resolves comparison playback from fallback audio scope key', () => {
    const transcriptionLayers = [makeLayer('tr-seg', 'transcription', '转写', 'independent_boundary')];
    const translationLayers = [{
      ...makeTranslationLayer('translation-seg', 'tr-seg', '译文', 'independent_boundary'),
      modality: 'mixed' as const,
      acceptsAudio: true,
    } as LayerDocType];
    const parent = makeUnit('u1', 'tr-seg', 0, 1);
    const transcriptionSegment = {
      ...makeUnit('seg-tr-1', 'tr-seg', 0, 1),
      unitType: 'segment' as const,
      parentUnitId: 'u1',
    } as LayerUnitDocType;
    const translationSegment = {
      ...makeUnit('seg-tl-1', 'translation-seg', 0, 1),
      unitType: 'segment' as const,
      parentUnitId: 'u1',
    } as LayerUnitDocType;
    const translationAudioByLayer = new Map<string, Map<string, LayerUnitContentDocType>>([
      ['translation-seg', new Map([
        ['u1', {
          id: 'aud-1',
          textId: 'text-1',
          unitId: 'u1',
          layerId: 'translation-seg',
          modality: 'audio',
          translationAudioMediaId: 'media-aud-1',
          sourceType: 'human',
          createdAt: '2026-04-19T00:00:00.000Z',
          updatedAt: '2026-04-19T00:00:01.000Z',
        } as LayerUnitContentDocType],
      ])],
    ]);
    const mediaItems: MediaItemDocType[] = [{
      id: 'media-aud-1',
      textId: 'text-1',
      filename: 'audio.webm',
      url: 'https://example.com/audio.webm',
      details: { source: 'translation-recording', timelineKind: 'acoustic' },
      isOfflineCached: false,
      createdAt: '2026-04-19T00:00:00.000Z',
    } as MediaItemDocType];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={[parent]}
            segmentParentUnitLookup={[parent]}
            segmentsByLayer={new Map<string, LayerUnitDocType[]>([
              ['tr-seg', [transcriptionSegment]],
              ['translation-seg', [translationSegment]],
            ])}
            translationAudioByLayer={translationAudioByLayer}
            mediaItems={mediaItems}
            defaultTranscriptionLayerId="tr-seg"
            focusedLayerRowId="translation-seg"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByRole('button', { name: /播放录音翻译|Play recorded translation/i })).toBeTruthy();
  });

  it('calls navigateUnitFromInput when Tab is pressed in comparison textareas', () => {
    const navigateUnitFromInput = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const view = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            navigateUnitFromInput={navigateUnitFromInput}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const sourceEditor = view.container.querySelector('textarea.timeline-comparison-source-input') as HTMLTextAreaElement;
    expect(sourceEditor).toBeTruthy();
    fireEvent.keyDown(sourceEditor, { key: 'Tab', shiftKey: false });
    expect(navigateUnitFromInput).toHaveBeenCalledTimes(1);

    const targetEditor = view.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement;
    expect(targetEditor).toBeTruthy();
    fireEvent.keyDown(targetEditor, { key: 'Tab', shiftKey: true });
    expect(navigateUnitFromInput).toHaveBeenCalledTimes(2);
  });

  it('shows translation stacks only for transcription layers that own child translation layers', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英'),
      makeLayer('tr-fr', 'transcription', '法'),
    ];
    const translationLayers = [
      makeTranslationLayer('tl-zh', 'tr-en', '中'),
      makeTranslationLayer('tl-wu', 'tr-en', '吴'),
    ];
    const units = [
      makeUnit('u-en', 'tr-en', 0, 1),
      makeUnit('u-fr', 'tr-fr', 0, 1.5),
    ];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-zh', new Map([['u-en', { text: '中文译' }]])],
      ['tl-wu', new Map([['u-en', { text: '吴语译' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit, layerId) => {
      if (unit.id === 'u-en' && layerId === 'tr-en') return '英语段';
      if (unit.id === 'u-fr' && layerId === 'tr-fr') return '法语段';
      return '';
    };

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-en"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByDisplayValue('英语段')).toBeTruthy();
    expect(screen.getByDisplayValue('法语段')).toBeTruthy();
    expect(screen.getByDisplayValue('中文译')).toBeTruthy();
    expect(screen.getByDisplayValue('吴语译')).toBeTruthy();
    expect(screen.getByTestId('comparison-target-empty-cmp-u-fr')).toBeTruthy();
  });

  it('shows orphan-repair hint when only unbound translation layers exist for another host group', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英'),
      makeLayer('tr-fr', 'transcription', '法'),
    ];
    const translationLayers = [
      makeLayer('tl-orphan', 'translation', '孤立译层'),
    ];
    const units = [
      makeUnit('u-en', 'tr-en', 0, 1),
      makeUnit('u-fr', 'tr-fr', 0, 1.5),
    ];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-orphan', new Map([['u-en', { text: '孤立译文' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit, layerId) => {
      if (unit.id === 'u-en' && layerId === 'tr-en') return '英语段';
      if (unit.id === 'u-fr' && layerId === 'tr-fr') return '法语段';
      return '';
    };

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-en"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('comparison-target-empty-cmp-u-fr')).toBeTruthy();
    expect(screen.getByText('检测到未绑定宿主的译文层；请先在层元信息里修复父层关系。')).toBeTruthy();
  });

  it('switches target header layer with the active group host instead of pinning one translation layer', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英语层'),
      makeLayer('tr-fr', 'transcription', '法语层'),
    ];
    const translationLayers = [
      makeTranslationLayer('tl-zh', 'tr-en', '中文译层'),
      makeTranslationLayer('tl-fr', 'tr-fr', '法文译层'),
    ];
    const layerLinks = [
      makeLayerLink('link-zh-en', 'tr-en', 'tr-en', 'tl-zh'),
      makeLayerLink('link-fr-fr', 'tr-fr', 'tr-fr', 'tl-fr'),
    ];
    const units = [
      makeUnit('u-en', 'tr-en', 0, 1),
      makeUnit('u-fr', 'tr-fr', 2, 3),
    ];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-zh', new Map([['u-en', { text: '中文译文' }]])],
      ['tl-fr', new Map([['u-fr', { text: '法文译文' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u-en' ? '英语原文' : '法语原文');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            layerLinks={layerLinks}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-en"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('comparison-layer-header-target').textContent ?? '').toContain('中文译层');
    expect(screen.queryByTestId('comparison-layer-header-target-tl-fr')).toBeNull();

    fireEvent.click(screen.getByDisplayValue('法语原文'));

    expect(screen.getByTestId('comparison-layer-header-target').textContent ?? '').toContain('法文译层');
    expect(screen.queryByTestId('comparison-layer-header-target-tl-zh')).toBeNull();
  });

  it('opens the layer display styles menu when displayStyleControl is provided', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            displayStyleControl={{
              orthographies: [],
              onUpdate: vi.fn(),
              onReset: vi.fn(),
            }}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '层显示样式' }));
    expect(await screen.findByRole('menu')).toBeTruthy();
  });

  it('opens layer menu from vertical row rail context menu', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '原文层')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '翻译层')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const view = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            deletableLayers={[...transcriptionLayers, ...translationLayers]}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const sourceRailButton = view.container.querySelector('.timeline-comparison-row-rail-source') as HTMLButtonElement | null;
    expect(sourceRailButton).toBeTruthy();

    fireEvent.contextMenu(sourceRailButton!);
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^层操作/ })).toBeTruthy();
  });

  it('opens the vertical layer header context menu and reuses shared layer action dialogs', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '原文层')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '翻译层')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            deletableLayers={[...transcriptionLayers, ...translationLayers]}
            displayStyleControl={{
              orthographies: [],
              onUpdate: vi.fn(),
              onReset: vi.fn(),
            }}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const comparisonView = screen.getByTestId('timeline-comparison-view');
    fireEvent.contextMenu(screen.getByTestId('comparison-layer-header-source'));

    expect(await screen.findByRole('menu')).toBeTruthy();

    const viewCategory = screen.getByRole('menuitem', { name: /^视图/ });
    fireEvent.mouseEnter(viewCategory);
    const sourceOnlyItem = await screen.findByRole('menuitem', { name: '仅原文' });
    fireEvent.click(sourceOnlyItem);
    expect(comparisonView.getAttribute('data-compact-mode')).toBe('source');

    fireEvent.contextMenu(screen.getByTestId('comparison-layer-header-source'));
    const layerOpsCategory = await screen.findByRole('menuitem', { name: /^层操作/ });
    fireEvent.click(layerOpsCategory);

    const editLayerAction = await screen.findByRole('menuitem', { name: /编辑该层元信息/ });
    const deleteLayerAction = await screen.findByRole('menuitem', { name: /删除当前层/ });
    expect((editLayerAction as HTMLButtonElement).disabled).toBe(false);
    expect((deleteLayerAction as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(editLayerAction);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
