// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
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

  it('shows lane-label-based headers, focuses layers from the header, and only reveals bundle chips when multiple bundles exist', () => {
    const handleAnnotationClick = vi.fn();
    const onFocusLayer = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '普通话转写')];
    const translationLayers = [makeLayer('translation-1', 'translation', '英文翻译')];
    const units = [
      { ...makeUnit('u1', 'tr-a', 0, 1), speaker: 'Alice', rootUnitId: 'bundle-a' } as LayerUnitDocType,
    ];
    const contextValue = makeEditorContext();
    contextValue.renderLaneLabel = (layer) => `${layer.name?.['zh-CN']} · 时间轴层头`;

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

    const sourceHeader = screen.getByRole('button', { name: /普通话转写 · 时间轴层头/ });
    const targetHeader = screen.getByRole('button', { name: /英文翻译 · 时间轴层头/ });
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
});
