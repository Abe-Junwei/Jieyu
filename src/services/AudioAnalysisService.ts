/**
 * Audio analysis utilities for waveform processing.
 */

/**
 * Find the nearest zero-crossing point to a given time in the audio buffer.
 * Searches within a window of ±windowMs milliseconds around the target time.
 */
export function findNearestZeroCrossing(
  audioBuffer: AudioBuffer,
  timeSec: number,
  windowMs = 5,
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
    if (data[i]! * data[i + 1]! <= 0) {
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
