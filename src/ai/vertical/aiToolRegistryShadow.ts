import type { ZodTypeAny } from 'zod';

import type { AiChatToolName } from '../chat/chatDomain.types';
import { toolArgumentSchemas } from '../chat/toolCallSchemas';
import { AI_TOOL_POLICY_MATRIX, type AiToolPolicyEntry } from '../policy/aiToolPolicyMatrix';
import { isWriteLikeToolCall } from '../policy/resolveExecutionPolicy';

type AiToolShadowWriteMode = 'read_only' | 'write_like' | 'propose_only';

export interface AiToolRegistryShadowEntry {
  toolName: AiChatToolName;
  schema: ZodTypeAny;
  policy: AiToolPolicyEntry;
  writeMode: AiToolShadowWriteMode;
}

export interface AiToolRegistryShadowParityReport {
  ok: boolean;
  policyOnlyTools: string[];
  schemaOnlyTools: string[];
}

const POLICY_TOOL_NAMES = Object.keys(AI_TOOL_POLICY_MATRIX) as AiChatToolName[];
const SCHEMA_TOOL_NAME_SET = new Set(Object.keys(toolArgumentSchemas));

function resolveWriteMode(toolName: AiChatToolName): AiToolShadowWriteMode {
  if (toolName === 'propose_changes') return 'propose_only';
  return isWriteLikeToolCall({ name: toolName, arguments: {} }) ? 'write_like' : 'read_only';
}

export const AI_TOOL_REGISTRY_SHADOW: Record<AiChatToolName, AiToolRegistryShadowEntry> = POLICY_TOOL_NAMES.reduce(
  (acc, toolName) => {
    const schema = toolArgumentSchemas[toolName as keyof typeof toolArgumentSchemas];
    if (!schema) {
      throw new Error(`Missing tool schema for ${toolName}`);
    }
    acc[toolName] = {
      toolName,
      schema,
      policy: AI_TOOL_POLICY_MATRIX[toolName],
      writeMode: resolveWriteMode(toolName),
    };
    return acc;
  },
  {} as Record<AiChatToolName, AiToolRegistryShadowEntry>,
);

export function getAiToolRegistryShadowEntry(toolName: AiChatToolName): AiToolRegistryShadowEntry {
  return AI_TOOL_REGISTRY_SHADOW[toolName];
}

export function listAiToolRegistryShadowEntries(): ReadonlyArray<AiToolRegistryShadowEntry> {
  return Object.values(AI_TOOL_REGISTRY_SHADOW);
}

export function getAiToolRegistryShadowParityReport(): AiToolRegistryShadowParityReport {
  const policyOnlyTools = POLICY_TOOL_NAMES.filter((toolName) => !SCHEMA_TOOL_NAME_SET.has(toolName));
  const schemaOnlyTools = Object.keys(toolArgumentSchemas).filter((toolName) => !(toolName in AI_TOOL_POLICY_MATRIX));
  return {
    ok: policyOnlyTools.length === 0 && schemaOnlyTools.length === 0,
    policyOnlyTools,
    schemaOnlyTools,
  };
}

export function assertAiToolRegistryShadowParity(): void {
  const report = getAiToolRegistryShadowParityReport();
  if (!report.ok) {
    throw new Error(
      `AiToolRegistry shadow parity mismatch: policyOnly=[${report.policyOnlyTools.join(',')}], schemaOnly=[${report.schemaOnlyTools.join(',')}]`,
    );
  }
}

