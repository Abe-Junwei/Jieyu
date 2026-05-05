// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAiChatReplayController } from './useAiChatReplayController';

vi.mock('./useAiChatReplayBundleOpener', () => ({
  useAiChatReplayBundleOpener: () => ({
    openReplayBundle: vi.fn(async () => {}),
  }),
}));

vi.mock('./useAiChatReplayArtifactActions', () => ({
  useAiChatReplayArtifactActions: ({ openReplayBundle }: { openReplayBundle: (requestId: string) => Promise<void> }) => ({
    openLatestVerticalWorkflowReplay: vi.fn(() => openReplayBundle('req-1')),
    copyLatestVerticalWorkflowRequestId: vi.fn(),
    exportGoldenSnapshot: vi.fn(async () => {}),
    importSnapshotForCompare: vi.fn(),
  }),
}));

describe('useAiChatReplayController', () => {
  it('exposes replay opener and artifact actions', () => {
    const { result } = renderHook(() => useAiChatReplayController({
      compareSnapshot: null,
      isZh: true,
      setDecisionReplayFocusRequestId: vi.fn(),
      setDecisionReplayLocatedRequestId: vi.fn(),
      setReplayLoadingRequestId: vi.fn(),
      setReplayErrorMessage: vi.fn(),
      setSelectedReplayBundle: vi.fn(),
      setSnapshotDiff: vi.fn(),
      latestVerticalWorkflowRequestId: null,
      setShowDecisionPanel: vi.fn(),
      copiedVerticalRequestTimerRef: { current: null },
      setCopiedVerticalWorkflowRequestId: vi.fn(),
      cardMessages: {} as never,
      selectedReplayBundle: null,
      setExportedSnapshotRequestId: vi.fn(),
      exportedSnapshotTimerRef: { current: null },
      setCompareSnapshot: vi.fn(),
    }));

    expect(typeof result.current.openReplayBundle).toBe('function');
    expect(typeof result.current.openLatestVerticalWorkflowReplay).toBe('function');
    expect(typeof result.current.exportGoldenSnapshot).toBe('function');
    expect(typeof result.current.importSnapshotForCompare).toBe('function');
  });
});
