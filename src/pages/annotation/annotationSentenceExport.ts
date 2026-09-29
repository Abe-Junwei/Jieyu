export type AnnotationSentenceExport = {
  unitId: string;
  textId: string;
  speakerId?: string;
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
