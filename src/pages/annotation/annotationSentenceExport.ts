import type { AnnotationIgtRow } from './annotationIgtRows';

export type AnnotationSentenceExport = {
  unitId: string;
  textId: string;
  speakerId?: string;
  speakerName?: string;
  startTime: number;
  endTime: number;
  surface: string;
  translation: string;
  tokens: Array<{
    id: string;
    form: string;
    gloss: string;
    pos: string;
    senseId?: string;
  }>;
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
  tokens: readonly { id: string; form: string; gloss: string; pos: string; senseId?: string }[];
}): AnnotationSentenceExport {
  return {
    textId: input.textId,
    unitId: input.unitId,
    ...(input.speakerId ? { speakerId: input.speakerId } : {}),
    ...(input.speakerName ? { speakerName: input.speakerName } : {}),
    startTime: input.startTime,
    endTime: input.endTime,
    surface: input.surface,
    translation: input.translation,
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
}): AnnotationSentenceExport {
  return buildAnnotationSentenceExport({
    textId: input.textId,
    unitId: input.row.id,
    ...(input.row.speakerId ? { speakerId: input.row.speakerId } : {}),
    ...(input.row.speakerName ? { speakerName: input.row.speakerName } : {}),
    startTime: input.row.startTime,
    endTime: input.row.endTime,
    surface: input.row.surface,
    translation: input.row.translation,
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
