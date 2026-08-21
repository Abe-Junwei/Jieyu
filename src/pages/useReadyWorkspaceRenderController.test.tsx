// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReadyWorkspaceRenderController } from './useReadyWorkspaceRenderController';

function makeInput(
  overrides: Partial<Parameters<typeof useReadyWorkspaceRenderController>[0]> = {},
) {
  return {
    isAiPanelCollapsed: false,
    flushDeferredAiRuntime: overrides.flushDeferredAiRuntime ?? vi.fn(),
    aiPendingToolCall: undefined as unknown,
    setHubSidebarTab: vi.fn(),
    setIsAiPanelCollapsed: vi.fn(),
    showProjectSetup: false,
    showAudioImport: false,
    audioDeleteConfirm: null as unknown,
    projectDeleteConfirm: null as unknown,
    showShortcuts: false,
    isFocusMode: false,
    pdfPreviewRequest: null as unknown,
    showBatchOperationPanel: false,
    recoveryAvailable: false,
    ...overrides,
  } satisfies Parameters<typeof useReadyWorkspaceRenderController>[0];
}

describe('useReadyWorkspaceRenderController', () => {
  it('does not re-run deferred flush when the input object is re-created with stable fields', () => {
    const flushDeferredAiRuntime = vi.fn();
    const { rerender } = renderHook(({ input }) => useReadyWorkspaceRenderController(input), {
      initialProps: {
        input: makeInput({ isAiPanelCollapsed: false, flushDeferredAiRuntime }),
      },
    });

    const callsAfterMount = flushDeferredAiRuntime.mock.calls.length;
    rerender({
      input: makeInput({ isAiPanelCollapsed: false, flushDeferredAiRuntime }),
    });
    expect(flushDeferredAiRuntime.mock.calls.length).toBe(callsAfterMount);
  });

  it('does not expand the analysis sidebar for a pending chat tool call', () => {
    const pending = { tool: 'test' };
    const setHubSidebarTab = vi.fn();
    const setIsAiPanelCollapsed = vi.fn();

    renderHook(() =>
      useReadyWorkspaceRenderController(
        makeInput({
          isAiPanelCollapsed: true,
          aiPendingToolCall: pending,
          setHubSidebarTab,
          setIsAiPanelCollapsed,
        }),
      ),
    );

    expect(setHubSidebarTab).not.toHaveBeenCalled();
    expect(setIsAiPanelCollapsed).not.toHaveBeenCalled();
  });
});
