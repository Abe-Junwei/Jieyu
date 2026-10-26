import { z } from 'zod';
import { isoDateSchema, provenanceSchema } from './provenanceSchema';

export const dmlexText = z.string().min(1);

const dmlexSenseSchema = z
  .object({
    id: dmlexText.optional(),
    indicator: z.string().optional(),
    labels: z.array(dmlexText).optional(),
    definitions: z
      .array(
        z
          .object({
            text: dmlexText,
            definitionType: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    examples: z
      .array(
        z
          .object({
            text: dmlexText,
            sourceIdentity: z.string().optional(),
            sourceElaboration: dmlexText.optional(),
            soundFile: z.string().optional(),
            labels: z.array(dmlexText).optional(),
            exampleTranslations: z
              .array(
                z
                  .object({
                    text: dmlexText,
                    langCode: z.string().optional(),
                    labels: z.array(dmlexText).optional(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
    headwordExplanations: z
      .array(
        z
          .object({
            text: dmlexText,
            langCode: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    headwordTranslations: z
      .array(
        z
          .object({
            text: dmlexText,
            langCode: z.string().optional(),
            partsOfSpeech: z.array(dmlexText).optional(),
            labels: z.array(dmlexText).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const dmlexEntrySchema = z
  .object({
    id: z.string().optional(),
    headword: dmlexText,
    homographNumber: z.string().optional(),
    partsOfSpeech: z.array(dmlexText).optional(),
    labels: z.array(dmlexText).optional(),
    pronunciations: z
      .array(
        z
          .object({
            soundFile: z.string().optional(),
            transcriptions: z
              .array(
                z
                  .object({
                    text: dmlexText,
                    scheme: z.string().optional(),
                  })
                  .strict(),
              )
              .min(1)
              .optional(),
            labels: z.array(dmlexText).optional(),
          })
          .strict(),
      )
      .optional(),
    inflectedForms: z
      .array(
        z
          .object({
            text: dmlexText,
            tag: dmlexText.optional(),
            labels: z.array(dmlexText).optional(),
          })
          .strict(),
      )
      .optional(),
    senses: z.array(dmlexSenseSchema).optional(),
    etymologies: z
      .array(
        z
          .object({
            description: z.string().optional(),
            etymons: z
              .array(
                z
                  .object({
                    etymonUnits: z
                      .array(
                        z
                          .object({
                            langCode: z.string(),
                            text: z.string(),
                          })
                          .strict(),
                      )
                      .min(1),
                    when: z.string().optional(),
                    type: z.string().optional(),
                    note: z.string().optional(),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const jieyuLexemeSchema = z
  .object({
    exampleRefs: z
      .array(
        z
          .object({
            senseId: dmlexText,
            exampleIndex: z.number().int().nonnegative(),
            segmentId: dmlexText,
          })
          .strict(),
      )
      .optional(),
    notes: z
      .array(
        z
          .object({
            owner: z.enum(['entry', 'sense']),
            ref: dmlexText,
            text: dmlexText,
          })
          .strict(),
      )
      .optional(),
    anchoredNotes: z
      .array(
        z
          .object({
            id: dmlexText,
            scope: z.enum(['lexeme', 'sense']),
            senseId: dmlexText.optional(),
            content: z
              .record(z.string().min(1), z.string())
              .refine((value) => Object.keys(value).length > 0),
            category: z
              .enum([
                'comment',
                'question',
                'todo',
                'linguistic',
                'fieldwork',
                'correction',
                'topic',
              ])
              .optional(),
            provenance: provenanceSchema.strict().optional(),
            createdAt: isoDateSchema,
            updatedAt: isoDateSchema,
          })
          .strict()
          .superRefine((note, ctx) => {
            if (note.scope === 'sense' && note.senseId === undefined) {
              ctx.addIssue({ code: 'custom', message: 'sense id is missing' });
            }
            if (note.scope === 'lexeme' && note.senseId !== undefined) {
              ctx.addIssue({ code: 'custom', message: 'lexeme note has a sense id' });
            }
          }),
      )
      .refine((notes) => new Set(notes.map((note) => note.id)).size === notes.length)
      .optional(),
    occurrenceCitations: z
      .array(
        z
          .object({
            textId: dmlexText,
            unitId: dmlexText,
            tokenId: dmlexText,
            lexemeId: dmlexText,
            senseId: dmlexText,
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/** Desktop writer reuses these objects. A failure is one English error, not a dropped field. */
export function parseStoredDmlexEntry(value: unknown): z.infer<typeof dmlexEntrySchema> {
  const parsed = dmlexEntrySchema.safeParse(value);
  if (!parsed.success) throw new Error('lexeme entry is invalid');
  return parsed.data;
}

export function parseStoredJieyuLexeme(value: unknown): z.infer<typeof jieyuLexemeSchema> {
  const parsed = jieyuLexemeSchema.safeParse(value);
  if (!parsed.success) throw new Error('lexeme extension is invalid');
  return parsed.data;
}
