import type { AiChatToolName } from '../chat/chatDomain.types';

export type AiToolRiskTier = 'low' | 'medium' | 'high';
export type AiToolConfirmationMode = 'none' | 'pending_propose_changes' | 'host_modal';
export type AiToolTargetKind = 'none' | 'segment' | 'layer' | 'layer_link' | 'navigation' | 'project';
export type AiToolLayerLinkActionKind = 'add_host' | 'remove_host' | 'switch_preferred_host';

export interface AiToolPolicyEntry {
  toolName: AiChatToolName;
  riskTier: AiToolRiskTier;
  destructive: boolean;
  requiresExplicitTarget: boolean;
  confirmationMode: AiToolConfirmationMode;
  targetKind: AiToolTargetKind;
  auditReasonCodes: readonly string[];
  extensionCapabilityHints?: readonly string[];
}

export const AI_TOOL_POLICY_MATRIX: Record<AiChatToolName, AiToolPolicyEntry> = {
  create_transcription_segment: {
    toolName: 'create_transcription_segment',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target', 'unresolved_write_target'],
  },
  split_transcription_segment: {
    toolName: 'split_transcription_segment',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_split_position', 'missing_unit_target', 'unresolved_write_target'],
  },
  merge_transcription_segments: {
    toolName: 'merge_transcription_segments',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target', 'unresolved_write_target'],
  },
  delete_transcription_segment: {
    toolName: 'delete_transcription_segment',
    riskTier: 'high',
    destructive: true,
    requiresExplicitTarget: true,
    confirmationMode: 'host_modal',
    targetKind: 'segment',
    auditReasonCodes: ['ambiguous_target', 'unresolved_delete_segment_target', 'missing_unit_target'],
  },
  clear_translation_segment: {
    toolName: 'clear_translation_segment',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_translation_layer_target', 'unresolved_write_target'],
  },
  set_transcription_text: {
    toolName: 'set_transcription_text',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target', 'unresolved_write_target'],
  },
  set_translation_text: {
    toolName: 'set_translation_text',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_translation_layer_target', 'unresolved_write_target'],
  },
  create_transcription_layer: {
    toolName: 'create_transcription_layer',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer',
    auditReasonCodes: ['missing_language_target'],
  },
  create_translation_layer: {
    toolName: 'create_translation_layer',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer',
    auditReasonCodes: ['missing_language_target'],
  },
  delete_layer: {
    toolName: 'delete_layer',
    riskTier: 'high',
    destructive: true,
    requiresExplicitTarget: true,
    confirmationMode: 'host_modal',
    targetKind: 'layer',
    auditReasonCodes: ['ambiguous_target', 'missing_layer_target'],
  },
  link_translation_layer: {
    toolName: 'link_translation_layer',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer_link',
    auditReasonCodes: ['missing_layer_link_target'],
    extensionCapabilityHints: ['translation_layer_linking'],
  },
  unlink_translation_layer: {
    toolName: 'unlink_translation_layer',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer_link',
    auditReasonCodes: ['missing_layer_link_target'],
    extensionCapabilityHints: ['translation_layer_linking'],
  },
  add_host: {
    toolName: 'add_host',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer_link',
    auditReasonCodes: ['missing_layer_link_target'],
    extensionCapabilityHints: ['translation_layer_linking'],
  },
  remove_host: {
    toolName: 'remove_host',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer_link',
    auditReasonCodes: ['missing_layer_link_target'],
    extensionCapabilityHints: ['translation_layer_linking'],
  },
  switch_preferred_host: {
    toolName: 'switch_preferred_host',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'layer_link',
    auditReasonCodes: ['missing_layer_link_target'],
    extensionCapabilityHints: ['translation_layer_linking'],
  },
  auto_gloss_unit: {
    toolName: 'auto_gloss_unit',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  set_token_pos: {
    toolName: 'set_token_pos',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  set_token_gloss: {
    toolName: 'set_token_gloss',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  propose_changes: {
    toolName: 'propose_changes',
    riskTier: 'high',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'pending_propose_changes',
    targetKind: 'none',
    auditReasonCodes: ['invalid_proposed_changes'],
  },
  nav_to_segment: {
    toolName: 'nav_to_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: ['missing_unit_target'],
  },
  nav_to_time: {
    toolName: 'nav_to_time',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: [],
  },
  play_pause: {
    toolName: 'play_pause',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: [],
  },
  mark_segment: {
    toolName: 'mark_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: [],
  },
  delete_segment: {
    toolName: 'delete_segment',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: [],
  },
  split_at_time: {
    toolName: 'split_at_time',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: [],
  },
  merge_prev: {
    toolName: 'merge_prev',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  merge_next: {
    toolName: 'merge_next',
    riskTier: 'medium',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  undo: {
    toolName: 'undo',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'none',
    auditReasonCodes: [],
  },
  redo: {
    toolName: 'redo',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'none',
    auditReasonCodes: [],
  },
  focus_segment: {
    toolName: 'focus_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: ['missing_unit_target'],
  },
  zoom_to_segment: {
    toolName: 'zoom_to_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: ['missing_unit_target'],
  },
  toggle_notes: {
    toolName: 'toggle_notes',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: [],
  },
  search_segments: {
    toolName: 'search_segments',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'navigation',
    auditReasonCodes: [],
  },
  auto_gloss_segment: {
    toolName: 'auto_gloss_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: true,
    confirmationMode: 'none',
    targetKind: 'segment',
    auditReasonCodes: ['missing_unit_target'],
  },
  get_current_segment: {
    toolName: 'get_current_segment',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'project',
    auditReasonCodes: [],
  },
  get_project_summary: {
    toolName: 'get_project_summary',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'project',
    auditReasonCodes: [],
  },
  get_recent_history: {
    toolName: 'get_recent_history',
    riskTier: 'low',
    destructive: false,
    requiresExplicitTarget: false,
    confirmationMode: 'none',
    targetKind: 'project',
    auditReasonCodes: [],
  },
};

export function getAiToolPolicy(toolName: AiChatToolName): AiToolPolicyEntry {
  return AI_TOOL_POLICY_MATRIX[toolName];
}

export function isAiToolDestructive(toolName: AiChatToolName): boolean {
  return getAiToolPolicy(toolName).destructive;
}

export function isAiToolSegmentWriteWithExplicitTarget(toolName: AiChatToolName): boolean {
  const policy = getAiToolPolicy(toolName);
  return policy.targetKind === 'segment' && policy.requiresExplicitTarget && !policy.destructive;
}

const SEGMENT_EXECUTION_TOOL_NAMES: ReadonlyArray<AiChatToolName> = [
  'create_transcription_segment',
  'split_transcription_segment',
  'merge_transcription_segments',
  'delete_transcription_segment',
  'set_transcription_text',
  'set_translation_text',
  'clear_translation_segment',
];

const LAYER_LINK_EXECUTION_TOOL_NAMES: ReadonlyArray<AiChatToolName> = Object.values(AI_TOOL_POLICY_MATRIX)
  .filter((policy) => policy.targetKind === 'layer_link' && policy.requiresExplicitTarget)
  .map((policy) => policy.toolName);

const LAYER_LINK_EXECUTION_TOOL_NAME_SET: ReadonlySet<AiChatToolName> = new Set(LAYER_LINK_EXECUTION_TOOL_NAMES);

export function getAiToolSegmentExecutionToolNames(): ReadonlyArray<AiChatToolName> {
  return SEGMENT_EXECUTION_TOOL_NAMES;
}

export function getAiToolLayerLinkExecutionToolNames(): ReadonlyArray<AiChatToolName> {
  return LAYER_LINK_EXECUTION_TOOL_NAMES;
}

export function isAiToolSegmentExecutionWithExplicitTarget(toolName: AiChatToolName): boolean {
  const policy = getAiToolPolicy(toolName);
  return policy.targetKind === 'segment' && policy.requiresExplicitTarget;
}

export function isAiToolLayerLinkWithExplicitTarget(toolName: AiChatToolName): boolean {
  const policy = getAiToolPolicy(toolName);
  return policy.targetKind === 'layer_link' && policy.requiresExplicitTarget && LAYER_LINK_EXECUTION_TOOL_NAME_SET.has(toolName);
}

export function getAiToolLayerLinkActionKind(toolName: AiChatToolName): AiToolLayerLinkActionKind | null {
  if (!isAiToolLayerLinkWithExplicitTarget(toolName)) return null;
  if (toolName === 'switch_preferred_host') return 'switch_preferred_host';
  if (toolName === 'link_translation_layer' || toolName === 'add_host') return 'add_host';
  return 'remove_host';
}

export function isAiToolSegmentTargetMaterializationTool(toolName: AiChatToolName): boolean {
  return isAiToolSegmentExecutionWithExplicitTarget(toolName) && toolName !== 'merge_transcription_segments';
}
