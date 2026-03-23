/**
 * Praat TextGrid import/export service.
 *
 * Supports the "normal" (long) TextGrid format,
 * which is the most common variant.
 */

import type { UtteranceDocType, TranslationLayerDocType, UtteranceTextDocType, UserNoteDocType } from '../db';

// ── Types ───────────────────────────────────────────────────

export interface TextGridExportInput {
  utterances: UtteranceDocType[];
  layers: TranslationLayerDocType[];
  translations: UtteranceTextDocType[];
  userNotes?: UserNoteDocType[];
}

export interface TextGridImportResult {
  /** Utterances from the first IntervalTier */
  utterances: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
  }>;
  /** Additional tiers keyed by name */
  additionalTiers: Map<string, Array<{
    startTime: number;
    endTime: number;
    text: string;
  }>>;
  /** Name of the first IntervalTier | 首层名称 */
  transcriptionTierName?: string;
}

// ── Export ───────────────────────────────────────────────────

function escapeTextGridString(s: string): string {
  return s.replace(/"/g, '""');
}

export function exportToTextGrid(input: TextGridExportInput): string {
  const { utterances, layers, translations, userNotes } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);
  if (sorted.length === 0) return '';

  const globalXmin = sorted[0]!.startTime;
  const globalXmax = sorted[sorted.length - 1]!.endTime;

  // Build tiers: first is transcription, then each translation layer
  interface TierEntry {
    name: string;
    intervals: Array<{ xmin: number; xmax: number; text: string }>;
  }

  const tiers: TierEntry[] = [];

  // Determine default transcription layer
  const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');
  const defaultTrcId = transcriptionLayers.find((l) => l.isDefault)?.id ?? transcriptionLayers[0]?.id;

  // Transcription tier
  const transcriptionIntervals = buildIntervalsWithGaps(
    sorted.map((u) => {
      const tr = defaultTrcId
        ? translations.find((t) => t.utteranceId === u.id && t.tierId === defaultTrcId && t.modality === 'text')
        : undefined;
      return {
        xmin: u.startTime,
        xmax: u.endTime,
        text: tr?.text ?? u.transcription?.default ?? '',
      };
    }),
    globalXmin,
    globalXmax,
  );
  tiers.push({ name: 'transcription', intervals: transcriptionIntervals });

  // Additional tiers: non-default transcription layers + translation layers
  const additionalLayers = layers.filter(
    (l) => l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  for (const layer of additionalLayers) {
    const layerTranslations = translations.filter(
      (t) => t.tierId === layer.id && t.modality === 'text',
    );
    const tierName = layer.name?.eng ?? layer.name?.zho ?? layer.key;

    const intervals = buildIntervalsWithGaps(
      sorted.map((u) => {
        const tr = layerTranslations.find((t) => t.utteranceId === u.id);
        return { xmin: u.startTime, xmax: u.endTime, text: tr?.text ?? '' };
      }),
      globalXmin,
      globalXmax,
    );
    tiers.push({ name: tierName, intervals });
  }

  // Notes tier
  if (userNotes && userNotes.length > 0) {
    const notesByUtt = new Map<string, UserNoteDocType[]>();
    for (const note of userNotes) {
      if (note.targetType !== 'utterance') continue;
      const arr = notesByUtt.get(note.targetId);
      if (arr) arr.push(note);
      else notesByUtt.set(note.targetId, [note]);
    }
    const noteIntervals = buildIntervalsWithGaps(
      sorted.map((u) => {
        const uttNotes = notesByUtt.get(u.id);
        const text = uttNotes
          ? uttNotes.map((n) => {
              const prefix = n.category ? `[${n.category}] ` : '';
              return prefix + (n.content['default'] ?? Object.values(n.content)[0] ?? '');
            }).join(' | ')
          : '';
        return { xmin: u.startTime, xmax: u.endTime, text };
      }),
      globalXmin,
      globalXmax,
    );
    tiers.push({ name: 'notes', intervals: noteIntervals });
  }

  // Build TextGrid output
  const lines: string[] = [
    'File type = "ooTextFile"',
    'Object class = "TextGrid"',
    '',
    `xmin = ${globalXmin}`,
    `xmax = ${globalXmax}`,
    'tiers? <exists>',
    `size = ${tiers.length}`,
    'item []:',
  ];

  tiers.forEach((tier, i) => {
    lines.push(`    item [${i + 1}]:`);
    lines.push('        class = "IntervalTier"');
    lines.push(`        name = "${escapeTextGridString(tier.name)}"`);
    lines.push(`        xmin = ${globalXmin}`);
    lines.push(`        xmax = ${globalXmax}`);
    lines.push(`        intervals: size = ${tier.intervals.length}`);
    tier.intervals.forEach((iv, j) => {
      lines.push(`        intervals [${j + 1}]:`);
      lines.push(`            xmin = ${iv.xmin}`);
      lines.push(`            xmax = ${iv.xmax}`);
      lines.push(`            text = "${escapeTextGridString(iv.text)}"`);
    });
  });

  return lines.join('\n') + '\n';
}

/**
 * Fill gaps between intervals with empty-text intervals so that
 * the tier covers [globalXmin, globalXmax] contiguously.
 */
function buildIntervalsWithGaps(
  intervals: Array<{ xmin: number; xmax: number; text: string }>,
  globalXmin: number,
  globalXmax: number,
): Array<{ xmin: number; xmax: number; text: string }> {
  const result: Array<{ xmin: number; xmax: number; text: string }> = [];
  let cursor = globalXmin;

  for (const iv of intervals) {
    if (iv.xmin > cursor + 1e-6) {
      result.push({ xmin: cursor, xmax: iv.xmin, text: '' });
    }
    result.push(iv);
    cursor = iv.xmax;
  }

  if (globalXmax > cursor + 1e-6) {
    result.push({ xmin: cursor, xmax: globalXmax, text: '' });
  }

  return result;
}

// ── Import ──────────────────────────────────────────────────

export function importFromTextGrid(text: string): TextGridImportResult {
  const lines = text.split(/\r?\n/);
  let idx = 0;

  function peekLine(): string {
    return idx < lines.length ? lines[idx]!.trim() : '';
  }
  function nextLine(): string {
    if (idx >= lines.length) throw new Error(`TextGrid parse error: unexpected end of file at line ${idx + 1}`);
    return lines[idx++]!.trim();
  }
  function readValue(prefix: string): string {
    const line = nextLine();
    const match = line.match(new RegExp(`^${prefix}\\s*=\\s*(.+)$`));
    return match ? match[1]!.trim() : '';
  }
  function readNumber(prefix: string): number {
    const val = parseFloat(readValue(prefix));
    if (!Number.isFinite(val)) throw new Error(`TextGrid parse error: invalid number for "${prefix}"`);
    return val;
  }
  function readQuotedString(prefix: string): string {
    const raw = readValue(prefix);
    // remove surrounding quotes and unescape
    return raw.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
  }

  // Header
  nextLine(); // File type = "ooTextFile"
  nextLine(); // Object class = "TextGrid"
  // skip blank
  if (peekLine() === '') nextLine();

  readNumber('xmin'); // global
  readNumber('xmax');
  nextLine(); // tiers? <exists>
  const tierCount = parseInt(readValue('size'), 10);
  if (!Number.isFinite(tierCount) || tierCount < 0) {
    throw new Error('TextGrid parse error: invalid tier count');
  }
  nextLine(); // item []:

  interface ParsedTier {
    name: string;
    intervals: Array<{ xmin: number; xmax: number; text: string }>;
  }

  const parsedTiers: ParsedTier[] = [];

  for (let t = 0; t < tierCount; t++) {
    nextLine(); // item [n]:
    const tierClass = readQuotedString('class');
    const tierName = readQuotedString('name');
    readNumber('xmin');
    readNumber('xmax');

    if (tierClass === 'IntervalTier') {
      const intervalCount = parseInt(readValue('intervals: size'), 10);
      if (!Number.isFinite(intervalCount) || intervalCount < 0) {
        throw new Error(`TextGrid parse error: invalid interval count for tier "${tierName}"`);
      }
      const intervals: ParsedTier['intervals'] = [];

      for (let i = 0; i < intervalCount; i++) {
        nextLine(); // intervals [n]:
        const xmin = readNumber('xmin');
        const xmax = readNumber('xmax');
        const ivText = readQuotedString('text');
        intervals.push({ xmin, xmax, text: ivText });
      }

      parsedTiers.push({ name: tierName, intervals });
    } else {
      // Skip PointTier or other types — consume lines until next item or EOF
      const pointCount = parseInt(readValue('points: size'), 10);
      if (!Number.isFinite(pointCount) || pointCount < 0) {
        throw new Error(`TextGrid parse error: invalid point count for tier "${tierName}"`);
      }
      for (let i = 0; i < pointCount; i++) {
        nextLine(); // points [n]:
        nextLine(); // number
        nextLine(); // mark or value
      }
    }
  }

  // Map tier 0 → utterances, rest → additional
  let utterances: TextGridImportResult['utterances'] = [];
  const additionalTiers = new Map<string, Array<{ startTime: number; endTime: number; text: string }>>();

  parsedTiers.forEach((tier, i) => {
    const nonEmpty = tier.intervals
      .filter((iv) => iv.text.trim() !== '')
      .map((iv) => ({
        startTime: iv.xmin,
        endTime: iv.xmax,
        transcription: iv.text,
        text: iv.text,
      }));

    if (i === 0) {
      utterances = nonEmpty.map((e) => ({
        startTime: e.startTime,
        endTime: e.endTime,
        transcription: e.text,
      }));
    } else {
      additionalTiers.set(
        tier.name,
        nonEmpty.map((e) => ({
          startTime: e.startTime,
          endTime: e.endTime,
          text: e.text,
        })),
      );
    }
  });

  const transcriptionTierName = parsedTiers[0]?.name;
  return {
    utterances,
    additionalTiers,
    ...(transcriptionTierName ? { transcriptionTierName } : {}),
  };
}

// ── File helpers ────────────────────────────────────────────

export function downloadTextGrid(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.TextGrid') ? filename : `${filename}.TextGrid`;
  a.click();
  URL.revokeObjectURL(url);
}
