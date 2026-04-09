import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeAcousticAnalysis } from './acousticAnalysisCore';
import { AcousticAnalysisService } from './AcousticAnalysisService';
import { acousticAnalysisCacheDB } from './AcousticAnalysisCacheDB';
import { buildAcousticCacheKey, DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticAnalysisConfig } from '../../utils/acousticOverlayTypes';
import type { AcousticProviderRuntimeConfig } from './acousticProviderContract';

type TestWorker = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: { requestId: string; type: 'analyze' | 'cancel'; mediaKey?: string; pcm?: Float32Array; sampleRate?: number; config?: AcousticAnalysisConfig }) => void;
  terminate: () => void;
};

function buildSineWave({
  frequencyHz,
  durationSec,
  sampleRate,
  amplitude = 0.6,
}: {
  frequencyHz: number;
  durationSec: number;
  sampleRate: number;
  amplitude?: number;
}): Float32Array {
  const sampleCount = Math.round(durationSec * sampleRate);
  const pcm = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    pcm[index] = amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
  return pcm;
}

function buildAudioBuffer(pcm: Float32Array, sampleRate: number): AudioBuffer {
  return {
    length: pcm.length,
    numberOfChannels: 1,
    sampleRate,
    duration: pcm.length / sampleRate,
    getChannelData: () => pcm,
  } as unknown as AudioBuffer;
}

function createMockWorker(counter: { count: number }) {
  const worker: TestWorker = {
    onmessage: null,
    onerror: null,
    postMessage(message: {
      requestId: string;
      type: 'analyze' | 'cancel';
      mediaKey?: string;
      pcm?: Float32Array;
      sampleRate?: number;
      config?: AcousticAnalysisConfig;
    }) {
      if (message.type === 'cancel') {
        return;
      }
      counter.count += 1;
      const result = computeAcousticAnalysis({
        mediaKey: message.mediaKey!,
        sampleRate: message.sampleRate!,
        pcm: message.pcm!,
        config: message.config!,
      });
      queueMicrotask(() => {
        worker.onmessage?.({
          data: {
            type: 'result',
            requestId: message.requestId,
            ok: true,
            result,
          },
        } as MessageEvent<unknown>);
      });
    },
    terminate() {},
  };
  return worker;
}

describe('AcousticAnalysisService', () => {
  beforeEach(async () => {
    await acousticAnalysisCacheDB.clear();
  });

  afterEach(async () => {
    await acousticAnalysisCacheDB.clear();
  });

  it('reuses persisted IndexedDB analysis across service instances', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 200,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);

    const firstCounter = { count: 0 };
    const firstService = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(firstCounter),
    });

    const firstResult = await firstService.analyzeAudioBuffer({
      mediaKey: 'media-persist',
      audioBuffer,
    });

    expect(firstCounter.count).toBe(1);
    expect(firstResult.summary.f0MeanHz ?? 0).toBeGreaterThan(185);
    firstService.dispose();

    const secondCounter = { count: 0 };
    const secondService = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(secondCounter),
    });

    const secondResult = await secondService.analyzeAudioBuffer({
      mediaKey: 'media-persist',
      audioBuffer,
    });

    expect(secondCounter.count).toBe(0);
    expect(secondResult.summary.f0MeanHz).toBe(firstResult.summary.f0MeanHz);
    secondService.dispose();
  });

  it('marks older configs as stale for the same media', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 180,
      durationSec: 1,
      sampleRate,
    });

    const configA = DEFAULT_ACOUSTIC_ANALYSIS_CONFIG;
    const configB = {
      ...DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
      pitchCeilingHz: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG.pitchCeilingHz + 50,
    };

    await acousticAnalysisCacheDB.put({
      cacheKey: buildAcousticCacheKey('media-stale', configA),
      mediaKey: 'media-stale',
      result: computeAcousticAnalysis({
        mediaKey: 'media-stale',
        sampleRate,
        pcm,
        config: configA,
      }),
      now: 10,
    });

    await acousticAnalysisCacheDB.put({
      cacheKey: buildAcousticCacheKey('media-stale', configB),
      mediaKey: 'media-stale',
      result: computeAcousticAnalysis({
        mediaKey: 'media-stale',
        sampleRate,
        pcm,
        config: configB,
      }),
      now: 20,
    });

    const entries = await acousticAnalysisCacheDB.listEntriesForMedia('media-stale');
    const staleEntry = entries.find((entry) => entry.cacheKey === buildAcousticCacheKey('media-stale', configA));
    const freshEntry = entries.find((entry) => entry.cacheKey === buildAcousticCacheKey('media-stale', configB));

    expect(staleEntry?.status).toBe('stale');
    expect(freshEntry?.status).toBe('fresh');
  });

  it('resolves concurrent worker requests without dropping earlier handlers', async () => {
    const sampleRate = 16000;
    const workerCounter = { count: 0 };
    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
    });

    const firstAudioBuffer = buildAudioBuffer(buildSineWave({
      frequencyHz: 180,
      durationSec: 1,
      sampleRate,
    }), sampleRate);
    const secondAudioBuffer = buildAudioBuffer(buildSineWave({
      frequencyHz: 240,
      durationSec: 1,
      sampleRate,
    }), sampleRate);

    const resultsPromise = Promise.all([
      service.analyzeAudioBuffer({ mediaKey: 'media-concurrent-a', audioBuffer: firstAudioBuffer }),
      service.analyzeAudioBuffer({ mediaKey: 'media-concurrent-b', audioBuffer: secondAudioBuffer }),
    ]);

    const [firstResult, secondResult] = await Promise.race([
      resultsPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Concurrent worker requests timed out')), 2000);
      }),
    ]);

    expect(workerCounter.count).toBe(2);
    expect(firstResult.mediaKey).toBe('media-concurrent-a');
    expect(secondResult.mediaKey).toBe('media-concurrent-b');
    service.dispose();
  });

  it('forwards worker progress updates to the caller', async () => {
    const progressWorker: TestWorker = {
      onmessage: null,
      onerror: null,
      postMessage(message: { requestId: string; type: 'analyze' | 'cancel' }) {
        if (message.type === 'cancel') return;
        queueMicrotask(() => {
          progressWorker.onmessage?.({
            data: {
              type: 'progress',
              requestId: message.requestId,
              progress: {
                phase: 'analyzing',
                processedFrames: 8,
                totalFrames: 20,
                ratio: 0.4,
              },
            },
          } as MessageEvent<unknown>);
          progressWorker.onmessage?.({
            data: {
              type: 'result',
              requestId: message.requestId,
              ok: true,
              result: computeAcousticAnalysis({
                mediaKey: 'media-progress',
                sampleRate: 16000,
                pcm: buildSineWave({ frequencyHz: 200, durationSec: 1, sampleRate: 16000 }),
                config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
              }),
            },
          } as MessageEvent<unknown>);
        });
      },
      terminate() {},
    };

    const service = new AcousticAnalysisService({
      workerFactory: () => progressWorker,
    });
    const progress = [] as number[];

    await service.analyzeAudioBuffer({
      mediaKey: 'media-progress',
      audioBuffer: buildAudioBuffer(buildSineWave({ frequencyHz: 200, durationSec: 1, sampleRate: 16000 }), 16000),
      onProgress: (entry) => {
        progress.push(entry.ratio);
      },
    });

    expect(progress).toEqual([0.4]);
    service.dispose();
  });

  it('cancels an in-flight worker request when the signal aborts', async () => {
    const messages: Array<{ requestId: string; type: 'analyze' | 'cancel' }> = [];
    const service = new AcousticAnalysisService({
      workerFactory: () => ({
        onmessage: null,
        onerror: null,
        postMessage(message: { requestId: string; type: 'analyze' | 'cancel' }) {
          messages.push(message);
        },
        terminate() {},
      } as unknown as TestWorker),
    });
    const controller = new AbortController();

    const promise = service.analyzeAudioBuffer({
      mediaKey: 'media-abort',
      audioBuffer: buildAudioBuffer(buildSineWave({ frequencyHz: 220, durationSec: 1, sampleRate: 16000 }), 16000),
      signal: controller.signal,
    });

    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (messages.length > 0 || Date.now() - start > 100) {
          resolve();
          return;
        }
        setTimeout(tick, 0);
      };
      tick();
    });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError', message: 'Acoustic analysis aborted' });
    expect(messages[0]?.type).toBe('analyze');
    expect(messages[1]?.type).toBe('cancel');
    expect(messages[1]?.requestId).toBe(messages[0]?.requestId);
    service.dispose();
  });

  it('uses external provider when it is reachable and configured', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 210,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);
    const workerCounter = { count: 0 };
    const externalCalls: Array<string> = [];
    const externalResult = computeAcousticAnalysis({
      mediaKey: 'media-external-ok',
      sampleRate,
      pcm,
      config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    });

    const runtimeConfig: AcousticProviderRuntimeConfig = {
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: 'https://acoustic.example.dev/analyze',
        timeoutMs: 5000,
      },
    };

    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
      providerRuntimeConfigResolver: () => runtimeConfig,
      externalProviderAnalyze: async (input) => {
        externalCalls.push(input.providerId);
        return externalResult;
      },
    });

    const result = await service.analyzeAudioBuffer({
      mediaKey: 'media-external-ok',
      audioBuffer,
    });

    expect(result.summary.f0MeanHz).toBe(externalResult.summary.f0MeanHz);
    expect(externalCalls).toEqual(['enhanced-provider']);
    expect(workerCounter.count).toBe(0);
    service.dispose();
  });

  it('sends multipart binary payload when calling external provider', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 205,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);
    const workerCounter = { count: 0 };
    const externalResult = computeAcousticAnalysis({
      mediaKey: 'media-external-multipart',
      sampleRate,
      pcm,
      config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: externalResult }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const runtimeConfig: AcousticProviderRuntimeConfig = {
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: 'https://acoustic.example.dev/analyze',
        apiKey: 'test-api-key',
        timeoutMs: 5000,
      },
    };

    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
      providerRuntimeConfigResolver: () => runtimeConfig,
    });

    const result = await service.analyzeAudioBuffer({
      mediaKey: 'media-external-multipart',
      audioBuffer,
    });

    expect(result.summary.f0MeanHz).toBe(externalResult.summary.f0MeanHz);
    expect(workerCounter.count).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const call = fetchSpy.mock.calls[0];
    const requestInit = call?.[1] as RequestInit | undefined;
    expect(requestInit?.body).toBeInstanceOf(FormData);
    expect((requestInit?.headers as Record<string, string>)?.authorization).toBe('Bearer test-api-key');
    expect((requestInit?.headers as Record<string, string>)?.['x-jieyu-acoustic-wire-format']).toBe('multipart-f32-v1');
    expect((requestInit?.headers as Record<string, string>)?.['content-type']).toBeUndefined();

    const form = requestInit?.body as FormData;
    const metadataRaw = form.get('metadata');
    expect(typeof metadataRaw).toBe('string');
    const metadata = JSON.parse(metadataRaw as string) as {
      mediaKey: string;
      sampleRate: number;
      providerId: string;
    };
    expect(metadata.mediaKey).toBe('media-external-multipart');
    expect(metadata.sampleRate).toBe(sampleRate);
    expect(metadata.providerId).toBe('enhanced-provider');
    expect(form.get('pcm_f32le')).toBeInstanceOf(Blob);

    fetchSpy.mockRestore();
    service.dispose();
  });

  it('falls back to local worker when external provider request fails', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 260,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);
    const workerCounter = { count: 0 };
    let externalCallCount = 0;

    const runtimeConfig: AcousticProviderRuntimeConfig = {
      routingStrategy: 'prefer-external',
      externalProvider: {
        enabled: true,
        endpoint: 'https://acoustic.example.dev/analyze',
        timeoutMs: 5000,
      },
    };

    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
      providerRuntimeConfigResolver: () => runtimeConfig,
      externalProviderAnalyze: async () => {
        externalCallCount += 1;
        throw new Error('external unavailable');
      },
    });

    const result = await service.analyzeAudioBuffer({
      mediaKey: 'media-external-fallback',
      audioBuffer,
      providerId: 'enhanced-provider',
    });

    expect(externalCallCount).toBe(1);
    expect(workerCounter.count).toBe(1);
    expect(result.summary.f0MeanHz ?? 0).toBeGreaterThan(200);
    service.dispose();
  });

  it('isolates cache entries by external provider endpoint', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 240,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);
    const workerCounter = { count: 0 };
    let endpoint = 'https://provider-a.example.dev/analyze';
    let externalCallCount = 0;

    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
      providerRuntimeConfigResolver: () => ({
        routingStrategy: 'prefer-external',
        externalProvider: {
          enabled: true,
          endpoint,
          timeoutMs: 5000,
        },
      }),
      externalProviderAnalyze: async (input) => {
        externalCallCount += 1;
        return computeAcousticAnalysis({
          mediaKey: input.mediaKey,
          sampleRate: input.sampleRate,
          pcm: input.pcm,
          config: input.config,
        });
      },
    });

    await service.analyzeAudioBuffer({
      mediaKey: 'media-external-cache-scope',
      audioBuffer,
      providerId: 'enhanced-provider',
    });
    await service.analyzeAudioBuffer({
      mediaKey: 'media-external-cache-scope',
      audioBuffer,
      providerId: 'enhanced-provider',
    });

    endpoint = 'https://provider-b.example.dev/analyze';
    await service.analyzeAudioBuffer({
      mediaKey: 'media-external-cache-scope',
      audioBuffer,
      providerId: 'enhanced-provider',
    });

    expect(externalCallCount).toBe(2);
    expect(workerCounter.count).toBe(0);
    service.dispose();
  });

  it('cleans up timeout and abort listener when external payload exceeds size limit', async () => {
    const service = new AcousticAnalysisService();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const signal = {
      aborted: false,
      addEventListener,
      removeEventListener,
    } as unknown as AbortSignal;

    await expect((service as any).analyzeWithExternalProvider({
      mediaKey: 'media-oversized-payload',
      pcm: { byteLength: (64 * 1024 * 1024) + 4 } as Float32Array,
      sampleRate: 16000,
      config: DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
      providerId: 'enhanced-provider',
      externalConfig: {
        enabled: true,
        endpoint: 'https://provider.example.dev/analyze',
        timeoutMs: 5000,
      },
      signal,
    })).rejects.toThrow(/payload exceeds limit/i);

    expect(addEventListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    service.dispose();
  });

  it('keeps provider runtime snapshot stable within a single analyze request', async () => {
    const sampleRate = 16000;
    const pcm = buildSineWave({
      frequencyHz: 230,
      durationSec: 1,
      sampleRate,
    });
    const audioBuffer = buildAudioBuffer(pcm, sampleRate);
    const workerCounter = { count: 0 };
    let resolverCalls = 0;
    const externalCallIds: string[] = [];

    const service = new AcousticAnalysisService({
      workerFactory: () => createMockWorker(workerCounter),
      providerRuntimeConfigResolver: () => {
        resolverCalls += 1;
        if (resolverCalls === 1) {
          return {
            routingStrategy: 'prefer-external',
            externalProvider: {
              enabled: true,
              endpoint: 'https://provider-a.example.dev/analyze',
              timeoutMs: 5000,
            },
          };
        }
        return {
          routingStrategy: 'local-first',
          externalProvider: {
            enabled: false,
            timeoutMs: 5000,
          },
        };
      },
      externalProviderAnalyze: async (input) => {
        externalCallIds.push(input.providerId);
        return computeAcousticAnalysis({
          mediaKey: input.mediaKey,
          sampleRate: input.sampleRate,
          pcm: input.pcm,
          config: input.config,
        });
      },
    });

    await service.analyzeAudioBuffer({
      mediaKey: 'media-runtime-snapshot',
      audioBuffer,
    });

    expect(externalCallIds).toEqual(['enhanced-provider']);
    expect(workerCounter.count).toBe(0);
    service.dispose();
  });
});