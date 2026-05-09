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

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  MediaItemDocType,
} from '../db';
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
  it('switches compact modes and keeps recording actions hidden by default', () => {
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
            focusedLayerRowId="tr-a"
            onFocusLayer={onFocusLayer}
            handleAnnotationClick={handleAnnotationClick}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const scoped = within(viewRender.container);
    const view = scoped.getByTestId('timeline-paired-reading-view');
    expect(view.getAttribute('data-compact-mode')).toBe('both');
    expect(scoped.queryByRole('button', { name: /组备注/ })).toBeNull();
    expect(
      scoped.queryByRole('button', { name: /开始录音翻译|Start recording translation/i }),
    ).toBeNull();

    fireEvent.click(scoped.getByRole('button', { name: /仅原文/ }));
    expect(view.getAttribute('data-compact-mode')).toBe('source');

    fireEvent.click(scoped.getByRole('button', { name: /仅翻译/ }));
    expect(view.getAttribute('data-compact-mode')).toBe('target');
  });

  it('shows enabled recording action for mixed translation layers in comparison view', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [
      {
        ...makeTranslationLayer('translation-mixed', 'tr-a'),
        modality: 'mixed' as const,
        acceptsAudio: true,
      } as LayerDocType,
    ];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const startRecordingForUnit = vi.fn(async () => undefined);

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
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

    const button = screen.getByRole('button', {
      name: /开始录音翻译|Start recording translation/i,
    });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    expect(startRecordingForUnit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      expect.objectContaining({ id: 'translation-mixed' }),
    );
  });

  it('does not show STT for audio-only translation layers (parity with horizontal lanes)', () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [
      {
        ...makeTranslationLayer('translation-audio', 'tr-a'),
        modality: 'audio' as const,
        acceptsAudio: true,
      } as LayerDocType,
    ];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];
    const translationAudioByLayer = new Map<string, Map<string, LayerUnitContentDocType>>([
      [
        'translation-audio',
        new Map([
          [
            'u1',
            {
              id: 'aud-1',
              textId: 'text-1',
              unitId: 'u1',
              layerId: 'translation-audio',
              modality: 'audio',
              translationAudioMediaId: 'media-aud-1',
              sourceType: 'human',
              createdAt: '2026-04-19T00:00:00.000Z',
              updatedAt: '2026-04-19T00:00:01.000Z',
            } as LayerUnitContentDocType,
          ],
        ]),
      ],
    ]);
    const mediaItems: MediaItemDocType[] = [
      {
        id: 'media-aud-1',
        textId: 'text-1',
        filename: 'audio.webm',
        url: 'https://example.com/a.webm',
        details: {},
        isOfflineCached: false,
        createdAt: '2026-04-19T00:00:00.000Z',
      } as MediaItemDocType,
    ];
    const transcribeVoiceTranslation = vi.fn(async () => undefined);

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="translation-audio"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            translationAudioByLayer={translationAudioByLayer}
            mediaItems={mediaItems}
            transcribeVoiceTranslation={transcribeVoiceTranslation}
            startRecordingForUnit={vi.fn()}
            stopRecording={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(
      screen.getByRole('button', { name: /播放录音翻译|Play recorded translation/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /语音转文字|Transcribe recording/i })).toBeNull();
    expect(transcribeVoiceTranslation).not.toHaveBeenCalled();
  });

  it('resolves comparison playback from fallback audio scope key', () => {
    const transcriptionLayers = [
      makeLayer('tr-seg', 'transcription', '转写', 'independent_boundary'),
    ];
    const translationLayers = [
      {
        ...makeTranslationLayer('translation-seg', 'tr-seg', '译文', 'independent_boundary'),
        modality: 'mixed' as const,
        acceptsAudio: true,
      } as LayerDocType,
    ];
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
      [
        'translation-seg',
        new Map([
          [
            'u1',
            {
              id: 'aud-1',
              textId: 'text-1',
              unitId: 'u1',
              layerId: 'translation-seg',
              modality: 'audio',
              translationAudioMediaId: 'media-aud-1',
              sourceType: 'human',
              createdAt: '2026-04-19T00:00:00.000Z',
              updatedAt: '2026-04-19T00:00:01.000Z',
            } as LayerUnitContentDocType,
          ],
        ]),
      ],
    ]);
    const mediaItems: MediaItemDocType[] = [
      {
        id: 'media-aud-1',
        textId: 'text-1',
        filename: 'audio.webm',
        url: 'https://example.com/audio.webm',
        details: { source: 'translation-recording', timelineKind: 'acoustic' },
        isOfflineCached: false,
        createdAt: '2026-04-19T00:00:00.000Z',
      } as MediaItemDocType,
    ];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={[parent]}
            segmentParentUnitLookup={[parent]}
            segmentsByLayer={
              new Map<string, LayerUnitDocType[]>([
                ['tr-seg', [transcriptionSegment]],
                ['translation-seg', [translationSegment]],
              ])
            }
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

    expect(
      screen.getByRole('button', { name: /播放录音翻译|Play recorded translation/i }),
    ).toBeTruthy();
  });

  it('calls navigateUnitFromInput when Tab is pressed in comparison textareas', () => {
    const navigateUnitFromInput = vi.fn();
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    const view = render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
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

    const sourceEditor = view.container.querySelector(
      'textarea.timeline-paired-reading-source-input',
    ) as HTMLTextAreaElement;
    expect(sourceEditor).toBeTruthy();
    fireEvent.keyDown(sourceEditor, { key: 'Tab', shiftKey: false });
    expect(navigateUnitFromInput).toHaveBeenCalledTimes(1);

    const targetEditor = view.container.querySelector(
      'textarea.timeline-paired-reading-target-input',
    ) as HTMLTextAreaElement;
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
    const units = [makeUnit('u-en', 'tr-en', 0, 1), makeUnit('u-fr', 'tr-fr', 0, 1.5)];
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
          <TranscriptionTimelineVerticalView
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
    expect(screen.getByTestId('paired-reading-target-empty-pr-u-fr-src-tr-fr')).toBeTruthy();
  });

  it('keeps translation editor visible when source unit layerId is missing in multi-transcription text-only mode', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英'),
      makeLayer('tr-fr', 'transcription', '法'),
    ];
    const translationLayers = [makeTranslationLayer('tl-en', 'tr-en', '英译')];
    const sourceWithLayer = makeUnit('u-en', 'tr-en', 0, 1);
    const { layerId: _ignoredLayerId, ...sourceWithoutLayer } = sourceWithLayer;
    const units = [sourceWithoutLayer as LayerUnitDocType];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-en', new Map([['u-en', { text: 'English translation text' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u-en' ? 'English source text' : '');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-fr"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByDisplayValue('English source text')).toBeTruthy();
    expect(screen.getByDisplayValue('English translation text')).toBeTruthy();
    expect(screen.queryByTestId('paired-reading-target-empty-pr-u-en-src-tr-en')).toBeNull();
  });

  it('keeps translation editor visible when host binding mismatches but unit-linked translation text exists', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英'),
      makeLayer('tr-fr', 'transcription', '法'),
    ];
    const translationLayers = [makeTranslationLayer('tl-en', 'tr-en', '英译')];
    const units = [makeUnit('u-fr', 'tr-fr', 0, 1)];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-en', new Map([['u-fr', { text: 'French unit fallback translation' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u-fr' ? 'French source text' : '');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-fr"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByDisplayValue('French source text')).toBeTruthy();
    expect(screen.getByDisplayValue('French unit fallback translation')).toBeTruthy();
    expect(screen.queryByTestId('paired-reading-target-empty-pr-u-fr-src-tr-fr')).toBeNull();
  });

  it('keeps translation editor visible in single-transcription mode when layer link host is unresolved', () => {
    const transcriptionLayers = [makeLayer('tr-single', 'transcription', '单转写')];
    const translationLayers = [makeTranslationLayer('tl-single', 'tr-single', '单译文')];
    const layerLinks = [makeLayerLink('link-single-stale', 'missing-key', '', 'tl-single')];
    const units = [makeUnit('u-single', 'tr-single', 0, 1)];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-single', new Map([['u-single', { text: 'Single host fallback translation' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) =>
      unit.id === 'u-single' ? 'Single host source text' : '';

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            layerLinks={layerLinks}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-single"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    expect(screen.getByDisplayValue('Single host source text')).toBeTruthy();
    expect(screen.getByDisplayValue('Single host fallback translation')).toBeTruthy();
    expect(
      screen.queryByTestId('paired-reading-target-empty-pr-u-single-src-tr-single'),
    ).toBeNull();
  });

  it('shows orphan-repair hint when only unbound translation layers exist for another host group', () => {
    const transcriptionLayers = [
      makeLayer('tr-en', 'transcription', '英'),
      makeLayer('tr-fr', 'transcription', '法'),
    ];
    const translationLayers = [makeLayer('tl-orphan', 'translation', '孤立译层')];
    const units = [makeUnit('u-en', 'tr-en', 0, 1), makeUnit('u-fr', 'tr-fr', 0, 1.5)];
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
          <TranscriptionTimelineVerticalView
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

    expect(screen.getByTestId('paired-reading-target-empty-pr-u-fr-src-tr-fr')).toBeTruthy();
    expect(
      screen.getByText(
        '检测到未绑定宿主的翻译层；请在层元信息中补充指向宿主转写的 layer_links（或调整首选宿主）。',
      ),
    ).toBeTruthy();
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
    const units = [makeUnit('u-en', 'tr-en', 0, 1), makeUnit('u-fr', 'tr-fr', 2, 3)];
    const contextValue = makeEditorContext();
    contextValue.translationTextByLayer = new Map([
      ['tl-zh', new Map([['u-en', { text: '中文译文' }]])],
      ['tl-fr', new Map([['u-fr', { text: '法文译文' }]])],
    ]) as unknown as TranscriptionEditorContextValue['translationTextByLayer'];
    contextValue.getUnitTextForLayer = (unit) => (unit.id === 'u-en' ? '英语原文' : '法语原文');

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={contextValue}>
          <TranscriptionTimelineVerticalView
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

    expect(screen.getByTestId('paired-reading-layer-header-target').textContent ?? '').toContain(
      '中文译层',
    );
    expect(screen.queryByTestId('paired-reading-layer-header-target-tl-fr')).toBeNull();

    fireEvent.click(screen.getByDisplayValue('法语原文'));

    expect(screen.getByTestId('paired-reading-layer-header-target').textContent ?? '').toContain(
      '法文译层',
    );
    expect(screen.queryByTestId('paired-reading-layer-header-target-tl-zh')).toBeNull();
  });

  it('opens the layer display styles menu when displayStyleControl is provided', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
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
          <TranscriptionTimelineVerticalView
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

    const sourceRailButton = view.container.querySelector(
      '.timeline-paired-reading-row-rail-source',
    ) as HTMLButtonElement | null;
    expect(sourceRailButton).toBeTruthy();

    fireEvent.contextMenu(sourceRailButton!);
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /^层操作/ })).toBeTruthy();
  });
});
