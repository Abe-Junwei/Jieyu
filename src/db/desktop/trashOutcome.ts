export async function trashOutcome(
  absolutePath: string,
  trash: (absolutePath: string) => Promise<void>,
  exists: (absolutePath: string) => boolean,
): Promise<'moved' | 'unknown'> {
  await trash(absolutePath);
  return exists(absolutePath) ? 'unknown' : 'moved';
}
