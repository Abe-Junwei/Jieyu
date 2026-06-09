import type { LocalContextToolName } from '../chat/localContextToolTypes';

export type LocalContextToolEffect = 'read' | 'write_preview';

const LOCAL_CONTEXT_TOOL_EFFECT: Record<LocalContextToolName, LocalContextToolEffect> = {
  get_current_selection: 'read',
  list_layers: 'read',
  list_layer_links: 'read',
  get_unsaved_drafts: 'read',
  list_speakers: 'read',
  list_notes: 'read',
  list_notes_detail: 'read',
  get_visible_timeline_state: 'read',
  get_speaker_breakdown: 'read',
  get_project_stats: 'read',
  get_waveform_analysis: 'read',
  get_acoustic_summary: 'read',
  find_incomplete_units: 'read',
  diagnose_quality: 'read',
  batch_apply: 'write_preview',
  suggest_next_action: 'read',
  list_units: 'read',
  search_units: 'read',
  get_unit_detail: 'read',
  get_unit_linguistic_memory: 'read',
};

export function getLocalContextToolEffect(name: LocalContextToolName): LocalContextToolEffect {
  return LOCAL_CONTEXT_TOOL_EFFECT[name];
}

export function isReadOnlyLocalContextToolName(name: string): boolean {
  if (!(name in LOCAL_CONTEXT_TOOL_EFFECT)) return false;
  return LOCAL_CONTEXT_TOOL_EFFECT[name as LocalContextToolName] === 'read';
}
