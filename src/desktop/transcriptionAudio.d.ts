export function pcmWav(bytes: Buffer): {
  sampleRate: number;
  channels: number;
  duration: number;
  slice(start: number, end: number): Buffer;
};
