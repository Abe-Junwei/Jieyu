import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeAcousticAnalysis } from './acousticAnalysisCore';
import { AcousticAnalysisService } from './AcousticAnalysisService';
import { acousticAnalysisCacheDB } from './AcousticAnalysisCacheDB';
import { buildAcousticCacheKey, DEFAULT_ACOUSTIC_ANALYSIS_CONFIG, type AcousticAnalysisConfig } from '../../utils/acousticOverlayTypes';

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
  } as AudioBuffer;
}

function createMockWorker(counter: { count: number }) {
  const worker = {
    onmessage: null,
    onerror: null,
    postMessage(message: {
      requestId: string;
      mediaKey: string;
      pcm: Float32Array;
      sampleRate: number;
      config: AcousticAnalysisConfig;
    }) {
      counter.count += 1;
      const result = computeAcousticAnalysis({
        mediaKey: message.mediaKey,
        sampleRate: message.sampleRate,
        pcm: message.pcm,
        config: message.config,
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
});