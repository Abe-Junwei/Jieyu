/**
 * vadWorker — Silero VAD ONNX 推理 Web Worker
 * Silero VAD ONNX inference Web Worker.
 *
 * 在独立Worker线程中运行Silero VAD，避免阻塞主线程。
 * Runs Silero VAD in an isolated Worker thread to avoid blocking the main thread.
 *
 * 消息协议 | Message protocol:
 *   In:  { type: 'init', modelUrl: string }
 *        { type: 'detect', id: string, pcm: Float32Array, sampleRate: number }
 *        { type: 'detect-stream-start', id: string, sampleRate: number }
 *        { type: 'detect-stream-chunk', id: string, pcm: Float32Array }
 *        { type: 'detect-stream-end', id: string }
 *        { type: 'cancel', id: string }
 *        { type: 'reset' }
 *   Out: { type: 'ready' }
 *        { type: 'progress', id: string, processedFrames: number, totalFrames: number, ratio: number }
 *        { type: 'result', id: string, segments: VadWorkerSegment[] }
 *        { type: 'error', id?: string, message: string }
 */

import {
  frameProbsToSegments,
  resampleLinear,
  type VadWorkerSegment,
} from '../utils/vadWorkerInferenceUtils';

export type { VadWorkerSegment } from '../utils/vadWorkerInferenceUtils';

// ── Silero VAD 配置 | Silero VAD configuration ──────────────────────────────

const SILERO_SAMPLE_RATE = 16_000; // Silero 仅支持 16kHz | Silero only supports 16 kHz
const FRAME_SIZE = 512; // Silero 标准帧大小 | Standard Silero frame size

// ── ONNX Runtime 运行时（动态导入）| ONNX Runtime (dynamic import) ─────────────

type OnnxSession = {
  run: (feeds: Record<string, OnnxTensor>) => Promise<Record<string, OnnxTensor>>;
};
type OnnxTensor = {
  data: Float32Array;
  dims: number[];
};

let session: OnnxSession | null = null;
let ort: typeof import('onnxruntime-web') | null = null;
let h0: Float32Array = new Float32Array(2 * 1 * 64); // hidden state
let c0: Float32Array = new Float32Array(2 * 1 * 64); // cell state
const cancelledRequestIds = new Set<string>();

// ── 流式推理会话状态 | Streaming inference session state ─────────────────────

interface StreamingSessionState {
  id: string;
  sampleRate: number;
  leftover: Float32Array;
  frameProbs: number[];
  processedFrames: number;
}

let streamSession: StreamingSessionState | null = null;
let streamProcessQueue: Promise<void> = Promise.resolve();

function resetState(): void {
  h0.fill(0);
  c0.fill(0);
}

// ── Worker 消息处理 | Worker message handler ─────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as { type: string; modelUrl?: string; id?: string; pcm?: Float32Array; sampleRate?: number };

  // WorkerPool 心跳协议 | Heartbeat protocol
  if (msg.type === 'workerpool:ping') {
    self.postMessage({ type: 'workerpool:pong' });
    return;
  }

  switch (msg.type) {
    case 'init': {
      try {
        ort = await import('onnxruntime-web');
        // 锁定 WASM 加载路径，dev 由中间件伺服，build 由 copyOnnxWasm 复制 | Pin WASM path; dev served by middleware, build by copyOnnxWasm plugin
        ort.env.wasm.wasmPaths = '/onnx-wasm/';
        session = await ort.InferenceSession.create(msg.modelUrl ?? '/models/silero_vad.onnx', {
          executionProviders: ['wasm'],
        }) as unknown as OnnxSession;
        resetState();
        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({
          type: 'error',
          message: `VAD init failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }

    case 'detect': {
      if (!session) {
        self.postMessage({ type: 'error', id: msg.id, message: 'VAD session not initialized' });
        return;
      }
      try {
        cancelledRequestIds.delete(msg.id!);
        const pcm = msg.pcm!;
        const sr = msg.sampleRate ?? SILERO_SAMPLE_RATE;

        // 重采样到 16kHz（如需）| Resample to 16kHz if needed
        const resampled = sr === SILERO_SAMPLE_RATE ? pcm : resampleLinear(pcm, sr, SILERO_SAMPLE_RATE);

        const segments = await runSileroVad(resampled, {
          requestId: msg.id!,
          shouldCancel: () => cancelledRequestIds.has(msg.id!),
          onProgress: (processedFrames, totalFrames) => {
            self.postMessage({
              type: 'progress',
              id: msg.id,
              processedFrames,
              totalFrames,
              ratio: totalFrames > 0 ? processedFrames / totalFrames : 1,
            });
          },
        });
        cancelledRequestIds.delete(msg.id!);
        self.postMessage({ type: 'result', id: msg.id, segments });
      } catch (err) {
        const aborted = cancelledRequestIds.has(msg.id!);
        cancelledRequestIds.delete(msg.id!);
        self.postMessage({
          type: 'error',
          id: msg.id,
          message: aborted ? 'VAD detect aborted' : `VAD detect failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }

    case 'cancel': {
      if (msg.id) {
        cancelledRequestIds.add(msg.id);
      }
      break;
    }

    case 'detect-stream-start': {
      if (!session) {
        self.postMessage({ type: 'error', id: msg.id, message: 'VAD session not initialized' });
        return;
      }
      // 若存在旧流式会话，向主线程发错误以拒绝其挂起请求 | Reject pending request for old streaming session if exists
      if (streamSession) {
        self.postMessage({ type: 'error', id: streamSession.id, message: 'Streaming session superseded by new session' });
      }
      cancelledRequestIds.delete(msg.id!);
      resetState();
      streamSession = {
        id: msg.id!,
        sampleRate: msg.sampleRate ?? SILERO_SAMPLE_RATE,
        leftover: new Float32Array(0),
        frameProbs: [],
        processedFrames: 0,
      };
      streamProcessQueue = Promise.resolve();
      break;
    }

    case 'detect-stream-chunk': {
      if (!streamSession || streamSession.id !== msg.id) {
        self.postMessage({ type: 'error', id: msg.id, message: 'No active streaming session for this id' });
        return;
      }
      if (cancelledRequestIds.has(msg.id!)) return;
      const chunkPcm = msg.pcm!;
      streamProcessQueue = streamProcessQueue.then(() => processStreamChunk(msg.id!, chunkPcm));
      break;
    }

    case 'detect-stream-end': {
      if (!streamSession || streamSession.id !== msg.id) {
        self.postMessage({ type: 'error', id: msg.id, message: 'No active streaming session for this id' });
        return;
      }
      streamProcessQueue = streamProcessQueue.then(() => finalizeStream(msg.id!));
      break;
    }

    case 'reset': {
      resetState();
      streamSession = null;
      break;
    }

    default:
      self.postMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
};

// ── Silero VAD 推理 | Silero VAD inference ───────────────────────────────────

/**
 * 对单帧 PCM 运行 Silero VAD ONNX 推理，返回语音概率。
 * Runs Silero VAD ONNX inference on a single frame, returning speech probability.
 */
async function runSingleFrame(frame: Float32Array): Promise<number> {
  if (!ort) throw new Error('onnxruntime-web not loaded');
  const inputTensor = new ort.Tensor('float32', frame, [1, FRAME_SIZE]);
  const srTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(SILERO_SAMPLE_RATE)]), [1]);
  const hTensor = new ort.Tensor('float32', h0, [2, 1, 64]);
  const cTensor = new ort.Tensor('float32', c0, [2, 1, 64]);

  const outputs = await session!.run({
    input: inputTensor as unknown as OnnxTensor,
    sr: srTensor as unknown as OnnxTensor,
    h: hTensor as unknown as OnnxTensor,
    c: cTensor as unknown as OnnxTensor,
  });

  const prob = (outputs['output']?.data as Float32Array)[0] ?? 0;
  const newH = outputs['hn']?.data as Float32Array;
  const newC = outputs['cn']?.data as Float32Array;
  if (newH) h0 = new Float32Array(newH);
  if (newC) c0 = new Float32Array(newC);
  return prob;
}

/**
 * 对 PCM 数据逐帧运行 Silero VAD ONNX 推理，返回语音段列表。
 * Runs Silero VAD ONNX frame-by-frame over PCM data and returns speech segments.
 */
async function runSileroVad(
  pcm: Float32Array,
  options: {
    requestId: string;
    shouldCancel?: () => boolean;
    onProgress?: (processedFrames: number, totalFrames: number) => void;
  },
): Promise<VadWorkerSegment[]> {
  const frameCount = Math.floor(pcm.length / FRAME_SIZE);
  const frameProbs: number[] = [];

  for (let fi = 0; fi < frameCount; fi++) {
    if (options.shouldCancel?.()) {
      const abortError = new Error('VAD detect aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    const frame = pcm.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
    frameProbs.push(await runSingleFrame(frame));

    if (options.onProgress && (fi === frameCount - 1 || (fi + 1) % 16 === 0)) {
      options.onProgress(fi + 1, frameCount);
    }
  }

  options.onProgress?.(frameCount, frameCount);
  return frameProbsToSegments(frameProbs, FRAME_SIZE, SILERO_SAMPLE_RATE);
}

// ── 流式推理处理 | Streaming inference processing ────────────────────────────

/**
 * 处理一个流式 PCM 块：重采样、拼接剩余、逐帧推理。
 * Process a streaming PCM chunk: resample, concatenate leftover, run per-frame inference.
 */
async function processStreamChunk(id: string, rawPcm: Float32Array): Promise<void> {
  if (!streamSession || streamSession.id !== id) return;
  if (cancelledRequestIds.has(id)) {
    streamSession = null;
    self.postMessage({ type: 'error', id, message: 'VAD detect aborted' });
    return;
  }

  const sr = streamSession.sampleRate;
  const resampled = sr === SILERO_SAMPLE_RATE ? rawPcm : resampleLinear(rawPcm, sr, SILERO_SAMPLE_RATE);

  // 拼接剩余 + 新数据 | Concatenate leftover + new data
  const combined = new Float32Array(streamSession.leftover.length + resampled.length);
  combined.set(streamSession.leftover);
  combined.set(resampled, streamSession.leftover.length);

  // 处理完整帧 | Process complete frames
  const completeFrames = Math.floor(combined.length / FRAME_SIZE);
  for (let fi = 0; fi < completeFrames; fi++) {
    if (cancelledRequestIds.has(id)) {
      streamSession = null;
      self.postMessage({ type: 'error', id, message: 'VAD detect aborted' });
      return;
    }
    const frame = combined.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
    streamSession.frameProbs.push(await runSingleFrame(frame));
    streamSession.processedFrames++;

    if (streamSession.processedFrames % 16 === 0) {
      self.postMessage({
        type: 'progress',
        id,
        processedFrames: streamSession.processedFrames,
        totalFrames: 0,
        ratio: 0,
      });
    }
  }

  // 保存剩余 | Keep leftover
  streamSession.leftover = combined.slice(completeFrames * FRAME_SIZE);
}

/**
 * 结束流式会话：处理剩余帧、后处理、返回结果。
 * Finalize streaming session: process remaining frames, post-process, return results.
 */
async function finalizeStream(id: string): Promise<void> {
  if (!streamSession || streamSession.id !== id) return;

  // 处理剩余完整帧 | Process remaining complete frames
  const leftover = streamSession.leftover;
  const remainingFrames = Math.floor(leftover.length / FRAME_SIZE);
  for (let fi = 0; fi < remainingFrames; fi++) {
    const frame = leftover.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
    streamSession.frameProbs.push(await runSingleFrame(frame));
    streamSession.processedFrames++;
  }

  const segments = frameProbsToSegments(streamSession.frameProbs, FRAME_SIZE, SILERO_SAMPLE_RATE);

  self.postMessage({
    type: 'progress',
    id,
    processedFrames: streamSession.processedFrames,
    totalFrames: streamSession.processedFrames,
    ratio: 1,
  });

  self.postMessage({ type: 'result', id, segments });
  cancelledRequestIds.delete(id);
  streamSession = null;
}
