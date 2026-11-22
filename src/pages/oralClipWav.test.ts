import { describe, expect, it } from 'vitest';
import { downsampleMono, pcm16Wav } from './oralClipWav';

describe('oral clip wav', () => {
  it('writes 16 kHz mono pcm16', () => {
    const wav = pcm16Wav(Float32Array.from([0.5, -0.5]), 16000);
    expect(Buffer.from(wav.subarray(0, 4)).toString('ascii')).toBe('RIFF');
    const view = new DataView(wav.buffer);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(44, true)).toBe(0x3fff);
    expect(view.getInt16(46, true)).toBe(-0x4000);
  });

  it('keeps one second when the rate drops to 16 kHz', () => {
    const input = new Float32Array(48000);
    expect(downsampleMono(input, 48000, 16000)).toHaveLength(16000);
  });
});
