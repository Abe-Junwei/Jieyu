export type SegmentLayerWriteReloadResult<T> = { stale: true } | { stale: false; value: T };

export async function runSegmentLayerWriteReload<T>(input: {
  generation: { current: number };
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  write: () => Promise<T>;
}): Promise<SegmentLayerWriteReloadResult<T>> {
  input.generation.current += 1;
  const postReloadToken = input.generation.current;
  const value = await input.write();
  await input.reloadSegments();
  if (input.generation.current !== postReloadToken) return { stale: true };
  await input.refreshSegmentUndoSnapshot();
  return { stale: false, value };
}
