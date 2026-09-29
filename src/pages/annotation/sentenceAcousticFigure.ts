import { computeAcousticAnalysis } from '../../services/acoustic/acousticAnalysisCore';
import { DEFAULT_ACOUSTIC_ANALYSIS_CONFIG } from '../../utils/acousticOverlayTypes';

export const SENTENCE_ACOUSTIC_COLUMNS = 96;
export const SENTENCE_SPECTROGRAM_BINS = 24;

export type SentenceAcousticFigure = {
  waveform: number[];
  spectrogram: number[][];
  pitch: Array<number | null>;
};

export function slicePcm(
  pcm: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
): Float32Array {
  if (!(sampleRate > 0) || !(endSec > startSec)) return new Float32Array();
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const end = Math.min(pcm.length, Math.ceil(endSec * sampleRate));
  if (end <= start) return new Float32Array();
  return pcm.subarray(start, end);
}

export function waveformPeaks(samples: Float32Array, columns: number): number[] {
  const width = Math.max(1, columns);
  const peaks = new Array<number>(width).fill(0);
  if (samples.length === 0) return peaks;
  let max = 0;
  const raw = new Array<number>(width).fill(0);
  for (let column = 0; column < width; column += 1) {
    const start = Math.floor((column * samples.length) / width);
    const end = Math.max(start + 1, Math.floor(((column + 1) * samples.length) / width));
    let peak = 0;
    for (let index = start; index < end && index < samples.length; index += 1) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > peak) peak = value;
    }
    raw[column] = peak;
    if (peak > max) max = peak;
  }
  if (max <= 0) return peaks;
  for (let column = 0; column < width; column += 1) peaks[column] = (raw[column] ?? 0) / max;
  return peaks;
}

function binMagnitude(window: Float32Array, bin: number): number {
  let real = 0;
  let imag = 0;
  const size = window.length;
  for (let index = 0; index < size; index += 1) {
    const angle = (2 * Math.PI * bin * index) / size;
    const sample = window[index] ?? 0;
    real += sample * Math.cos(angle);
    imag -= sample * Math.sin(angle);
  }
  return Math.hypot(real, imag);
}

export function spectrogramColumns(
  samples: Float32Array,
  columns: number,
  bins: number,
): number[][] {
  const width = Math.max(1, columns);
  const height = Math.max(1, bins);
  const columnsOut: number[][] = [];
  const windowSize = 128;
  for (let column = 0; column < width; column += 1) {
    const center = Math.floor(((column + 0.5) * Math.max(samples.length - 1, 0)) / width);
    const start = Math.max(0, center - Math.floor(windowSize / 2));
    const window = samples.subarray(start, Math.min(samples.length, start + windowSize));
    const energies = new Array<number>(height).fill(0);
    let max = 0;
    for (let bin = 0; bin < height; bin += 1) {
      const energy = window.length > 0 ? binMagnitude(window, bin + 1) : 0;
      energies[bin] = energy;
      if (energy > max) max = energy;
    }
    columnsOut.push(max > 0 ? energies.map((energy) => energy / max) : energies);
  }
  return columnsOut;
}

export function pitchColumns(
  frames: readonly { timeSec: number; f0Hz: number | null }[],
  durationSec: number,
  columns: number,
): Array<number | null> {
  const width = Math.max(1, columns);
  const voiced = frames
    .map((frame) => frame.f0Hz)
    .filter((hz): hz is number => typeof hz === 'number' && hz > 0);
  if (voiced.length === 0 || !(durationSec > 0)) return new Array<number | null>(width).fill(null);
  const min = Math.min(...voiced);
  const max = Math.max(...voiced);
  const span = max - min || 1;
  return Array.from({ length: width }, (_, column) => {
    const time = ((column + 0.5) * durationSec) / width;
    let nearest = frames[0];
    let best = Number.POSITIVE_INFINITY;
    for (const frame of frames) {
      const distance = Math.abs(frame.timeSec - time);
      if (distance < best) {
        best = distance;
        nearest = frame;
      }
    }
    const hz = nearest?.f0Hz;
    if (typeof hz !== 'number' || !(hz > 0)) return null;
    return (hz - min) / span;
  });
}

export function encodeWavPcm16(pcm: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

export function buildSentenceAcousticFigure(
  pcm: Float32Array,
  sampleRate: number,
): SentenceAcousticFigure {
  const waveform = waveformPeaks(pcm, SENTENCE_ACOUSTIC_COLUMNS);
  const spectrogram = spectrogramColumns(pcm, SENTENCE_ACOUSTIC_COLUMNS, SENTENCE_SPECTROGRAM_BINS);
  if (pcm.length < 64 || !(sampleRate > 0)) {
    return {
      waveform,
      spectrogram,
      pitch: new Array<number | null>(SENTENCE_ACOUSTIC_COLUMNS).fill(null),
    };
  }
  const analysis = computeAcousticAnalysis({
    mediaKey: 'sentence',
    sampleRate,
    pcm,
    config: {
      ...DEFAULT_ACOUSTIC_ANALYSIS_CONFIG,
      frameStepSec: 0.02,
    },
  });
  return {
    waveform,
    spectrogram,
    pitch: pitchColumns(analysis.frames, pcm.length / sampleRate, SENTENCE_ACOUSTIC_COLUMNS),
  };
}
