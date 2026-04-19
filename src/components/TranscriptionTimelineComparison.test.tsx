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

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { TranscriptionEditorContext, type TranscriptionEditorContextValue } from '../contexts/TranscriptionEditorContext';
import { LocaleProvider } from '../i18n';
import { TranscriptionTimelineComparison } from './TranscriptionTimelineComparison';

function makeLayer(
  id: string,
  layerType: 'transcription' | 'translation',
  displayName = id,
  constraint: LayerDocType['constraint'] = 'symbolic_association',
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
  };
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
    renderLaneLabel: () => null,
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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

  it('syncs the active comparison group when the selected unit changes outside the component', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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

  it('keeps target-side save feedback on a separate slot when vertical cards also show note markers', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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

  it('shows inline dot-separated lane headers, focuses layers from the header, and only reveals bundle chips when multiple bundles exist', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '普通话转写')];
    const translationLayers = [makeLayer('translation-1', 'translation', '英文翻译')];
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

    const sourceHeader = screen.getByRole('button', { name: /普通话转写/ });
    const targetHeader = screen.getByRole('button', { name: /英文翻译/ });
    expect(sourceHeader).toBeTruthy();
    expect(targetHeader).toBeTruthy();
    expect(sourceHeader.getAttribute('aria-pressed')).toBe('true');
    expect(targetHeader.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(targetHeader);
    expect(onFocusLayer).toHaveBeenCalledWith('translation-1');
    expect(sourceHeader.getAttribute('aria-pressed')).toBe('false');
    expect(targetHeader.getAttribute('aria-pressed')).toBe('true');
    expect(viewRender.container.querySelector('.timeline-comparison-chip-speaker')?.textContent).toContain('Alice');
    expect(viewRender.container.querySelectorAll('.timeline-comparison-chip-bundle')).toHaveLength(0);

    viewRender.rerender(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineComparison
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={[
              { ...makeUnit('u1', 'tr-a', 0, 1), rootUnitId: 'bundle-a' } as LayerUnitDocType,
              { ...makeUnit('u2', 'tr-a', 2, 3), rootUnitId: 'bundle-b' } as LayerUnitDocType,
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

  it('avoids rendering duplicated target preview lines above the editor', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const editor = viewRender.container.querySelector('textarea.timeline-comparison-target-input') as HTMLTextAreaElement | null;
    expect(editor).toBeTruthy();
    expect(editor?.value).toBe('第一行\n第二行');
  });

  it('keeps the transcription column directly editable', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
    const translationLayers = [makeLayer('translation-1', 'translation', '译文', 'independent_boundary')];
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
    const translationLayers = [makeLayer('translation-1', 'translation')];
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

  it('calls navigateUnitFromInput when Tab is pressed in comparison textareas', () => {
    const navigateUnitFromInput = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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

  it('opens the layer display styles menu when displayStyleControl is provided', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeLayer('translation-1', 'translation')];
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
});
