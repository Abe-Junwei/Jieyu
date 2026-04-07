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
 *        { type: 'reset' }
 *   Out: { type: 'ready' }
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
let h0: Float32Array = new Float32Array(2 * 1 * 64); // hidden state
let c0: Float32Array = new Float32Array(2 * 1 * 64); // cell state

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
        const ort = await import('onnxruntime-web');
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
        const pcm = msg.pcm!;
        const sr = msg.sampleRate ?? SILERO_SAMPLE_RATE;

        // 重采样到 16kHz（如需）| Resample to 16kHz if needed
        const resampled = sr === SILERO_SAMPLE_RATE ? pcm : resampleLinear(pcm, sr, SILERO_SAMPLE_RATE);

        const segments = await runSileroVad(resampled);
        self.postMessage({ type: 'result', id: msg.id, segments });
      } catch (err) {
        self.postMessage({
          type: 'error',
          id: msg.id,
          message: `VAD detect failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }

    case 'reset': {
      resetState();
      break;
    }

    default:
      self.postMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
  }
};

// ── Silero VAD 推理 | Silero VAD inference ───────────────────────────────────

/**
 * 对 PCM 数据逐帧运行 Silero VAD ONNX 推理，返回语音段列表。
 * Runs Silero VAD ONNX frame-by-frame over PCM data and returns speech segments.
 */
async function runSileroVad(pcm: Float32Array): Promise<VadWorkerSegment[]> {
  const ort = await import('onnxruntime-web');
  const frameCount = Math.floor(pcm.length / FRAME_SIZE);
  const frameProbs: number[] = [];

  for (let fi = 0; fi < frameCount; fi++) {
    const frame = pcm.slice(fi * FRAME_SIZE, (fi + 1) * FRAME_SIZE);

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
    frameProbs.push(prob);

    // 更新状态 | Update hidden/cell state
    const newH = outputs['hn']?.data as Float32Array;
    const newC = outputs['cn']?.data as Float32Array;
    if (newH) h0 = new Float32Array(newH);
    if (newC) c0 = new Float32Array(newC);
  }

  return frameProbsToSegments(frameProbs, FRAME_SIZE, SILERO_SAMPLE_RATE);
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
