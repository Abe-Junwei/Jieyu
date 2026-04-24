/**
 * VadService —— 基于音频能量的声音活动检测（VAD）
 * Voice Activity Detection based on short-time RMS energy analysis.
 *
 * 无需外部依赖，直接在主线程或 Worker 中运行 Web Audio API AudioBuffer。
 * Zero external dependencies — runs on an AudioBuffer returned by the Web Audio API.
 */

// ---- 配置参数 | Configuration ----

export interface VadOptions {
  /** 帧窗口时长（秒），默认 0.03 s | Frame window duration in seconds (default: 0.03) */
  frameDurationSec?: number;
  /** 帧步进时长（秒），默认 0.01 s | Frame hop duration in seconds (default: 0.01) */
  hopDurationSec?: number;
  /**
   * 能量阈值因子（相对于全段最大 RMS 的比例），默认 0.05。
   * 降低此值可检出更安静的语音；升高则只保留响亮段落。
   * Threshold factor relative to peak RMS; lower = detect quieter speech.
   */
  thresholdFactor?: number;
  /** 合并相邻语段的最大静音间隔（秒），默认 0.3 s | Max silence gap to merge adjacent segments (seconds) */
  mergeGapSec?: number;
  /** 最小语段时长（秒），短于此则丢弃，默认 0.2 s | Minimum segment duration in seconds */
  minDurationSec?: number;
  /** 最大语段时长（秒），超出则强制截断，默认 30 s | Maximum segment duration in seconds */
  maxDurationSec?: number;
  /** 每段前置静默填充（秒），默认 0.05 s | Pre-roll silence padding in seconds */
  paddingStartSec?: number;
  /** 每段后置静默填充（秒），默认 0.10 s | Post-roll silence padding in seconds */
  paddingEndSec?: number;
}

export interface VadSegment {
  /** 语段起始时间（秒）| Segment start time in seconds */
  start: number;
  /** 语段结束时间（秒）| Segment end time in seconds */
  end: number;
}

// ---- 核心算法 | Core algorithm ----

/**
 * 分析 AudioBuffer，返回语音活动时间段列表。
 * Analyses an AudioBuffer and returns a list of voice-activity segments.
 */
export function detectVadSegments(
  buffer: AudioBuffer,
  options: VadOptions = {},
): VadSegment[] {
  const {
    frameDurationSec = 0.03,
    hopDurationSec   = 0.01,
    thresholdFactor  = 0.05,
    mergeGapSec      = 0.30,
    minDurationSec   = 0.20,
    maxDurationSec   = 30.0,
    paddingStartSec  = 0.05,
    paddingEndSec    = 0.10,
  } = options;

  const sr   = buffer.sampleRate;
  const total = buffer.length;

  // 混合所有声道为单声道 | Downmix all channels to mono
  const mono = new Float32Array(total);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const chData = buffer.getChannelData(ch);
    for (let i = 0; i < total; i++) {
      mono[i] = (mono[i] as number) + (chData[i] as number);
    }
  }
  if (buffer.numberOfChannels > 1) {
    const inv = 1 / buffer.numberOfChannels;
    for (let i = 0; i < total; i++) mono[i] = (mono[i] as number) * inv;
  }

  const frameLen  = Math.round(frameDurationSec * sr);
  const hopLen    = Math.round(hopDurationSec   * sr);

  // 计算每帧 RMS | Compute per-frame RMS energy
  const frameCount = Math.floor((total - frameLen) / hopLen) + 1;
  const rms = new Float32Array(frameCount);
  let peakRms = 0;
  for (let fi = 0; fi < frameCount; fi++) {
    const start = fi * hopLen;
    let sum = 0;
    for (let si = start; si < start + frameLen; si++) {
        const v = mono[si] as number;
        sum += v * v;
    }
      const rmsFi = Math.sqrt(sum / frameLen);
      rms[fi] = rmsFi;
      if (rmsFi > peakRms) peakRms = rmsFi;
  }

  if (peakRms === 0) return [];   // 纯静音 | Completely silent

  const threshold = peakRms * thresholdFactor;

  // 生成语音/静音帧标签 | Label each frame as speech or silence
  const isSpeech = new Uint8Array(frameCount);
  for (let fi = 0; fi < frameCount; fi++) {
    isSpeech[fi] = (rms[fi] as number) >= threshold ? 1 : 0;
  }

  // 提取语音段 framing → time | Convert frame runs to time segments
  const raw: VadSegment[] = [];
  let inSpeech = false;
  let segStartFrame = 0;
  for (let fi = 0; fi <= frameCount; fi++) {
    const speaking = fi < frameCount ? (isSpeech[fi] as number) === 1 : false;
    if (!inSpeech && speaking) {
      inSpeech = true;
      segStartFrame = fi;
    } else if (inSpeech && !speaking) {
      inSpeech = false;
      raw.push({
        start: (segStartFrame as number) * hopLen / sr,
        end:   fi           * hopLen / sr,
      });
    }
  }

  // 合并靠近的段 | Merge segments with small gaps
  const merged: VadSegment[] = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last != null && seg.start - last.end <= mergeGapSec) {
      last.end = seg.end;
    } else {
      merged.push({ ...seg });
    }
  }

  const totalDuration = total / sr;

  // 应用 padding + clamp + 最大时长拆分 + 最小时长过滤 | Apply padding, clamp, split, filter
  const result: VadSegment[] = [];
  for (const seg of merged) {
    const padStart = Math.max(0, seg.start - paddingStartSec);
    const padEnd   = Math.min(totalDuration, seg.end + paddingEndSec);

    if (padEnd - padStart < minDurationSec) continue;

    // 超长段按 maxDurationSec 等分拆断 | Split overlong segments evenly
    if (padEnd - padStart > maxDurationSec) {
      let cursor = padStart;
      while (cursor < padEnd) {
        const chunkEnd = Math.min(cursor + maxDurationSec, padEnd);
        if (chunkEnd - cursor >= minDurationSec) {
          result.push({ start: cursor, end: chunkEnd });
        }
        cursor = chunkEnd;
      }
    } else {
      result.push({ start: padStart, end: padEnd });
    }
  }

  return result;
}

// ---- AudioBuffer 加载工具 | AudioBuffer loader utility ----

/**
 * 从 URL 加载音频文件并解码为 AudioBuffer。
 * Fetches an audio URL and decodes it into an AudioBuffer via Web Audio API.
 */
/** Hard cap for fetch-then-decode path to avoid unbounded RAM before decodeAudioData. */
const MAX_AUDIO_FETCH_BYTES = 10 * 1024 * 1024;
/** Prevents OOM from unbounded `chunks.push` count on pathological chunk sizes. */
const MAX_AUDIO_STREAM_CHUNKS = 32_768;

export async function loadAudioBuffer(
  url: string,
  onProgress?: (ratio: number) => void,
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  let loaded = 0;
  const chunks: Uint8Array[] = [];

  const reader = response.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (loaded > MAX_AUDIO_FETCH_BYTES) {
      throw new Error(`Audio download exceeds safe limit (${MAX_AUDIO_FETCH_BYTES} bytes)`);
    }
    chunks.push(value);
    if (chunks.length > MAX_AUDIO_STREAM_CHUNKS) {
      throw new Error(
        `Audio download chunk count exceeded safe limit (${MAX_AUDIO_STREAM_CHUNKS} chunks)`,
      );
    }
    if (onProgress && contentLength > 0) {
      onProgress(Math.min(loaded / contentLength, 1));
    }
  }

  const totalBytes = chunks.reduce((n, c) => n + c.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const audioCtx = new AudioContext();
  try {
    // 直接用底层 ArrayBuffer，避免多余拷贝 | Use underlying ArrayBuffer directly to avoid redundant copy
    return await audioCtx.decodeAudioData(combined.buffer as ArrayBuffer);
  } finally {
    void audioCtx.close();
  }
}
