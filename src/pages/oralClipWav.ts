/** 16 kHz mono PCM16 WAV. The browser records webm; local Whisper only accepts this. */
export function pcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  out.set([82, 73, 70, 70], 0);
  view.setUint32(4, 36 + dataBytes, true);
  out.set([87, 65, 86, 69, 102, 109, 116, 32], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  out.set([100, 97, 116, 97], 36);
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

export function downsampleMono(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const count = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const at = (index * fromRate) / toRate;
    const left = Math.min(Math.floor(at), input.length - 1);
    const right = Math.min(left + 1, input.length - 1);
    const mix = at - left;
    out[index] = (input[left] ?? 0) * (1 - mix) + (input[right] ?? 0) * mix;
  }
  return out;
}

export async function clipBytesToWav(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(copy);
    const mono = new Float32Array(audio.length);
    const channels = audio.numberOfChannels;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = audio.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) {
        mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / channels;
      }
    }
    return pcm16Wav(downsampleMono(mono, audio.sampleRate, 16000), 16000);
  } finally {
    await context.close();
  }
}
