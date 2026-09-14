/**
 * C3c outbound: Leipzig IGT as gb4e `\gll` / `\glt` LaTeX.
 *
 * Research: adapt gb4e (journal IGT default), not ExPex; serialize from the same
 * `layer_units` + translation-layer read model as Flextext/C3a — never write back.
 * Do not call AutoGlossService.glossUnit. LeipzigValidator is for tests, not a download gate.
 */

export const TRANSCRIPTION_IGT_LATEX_FORMAT = 'tex' as const;
export type TranscriptionIgtLatexFormat = typeof TRANSCRIPTION_IGT_LATEX_FORMAT;

export type TranscriptionIgtLatexPayload = {
  body: string;
  extension: 'tex';
  mime: string;
};

export type IgtLatexExportWord = {
  form?: Record<string, string> | undefined;
  gloss?: Record<string, string> | undefined;
  morphemes?: Array<{
    form?: Record<string, string> | undefined;
    gloss?: Record<string, string> | undefined;
  }>;
};

export type IgtLatexExportUnit = {
  id: string;
  startTime: number;
  endTime: number;
  transcription?: Record<string, string> | undefined;
  words?: IgtLatexExportWord[] | undefined;
};

export type IgtLatexTranslationRow = {
  unitId?: string | undefined;
  layerId?: string | undefined;
  modality?: string | undefined;
  text?: string | undefined;
};

export type IgtLatexLayer = {
  id: string;
  layerType?: string | undefined;
};

export type IgtLatexExample = {
  surfaceTokens: string[];
  glossTokens: string[];
  translation: string;
};

const IGT_LATEX_MIME = 'application/x-tex';

const LATEX_SPECIALS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

export function escapeLatexIgtText(text: string): string {
  return text.replace(/[\\{}$&#%_~^]/g, (ch) => LATEX_SPECIALS[ch] ?? ch);
}

export function formatGb4eColumn(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '{}';
  const escaped = escapeLatexIgtText(trimmed);
  if (/\s/.test(trimmed)) return `{${escaped}}`;
  return escaped;
}

function firstLocalizedValue(value: Record<string, string> | undefined): string {
  if (!value) return '';
  const preferred = value.default ?? value.eng ?? value.zho ?? value.en ?? value.zh;
  if (typeof preferred === 'string' && preferred.trim().length > 0) return preferred.trim();
  for (const entry of Object.values(value)) {
    if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
  }
  return '';
}

function joinMorphemeLine(
  morphemes: NonNullable<IgtLatexExportWord['morphemes']>,
  pick: (morph: NonNullable<IgtLatexExportWord['morphemes']>[number]) => string,
): string {
  const parts = morphemes.map((morph) => pick(morph)).filter((part) => part.length > 0);
  return parts.join('-');
}

function wordColumns(word: IgtLatexExportWord): { surface: string; gloss: string } {
  const morphs = word.morphemes;
  if (morphs && morphs.length > 0) {
    const surface = joinMorphemeLine(morphs, (morph) => firstLocalizedValue(morph.form));
    const gloss = joinMorphemeLine(morphs, (morph) => firstLocalizedValue(morph.gloss));
    if (surface.length > 0 || gloss.length > 0) {
      return {
        surface: surface.length > 0 ? surface : firstLocalizedValue(word.form),
        gloss,
      };
    }
  }
  return {
    surface: firstLocalizedValue(word.form),
    gloss: firstLocalizedValue(word.gloss),
  };
}

function fallbackSurfaceTokens(unit: IgtLatexExportUnit): string[] {
  const text = firstLocalizedValue(unit.transcription);
  if (text.length === 0) return [];
  return text.split(/\s+/).filter((token) => token.length > 0);
}

function translationForUnit(
  unitId: string,
  translations: readonly IgtLatexTranslationRow[],
  translationLayerId: string | undefined,
): string {
  if (translationLayerId === undefined || translationLayerId.length === 0) return '';
  for (const row of translations) {
    if (row.unitId !== unitId) continue;
    if (row.layerId !== translationLayerId) continue;
    if (typeof row.modality === 'string' && row.modality.length > 0 && row.modality !== 'text') {
      continue;
    }
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (text.length > 0) return text;
  }
  return '';
}

function alignColumns(surface: string[], gloss: string[]): { surface: string[]; gloss: string[] } {
  const width = Math.max(surface.length, gloss.length);
  const nextSurface = surface.slice();
  const nextGloss = gloss.slice();
  while (nextSurface.length < width) nextSurface.push('');
  while (nextGloss.length < width) nextGloss.push('');
  return { surface: nextSurface, gloss: nextGloss };
}

export function toTranscriptionIgtLatexExamples(
  units: IgtLatexExportUnit[],
  options?: {
    translations?: readonly IgtLatexTranslationRow[];
    layers?: readonly IgtLatexLayer[];
  },
): IgtLatexExample[] {
  const translationLayerId = options?.layers?.find(
    (layer) => layer.layerType === 'translation',
  )?.id;
  const translations = options?.translations ?? [];

  return [...units]
    .sort((a, b) => {
      const startDelta = a.startTime - b.startTime;
      if (startDelta !== 0) return startDelta;
      return a.id.localeCompare(b.id);
    })
    .map((unit) => {
      const fromWords = (unit.words ?? [])
        .map((word) => wordColumns(word))
        .filter((column) => column.surface.length > 0 || column.gloss.length > 0);
      const surfaceTokens =
        fromWords.length > 0
          ? fromWords.map((column) => column.surface)
          : fallbackSurfaceTokens(unit);
      const glossTokens =
        fromWords.length > 0
          ? fromWords.map((column) => column.gloss)
          : surfaceTokens.map(() => '');
      const aligned = alignColumns(surfaceTokens, glossTokens);
      return {
        surfaceTokens: aligned.surface,
        glossTokens: aligned.gloss,
        translation: translationForUnit(unit.id, translations, translationLayerId),
      };
    })
    .filter(
      (example) =>
        example.surfaceTokens.some((token) => token.length > 0) || example.translation.length > 0,
    );
}

export function collectIgtGlossTokens(examples: IgtLatexExample[]): string[] {
  return examples.flatMap((example) =>
    example.glossTokens.filter((token) => token.trim().length > 0),
  );
}

function serializeExample(example: IgtLatexExample): string {
  const surface = example.surfaceTokens.map((token) => formatGb4eColumn(token)).join(' ');
  const gloss = example.glossTokens.map((token) => formatGb4eColumn(token)).join(' ');
  const lines = [`\\ex`, `\\gll ${surface} \\\\`, `     ${gloss} \\\\`];
  if (example.translation.length > 0) {
    lines.push(`\\glt \`${escapeLatexIgtText(example.translation)}'`);
  }
  return lines.join('\n');
}

export function serializeTranscriptionIgtLatex(
  units: IgtLatexExportUnit[],
  options?: {
    translations?: readonly IgtLatexTranslationRow[];
    layers?: readonly IgtLatexLayer[];
  },
): TranscriptionIgtLatexPayload {
  const examples = toTranscriptionIgtLatexExamples(units, options);
  if (examples.length === 0) {
    return { body: '', extension: 'tex', mime: IGT_LATEX_MIME };
  }
  const body = [
    '% jieyu-igt-gb4e',
    '% Requires: \\usepackage{gb4e}',
    '\\begin{exe}',
    examples.map((example) => serializeExample(example)).join('\n'),
    '\\end{exe}',
    '',
  ].join('\n');
  return { body, extension: 'tex', mime: IGT_LATEX_MIME };
}
