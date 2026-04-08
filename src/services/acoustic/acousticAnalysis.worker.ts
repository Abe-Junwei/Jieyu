import type { AcousticAnalysisConfig, AcousticFeatureResult } from '../../utils/acousticOverlayTypes';
import { computeAcousticAnalysis } from './acousticAnalysisCore';

interface AcousticWorkerRequest {
  requestId: string;
  type: 'analyze';
  mediaKey: string;
  pcm: Float32Array;
  sampleRate: number;
  config: AcousticAnalysisConfig;
}

interface AcousticWorkerResult {
  type: 'result';
  requestId: string;
  ok: boolean;
  result?: AcousticFeatureResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<AcousticWorkerRequest>) => {
  const request = event.data;
  try {
    const result = computeAcousticAnalysis({
      mediaKey: request.mediaKey,
      pcm: request.pcm,
      sampleRate: request.sampleRate,
      config: request.config,
    });
    self.postMessage({
      type: 'result',
      requestId: request.requestId,
      ok: true,
      result,
    } satisfies AcousticWorkerResult);
  } catch (error) {
    self.postMessage({
      type: 'result',
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Acoustic analysis failed',
    } satisfies AcousticWorkerResult);
  }
};