import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSttRuntime, createSttEnhancementProvider } = vi.hoisted(() => {
  const createSttEnhancementProvider = vi.fn((kind: string) => ({ kind }));
  const loadSttRuntime = vi.fn<() => Promise<{ createSttEnhancementProvider: typeof createSttEnhancementProvider }>>();
  return { loadSttRuntime, createSttEnhancementProvider };
});

vi.mock('./voiceRuntimeLoaders', () => ({
  loadSttRuntime,
}));

import { scheduleSyncVoiceServiceSttEnhancement } from './VoiceAgentService.sttEnhancementSync';

describe('scheduleSyncVoiceServiceSttEnhancement (#384)', () => {
  beforeEach(() => {
    loadSttRuntime.mockReset();
    createSttEnhancementProvider.mockClear();
  });

  it('启用后加载未完成时关闭 → 加载完成仍保持关闭 | disable during load must keep enhancement off', async () => {
    let resolveLoad!: (value: {
      createSttEnhancementProvider: typeof createSttEnhancementProvider;
    }) => void;
    const deferred = new Promise<{
      createSttEnhancementProvider: typeof createSttEnhancementProvider;
    }>((resolve) => {
      resolveLoad = resolve;
    });
    loadSttRuntime.mockReturnValueOnce(deferred);

    const setSttEnhancement = vi.fn();
    const voiceService = { setSttEnhancement } as never;
    let epoch = 0;

    // Enable whisperx-align (starts async load)
    epoch += 1;
    const enableEpoch = epoch;
    scheduleSyncVoiceServiceSttEnhancement({
      getVoiceService: () => voiceService,
      enhancementKind: 'whisperx-align',
      enhancementConfig: {},
      isCurrent: () => enableEpoch === epoch,
    });
    expect(loadSttRuntime).toHaveBeenCalledTimes(1);
    expect(setSttEnhancement).not.toHaveBeenCalled();

    // Disable before load completes — bumps epoch and clears immediately
    epoch += 1;
    const disableEpoch = epoch;
    scheduleSyncVoiceServiceSttEnhancement({
      getVoiceService: () => voiceService,
      enhancementKind: 'none',
      enhancementConfig: {},
      isCurrent: () => disableEpoch === epoch,
    });
    expect(setSttEnhancement).toHaveBeenCalledWith(undefined, undefined);

    setSttEnhancement.mockClear();
    resolveLoad({ createSttEnhancementProvider });
    await deferred;
    await Promise.resolve();

    // Stale enable callback must not re-install the provider
    expect(createSttEnhancementProvider).not.toHaveBeenCalled();
    expect(setSttEnhancement).not.toHaveBeenCalled();
  });

  it('current sync still installs provider when load completes while current', async () => {
    loadSttRuntime.mockResolvedValueOnce({ createSttEnhancementProvider });
    const setSttEnhancement = vi.fn();
    const voiceService = { setSttEnhancement } as never;
    const epoch = 1;

    scheduleSyncVoiceServiceSttEnhancement({
      getVoiceService: () => voiceService,
      enhancementKind: 'whisperx-align',
      enhancementConfig: { foo: 1 } as never,
      isCurrent: () => epoch === 1,
    });

    await vi.waitFor(() => {
      expect(createSttEnhancementProvider).toHaveBeenCalledWith('whisperx-align');
    });
    expect(setSttEnhancement).toHaveBeenCalledWith({ kind: 'whisperx-align' }, { foo: 1 });
  });
});
