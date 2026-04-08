/**
 * WhisperXVadService — 单元测试
 * Unit tests for WhisperXVadService (Worker mock path + energy fallback path).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ── mock VadService（能量降级）| mock energy-based VadService ────────────────
vi.mock('../VadService', () => ({
  detectVadSegments: vi.fn(() => [
    { start: 0.1, end: 1.5 },
    { start: 2.0, end: 3.8 },
  ]),
}));

import { WhisperXVadService } from './WhisperXVadService';
import { detectVadSegments } from '../VadService';

// ── 辅助：构造一个最小 AudioBuffer stub ──────────────────────────────────────
function makeAudioBuffer(durationSec = 2, sr = 44100): AudioBuffer {
  const len = Math.floor(durationSec * sr);
  const data = new Float32Array(len);
  return {
    sampleRate: sr,
    length: len,
    duration: durationSec,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

// ── Worker stub ───────────────────────────────────────────────────────────────

type MessageHandler = (e: MessageEvent) => void;

class FakeWorker {
  onmessage: MessageHandler | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private sentMessages: unknown[] = [];

  postMessage(data: unknown): void {
    this.sentMessages.push(data);
    const msg = data as { type: string; id?: string };

    // 模拟 Worker 响应 | Simulate Worker responses
    if (msg.type === 'init') {
      // 异步发送 ready | Async send ready
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
      });
    } else if (msg.type === 'detect') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: { type: 'progress', id: msg.id, processedFrames: 16, totalFrames: 32, ratio: 0.5 },
        } as unknown as MessageEvent);
        this.onmessage?.({
          data: {
            type: 'result',
            id: msg.id,
            segments: [
              { start: 0.2, end: 1.4, confidence: 0.87 },
              { start: 2.1, end: 3.6, confidence: 0.92 },
            ],
          },
        } as unknown as MessageEvent);
      });
    } else if (msg.type === 'reset') {
      // 无响应 | No response expected
    }
  }

  terminate(): void { /* no-op */ }
}

// ── 用 FakeWorker 替换全局 Worker | Inject FakeWorker globally ────────────────

describe('WhisperXVadService', () => {
  let originalWorker: typeof Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    // @ts-expect-error — 测试环境下替换全局 Worker
    globalThis.Worker = FakeWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    vi.clearAllMocks();
  });

  // ── init + detectSpeechSegments via Worker ────────────────────────────────

  it('init 后用 Worker 路径检测语音段 | uses Worker path after init', async () => {
    const svc = new WhisperXVadService({ modelUrl: '/models/silero_vad.onnx' });
    await svc.init();

    const buf = makeAudioBuffer(4);
    const segs = await svc.detectSpeechSegments(buf);

    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ start: 0.2, end: 1.4, confidence: 0.87 });
    expect(segs[1]).toMatchObject({ start: 2.1, end: 3.6, confidence: 0.92 });
  });

  it('检测结果包含 confidence 字段 | result includes confidence field', async () => {
    const svc = new WhisperXVadService();
    await svc.init();
    const segs = await svc.detectSpeechSegments(makeAudioBuffer(3));
    for (const seg of segs) {
      expect(typeof seg.confidence).toBe('number');
      expect(seg.confidence).toBeGreaterThanOrEqual(0);
      expect(seg.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('转发 Worker 进度事件 | forwards Worker progress events', async () => {
    const svc = new WhisperXVadService();
    await svc.init();
    const progress = [] as number[];

    await svc.detectSpeechSegments(makeAudioBuffer(3), {
      onProgress: (entry) => {
        progress.push(entry.ratio);
      },
    });

    expect(progress).toContain(0.5);
  });

  // ── 能量降级路径 | Energy fallback path ─────────────────────────────────

  it('未 init 时降级到能量 VAD | falls back to energy VAD when not initialized', async () => {
    const svc = new WhisperXVadService();
    // 不调用 init() — Worker 未就绪 | Skip init() — Worker not ready
    const buf = makeAudioBuffer(4);
    const segs = await svc.detectSpeechSegments(buf);

    expect(detectVadSegments).toHaveBeenCalledWith(buf);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ start: 0.1, end: 1.5 });
    // 能量降级结果无 confidence | Energy fallback has no confidence
    expect(segs[0]?.confidence).toBeUndefined();
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  it('dispose 后再次调用降级到能量 VAD | dispose makes subsequent calls fall back', async () => {
    const svc = new WhisperXVadService();
    await svc.init();
    svc.dispose();

    const buf = makeAudioBuffer(2);
    const segs = await svc.detectSpeechSegments(buf);
    expect(detectVadSegments).toHaveBeenCalledWith(buf);
    expect(segs.length).toBeGreaterThan(0);
  });

  // ── resetState ────────────────────────────────────────────────────────────

  it('init 前调用 resetState 不抛出 | resetState before init does not throw', () => {
    const svc = new WhisperXVadService();
    expect(() => svc.resetState()).not.toThrow();
  });

  // ── Worker 初始化超时 | Worker init timeout ─────────────────────────────

  it('Worker init 超时 → 抛出错误 | Worker init timeout → throws', async () => {
    // 使用一个不发 ready 的 Worker | Worker that never sends 'ready'
    class SilentWorker {
      onmessage: MessageHandler | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(): void { /* 不响应 | No response */ }
      terminate(): void { /* no-op */ }
    }
    // @ts-expect-error — 测试环境下替换全局 Worker
    globalThis.Worker = SilentWorker;

    const svc = new WhisperXVadService({ initTimeoutMs: 50 });
    await expect(svc.init()).rejects.toThrow(/timed out/);
    // 超时后仍可降级到能量 VAD | After timeout, still falls back to energy VAD
    const segs = await svc.detectSpeechSegments(makeAudioBuffer(1));
    expect(detectVadSegments).toHaveBeenCalled();
    expect(segs.length).toBeGreaterThan(0);
  });

  // ── Worker 检测过程中报错 | Worker error during detection ────────────────

  it('Worker 检测报错 → reject 对应 promise | detection error → rejects promise', async () => {
    class ErrorWorker {
      onmessage: MessageHandler | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(data: unknown): void {
        const msg = data as { type: string; id?: string };
        if (msg.type === 'init') {
          queueMicrotask(() => {
            this.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
          });
        } else if (msg.type === 'detect') {
          queueMicrotask(() => {
            this.onmessage?.({
              data: { type: 'error', id: msg.id, message: 'ONNX inference failed' },
            } as unknown as MessageEvent);
          });
        }
      }
      terminate(): void { /* no-op */ }
    }
    // @ts-expect-error — 测试环境下替换全局 Worker
    globalThis.Worker = ErrorWorker;

    const svc = new WhisperXVadService();
    await svc.init();
    await expect(svc.detectSpeechSegments(makeAudioBuffer(2))).rejects.toThrow('ONNX inference failed');
  });

  it('abort signal 会取消对应检测请求 | abort signal cancels in-flight detection', async () => {
    const seenMessages: Array<{ type: string; id?: string }> = [];

    class AbortAwareWorker {
      onmessage: MessageHandler | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      postMessage(data: unknown): void {
        const msg = data as { type: string; id?: string };
        seenMessages.push(msg);
        if (msg.type === 'init') {
          queueMicrotask(() => {
            this.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
          });
        }
      }
      terminate(): void { /* no-op */ }
    }

    // @ts-expect-error — 测试环境下替换全局 Worker
    globalThis.Worker = AbortAwareWorker;

    const svc = new WhisperXVadService();
    await svc.init();
    const controller = new AbortController();
    const promise = svc.detectSpeechSegments(makeAudioBuffer(2), { signal: controller.signal });

    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError', message: 'VAD detect aborted' });
    expect(seenMessages.some((message) => message.type === 'detect')).toBe(true);
    expect(seenMessages.some((message) => message.type === 'cancel')).toBe(true);
  });

  // ── Worker 创建失败 | Worker creation failure ───────────────────────────

  it('Worker 构造函数抛出 → init 拒绝 | Worker constructor throws → init rejects', async () => {
    // @ts-expect-error — 测试环境下替换全局 Worker
    globalThis.Worker = class { constructor() { throw new Error('CSP blocked'); } };

    const svc = new WhisperXVadService();
    await expect(svc.init()).rejects.toThrow(/CSP blocked/);
  });

  // ── 重复 init 幂等 | Double init is idempotent ─────────────────────────

  it('重复 init 不重新创建 Worker | second init is a no-op', async () => {
    const svc = new WhisperXVadService();
    await svc.init();
    await svc.init(); // 不应抛出 | Should not throw
    const segs = await svc.detectSpeechSegments(makeAudioBuffer(1));
    expect(segs.length).toBeGreaterThan(0);
  });
});
