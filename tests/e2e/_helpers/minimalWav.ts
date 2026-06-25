/** 最小合法 WAV：8kHz mono 16-bit PCM，约 0.25s，供 E2E 媒体导入探针。 */
export function buildMinimalWavBytes(durationSec = 0.25, sampleRate = 8000): Uint8Array {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataBytes, true);

  return new Uint8Array(buffer);
}

export function buildMinimalWavFile(name = 'e2e-field-sample.wav'): { name: string; mimeType: string; buffer: Buffer } {
  return {
    name,
    mimeType: 'audio/wav',
    buffer: Buffer.from(buildMinimalWavBytes()),
  };
}
