const playing = new Set<HTMLAudioElement>();

export function watchOralAudio(node: HTMLAudioElement | null): () => void {
  if (node !== null) playing.add(node);
  return () => {
    if (node !== null) playing.delete(node);
  };
}

export function pauseOralAudios(): void {
  for (const node of playing) node.pause();
}
