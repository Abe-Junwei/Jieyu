import type { AnnotationIgtRow } from './annotationIgtRows';

export type AnnotationSentenceTokenExport = {
  id: string;
  form: string;
  gloss: string;
  pos: string;
  senseId?: string;
};

export type AnnotationSentenceMorphemeExport = {
  id: string;
  tokenId: string;
  form: string;
  gloss: string;
  pos: string;
};

export type AnnotationSentenceExport = {
  unitId: string;
  textId: string;
  mediaId?: string;
  speakerId?: string;
  speakerName?: string;
  startTime: number;
  endTime: number;
  surface: string;
  translation: string;
  tokens: AnnotationSentenceTokenExport[];
  morphemes: AnnotationSentenceMorphemeExport[];
};

export function buildAnnotationSentenceExport(input: {
  textId: string;
  unitId: string;
  speakerId?: string;
  speakerName?: string;
  startTime: number;
  endTime: number;
  surface: string;
  translation: string;
  mediaId?: string;
  tokens: readonly AnnotationSentenceTokenExport[];
  morphemes?: readonly AnnotationSentenceMorphemeExport[];
}): AnnotationSentenceExport {
  return {
    textId: input.textId,
    unitId: input.unitId,
    ...(input.speakerId ? { speakerId: input.speakerId } : {}),
    ...(input.speakerName ? { speakerName: input.speakerName } : {}),
    startTime: input.startTime,
    endTime: input.endTime,
    ...(input.mediaId ? { mediaId: input.mediaId } : {}),
    surface: input.surface,
    translation: input.translation,
    morphemes: (input.morphemes ?? []).map((morph) => ({
      id: morph.id,
      tokenId: morph.tokenId,
      form: morph.form,
      gloss: morph.gloss,
      pos: morph.pos,
    })),
    tokens: input.tokens.map((token) => ({
      id: token.id,
      form: token.form,
      gloss: token.gloss,
      pos: token.pos,
      ...(token.senseId ? { senseId: token.senseId } : {}),
    })),
  };
}

/** Page export path: keep the persisted speaker id distinct from the display name. */
export function exportFocusedAnnotationSentence(input: {
  textId: string;
  row: AnnotationIgtRow;
  senseIdByTokenId?: Readonly<Record<string, string | undefined>>;
  morphemes?: readonly AnnotationSentenceMorphemeExport[];
}): AnnotationSentenceExport {
  return buildAnnotationSentenceExport({
    textId: input.textId,
    unitId: input.row.id,
    ...(input.row.speakerId ? { speakerId: input.row.speakerId } : {}),
    ...(input.row.speakerName ? { speakerName: input.row.speakerName } : {}),
    startTime: input.row.startTime,
    endTime: input.row.endTime,
    ...(input.row.mediaId ? { mediaId: input.row.mediaId } : {}),
    surface: input.row.surface,
    translation: input.row.translation,
    ...(input.morphemes ? { morphemes: input.morphemes } : {}),
    tokens: input.row.tokens.map((token) => {
      const senseId = input.senseIdByTokenId?.[token.id];
      return {
        id: token.id,
        form: token.form,
        gloss: token.gloss,
        pos: token.pos,
        ...(senseId ? { senseId } : {}),
      };
    }),
  });
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readToken(value: unknown): AnnotationSentenceTokenExport | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = readText(row.id).trim();
  if (id.length === 0) return null;
  const senseId = readText(row.senseId).trim();
  return {
    id,
    form: readText(row.form),
    gloss: readText(row.gloss),
    pos: readText(row.pos),
    ...(senseId.length > 0 ? { senseId } : {}),
  };
}

function readMorpheme(value: unknown): AnnotationSentenceMorphemeExport | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = readText(row.id).trim();
  const tokenId = readText(row.tokenId).trim();
  if (id.length === 0 || tokenId.length === 0) return null;
  return {
    id,
    tokenId,
    form: readText(row.form),
    gloss: readText(row.gloss),
    pos: readText(row.pos),
  };
}

/** Ids, not array order, join a token to its sense and a morpheme to its word. */
export function readAnnotationSentenceExport(value: unknown): AnnotationSentenceExport | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const unitId = readText(row.unitId).trim();
  const textId = readText(row.textId).trim();
  if (unitId.length === 0 || textId.length === 0) return null;
  const mediaId = readText(row.mediaId).trim();
  const speakerId = readText(row.speakerId).trim();
  const speakerName = readText(row.speakerName).trim();
  const tokens = Array.isArray(row.tokens)
    ? row.tokens.flatMap((item) => {
        const token = readToken(item);
        return token ? [token] : [];
      })
    : [];
  const morphemes = Array.isArray(row.morphemes)
    ? row.morphemes.flatMap((item) => {
        const morph = readMorpheme(item);
        return morph ? [morph] : [];
      })
    : [];
  return {
    unitId,
    textId,
    ...(mediaId.length > 0 ? { mediaId } : {}),
    ...(speakerId.length > 0 ? { speakerId } : {}),
    ...(speakerName.length > 0 ? { speakerName } : {}),
    startTime: typeof row.startTime === 'number' ? row.startTime : 0,
    endTime: typeof row.endTime === 'number' ? row.endTime : 0,
    surface: readText(row.surface),
    translation: readText(row.translation),
    tokens,
    morphemes,
  };
}
