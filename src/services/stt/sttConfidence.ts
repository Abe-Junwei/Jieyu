/**
 * sttConfidence — STT 置信度计算工具
 * Utility for computing confidence scores from STT API responses.
 *
 * 支持 Whisper verbose_json（avg_logprob + no_speech_prob）的标准解析，
 * 以及对非 Whisper 服务的降级估算。
 * Supports standard parsing of Whisper verbose_json (avg_logprob + no_speech_prob),
 * plus fallback estimation for non-Whisper services.
 */

// ── Whisper verbose_json 类型 | Whisper verbose_json types ──────────────────

export interface WhisperVerboseSegment {
  /** 语段起始秒 | Segment start in seconds */
  start: number;
  /** 语段结束秒 | Segment end in seconds */
  end: number;
  /** 转写文本 | Transcribed text */
  text: string;
  /** 平均对数概率 | Average log probability */
  avg_logprob: number;
  /** 非语音概率 [0, 1] | No-speech probability [0, 1] */
  no_speech_prob?: number;
}

export interface WhisperVerboseResponse {
  /** 完整转写文本 | Full transcribed text */
  text: string;
  /** 检出语言 | Detected language */
  language?: string;
  /** 音频总时长（秒）| Audio duration in seconds */
  duration?: number;
  /** 逐段详情 | Per-segment details */
  segments?: WhisperVerboseSegment[];
}

// ── 单值转换 | Single value conversion ──────────────────────────────────────

/**
 * 将 avg_logprob 转为 [0, 1] 置信度。
 * Converts Whisper's avg_logprob to a [0, 1] confidence score.
 *
 * avg_logprob 典型范围 [-1.0, 0.0]，越接近 0 越自信。
 * Typical range [-1.0, 0.0], closer to 0 = higher confidence.
 */
export function logprobToConfidence(avgLogprob: number): number {
  const raw = Math.exp(avgLogprob);
  return Math.max(0, Math.min(1, raw));
}

// ── 加权平均置信度 | Weighted average confidence ────────────────────────────

/**
 * 从 Whisper verbose_json 的 segments 中计算按时长加权的综合置信度。
 * Computes duration-weighted average confidence from verbose_json segments.
 *
 * 如果 segments 为空或不存在，返回 fallback（默认 1.0，即无数据时兼容旧行为）。
 * Returns fallback (default 1.0) if segments are empty or absent.
 */
export function computeWhisperConfidence(
  response: WhisperVerboseResponse,
  fallback = 1.0,
): number {
  const segments = response.segments;
  if (!segments || segments.length === 0) return fallback;

  let totalDuration = 0;
  let weightedSum = 0;

  for (const seg of segments) {
    const duration = Math.max(0, seg.end - seg.start);
    if (duration === 0) continue;

    const conf = logprobToConfidence(seg.avg_logprob);
    // no_speech_prob 高说明该段可能不是语音，降低置信度
    // High no_speech_prob indicates likely non-speech, penalise confidence
    const nsPenalty = seg.no_speech_prob != null
      ? Math.max(0, 1 - seg.no_speech_prob)
      : 1;

    weightedSum += duration * conf * nsPenalty;
    totalDuration += duration;
  }

  if (totalDuration === 0) return fallback;
  return Math.max(0, Math.min(1, weightedSum / totalDuration));
}

/**
 * 尝试将任意 JSON 响应解析为 WhisperVerboseResponse。
 * 如果不包含 segments 则返回 null（用于优雅降级）。
 *
 * Attempts to parse an arbitrary JSON response as WhisperVerboseResponse.
 * Returns null if no segments present (for graceful fallback).
 */
export function tryParseVerboseResponse(
  json: Record<string, unknown>,
): WhisperVerboseResponse | null {
  const text = typeof json.text === 'string' ? json.text : '';
  const segments = json.segments;

  if (!Array.isArray(segments) || segments.length === 0) return null;

  // 验证至少第一段包含 avg_logprob | Validate at least first segment has avg_logprob
  const first = segments[0] as Record<string, unknown> | undefined;
  if (first == null || typeof first.avg_logprob !== 'number') return null;

  return {
    text,
    ...(typeof json.language === 'string' && { language: json.language }),
    ...(typeof json.duration === 'number' && { duration: json.duration }),
    segments: segments as WhisperVerboseSegment[],
  };
}
