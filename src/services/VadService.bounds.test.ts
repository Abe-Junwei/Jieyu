import { describe, expect, it } from 'vitest';
import { detectVadSegments } from './VadService';

function monoBuffer(length: number, sampleRate = 16000): AudioBuffer {
  const data = new Float32Array(length);
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('detectVadSegments short input (#549)', () => {
  it('returns no segments for an empty buffer', () => {
    expect(detectVadSegments(monoBuffer(0))).toEqual([]);
  });

  it('returns no segments when the buffer is shorter than one frame', () => {
    expect(detectVadSegments(monoBuffer(160))).toEqual([]);
  });
});
