import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSetVadService,
  mockRecordingDispose,
  mockVadInit,
  mockVadDispose,
  mockAttemptEngineWithFallback,
} = vi.hoisted(() => ({
  mockSetVadService: vi.fn(),
  mockRecordingDispose: vi.fn(),
  mockVadInit: vi.fn(async () => undefined),
  mockVadDispose: vi.fn(),
  mockAttemptEngineWithFallback: vi.fn(async () => undefined),
}));

vi.mock('./VoiceInputService.vad', () => ({
  VadMonitorRuntime: class VadMonitorRuntime {
    stop = vi.fn();
    stopSilenceTimer = vi.fn();
    energyLevel = 0;
  },
}));

vi.mock('./VoiceInputService.recording', () => ({
  RecordingExecutor: class RecordingExecutor {
    setVadService = mockSetVadService;
    dispose = mockRecordingDispose;
  },
}));

vi.mock('./vad/WhisperXVadService', () => ({
  WhisperXVadService: class WhisperXVadService {
    init = mockVadInit;
    dispose = mockVadDispose;
  },
}));

import { VoiceInputService } from './VoiceInputService';

describe('VoiceInputService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSetVadService.mockReset();
    mockRecordingDispose.mockReset();
    mockVadInit.mockReset();
    mockVadInit.mockResolvedValue(undefined);
    mockVadDispose.mockReset();
    mockAttemptEngineWithFallback.mockReset();
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('rebinds an existing WhisperX VAD instance when start is called again with VAD enabled', async () => {
    const service = new VoiceInputService() as any;
    const existingVadService = {
      init: mockVadInit,
      dispose: mockVadDispose,
    };

    service._vadService = existingVadService;
    service._attemptEngineWithFallback = mockAttemptEngineWithFallback;

    service.start({
      lang: 'zh-CN',
      continuous: false,
      interimResults: false,
      preferredEngine: 'whisper-local',
      vadEnabled: true,
    });

    expect(mockSetVadService).toHaveBeenCalledWith(existingVadService);
    expect(mockVadInit).not.toHaveBeenCalled();
  });

  it('initializes and binds WhisperX VAD when fallback reaches whisper-local', async () => {
    const service = new VoiceInputService() as any;
    service._config = {
      lang: 'zh-CN',
      continuous: false,
      interimResults: false,
      preferredEngine: 'web-speech',
    };
    service._startEngine = vi.fn((engine: string) => engine === 'whisper-local');

    await service._attemptEngineWithFallback('web-speech');

    expect(service._startEngine).toHaveBeenCalledWith('web-speech');
    expect(service._startEngine).toHaveBeenCalledWith('whisper-local');
    expect(mockVadInit).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mockSetVadService).toHaveBeenCalled();
  });
});