/**
 * R3-1: the first local-context batch on ToolLoopAgent.
 * Read-only corpus queries. The model sees the result JSON (without _readModel);
 * the caller keeps the full result for the verified report.
 */
import { jsonSchema } from 'ai';
import type { PilotToolSpec } from './toolLoopAgentPilot';

export const RUNTIME_V2_CORPUS_ANALYSIS_TOOLS = [
  'concordance_kwic',
  'query_morpheme_paradigm',
  'find_counterexamples',
] as const;

export type RuntimeV2CorpusAnalysisTool = (typeof RUNTIME_V2_CORPUS_ANALYSIS_TOOLS)[number];

export function isRuntimeV2CorpusAnalysisTool(name: string): name is RuntimeV2CorpusAnalysisTool {
  return (RUNTIME_V2_CORPUS_ANALYSIS_TOOLS as readonly string[]).includes(name);
}

const objectSchema = (properties: Record<string, unknown>) =>
  jsonSchema({ type: 'object', properties } as Record<string, unknown>);

/** R3-n batches 1–4. Read-only workspace queries. Writes such as batch_apply stay off this list. */
export const RUNTIME_V2_LOCAL_READ_TOOLS = [
  'list_units',
  'search_units',
  'get_unit_detail',
  'get_unit_linguistic_memory',
  'get_current_selection',
  'list_layers',
  'list_layer_links',
  'get_unsaved_drafts',
  'list_speakers',
  'list_notes',
  'list_notes_detail',
  'get_visible_timeline_state',
  'get_speaker_breakdown',
  'get_project_stats',
  'get_waveform_analysis',
  'get_acoustic_summary',
  'find_incomplete_units',
  'diagnose_quality',
  'suggest_next_action',
] as const;

export type RuntimeV2LocalReadTool = (typeof RUNTIME_V2_LOCAL_READ_TOOLS)[number];

export function isRuntimeV2LocalReadTool(name: string): name is RuntimeV2LocalReadTool {
  return (RUNTIME_V2_LOCAL_READ_TOOLS as readonly string[]).includes(name);
}

/** Preview only. The model does not see the result until the user approves. */
export function isRuntimeV2BatchApply(name: string): boolean {
  return name === 'batch_apply';
}

export function batchApplyToolSpec(): PilotToolSpec {
  return {
    description:
      'Preview one action on many units. It does not change data. The user confirms before the preview is returned.',
    inputSchema: objectSchema({
      action: { type: 'string' },
      unitIds: { type: 'array', items: { type: 'string' } },
    }),
  };
}

/** Lines for the confirm card, taken from the call itself. The preview query runs after approval. */
export function batchApplyApprovalLines(args: Record<string, unknown>): string[] {
  const action =
    typeof args.action === 'string' && args.action.trim() ? args.action.trim() : 'update';
  const ids = Array.isArray(args.unitIds)
    ? args.unitIds.flatMap((id) => (typeof id === 'string' && id.trim() ? [id.trim()] : []))
    : [];
  const shown = ids.slice(0, 8).map((id) => `${action} ${id}`);
  return shown.length > 0 ? shown : [`${action} (no unit ids)`];
}

export function localReadToolSpecs(): Record<string, PilotToolSpec> {
  const descriptions: Record<RuntimeV2LocalReadTool, string> = {
    list_units: 'List units in the current project. Returns matches with unit ids.',
    search_units: 'Search units by text or filters. Returns matches with unit ids.',
    get_unit_detail: 'One unit by unitId, including its text.',
    get_unit_linguistic_memory: 'One unit with tokens, morphemes, and notes.',
    get_current_selection: 'The current selection and how many units are in scope.',
    list_layers: 'Workspace layers with ids, labels, and row counts. Optional layerType.',
    list_layer_links: 'Which translation layer is linked to which transcription layer.',
    get_unsaved_drafts: 'Unsaved unit and translation drafts currently visible.',
    list_speakers: 'Speakers in the current workspace, with ids and names.',
    list_notes: 'Note count and category histogram for the visible context.',
    list_notes_detail: 'Recent notes tied to units in scope. Optional limit, scope, and category.',
    get_visible_timeline_state:
      'Visible timeline: media, layers, selection, zoom, and speaker filter.',
    get_speaker_breakdown: 'Per-speaker row counts for a scope.',
    get_project_stats: 'Project-wide counts, including how many units exist.',
    get_waveform_analysis: 'Current-track waveform quality. Gaps are silence, not unit totals.',
    get_acoustic_summary: 'Acoustic summary for the current selection.',
    find_incomplete_units: 'Units that are not yet verified. Optional limit.',
    diagnose_quality: 'Missing text, missing speaker, and gap counts.',
    suggest_next_action: 'Ranked next steps from the current project state.',
  };
  const specs: Record<string, PilotToolSpec> = {};
  for (const name of RUNTIME_V2_LOCAL_READ_TOOLS) {
    specs[name] = {
      description: descriptions[name],
      inputSchema: objectSchema({
        unitId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        scope: { type: 'string' },
        layerType: { type: 'string' },
        category: { type: 'string' },
      }),
    };
  }
  return specs;
}

export function externalMcpToolSpecs(
  tools: ReadonlyArray<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
): Record<string, PilotToolSpec> {
  const specs: Record<string, PilotToolSpec> = {};
  for (const tool of tools) {
    specs[tool.name] = {
      description: tool.description,
      inputSchema: jsonSchema(tool.inputSchema as Record<string, unknown>),
    };
  }
  return specs;
}

export function corpusAnalysisToolSpecs(): Record<string, PilotToolSpec> {
  return {
    concordance_kwic: {
      description:
        'Morpheme hits in the current document. Each hit has morphemeId and unitId. Cite morphemeId.',
      inputSchema: objectSchema({
        gloss: { type: 'string' },
        form: { type: 'string' },
        limit: { type: 'number' },
      }),
    },
    query_morpheme_paradigm: {
      description:
        'Adjacent gloss pairs for one part of speech. Cite examples[].morphemeId, not the pair itself.',
      inputSchema: objectSchema({ pos: { type: 'string' } }),
    },
    find_counterexamples: {
      description:
        'Units that fail a gloss hypothesis. Cite counterexampleUnitIds entries, which are unit ids.',
      inputSchema: objectSchema({
        gloss: { type: 'string' },
        pos: { type: 'string' },
        expect: { type: 'string', enum: ['present', 'absent'] },
        limit: { type: 'number' },
      }),
    },
  };
}

/** What the model reads on the next step. Drops local read-model metadata. */
export function corpusToolMessage(result: unknown): string {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return JSON.stringify(result);
  const { _readModel: _dropped, ...rest } = result as Record<string, unknown>;
  return JSON.stringify(rest);
}
