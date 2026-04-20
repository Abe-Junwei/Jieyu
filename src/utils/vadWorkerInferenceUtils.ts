/**
 * VAD Worker 纯函数：重采样与帧概率 → 语段（供 `vadWorker` 与单测复用）。
 * Pure helpers for VAD worker resampling and frame-probability → segments (shared with `vadWorker` + tests).
 */

export interface VadWorkerSegment {
  start: number;
  end: number;
  confidence: number;
}

const SPEECH_THRESHOLD = 0.5;
const MERGE_GAP_SEC = 0.3;
const MIN_DURATION_SEC = 0.2;
const MAX_DURATION_SEC = 30.0;

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
      : cursor + MAX_DURATION_SEC;

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
): VadWorkerSegment[] {
  const frameDuration = frameSize / sampleRate;

  const isSpeech = probs.map((p) => p >= SPEECH_THRESHOLD);

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
      splitLongSegmentAtSilence(seg, probs, frameDuration, avgConf, result);
    }
  }

  return result;
}

/** 简单线性插值重采样（如降采样到 16kHz）。 */
export function resampleLinear(
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
