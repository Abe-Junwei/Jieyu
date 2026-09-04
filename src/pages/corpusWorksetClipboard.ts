export async function writeCorpusWorksetClipboard(text: string): Promise<boolean> {
  if (text.length === 0) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
