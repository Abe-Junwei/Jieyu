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

  it('does not re-run pending-tool sidebar activation when the input object is re-created with the same pending ref', () => {
    const pending = { tool: 'test' };
    const setHubSidebarTab = vi.fn();
    const setIsAiPanelCollapsed = vi.fn();
    const flushDeferredAiRuntime = vi.fn();

    const { rerender } = renderHook(({ input }) => useReadyWorkspaceRenderController(input), {
      initialProps: {
        input: makeInput({
          isAiPanelCollapsed: true,
          flushDeferredAiRuntime,
          aiPendingToolCall: pending,
          setHubSidebarTab,
          setIsAiPanelCollapsed,
        }),
      },
    });

    const hubCallsAfterMount = setHubSidebarTab.mock.calls.length;
    const collapseCallsAfterMount = setIsAiPanelCollapsed.mock.calls.length;
    rerender({
      input: makeInput({
        isAiPanelCollapsed: true,
        flushDeferredAiRuntime,
        aiPendingToolCall: pending,
        setHubSidebarTab,
        setIsAiPanelCollapsed,
      }),
    });
    expect(setHubSidebarTab.mock.calls.length).toBe(hubCallsAfterMount);
    expect(setIsAiPanelCollapsed.mock.calls.length).toBe(collapseCallsAfterMount);
  });
});
