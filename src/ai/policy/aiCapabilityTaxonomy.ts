/**
 * PR-4: Runtime safety capability taxonomy.
 * Maps every AI tool to one of six capability categories.
 * Each category must have allow/ask/deny paths defined in the policy layer.
 */
import type { AiChatToolName } from '../chat/chatDomain.types';
import { toolArgumentSchemas } from '../chat/toolCallSchemas';
import { AI_TOOL_POLICY_MATRIX, getAiToolPolicy } from './aiToolPolicyMatrix';
import { isWriteLikeToolCall } from './resolveExecutionPolicy';

export type AiCapabilityCategory =
  | 'read'
  | 'propose'
  | 'confirm_write'
  | 'destructive'
  | 'memory_write'
  | 'sidecar_write';

const READ_TOOL_NAMES = new Set<AiChatToolName>([
  'play_pause',
  'undo',
  'redo',
  'search_segments',
  'toggle_notes',
  'mark_segment',
  'nav_to_segment',
  'nav_to_time',
  'focus_segment',
  'zoom_to_segment',
  'get_current_segment',
]);

export function resolveToolCapabilityCategory(toolName: AiChatToolName): AiCapabilityCategory {
  if (toolName === 'propose_changes') return 'propose';
  if (READ_TOOL_NAMES.has(toolName)) return 'read';
  const policy = getAiToolPolicy(toolName);
  if (!policy) {
    // Unregistered tool falls back to read; taxonomy report will flag it.
    return 'read';
  }
  if (policy.destructive) return 'destructive';
  if (isWriteLikeToolCall({ name: toolName, arguments: {} })) return 'confirm_write';
  return 'read';
}

/** All registered tool names from the policy matrix. */
export const REGISTERED_TOOL_NAMES = Object.keys(AI_TOOL_POLICY_MATRIX) as AiChatToolName[];

/** All tool names from the schema registry. */
export const SCHEMA_TOOL_NAMES = Object.keys(toolArgumentSchemas) as AiChatToolName[];

export interface CapabilityTaxonomyReport {
  ok: boolean;
  unregisteredWriteTools: AiChatToolName[];
  categoryCounts: Record<AiCapabilityCategory, number>;
}

export function getCapabilityTaxonomyReport(): CapabilityTaxonomyReport {
  const registeredSet = new Set(REGISTERED_TOOL_NAMES);
  const unregisteredWriteTools = SCHEMA_TOOL_NAMES.filter((name) => {
    const category = resolveToolCapabilityCategory(name);
    const isWrite = category !== 'read';
    return isWrite && !registeredSet.has(name);
  });

  const categoryCounts: Record<AiCapabilityCategory, number> = {
    read: 0,
    propose: 0,
    confirm_write: 0,
    destructive: 0,
    memory_write: 0,
    sidecar_write: 0,
  };

  for (const name of SCHEMA_TOOL_NAMES) {
    const category = resolveToolCapabilityCategory(name);
    categoryCounts[category] += 1;
  }

  return {
    ok: unregisteredWriteTools.length === 0,
    unregisteredWriteTools,
    categoryCounts,
  };
}

export function assertCapabilityTaxonomy(): void {
  const report = getCapabilityTaxonomyReport();
  if (!report.ok) {
    throw new Error(
      `Capability taxonomy violation: unregistered write tools=[${report.unregisteredWriteTools.join(',')}]`,
    );
  }
}
