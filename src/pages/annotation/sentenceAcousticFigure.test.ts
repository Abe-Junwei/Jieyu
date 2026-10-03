import { describe, expect, it } from 'vitest';
import {
  SENTENCE_SPECTROGRAM_BINS,
  encodeWavPcm16,
  pitchColumns,
  slicePcm,
  spectrogramColumns,
  waveformPeaks,
} from './sentenceAcousticFigure';

describe('sentenceAcousticFigure', () => {
  it('slices the sentence and leaves samples outside it', () => {
    const pcm = Float32Array.from({ length: 100 }, (_, index) => index);
    const slice = slicePcm(pcm, 10, 2, 5);
    expect(slice[0]).toBe(20);
    expect(slice.length).toBe(30);
    expect(slicePcm(pcm, 10, 5, 5).length).toBe(0);
  });

  it('peaks a louder half of the waveform higher', () => {
    const samples = new Float32Array(20);
    for (let index = 10; index < 20; index += 1) samples[index] = 0.8;
    const peaks = waveformPeaks(samples, 2);
    expect(peaks[1]).toBeGreaterThan(peaks[0] ?? 0);
    expect(peaks[1]).toBeCloseTo(1);
  });

  it('puts a sine into an upper spectrogram bin, not the lowest', () => {
    const sampleRate = 8000;
    const samples = Float32Array.from({ length: 256 }, (_, index) =>
      Math.sin((2 * Math.PI * 2000 * index) / sampleRate),
    );
    const column = spectrogramColumns(samples, 1, SENTENCE_SPECTROGRAM_BINS)[0] ?? [];
    const low = column[0] ?? 0;
    const high = Math.max(...column.slice(8));
    expect(high).toBeGreaterThan(low);
  });

  it('writes a 16-bit wav header for the sliced sentence', async () => {
    const wav = encodeWavPcm16(new Float32Array([0, 0.5, -0.5]), 16000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(bytes.length).toBe(44 + 6);
  });

  it('leaves pitch empty where frames are unvoiced', () => {
    const pitch = pitchColumns(
      [
        { timeSec: 0.1, f0Hz: null },
        { timeSec: 0.9, f0Hz: 180 },
      ],
      1,
      2,
    );
    expect(pitch[0]).toBeNull();
    expect(pitch[1]).toBeCloseTo(0);
  });
});
