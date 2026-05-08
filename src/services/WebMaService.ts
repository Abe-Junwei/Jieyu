/**
 * WebMAUS forced alignment — TextGrid parsing utilities.
 *
 * Live HTTP submission/polling lived in `WebMaServiceClient` (removed as unused).
 * {@link parseTextGrid} remains for alignment adapters and tests.
 *
 * @see https://clarin.phonetik.uni-muenchen.de/BASWebServices (BAS portal)
 */

export interface WebMaAlignmentResult {
  /** The task ID returned by WebMAUS. */
  taskId: string;
  /** Parsed word-level intervals from the TextGrid. */
  words: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  /** Parsed phoneme-level intervals (if available from WebMAUS). */
  phonemes: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  /** Raw TextGrid content returned by WebMAUS. */
  rawTextGrid: string;
}

/**
 * Parse a Praat TextGrid string into word and phoneme intervals.
 * WebMAUS returns a standard long TextGrid format.
 *
 * Uses a tier-by-tier parsing strategy: split by 'item [' first, then
 * extract the tier name from each item's header, then parse intervals
 * within that item's scope. This avoids cross-tier contamination.
 */
export function parseTextGrid(textGrid: string): {
  words: Array<{ text: string; startTime: number; endTime: number }>;
  phonemes: Array<{ text: string; startTime: number; endTime: number }>;
} {
  const words: Array<{ text: string; startTime: number; endTime: number }> = [];
  const phonemes: Array<{ text: string; startTime: number; endTime: number }> = [];

  // Split into tiers using 'item [' as delimiter (same approach as praatio)
  const tierList = textGrid.split('item [');

  // tierList[0] = header (before first 'item ['), tierList[1..] = each tier
  tierList.shift();

  for (const tierTxt of tierList) {
    // Determine tier type and name from the header (before 'intervals:' or 'points:')
    const isIntervalTier = tierTxt.includes('class = "IntervalTier"');
    const searchWord = isIntervalTier ? 'intervals:' : 'points:';

    const parts = tierTxt.split(searchWord, 2);
    if (parts.length < 2) continue; // malformed tier

    const header = parts[0]!;
    const tierData = parts[1]!;

    // Extract tier name from header
    const nameMatch = header.match(/name = "([^"]+)"/);
    if (!nameMatch) continue;
    const tierName = nameMatch[1]!.toLowerCase();

    if (!isIntervalTier) continue; // skip point tiers for now

    // Classify tier type
    const isWordTier =
      tierName.includes('word') || tierName.includes('ort') || tierName === 'words';
    const isPhonemeTier =
      tierName.includes('phon') ||
      tierName.includes('kalt') ||
      tierName.includes('sampa') ||
      tierName === 'mau';

    // Parse intervals: look for xmin, xmax, text in sequence
    let offset = 0;
    while (offset < tierData.length) {
      const xminIdx = tierData.indexOf('xmin =', offset);
      if (xminIdx === -1) break;
      const xmaxIdx = tierData.indexOf('xmax =', xminIdx);
      if (xmaxIdx === -1) break;
      const textIdx = tierData.indexOf('text =', xmaxIdx);
      if (textIdx === -1) break;

      const xminLine = tierData.substring(xminIdx + 7, tierData.indexOf('\n', xminIdx + 7)).trim();
      const xmaxLine = tierData.substring(xmaxIdx + 7, tierData.indexOf('\n', xmaxIdx + 7)).trim();
      const textLine = tierData.substring(textIdx + 7, tierData.indexOf('\n', textIdx + 7)).trim();

      const textContent = textLine.replace(/^"(.*)"$/, '$1');
      const start = parseFloat(xminLine);
      const end = parseFloat(xmaxLine);

      if (!isNaN(start) && !isNaN(end) && textContent && textContent !== '<#>' && textContent !== '<SP>') {
        if (isWordTier) {
          words.push({ text: textContent, startTime: start, endTime: end });
        } else if (isPhonemeTier) {
          phonemes.push({ text: textContent, startTime: start, endTime: end });
        } else if (words.length === 0 && phonemes.length === 0 && /[a-zA-Z\u4e00-\u9fff]/.test(textContent)) {
          // First unnamed tier — treat as words
          words.push({ text: textContent, startTime: start, endTime: end });
        }
      }

      offset = textIdx + 7;
    }
  }

  return { words, phonemes };
}
