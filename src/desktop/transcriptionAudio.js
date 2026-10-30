/** PCM16 RIFF chunks only; conversion of other codecs belongs to the real-engine slice. */
export function pcmWav(bytes) {
  if (
    bytes.length < 12 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('unsupported transcription audio');
  const limit = bytes.readUInt32LE(4) + 8;
  if (limit > bytes.length) throw new Error('unsupported transcription audio');
  let format;
  let data;
  for (let at = 12; at + 8 <= limit;) {
    const size = bytes.readUInt32LE(at + 4);
    const end = at + 8 + size;
    if (end > limit) throw new Error('unsupported transcription audio');
    const kind = bytes.toString('ascii', at, at + 4);
    if (kind === 'fmt ') format = bytes.subarray(at + 8, end);
    if (kind === 'data') data = bytes.subarray(at + 8, end);
    at = end + (size % 2);
  }
  if (
    !format ||
    format.length < 16 ||
    !data ||
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(14) !== 16
  )
    throw new Error('unsupported transcription audio');
  const channels = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const frame = channels * 2;
  if (
    channels < 1 ||
    sampleRate < 1 ||
    format.readUInt16LE(12) !== frame ||
    format.readUInt32LE(8) !== sampleRate * frame ||
    data.length % frame !== 0
  )
    throw new Error('unsupported transcription audio');
  return {
    sampleRate,
    channels,
    duration: data.length / frame / sampleRate,
    slice(start, end) {
      const first = Math.round(start * sampleRate) * frame;
      const last = Math.round(end * sampleRate) * frame;
      if (first < 0 || last > data.length || last <= first)
        throw new Error('transcription range is invalid');
      const output = Buffer.alloc(44 + last - first);
      output.write('RIFF');
      output.writeUInt32LE(output.length - 8, 4);
      output.write('WAVEfmt ', 8);
      output.writeUInt32LE(16, 16);
      format.copy(output, 20, 0, 16);
      output.write('data', 36);
      output.writeUInt32LE(last - first, 40);
      data.copy(output, 44, first, last);
      return output;
    },
  };
}
