// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { AiChatPromptLabModal } from './AiChatPromptLabModal';
import { AiChatReplayDetailPanel } from './AiChatReplayDetailPanel';
import { DevErrorAggregationPanel } from '../DevErrorAggregationPanel';
import { recordStructuredError, resetStructuredErrorAggregation } from '../../observability/errorAggregation';

const {
  computeAdaptivePanelWidthMock,
  readPersistedUiFontScaleMock,
  resolveTextDirectionFromLocaleMock,
} = vi.hoisted(() => ({
  computeAdaptivePanelWidthMock: vi.fn<(input: { baseWidth: number; direction: 'ltr' | 'rtl' }) => number>(),
  readPersistedUiFontScaleMock: vi.fn<(locale: string, direction: 'ltr' | 'rtl') => number>(),
  resolveTextDirectionFromLocaleMock: vi.fn<(locale: string) => 'ltr' | 'rtl'>(),
}));

vi.mock('../../utils/panelAdaptiveLayout', () => ({
  UI_FONT_SCALE_LIMITS: {
    min: 0.85,
    max: 1.4,
    fallback: 1,
    storageKey: 'jieyu:ui-font-scale',
    changeEvent: 'jieyu:ui-font-scale-changed',
  },
  subscribeUiFontScalePreference: () => () => {},
  readUiFontScalePreferenceSnapshot: () => 'auto:1.0000',
  computeAdaptivePanelWidth: (input: { baseWidth: number; direction: 'ltr' | 'rtl' }) => computeAdaptivePanelWidthMock(input),
  readPersistedUiFontScale: (locale: string, direction: 'ltr' | 'rtl') => readPersistedUiFontScaleMock(locale, direction),
  resolveTextDirectionFromLocale: (locale: string) => resolveTextDirectionFromLocaleMock(locale),
}));

describe('AI complex panels RTL matrix', () => {
  beforeEach(() => {
    computeAdaptivePanelWidthMock.mockReset();
    readPersistedUiFontScaleMock.mockReset();
    resolveTextDirectionFromLocaleMock.mockReset();
    readPersistedUiFontScaleMock.mockReturnValue(1);
    computeAdaptivePanelWidthMock.mockImplementation((input) => input.baseWidth);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetStructuredErrorAggregation();
  });

  it.each([
    { direction: 'ltr' as const },
    { direction: 'rtl' as const },
  ])('applies dual-channel measurement + dir to prompt lab in $direction', ({ direction }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);

    const view = render(
      <LocaleProvider locale="en-US">
        <AiChatPromptLabModal
          isZh={false}
          showPromptLab
          promptTemplates={[]}
          editingTemplateId={null}
          templateTitleInput=""
          templateContentInput=""
          onInjectTemplate={vi.fn()}
          onEditTemplate={vi.fn()}
          onRemoveTemplate={vi.fn()}
          onTemplateTitleInputChange={vi.fn()}
          onTemplateContentInputChange={vi.fn()}
          onAppendPromptVariable={vi.fn()}
          onSaveTemplate={vi.fn()}
          onInjectAndClose={vi.fn()}
        />
      </LocaleProvider>,
    );

    const root = view.container.querySelector('.ai-chat-prompt-lab-panel-content') as HTMLDivElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('dir')).toBe(direction);
    expect(readPersistedUiFontScaleMock).toHaveBeenCalledWith('en-US', direction);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 320, direction }));
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 720, direction }));
  });

  it.each([
    { direction: 'ltr' as const },
    { direction: 'rtl' as const },
  ])('applies dual-channel measurement + dir to replay detail panel in $direction', ({ direction }) => {
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);

    const view = render(
      <LocaleProvider locale="en-US">
        <AiChatReplayDetailPanel
          isZh={false}
          showReplayDetailPanel={false}
          selectedReplayBundle={{
            toolName: 'delete_layer',
            requestId: 'req-1',
            replayable: true,
            decisions: [],
          } as any}
          compareSnapshot={null}
          snapshotDiff={null}
          importFileInputRef={{ current: null }}
          onToggleDetail={vi.fn()}
          onClose={vi.fn()}
          onImportSnapshotFile={vi.fn()}
          onClearCompare={vi.fn()}
        />
      </LocaleProvider>,
    );

    const root = view.container.querySelector('.ai-chat-replay-panel') as HTMLDivElement;
    expect(root).toBeTruthy();
    expect(root.getAttribute('dir')).toBe(direction);
    expect(readPersistedUiFontScaleMock).toHaveBeenCalledWith('en-US', direction);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 360, direction }));
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 760, direction }));
  });

  it.each([
    { direction: 'ltr' as const },
    { direction: 'rtl' as const },
  ])('applies direction + dual-channel sizing to error aggregation panel in $direction', ({ direction }) => {
    vi.useFakeTimers();
    resolveTextDirectionFromLocaleMock.mockReturnValue(direction);

    render(
      <LocaleProvider locale="en-US">
        <DevErrorAggregationPanel />
      </LocaleProvider>,
    );

    recordStructuredError({
      category: 'action',
      action: 'transcription.toolbar.importAudio',
      i18nKey: 'transcription.importExport.failed',
      recoverable: true,
    });

    act(() => {
      vi.advanceTimersByTime(1100);
    });

    const root = screen.getByText(/Error Aggregation/).closest('details') as HTMLElement;
    expect(root.getAttribute('dir')).toBe(direction);
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 320, direction }));
    expect(computeAdaptivePanelWidthMock).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: 520, direction }));
  });
});
