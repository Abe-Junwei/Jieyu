/**
 * VAD Worker 纯函数：重采样与帧概率 → 语段（供 `vadWorker` 与单测复用）。
 * Pure helpers for VAD worker resampling and frame-probability → segments (shared with `vadWorker` + tests).
 */

/**
 * Silero VAD v5+ 的 ONNX 接口（v6.2.3 同）：输入 `input` [1, 64+512]（前 64 个采样是上一帧尾部的
 * 上下文）、`state` [2,1,128]、`sr`；输出 `output`（语音概率）和 `stateN`。v4 的 `h` / `c` 已不存在。
 * Silero VAD v5+ ONNX interface (same in v6.2.3): inputs `input` [1, 64+512] (the first 64
 * samples are context from the previous frame), `state` [2,1,128] and `sr`; outputs `output`
 * (speech probability) and `stateN`. The v4 `h` / `c` inputs are gone.
 */
export const SILERO_FRAME_SAMPLES = 512;
export const SILERO_CONTEXT_SAMPLES = 64;
export const SILERO_STATE_SIZE = 2 * 1 * 128;

export interface SileroTensorLike {
  data: unknown;
  dims: readonly number[];
}
export interface SileroOrtLike {
  Tensor: new (
    type: 'float32' | 'int64',
    data: Float32Array | BigInt64Array,
    dims: readonly number[],
  ) => SileroTensorLike;
}
export interface SileroSessionLike {
  run(feeds: Record<string, SileroTensorLike>): Promise<Record<string, SileroTensorLike>>;
}
export interface SileroStreamState {
  state: Float32Array;
  context: Float32Array;
}

export function createSileroStreamState(): SileroStreamState {
  return {
    state: new Float32Array(SILERO_STATE_SIZE),
    context: new Float32Array(SILERO_CONTEXT_SAMPLES),
  };
}

/**
 * 跑一帧（512 采样，16 kHz），返回语音概率并就地推进 state / context。
 * Runs one 512-sample 16 kHz frame, returns the speech probability and advances state / context.
 */
export async function runSileroFrame(
  ort: SileroOrtLike,
  session: SileroSessionLike,
  stream: SileroStreamState,
  frame: Float32Array,
  sampleRate = 16_000,
): Promise<number> {
  const input = new Float32Array(SILERO_CONTEXT_SAMPLES + SILERO_FRAME_SAMPLES);
  input.set(stream.context);
  input.set(frame.subarray(0, SILERO_FRAME_SAMPLES), SILERO_CONTEXT_SAMPLES);
  const outputs = await session.run({
    input: new ort.Tensor('float32', input, [1, input.length]),
    state: new ort.Tensor('float32', stream.state, [2, 1, 128]),
    sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(sampleRate)]), [1]),
  });
  const prob = (outputs['output']?.data as Float32Array | undefined)?.[0] ?? 0;
  const nextState = outputs['stateN']?.data as Float32Array | undefined;
  if (nextState !== undefined) stream.state = new Float32Array(nextState);
  stream.context = input.slice(input.length - SILERO_CONTEXT_SAMPLES);
  return prob;
}

export interface VadWorkerSegment {
  start: number;
  end: number;
  confidence: number;
}

/**
 * VAD 后处理参数 | VAD post-processing parameters
 */
export interface VadSegmentationParams {
  /** 进入语音的概率阈值 | Probability to enter speech */
  onsetThreshold: number;
  /** 退出语音的概率阈值（迟滞，≤ onset）| Probability below which speech ends (hysteresis, ≤ onset) */
  offsetThreshold: number;
  /** 间隔不超过此值的语段合并 | Merge segments separated by at most this gap */
  mergeGapSec: number;
  /** 短于此值的语段丢弃 | Drop segments shorter than this */
  minDurationSec: number;
  /** 长于此值的语段在静音处切开 | Split segments longer than this at the quietest frame */
  maxDurationSec: number;
}

/**
 * 默认值偏保守（ComputEL-9：田野录音里 VAD 常把环境噪声判成人声）。
 * - onset 0.5 → 0.6：短促噪声（风声、碰麦、鸡叫）更难触发新语段。
 * - offset 0.45（新增迟滞，≈ Silero 官方 neg_threshold = threshold − 0.15）：已在说话时概率
 *   短暂下探不会把一句话切碎，句尾也不会被过早截掉，抵消提高 onset 对边界的影响。
 * - minDuration 0.2 → 0.3 s：约一个音节以下的片段多为噪声，不再作为语段输出。
 * - mergeGap 0.3 s、maxDuration 30 s 不变（Whisper 窗口上限）。
 * Defaults lean conservative (ComputEL-9: VADs routinely label field-recording noise as speech).
 * - onset 0.5 → 0.6: short noise bursts (wind, mic bumps, animals) are less likely to open a
 *   segment.
 * - offset 0.45 (new hysteresis, ≈ Silero's own neg_threshold = threshold − 0.15): brief dips
 *   inside speech no longer fragment an utterance and endings are not clipped early, offsetting
 *   the higher onset at the boundaries.
 * - minDuration 0.2 → 0.3 s: sub-syllable blips are mostly noise and are no longer emitted.
 * - mergeGap 0.3 s and maxDuration 30 s unchanged (Whisper window limit).
 */
export const DEFAULT_VAD_SEGMENTATION_PARAMS: Readonly<VadSegmentationParams> = Object.freeze({
  onsetThreshold: 0.6,
  offsetThreshold: 0.45,
  mergeGapSec: 0.3,
  minDurationSec: 0.3,
  maxDurationSec: 30.0,
});

function splitLongSegmentAtSilence(
  seg: { start: number; end: number; probs: number[] },
  allProbs: number[],
  frameDuration: number,
  avgConf: number,
  result: VadWorkerSegment[],
  params: VadSegmentationParams,
): void {
  const { minDurationSec: MIN_DURATION_SEC, maxDurationSec: MAX_DURATION_SEC } = params;
  let cursor = seg.start;

  while (cursor < seg.end) {
    const remaining = seg.end - cursor;
    if (remaining <= MAX_DURATION_SEC) {
      if (remaining >= MIN_DURATION_SEC) {
        result.push({ start: cursor, end: seg.end, confidence: avgConf });
      }
      break;
    }

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

    const splitSec = bestFrame >= 0 ? bestFrame * frameDuration : cursor + MAX_DURATION_SEC;

    const chunkEnd = Math.min(splitSec, seg.end);
    if (chunkEnd - cursor >= MIN_DURATION_SEC) {
      result.push({ start: cursor, end: chunkEnd, confidence: avgConf });
    }
    cursor = chunkEnd;
  }
}

/**
 * 将帧概率序列转换为 WhisperX Cut & Merge 风格的语音段列表。
 */
export function frameProbsToSegments(
  probs: number[],
  frameSize: number,
  sampleRate: number,
  params: VadSegmentationParams = DEFAULT_VAD_SEGMENTATION_PARAMS,
): VadWorkerSegment[] {
  const frameDuration = frameSize / sampleRate;
  const {
    onsetThreshold,
    mergeGapSec: MERGE_GAP_SEC,
    minDurationSec: MIN_DURATION_SEC,
    maxDurationSec: MAX_DURATION_SEC,
  } = params;
  const offsetThreshold = Math.min(params.offsetThreshold, onsetThreshold);

  // 迟滞：≥ onset 进入语音，< offset 才退出 | Hysteresis: enter at ≥ onset, leave below offset
  const isSpeech: boolean[] = [];
  let speaking = false;
  for (const p of probs) {
    speaking = speaking ? p >= offsetThreshold : p >= onsetThreshold;
    isSpeech.push(speaking);
  }

  const raw: { start: number; end: number; probs: number[] }[] = [];
  let inSpeech = false;
  let segStart = 0;
  let segProbs: number[] = [];

  for (let i = 0; i <= isSpeech.length; i++) {
    const speaking = i < isSpeech.length ? isSpeech[i] === true : false;
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

  const result: VadWorkerSegment[] = [];
  for (const seg of merged) {
    const dur = seg.end - seg.start;
    if (dur < MIN_DURATION_SEC) continue;

    const avgConf = seg.probs.reduce((a, b) => a + b, 0) / Math.max(seg.probs.length, 1);

    if (dur <= MAX_DURATION_SEC) {
      result.push({ start: seg.start, end: seg.end, confidence: avgConf });
    } else {
      splitLongSegmentAtSilence(seg, probs, frameDuration, avgConf, result, params);
    }
  }

  return result;
}

/** 简单线性插值重采样（如降采样到 16kHz）。 */
export function resampleLinear(pcm: Float32Array, fromSr: number, toSr: number): Float32Array {
  if (fromSr === toSr) return pcm;
  const ratio = fromSr / toSr;
  const outputLen = Math.floor(pcm.length / ratio);
  const output = new Float32Array(outputLen);
  for (let i = 0; i < outputLen; i++) {
    const src = i * ratio;
    const lo = Math.floor(src);
    const hi = Math.min(lo + 1, pcm.length - 1);
    const frac = src - lo;
    output[i] = pcm[lo]! * (1 - frac) + pcm[hi]! * frac;
  }
  return output;
}
