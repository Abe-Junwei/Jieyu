/**
 * EarconService — 音效反馈
 *
 * 使用 Web Audio API 合成简短提示音 (earcons)，
 * 无需加载外部音频文件。
 *
 * @see 解语-语音智能体架构设计方案 §4.7
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Play a short tone with the given frequency, duration, and volume.
 */
function playTone(
  frequency: number,
  durationMs: number,
  volume = 0.15,
  type: OscillatorType = 'sine',
): void {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;

  // Fade-out envelope to avoid clicks
  const endTime = ctx.currentTime + durationMs / 1000;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, endTime);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(endTime);
}

/**
 * Two-tone ascending chime — voice agent activated.
 */
export function playActivate(): void {
  playTone(523.25, 80);   // C5
  setTimeout(() => playTone(659.25, 120), 80);  // E5
}

/**
 * Single descending tone — voice agent deactivated.
 */
export function playDeactivate(): void {
  playTone(659.25, 60);   // E5
  setTimeout(() => playTone(523.25, 100), 60);  // C5
}

/**
 * Short bright ping — command successfully executed.
 */
export function playSuccess(): void {
  playTone(880, 80, 0.12);  // A5
}

/**
 * Low buzz — error or unrecognized command.
 */
export function playError(): void {
  playTone(220, 150, 0.12, 'square');  // A3 square wave
}

/**
 * Subtle tick — interim result / feedback pulse.
 */
export function playTick(): void {
  playTone(1046.5, 30, 0.06);  // C6 very short
}
