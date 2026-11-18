// @vitest-environment jsdom
/**
 * VadMediaBackend.browser — 引擎标签必须真实反映本次检测 | engine label must reflect the real detection
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { detectWithEngine, initMock, resetMock, constructed } = vi.hoisted(() => ({
  detectWithEngine: vi.fn(),
  initMock: vi.fn(),
  resetMock: vi.fn(),
  constructed: { count: 0 },
}));

vi.mock('./WhisperXVadService', () => ({
  WhisperXVadService: class MockWhisperXVadService {
    constructor() {
      constructed.count += 1;
    }
    init = initMock;
    detectSpeechSegmentsWithEngine = detectWithEngine;
    resetState = resetMock;
    dispose = vi.fn();
  },
}));

import { getVadMediaBackend } from './VadMediaBackend';
import './VadMediaBackend.browser';

describe('BrowserVadMediaBackend engine label', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => '16' },
        arrayBuffer: async () => new ArrayBuffer(16),
      })),
    );
    class FakeAudioContext {
      decodeAudioData = vi.fn(async () => ({ duration: 2 }) as AudioBuffer);
      close = vi.fn(async () => undefined);
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('Silero 初始化失败、能量降级时 engine 为 energy | reports energy when Silero init fails and energy VAD runs', async () => {
    initMock.mockRejectedValueOnce(new Error('VAD init failed'));
    detectWithEngine.mockResolvedValueOnce({ segments: [{ start: 0, end: 1 }], engine: 'energy' });

    const backend = getVadMediaBackend();
    expect(backend).toBeDefined();
    const result = await backend!.run({ mediaId: 'm1', mediaUrl: 'blob:m1' });

    expect(result.engine).toBe('energy');
    expect(result.segments).toEqual([{ start: 0, end: 1 }]);
    expect(result.durationSec).toBe(2);
  });

  it('Silero 实际产出结果时 engine 为 silero | reports silero when Silero produced the segments', async () => {
    initMock.mockResolvedValueOnce(undefined);
    detectWithEngine.mockResolvedValueOnce({
      segments: [{ start: 0, end: 1, confidence: 0.9 }],
      engine: 'silero',
    });

    const result = await getVadMediaBackend()!.run({ mediaId: 'm2', mediaUrl: 'blob:m2' });

    expect(result.engine).toBe('silero');
  });

  it('复用同一个服务检测下一段媒体，且不 reset | reuses one service for the next media and does not reset', async () => {
    initMock.mockResolvedValue(undefined);
    detectWithEngine.mockResolvedValue({ segments: [], engine: 'silero' });
    const backend = getVadMediaBackend()!;
    await backend.run({ mediaId: 'seq-a', mediaUrl: 'blob:seq-a' });
    const constructedAfterFirst = constructed.count;
    await backend.run({ mediaId: 'seq-b', mediaUrl: 'blob:seq-b' });

    expect(constructed.count).toBe(constructedAfterFirst);
    expect(detectWithEngine).toHaveBeenCalledTimes(2);
    expect(resetMock).not.toHaveBeenCalled();
  });
});
