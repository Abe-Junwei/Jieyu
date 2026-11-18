/**
 * Shared getUserMedia analysis stream for VAD / energy (Phase C2 split).
 * Single underlying MediaStream; callers use createClone for parallel consumers.
 */

export class VoiceInputSharedAnalysisStreamHandle {
  private stream: MediaStream | null = null;
  /** Bumped by `release()` so a getUserMedia that resolves afterwards is discarded. */
  private requestGeneration = 0;

  async ensure(): Promise<MediaStream | null> {
    if (this.stream && this.stream.active) {
      return this.stream;
    }
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const generation = ++this.requestGeneration;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (generation !== this.requestGeneration) {
      for (const track of stream.getTracks()) track.stop();
      return this.stream && this.stream.active ? this.stream : null;
    }
    this.stream = stream;
    return this.stream;
  }

  async createClone(): Promise<MediaStream | null> {
    const base = await this.ensure();
    const track = base?.getAudioTracks?.()[0];
    if (!track) return null;
    return new MediaStream([track.clone()]);
  }

  release(): void {
    this.requestGeneration += 1;
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }
}
