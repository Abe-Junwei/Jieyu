import { z } from 'zod';
import type {
  VerticalWorkflowId,
  VerticalWorkflowOutputSchemaId,
} from './verticalWorkflowRegistry';

const verticalWorkflowIdSchema = z.enum([
  'segment_qa',
  'annotation_qa',
  'lexeme_candidates',
  'elan_flex_compatibility',
]);

export const verticalWorkflowEnvelopeSchemaV0 = z.object({
  schemaVersion: z.literal(0),
  workflowId: verticalWorkflowIdSchema,
  writeMode: z.enum(['read_only', 'propose_only', 'confirm_required']),
  outputKind: z.enum([
    'answer',
    'qa_findings',
    'lexeme_candidates',
    'export_plan',
    'fieldwork_note',
    'compatibility_report',
  ]),
  evidencePackets: z.array(
    z
      .object({
        id: z.string(),
        sourceType: z.string(),
        sourceId: z.string(),
      })
      .passthrough(),
  ),
  generatedAt: z.string(),
  status: z.enum(['ready', 'degraded']),
});

const SCHEMA_BY_ID = {
  envelope_v0: verticalWorkflowEnvelopeSchemaV0,
} as const;

export function getVerticalWorkflowOutputSchema(schemaId: VerticalWorkflowOutputSchemaId) {
  return SCHEMA_BY_ID[schemaId];
}

export function parseVerticalWorkflowEnvelopeV0(workflowId: VerticalWorkflowId, value: unknown) {
  const parsed = verticalWorkflowEnvelopeSchemaV0.parse(value);
  if (parsed.workflowId !== workflowId) {
    throw new Error(`Envelope workflowId ${parsed.workflowId} does not match ${workflowId}`);
  }
  return parsed;
}
