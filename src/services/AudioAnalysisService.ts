/**
 * Audio analysis utilities for waveform processing.
 */

/**
 * Find the nearest zero-crossing point to a given time in the audio buffer.
 * Searches within a window of ±windowMs milliseconds around the target time.
 *
 * 过滤逻辑 | Filtering:
 * 仅在至少一个邻接样本的绝对值超过 `noiseFloor` 时才记为有效过零点，
 * 避免噪声底噪（极低振幅抖动）产生大量伪零点并引发导出爆音。
 * A zero-crossing is only counted when at least one adjacent sample's absolute
 * value exceeds `noiseFloor`, filtering out noise-floor crossings that could
 * cause clicks/pops in exported audio.
 */
export function findNearestZeroCrossing(
  audioBuffer: AudioBuffer,
  timeSec: number,
  windowMs = 5,
  noiseFloor = 0.005,
): number {
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);
  const centerSample = Math.round(timeSec * sampleRate);
  const windowSamples = Math.round((windowMs / 1000) * sampleRate);
  const lo = Math.max(0, centerSample - windowSamples);
  const hi = Math.min(data.length - 2, centerSample + windowSamples);

  let bestDist = Infinity;
  let bestSample = centerSample;

  for (let i = lo; i <= hi; i++) {
    const a = data[i]!;
    const b = data[i + 1]!;
    if (a * b <= 0 && (Math.abs(a) >= noiseFloor || Math.abs(b) >= noiseFloor)) {
      const dist = Math.abs(i - centerSample);
      if (dist < bestDist) {
        bestDist = dist;
        bestSample = i;
      }
    }
  }
  return bestSample / sampleRate;
}

/**
 * Snap both start and end times to the nearest zero-crossing points.
 */
export function snapToZeroCrossing(
  audioBuffer: AudioBuffer,
  start: number,
  end: number,
  windowMs = 5,
): { start: number; end: number } {
  return {
    start: findNearestZeroCrossing(audioBuffer, start, windowMs),
    end: findNearestZeroCrossing(audioBuffer, end, windowMs),
  };
}
