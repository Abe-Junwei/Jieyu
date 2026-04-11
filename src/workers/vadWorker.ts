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

export interface VadWorkerSegment {
  /** 语音段起始时间（秒）| Speech segment start time in seconds */
  start: number;
  /** 语音段结束时间（秒）| Speech segment end time in seconds */
  end: number;
  /** VAD 置信度均值 [0, 1] | Mean VAD confidence score [0, 1] */
  confidence: number;
}

// ── Silero VAD 配置 | Silero VAD configuration ──────────────────────────────

const SILERO_SAMPLE_RATE = 16_000; // Silero 仅支持 16kHz | Silero only supports 16 kHz
const FRAME_SIZE = 512; // Silero 标准帧大小 | Standard Silero frame size
const SPEECH_THRESHOLD = 0.5; // 判定为语音的概率阈值 | Probability threshold for speech
const MERGE_GAP_SEC = 0.3; // 合并相邻段的间距上限（秒）| Max gap to merge adjacent segments
const MIN_DURATION_SEC = 0.2; // 最短语段时长 | Minimum segment duration
const MAX_DURATION_SEC = 30.0; // 最长语段时长 | Maximum segment duration

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

/**
 * 将帧概率序列转换为 WhisperX Cut & Merge 风格的语音段列表。
 * Converts frame probability sequence to speech segments using WhisperX Cut & Merge strategy.
 *
 * 策略 | Strategy:
 *   1. 按阈值标记语音帧
 *   2. 合并间距 ≤ MERGE_GAP_SEC 的相邻段（避免碎片化）
 *   3. 超 MAX_DURATION_SEC 的长段在相对最小概率点拆分
 *   4. 过滤 < MIN_DURATION_SEC 的短段
 */
function frameProbsToSegments(
  probs: number[],
  frameSize: number,
  sampleRate: number,
): VadWorkerSegment[] {
  const frameDuration = frameSize / sampleRate;

  // 步骤 1：帧标记 | Step 1: label frames
  const isSpeech = probs.map((p) => p >= SPEECH_THRESHOLD);

  // 步骤 2：提取原始段 | Step 2: extract raw segments
  const raw: { start: number; end: number; probs: number[] }[] = [];
  let inSpeech = false;
  let segStart = 0;
  let segProbs: number[] = [];

  for (let i = 0; i <= isSpeech.length; i++) {
    const speaking = i < isSpeech.length ? isSpeech[i] : false;
    if (!inSpeech && speaking) {
      inSpeech = true;
      segStart = i;
      segProbs = [probs[i]!];
    } else if (inSpeech) {
      if (speaking) {
        segProbs.push(probs[i]!);
      } else {
        inSpeech = false;
        raw.push({
          start: segStart * frameDuration,
          end: i * frameDuration,
          probs: segProbs,
        });
        segProbs = [];
      }
    }
  }

  // 步骤 3：合并靠近段 | Step 3: merge close segments
  const merged: typeof raw = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last != null && seg.start - last.end <= MERGE_GAP_SEC) {
      last.end = seg.end;
      last.probs.push(...seg.probs);
    } else {
      merged.push({ ...seg, probs: [...seg.probs] });
    }
  }

  // 步骤 4：超长拆分 + 最短过滤 + 转输出格式 | Step 4: split long, filter short, convert to output
  const result: VadWorkerSegment[] = [];
  for (const seg of merged) {
    const dur = seg.end - seg.start;
    if (dur < MIN_DURATION_SEC) continue;

    const avgConf = seg.probs.reduce((a, b) => a + b, 0) / Math.max(seg.probs.length, 1);

    if (dur <= MAX_DURATION_SEC) {
      result.push({ start: seg.start, end: seg.end, confidence: avgConf });
    } else {
      // 在相对静音点拆分超长段（WhisperX 策略）| Split long segment at relative silence points
      splitLongSegmentAtSilence(seg, probs, frameDuration, avgConf, result);
    }
  }

  return result;
}

// ── 超长段静音点拆分 | Long segment silence-point splitting ──────────────────

/**
 * 在相对最低概率点拆分超长语音段，避免在语音中间硬切。
 * Splits an oversized segment at relative silence points (lowest probability frames).
 *
 * 策略 | Strategy:
 *   1. 在 [MAX_DURATION_SEC × 0.7, MAX_DURATION_SEC] 范围内寻找概率最低帧
 *   2. 若找到 → 在该帧处切分
 *   3. 若未找到（全段高概率）→ 在 MAX_DURATION_SEC 处硬切
 */
function splitLongSegmentAtSilence(
  seg: { start: number; end: number; probs: number[] },
  allProbs: number[],
  frameDuration: number,
  avgConf: number,
  result: VadWorkerSegment[],
): void {
  let cursor = seg.start;

  while (cursor < seg.end) {
    const remaining = seg.end - cursor;
    if (remaining <= MAX_DURATION_SEC) {
      if (remaining >= MIN_DURATION_SEC) {
        result.push({ start: cursor, end: seg.end, confidence: avgConf });
      }
      break;
    }

    // 在 [70%-100%] MAX_DURATION_SEC 窗口搜索最低概率帧 | Search for lowest-prob frame in [70%-100%] window
    const searchStartSec = cursor + MAX_DURATION_SEC * 0.7;
    const searchEndSec = cursor + MAX_DURATION_SEC;
    const searchStartFrame = Math.floor(searchStartSec / frameDuration);
    const searchEndFrame = Math.min(Math.floor(searchEndSec / frameDuration), allProbs.length - 1);

    let bestFrame = -1;
    let bestProb = Infinity;
    for (let f = searchStartFrame; f <= searchEndFrame; f++) {
      const p = allProbs[f] ?? 1;
      if (p < bestProb) {
        bestProb = p;
        bestFrame = f;
      }
    }

    const splitSec = bestFrame >= 0
      ? bestFrame * frameDuration
      : cursor + MAX_DURATION_SEC; // 兜底硬切 | Hard split fallback

    const chunkEnd = Math.min(splitSec, seg.end);
    if (chunkEnd - cursor >= MIN_DURATION_SEC) {
      result.push({ start: cursor, end: chunkEnd, confidence: avgConf });
    }
    cursor = chunkEnd;
  }
}

// ── 线性重采样 | Linear resampling ─────────────────────────────────────────────

/**
 * 简单线性插值重采样。仅用于将音频降采样到 16kHz。
 * Simple linear interpolation resampler. Used to downsample audio to 16 kHz.
 */
function resampleLinear(
  pcm: Float32Array,
  fromSr: number,
  toSr: number,
): Float32Array {
  if (fromSr === toSr) return pcm;
  const ratio = fromSr / toSr;
  const outputLen = Math.floor(pcm.length / ratio);
  const output = new Float32Array(outputLen);
  for (let i = 0; i < outputLen; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, pcm.length - 1);
    const frac = src - lo;
    output[i] = (pcm[lo]! * (1 - frac)) + (pcm[hi]! * frac);
  }
  return output;
}
