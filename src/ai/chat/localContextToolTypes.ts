export type LocalContextToolName =
  | 'get_current_selection'
  | 'list_layers'
  | 'list_layer_links'
  | 'get_unsaved_drafts'
  | 'list_speakers'
  | 'list_notes'
  | 'list_notes_detail'
  | 'get_visible_timeline_state'
  | 'get_speaker_breakdown'
  | 'get_project_stats'
  | 'get_waveform_analysis'
  | 'get_acoustic_summary'
  | 'find_incomplete_units'
  | 'diagnose_quality'
  | 'batch_apply'
  | 'suggest_next_action'
  | 'list_units'
  | 'search_units'
  | 'get_unit_detail'
  | 'get_unit_linguistic_memory';

export interface LocalContextToolCall {
  name: LocalContextToolName;
  arguments: Record<string, unknown>;
}

export interface LocalContextToolResult {
  ok: boolean;
  name: LocalContextToolName;
  result: unknown;
  error?: string;
}

export interface LocalToolExecutionTraceOptions {
  traceId?: string;
  step?: number;
}
