/** ponytail: RMS into 0..1, not a calibrated meter. */
export function watchLevel(stream: MediaStream, onLevel: (value: number) => void): () => void {
  const Ctx = window.AudioContext;
  if (Ctx === undefined) return () => {};
  try {
    const context = new Ctx();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    void context.resume();
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let last = 0;
    let shown = -1;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 100) return;
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const sample = ((data[i] ?? 128) - 128) / 128;
        sum += sample * sample;
      }
      const next = Math.min(1, Math.sqrt(sum / data.length) * 12);
      if (Math.abs(next - shown) < 0.05) return;
      shown = next;
      onLevel(next);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  } catch {
    return () => {};
  }
}
