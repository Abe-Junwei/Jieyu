import type { AcousticAnalysisConfig, AcousticAnalysisProgress, AcousticFeatureResult } from '../../utils/acousticOverlayTypes';
import { computeAcousticAnalysisAsync } from './acousticAnalysisCore';

interface AcousticAnalyzeWorkerRequest {
  requestId: string;
  type: 'analyze';
  mediaKey: string;
  pcm: Float32Array;
  sampleRate: number;
  config: AcousticAnalysisConfig;
}

interface AcousticCancelWorkerRequest {
  requestId: string;
  type: 'cancel';
}

interface AcousticHeartbeatPingRequest {
  type: 'workerpool:ping';
}

type AcousticWorkerRequest = AcousticAnalyzeWorkerRequest | AcousticCancelWorkerRequest | AcousticHeartbeatPingRequest;

interface AcousticWorkerProgress {
  type: 'progress';
  requestId: string;
  progress: AcousticAnalysisProgress;
}

interface AcousticWorkerResult {
  type: 'result';
  requestId: string;
  ok: boolean;
  result?: AcousticFeatureResult;
  error?: string;
}

const cancelledRequests = new Set<string>();

function buildProgress(processedFrames: number, totalFrames: number): AcousticAnalysisProgress {
  const safeTotalFrames = Math.max(1, totalFrames);
  return {
    phase: processedFrames >= totalFrames ? 'done' : 'analyzing',
    processedFrames,
    totalFrames,
    ratio: Math.min(1, processedFrames / safeTotalFrames),
  };
}

function createAbortError(): Error {
  const error = new Error('Acoustic analysis aborted');
  error.name = 'AbortError';
  return error;
}

self.onmessage = (event: MessageEvent<AcousticWorkerRequest>) => {
  const request = event.data;
  // WorkerPool 心跳协议 | Heartbeat protocol
  if (request.type === 'workerpool:ping') {
    self.postMessage({ type: 'workerpool:pong' });
    return;
  }
  if (request.type === 'cancel') {
    cancelledRequests.add(request.requestId);
    return;
  }

  cancelledRequests.delete(request.requestId);
  void (async () => {
    try {
      const result = await computeAcousticAnalysisAsync({
        mediaKey: request.mediaKey,
        pcm: request.pcm,
        sampleRate: request.sampleRate,
        config: request.config,
      }, {
        onProgress: (processedFrames, totalFrames) => {
          self.postMessage({
            type: 'progress',
            requestId: request.requestId,
            progress: buildProgress(processedFrames, totalFrames),
          } satisfies AcousticWorkerProgress);
        },
        shouldCancel: () => cancelledRequests.has(request.requestId),
        yieldEveryFrames: 8,
      });
      cancelledRequests.delete(request.requestId);
      self.postMessage({
        type: 'result',
        requestId: request.requestId,
        ok: true,
        result,
      } satisfies AcousticWorkerResult);
    } catch (error) {
      const aborted = cancelledRequests.has(request.requestId) || ((error instanceof Error) && error.name === 'AbortError');
      cancelledRequests.delete(request.requestId);
      self.postMessage({
        type: 'result',
        requestId: request.requestId,
        ok: false,
        error: aborted ? createAbortError().message : (error instanceof Error ? error.message : 'Acoustic analysis failed'),
      } satisfies AcousticWorkerResult);
    }
  })();
};