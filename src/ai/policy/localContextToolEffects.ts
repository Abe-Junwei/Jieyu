import type { LocalContextToolName } from '../chat/localContextToolTypes';
import type { AiToolEffect, AiToolScopeBinding } from './aiToolPolicyMatrix';

export type LocalContextToolEffect = 'read' | 'write_preview';

export interface LocalContextToolPolicyEntry {
  effect: AiToolEffect;
  scopeBinding: AiToolScopeBinding;
}

export const LOCAL_CONTEXT_TOOL_POLICY: Record<LocalContextToolName, LocalContextToolPolicyEntry> =
  {
    get_current_selection: { effect: 'read', scopeBinding: 'current_selection' },
    list_layers: { effect: 'read', scopeBinding: 'current_project' },
    list_layer_links: { effect: 'read', scopeBinding: 'current_layer' },
    get_unsaved_drafts: { effect: 'read', scopeBinding: 'current_project' },
    list_speakers: { effect: 'read', scopeBinding: 'current_project' },
    list_notes: { effect: 'read', scopeBinding: 'current_project' },
    list_notes_detail: { effect: 'read', scopeBinding: 'current_project' },
    get_visible_timeline_state: { effect: 'read', scopeBinding: 'current_project' },
    get_speaker_breakdown: { effect: 'read', scopeBinding: 'current_project' },
    get_project_stats: { effect: 'read', scopeBinding: 'current_project' },
    get_waveform_analysis: { effect: 'read', scopeBinding: 'current_project' },
    get_acoustic_summary: { effect: 'read', scopeBinding: 'current_selection' },
    find_incomplete_units: { effect: 'read', scopeBinding: 'current_project' },
    diagnose_quality: { effect: 'read', scopeBinding: 'current_project' },
    batch_apply: { effect: 'write', scopeBinding: 'current_project' },
    suggest_next_action: { effect: 'read', scopeBinding: 'current_project' },
    list_units: { effect: 'read', scopeBinding: 'current_project' },
    search_units: { effect: 'read', scopeBinding: 'current_project' },
    get_unit_detail: { effect: 'read', scopeBinding: 'current_unit' },
    get_unit_linguistic_memory: { effect: 'read', scopeBinding: 'current_unit' },
  };

export const LOCAL_CONTEXT_TOOL_NAMES: ReadonlySet<LocalContextToolName> = new Set(
  Object.keys(LOCAL_CONTEXT_TOOL_POLICY) as LocalContextToolName[],
);

export function getLocalContextToolPolicy(name: LocalContextToolName): LocalContextToolPolicyEntry {
  return LOCAL_CONTEXT_TOOL_POLICY[name];
}

export function getLocalContextToolEffect(name: LocalContextToolName): LocalContextToolEffect {
  return LOCAL_CONTEXT_TOOL_POLICY[name].effect === 'read' ? 'read' : 'write_preview';
}

export function isReadOnlyLocalContextToolName(name: string): boolean {
  if (!(name in LOCAL_CONTEXT_TOOL_POLICY)) return false;
  return LOCAL_CONTEXT_TOOL_POLICY[name as LocalContextToolName].effect === 'read';
}
