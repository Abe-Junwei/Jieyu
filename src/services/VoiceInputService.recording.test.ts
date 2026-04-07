/**
 * VoiceInputService.recording — 集成冒烟测试
 * Integration smoke test: RecordingExecutor VAD→STT pipeline.
 *
 * 验证链路 | Verified chain:
 *   setVadService() → stopRecording() → VAD detectSpeechSegments → emit / skip
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── mock 依赖 | mock dependencies ──────────────────────────────────────────

const { mockDetectSpeechSegments } = vi.hoisted(() => ({
  mockDetectSpeechSegments: vi.fn(),
}));

vi.mock('./VoiceInputService.probes', () => ({
  buildWhisperTranscriptionEndpoints: vi.fn(() => ['http://localhost:8080/v1/audio/transcriptions']),
  createTranscriptionTimeoutController: vi.fn(() => ({
    controller: new AbortController(),
    clear: vi.fn(),
  })),
}));

vi.mock('./vad/WhisperXVadService', () => ({
  WhisperXVadService: class MockWhisperXVadService {
    detectSpeechSegments = mockDetectSpeechSegments;
    init = vi.fn(async () => undefined);
    dispose = vi.fn();
  },
}));

vi.mock('../observability/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./vad/VadCacheService', () => ({
  vadCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
  },
}));

vi.mock('../utils/decodeEscapedUnicode', () => ({
  decodeEscapedUnicode: (s: string) => s,
}));

import type { SttResult } from './VoiceInputService';
import { RecordingExecutor, type RecordingCallbacks } from './VoiceInputService.recording';
import { WhisperXVadService } from './vad/WhisperXVadService';

// ── 辅助 | helpers ──────────────────────────────────────────────────────────

/**
 * 构造最小 MediaRecorder / MediaStream / AudioContext stub
 * Minimal stubs for browser recording APIs
 */
function installMediaStubs(options?: { audioChunks?: Blob[] }) {
  const defaultChunks = options?.audioChunks ?? [new Blob(['audio'], { type: 'audio/webm' })];
  const fakeTrack = { stop: vi.fn(), kind: 'audio' } as unknown as MediaStreamTrack;
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  } as unknown as MediaStream;

  const emitChunks = (
    ondataavailable: ((e: BlobEvent) => void) | null,
    dataHandler: ((e: BlobEvent) => void) | null,
  ) => {
    for (const chunk of defaultChunks) {
      const event = { data: chunk } as unknown as BlobEvent;
      ondataavailable?.(event);
      dataHandler?.(event);
    }
  };

  // MediaRecorder
  let dataHandler: ((e: BlobEvent) => void) | null = null;
  let stopHandler: (() => void) | null = null;
  vi.stubGlobal('MediaRecorder', class FakeMediaRecorder {
    static isTypeSupported = () => true;
    state = 'inactive' as string;
    ondataavailable: ((e: BlobEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    start = vi.fn(() => {
      this.state = 'recording';
      emitChunks(this.ondataavailable, dataHandler);
    });
    stop = vi.fn(() => {
      this.state = 'inactive';
      emitChunks(this.ondataavailable, dataHandler);
      stopHandler?.();
    });
    addEventListener = vi.fn((type: string, handler: (...args: unknown[]) => void) => {
      if (type === 'dataavailable') dataHandler = handler as never;
      if (type === 'stop') stopHandler = handler as never;
    });
    removeEventListener = vi.fn();
  });

  // navigator.mediaDevices
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(async () => fakeStream) },
  });

  // AudioContext — 用于 VAD 路径 | used in VAD path
  const fakeAudioBuffer = {
    sampleRate: 16000,
    length: 16000,
    duration: 1.0,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(16000),
  } as unknown as AudioBuffer;
  const audioContexts: Array<{ decodeAudioData: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal('AudioContext', class FakeAudioContext {
    decodeAudioData = vi.fn(async () => fakeAudioBuffer);
    close = vi.fn(async () => undefined);
    constructor() {
      audioContexts.push({ decodeAudioData: this.decodeAudioData, close: this.close });
    }
  });

  return { fakeStream, fakeTrack, fakeAudioBuffer, audioContexts };
}

// ── 测试 | tests ──────────────────────────────────────────────────────────

describe('RecordingExecutor — VAD→STT 集成', () => {
  let callbacks: RecordingCallbacks;
  let emitResult: ReturnType<typeof vi.fn<(result: SttResult) => void>>;
  let emitError: ReturnType<typeof vi.fn<(error: string) => void>>;

  beforeEach(() => {
    vi.restoreAllMocks();
    emitResult = vi.fn<(result: SttResult) => void>();
    emitError = vi.fn<(error: string) => void>();
    callbacks = { emitResult, emitError };
    mockDetectSpeechSegments.mockReset();
    installMediaStubs();

    // 提供通用的 fetch / FormData 环境 | Provide universal fetch/FormData stubs for whisper-server path
    vi.stubGlobal('FormData', class MockFormData {
      private entries: [string, unknown][] = [];
      append(key: string, value: unknown) { this.entries.push([key, value]); }
      get(key: string) { return this.entries.find(([entryKey]) => entryKey === key)?.[1] ?? null; }
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'transcribed' }),
      text: async () => 'transcribed',
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('VAD 检测到语音段时正常走 STT 路径 | proceeds to STT when VAD detects speech', async () => {
    mockDetectSpeechSegments.mockResolvedValue([
      { start: 0.0, end: 0.8, confidence: 0.91 },
    ]);

    const executor = new RecordingExecutor(callbacks);
    const vadService = new WhisperXVadService();
    executor.setVadService(vadService);

    await executor.startRecording();
    expect(executor.isRecording).toBe(true);

    await executor.stopRecording('whisper-local', {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'zh-CN',
    });

    // VAD 应被调用 | VAD should be called
    expect(mockDetectSpeechSegments).toHaveBeenCalledTimes(1);
    // VAD 通过后应继续到 STT 路径（产出结果或错误）| After VAD passes, pipeline should complete (result or error)
    const callbackInvoked = emitResult.mock.calls.length > 0 || emitError.mock.calls.length > 0;
    expect(callbackInvoked).toBe(true);
  });

  it('VAD 未检测到语音时跳过 STT 并返回空结果 | skips STT and returns empty result when VAD detects no speech', async () => {
    mockDetectSpeechSegments.mockResolvedValue([]);

    const executor = new RecordingExecutor(callbacks);
    executor.setVadService(new WhisperXVadService());

    await executor.startRecording();
    await executor.stopRecording('whisper-local', { lang: 'zh-CN' });

    // VAD 应被调用 | VAD should be called
    expect(mockDetectSpeechSegments).toHaveBeenCalledTimes(1);
    // 应返回空结果 | Should emit empty result
    expect(emitResult).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '',
        isFinal: true,
        confidence: 0,
        lang: 'zh-CN',
        engine: 'whisper-local',
      }),
    );
  });

  it('VAD 失败时不阻断 STT 流程 | VAD failure does not block STT', async () => {
    const { audioContexts } = installMediaStubs();
    mockDetectSpeechSegments.mockRejectedValue(new Error('ONNX runtime crash'));

    const executor = new RecordingExecutor(callbacks);
    executor.setVadService(new WhisperXVadService());

    await executor.startRecording();
    await executor.stopRecording('whisper-local', {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'en',
    });

    // VAD 失败后仍继续管道（产出结果或错误，不抛异常）| Pipeline continues after VAD failure (does not throw)
    const callbackInvoked = emitResult.mock.calls.length > 0 || emitError.mock.calls.length > 0;
    expect(callbackInvoked).toBe(true);
    expect(audioContexts[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('非 whisper-local 引擎不触发 VAD | non-whisper-local engine does not trigger VAD', async () => {

    const executor = new RecordingExecutor(callbacks);
    executor.setVadService(new WhisperXVadService());

    await executor.startRecording();
    await executor.stopRecording('web-speech' as never, {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'fr',
    });

    // VAD 不应被调用 | VAD should NOT be called
    expect(mockDetectSpeechSegments).not.toHaveBeenCalled();
  });

  it('无 VAD 服务时直接走 STT | no VAD service proceeds to STT directly', async () => {

    const executor = new RecordingExecutor(callbacks);
    // 不设置 VAD | No VAD set

    await executor.startRecording();
    await executor.stopRecording('whisper-local', {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'en',
    });

    expect(mockDetectSpeechSegments).not.toHaveBeenCalled();
    // 无 VAD 时管道仍完成 | Pipeline completes without VAD
    const callbackInvoked = emitResult.mock.calls.length > 0 || emitError.mock.calls.length > 0;
    expect(callbackInvoked).toBe(true);
  });

  it('setVadService(null) 清除 VAD 服务 | setVadService(null) clears VAD service', async () => {
    mockDetectSpeechSegments.mockResolvedValue([]);

    const executor = new RecordingExecutor(callbacks);
    executor.setVadService(new WhisperXVadService());
    executor.setVadService(null);

    await executor.startRecording();
    await executor.stopRecording('whisper-local', {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'en',
    });

    // VAD 被清除，不应被调用 | VAD cleared, should not be called
    expect(mockDetectSpeechSegments).not.toHaveBeenCalled();
  });

  it('uses the Distil-Whisper default model when no explicit model is configured', async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: { body?: unknown }) => {
      const body = init?.body as { get: (key: string) => unknown } | undefined;
      expect(body?.get('model')).toBe('ggml-distil-whisper-large-v3.bin');
      return {
        ok: true,
        json: async () => ({ text: 'transcribed' }),
        text: async () => 'transcribed',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const executor = new RecordingExecutor(callbacks);

    await executor.startRecording();
    await executor.stopRecording('whisper-local', {
      whisperServerUrl: 'http://localhost:8080',
      lang: 'zh-CN',
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
