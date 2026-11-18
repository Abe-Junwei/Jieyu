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
  createSileroStreamState,
  frameProbsToSegments,
  resampleLinear,
  runSileroFrame,
  SILERO_FRAME_SAMPLES,
  type SileroOrtLike,
  type SileroSessionLike,
  type SileroStreamState,
  type VadWorkerSegment,
} from '../utils/vadWorkerInferenceUtils';

export type { VadWorkerSegment } from '../utils/vadWorkerInferenceUtils';

// ── Silero VAD 配置 | Silero VAD configuration ──────────────────────────────

const SILERO_SAMPLE_RATE = 16_000; // Silero 仅支持 16kHz | Silero only supports 16 kHz
const FRAME_SIZE = SILERO_FRAME_SAMPLES; // Silero 标准帧大小 | Standard Silero frame size

export interface VadWorkerOutbound {
  type: string;
  id?: string | undefined;
  message?: string;
  segments?: VadWorkerSegment[];
  processedFrames?: number;
  totalFrames?: number;
  ratio?: number;
}

export interface VadWorkerRuntime {
  ort: SileroOrtLike;
  session: SileroSessionLike;
}

export interface VadWorkerHandlerDeps {
  /** 测试注入脚本会话；缺省加载 onnxruntime-web。| Tests inject a scripted session; default loads onnxruntime-web. */
  loadRuntime?: (modelUrl: string) => Promise<VadWorkerRuntime>;
}

interface StreamingSessionState {
  id: string;
  sampleRate: number;
  leftover: Float32Array;
  frameProbs: number[];
  processedFrames: number;
  silero: SileroStreamState;
}

/**
 * 每个 Worker 一份模型，循环状态按音频归属。
 * One model per worker; recurrent state belongs to one audio.
 *
 * `detect` 与每条流式会话各持有自己的 state/context。模型权重可以复用，
 * 独立媒体、失败后的下一次，以及交错中的另一次请求都不能读到这份状态。
 * Each `detect` and each streaming session owns its state/context. Weights may be
 * reused; another media item, a later request after failure, or an interleaved
 * request must not observe this state.
 */
export function createVadWorkerHandler(
  postMessage: (message: VadWorkerOutbound) => void,
  deps: VadWorkerHandlerDeps = {},
): (event: MessageEvent) => Promise<void> {
  let session: SileroSessionLike | null = null;
  let ort: SileroOrtLike | null = null;
  const cancelledRequestIds = new Set<string>();

  let streamSession: StreamingSessionState | null = null;
  let streamProcessQueue: Promise<void> = Promise.resolve();

  const loadRuntime =
    deps.loadRuntime ??
    (async (modelUrl: string): Promise<VadWorkerRuntime> => {
      const ortModule = await import('onnxruntime-web');
      // 锁定 WASM 加载路径，dev 由中间件伺服，build 由 copyOnnxWasm 复制 | Pin WASM path; dev served by middleware, build by copyOnnxWasm plugin
      ortModule.env.wasm.wasmPaths = '/onnx-wasm/';
      const created = (await ortModule.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
      })) as unknown as SileroSessionLike;
      return { ort: ortModule as unknown as SileroOrtLike, session: created };
    });

  async function runSingleFrame(silero: SileroStreamState, frame: Float32Array): Promise<number> {
    if (!ort || !session) throw new Error('onnxruntime-web not loaded');
    return runSileroFrame(ort, session, silero, frame, SILERO_SAMPLE_RATE);
  }

  async function runSileroVad(
    pcm: Float32Array,
    silero: SileroStreamState,
    options: {
      requestId: string;
      shouldCancel?: () => boolean;
      onProgress?: (processedFrames: number, totalFrames: number) => void;
    },
  ): Promise<VadWorkerSegment[]> {
    const frameCount = Math.floor(pcm.length / FRAME_SIZE);
    const frameProbs: number[] = [];

    for (let fi = 0; fi < frameCount; fi++) {
      if (options.shouldCancel?.() === true) {
        const abortError = new Error('VAD detect aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      const frame = pcm.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
      frameProbs.push(await runSingleFrame(silero, frame));

      if (options.onProgress !== undefined && (fi === frameCount - 1 || (fi + 1) % 16 === 0)) {
        options.onProgress(fi + 1, frameCount);
      }
    }

    options.onProgress?.(frameCount, frameCount);
    return frameProbsToSegments(frameProbs, FRAME_SIZE, SILERO_SAMPLE_RATE);
  }

  async function processStreamChunk(id: string, rawPcm: Float32Array): Promise<void> {
    if (!streamSession || streamSession.id !== id) {
      postMessage({
        type: 'error',
        id,
        message: 'No active streaming session for this id',
      });
      return;
    }
    const active = streamSession;
    if (cancelledRequestIds.has(id)) {
      if (streamSession === active) streamSession = null;
      postMessage({ type: 'error', id, message: 'VAD detect aborted' });
      return;
    }

    const sr = active.sampleRate;
    const resampled =
      sr === SILERO_SAMPLE_RATE ? rawPcm : resampleLinear(rawPcm, sr, SILERO_SAMPLE_RATE);

    const combined = new Float32Array(active.leftover.length + resampled.length);
    combined.set(active.leftover);
    combined.set(resampled, active.leftover.length);

    const completeFrames = Math.floor(combined.length / FRAME_SIZE);
    for (let fi = 0; fi < completeFrames; fi++) {
      if (cancelledRequestIds.has(id)) {
        if (streamSession === active) streamSession = null;
        postMessage({ type: 'error', id, message: 'VAD detect aborted' });
        return;
      }
      if (streamSession !== active) return;
      const frame = combined.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
      active.frameProbs.push(await runSingleFrame(active.silero, frame));
      active.processedFrames++;

      if (active.processedFrames % 16 === 0) {
        postMessage({
          type: 'progress',
          id,
          processedFrames: active.processedFrames,
          totalFrames: 0,
          ratio: 0,
        });
      }
    }

    active.leftover = combined.slice(completeFrames * FRAME_SIZE);
  }

  async function finalizeStream(id: string): Promise<void> {
    if (!streamSession || streamSession.id !== id) {
      postMessage({
        type: 'error',
        id,
        message: 'No active streaming session for this id',
      });
      return;
    }
    const active = streamSession;

    const leftover = active.leftover;
    const remainingFrames = Math.floor(leftover.length / FRAME_SIZE);
    for (let fi = 0; fi < remainingFrames; fi++) {
      if (streamSession !== active) return;
      const frame = leftover.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);
      active.frameProbs.push(await runSingleFrame(active.silero, frame));
      active.processedFrames++;
    }

    const segments = frameProbsToSegments(active.frameProbs, FRAME_SIZE, SILERO_SAMPLE_RATE);

    postMessage({
      type: 'progress',
      id,
      processedFrames: active.processedFrames,
      totalFrames: active.processedFrames,
      ratio: 1,
    });

    postMessage({ type: 'result', id, segments });
    cancelledRequestIds.delete(id);
    if (streamSession === active) streamSession = null;
  }

  return async (event: MessageEvent) => {
    const msg = event.data as {
      type: string;
      modelUrl?: string;
      id?: string;
      pcm?: Float32Array;
      sampleRate?: number;
    };

    if (msg.type === 'workerpool:ping') {
      postMessage({ type: 'workerpool:pong' });
      return;
    }

    switch (msg.type) {
      case 'init': {
        try {
          const runtime = await loadRuntime(msg.modelUrl ?? '/models/silero_vad.onnx');
          ort = runtime.ort;
          session = runtime.session;
          postMessage({ type: 'ready' });
        } catch (err) {
          postMessage({
            type: 'error',
            message: `VAD init failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'detect': {
        if (!session) {
          postMessage({ type: 'error', id: msg.id, message: 'VAD session not initialized' });
          return;
        }
        // 这次检测自己的循环状态。失败、取消或与别的请求交错都不会留下共享残留。
        // Recurrent state for this detect only. Failure, cancel, or interleaving leaves nothing shared.
        const silero = createSileroStreamState();
        try {
          cancelledRequestIds.delete(msg.id!);
          const pcm = msg.pcm!;
          const sr = msg.sampleRate ?? SILERO_SAMPLE_RATE;
          const resampled =
            sr === SILERO_SAMPLE_RATE ? pcm : resampleLinear(pcm, sr, SILERO_SAMPLE_RATE);

          const segments = await runSileroVad(resampled, silero, {
            requestId: msg.id!,
            shouldCancel: () => cancelledRequestIds.has(msg.id!),
            onProgress: (processedFrames, totalFrames) => {
              postMessage({
                type: 'progress',
                id: msg.id,
                processedFrames,
                totalFrames,
                ratio: totalFrames > 0 ? processedFrames / totalFrames : 1,
              });
            },
          });
          cancelledRequestIds.delete(msg.id!);
          postMessage({ type: 'result', id: msg.id, segments });
        } catch (err) {
          const aborted = cancelledRequestIds.has(msg.id!);
          cancelledRequestIds.delete(msg.id!);
          postMessage({
            type: 'error',
            id: msg.id,
            message: aborted
              ? 'VAD detect aborted'
              : `VAD detect failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        break;
      }

      case 'cancel': {
        if (msg.id !== undefined && msg.id.length > 0) {
          cancelledRequestIds.add(msg.id);
        }
        break;
      }

      case 'detect-stream-start': {
        if (!session) {
          postMessage({ type: 'error', id: msg.id, message: 'VAD session not initialized' });
          return;
        }
        if (streamSession) {
          postMessage({
            type: 'error',
            id: streamSession.id,
            message: 'Streaming session superseded by new session',
          });
        }
        cancelledRequestIds.delete(msg.id!);
        streamSession = {
          id: msg.id!,
          sampleRate: msg.sampleRate ?? SILERO_SAMPLE_RATE,
          leftover: new Float32Array(0),
          frameProbs: [],
          processedFrames: 0,
          silero: createSileroStreamState(),
        };
        streamProcessQueue = Promise.resolve();
        break;
      }

      case 'detect-stream-chunk': {
        if (!streamSession || streamSession.id !== msg.id) {
          postMessage({
            type: 'error',
            id: msg.id,
            message: 'No active streaming session for this id',
          });
          return;
        }
        if (cancelledRequestIds.has(msg.id!)) return;
        const chunkPcm = msg.pcm!;
        streamProcessQueue = streamProcessQueue.then(() => processStreamChunk(msg.id!, chunkPcm));
        break;
      }

      case 'detect-stream-end': {
        if (!streamSession || streamSession.id !== msg.id) {
          postMessage({
            type: 'error',
            id: msg.id,
            message: 'No active streaming session for this id',
          });
          return;
        }
        streamProcessQueue = streamProcessQueue.then(() => finalizeStream(msg.id!));
        break;
      }

      case 'reset': {
        streamSession = null;
        break;
      }

      default:
        postMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  };
}

function isDedicatedWorkerScope(): boolean {
  const ctor = (globalThis as { DedicatedWorkerGlobalScope?: new () => object })
    .DedicatedWorkerGlobalScope;
  return typeof ctor === 'function' && globalThis instanceof ctor;
}

function bindDedicatedWorkerHandler(): void {
  const scope = globalThis as typeof globalThis & {
    postMessage: (message: unknown) => void;
    onmessage: ((event: MessageEvent) => void) | null;
  };
  const handler = createVadWorkerHandler((message) => {
    scope.postMessage(message);
  });
  scope.onmessage = (event: MessageEvent) => {
    void handler(event);
  };
}

if (isDedicatedWorkerScope()) {
  bindDedicatedWorkerHandler();
}
