/**
 * VoiceActionTools - tool schemas for LLM-driven UI control.
 *
 * Defines the tool interface used by the Voice Agent to invoke UI actions via AI.
 * Unlike IntentRouter regex rules, these tools are used after intent resolution
 * when the model needs to trigger more complex structured actions.
 *
 * Tools are dispatched through VoiceAgentService.executeTool().
 */

// ── Tool Names ───────────────────────────────────────────────────────────────

/** Voice Action Tool names callable by the LLM. */
export type VoiceActionToolName =
  // ── Navigation ──────────────────────────────────────────────────────────
  | 'nav_to_segment'
  | 'nav_to_time'
  | 'play_pause'
  // ── Segment editing ──────────────────────────────────────────────────────
  | 'mark_segment'
  | 'delete_segment'
  | 'split_at_time'
  | 'merge_prev'
  | 'merge_next'
  // ── Undo / redo ──────────────────────────────────────────────────────────
  | 'undo'
  | 'redo'
  // ── View ────────────────────────────────────────────────────────────────
  | 'focus_segment'
  | 'zoom_to_segment'
  | 'toggle_notes'
  | 'search_segments'
  // ── AI assistance ───────────────────────────────────────────────────────
  | 'auto_gloss_segment'
  // ── Context query ────────────────────────────────────────────────────────
  | 'get_current_segment'
  | 'get_project_summary'
  | 'get_recent_history';
