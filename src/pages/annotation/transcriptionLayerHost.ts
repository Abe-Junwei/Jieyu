/** Transcription tree parent. Translation hosts stay on layer links, not this field. */
export function transcriptionHostInput(hostId: string): { parentLayerId: string } {
  return { parentLayerId: hostId };
}

export function withTranscriptionHost<T extends object>(
  layer: T,
  hostId: string,
): T & { parentLayerId: string } {
  return { ...layer, parentLayerId: hostId };
}
