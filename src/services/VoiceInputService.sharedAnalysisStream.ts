/**
 * Shared getUserMedia analysis stream for VAD / energy (Phase C2 split).
 * Single underlying MediaStream; callers use createClone for parallel consumers.
 */

export class VoiceInputSharedAnalysisStreamHandle {
  private stream: MediaStream | null = null;

  async ensure(): Promise<MediaStream | null> {
    if (this.stream && this.stream.active) {
      return this.stream;
    }
    if (!navigator.mediaDevices?.getUserMedia) return null;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return this.stream;
  }

  async createClone(): Promise<MediaStream | null> {
    const base = await this.ensure();
    const track = base?.getAudioTracks?.()[0];
    if (!track) return null;
    return new MediaStream([track.clone()]);
  }

  release(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }
}
