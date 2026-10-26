import { z } from 'zod';

export const isoDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected ISO date-time string',
});

const reviewStatusSchema = z.enum(['draft', 'suggested', 'confirmed', 'rejected']);
const actorTypeSchema = z.enum(['human', 'ai', 'system', 'importer']);
const creationMethodSchema = z.enum([
  'manual',
  'import',
  'auto-segmentation',
  'auto-transcription',
  'auto-gloss',
  'alignment',
  'projection',
  'merge',
  'split',
  'migration',
]);

/** 生成参数：扁平键值，限制规模 | Generation params: flat key-value with bounded size */
const PROVENANCE_PARAMS_MAX_KEYS = 32;
const provenanceParamsSchema = z
  .record(
    z.string().min(1).max(64),
    z.union([z.string().max(256), z.number().finite(), z.boolean()]),
  )
  .refine((value) => Object.keys(value).length <= PROVENANCE_PARAMS_MAX_KEYS, {
    message: `provenance.params allows at most ${PROVENANCE_PARAMS_MAX_KEYS} keys`,
  });

export const provenanceSchema = z.object({
  actorType: actorTypeSchema,
  actorId: z.string().optional(),
  method: creationMethodSchema,
  taskId: z.string().optional(),
  model: z.string().optional(),
  modelVersion: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
  reviewStatus: reviewStatusSchema.optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: isoDateSchema.optional(),
  params: provenanceParamsSchema.optional(),
});
