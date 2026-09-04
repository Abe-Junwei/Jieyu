import type { ZodTypeAny } from 'zod';

import type { AiChatToolName } from '../chat/chatDomain.types';
import { toolArgumentSchemas } from '../chat/toolCallSchemas';
import { AI_TOOL_POLICY_MATRIX, type AiToolPolicyEntry } from '../policy/aiToolPolicyMatrix';
import { isReadOnlyLocalContextToolName } from '../policy/localContextToolEffects';
import { isWriteLikeToolCall } from '../policy/resolveExecutionPolicy';

export type AiToolCatalogWriteMode = 'read_only' | 'write_like' | 'propose_only';
export type AiToolCatalogTrust = 'interactive' | 'background';

export interface AiToolCatalogEntry {
  toolName: AiChatToolName;
  schema: ZodTypeAny;
  policy: AiToolPolicyEntry;
  writeMode: AiToolCatalogWriteMode;
  trust: AiToolCatalogTrust;
}

export interface AiToolCatalogParityReport {
  ok: boolean;
  policyOnlyTools: string[];
  schemaOnlyTools: string[];
}

const POLICY_TOOL_NAMES = Object.keys(AI_TOOL_POLICY_MATRIX) as AiChatToolName[];
const SCHEMA_TOOL_NAME_SET = new Set(Object.keys(toolArgumentSchemas));

function resolveWriteMode(toolName: AiChatToolName): AiToolCatalogWriteMode {
  if (toolName === 'propose_changes') return 'propose_only';
  return isWriteLikeToolCall({ name: toolName, arguments: {} }) ? 'write_like' : 'read_only';
}

function resolveCatalogTrust(writeMode: AiToolCatalogWriteMode): AiToolCatalogTrust {
  return writeMode === 'read_only' ? 'background' : 'interactive';
}

export const AI_TOOL_CATALOG: Record<AiChatToolName, AiToolCatalogEntry> = POLICY_TOOL_NAMES.reduce(
  (acc, toolName) => {
    const schema = toolArgumentSchemas[toolName as keyof typeof toolArgumentSchemas];
    if (!schema) {
      throw new Error(`Missing tool schema for ${toolName}`);
    }
    const writeMode = resolveWriteMode(toolName);
    acc[toolName] = {
      toolName,
      schema,
      policy: AI_TOOL_POLICY_MATRIX[toolName],
      writeMode,
      trust: resolveCatalogTrust(writeMode),
    };
    return acc;
  },
  {} as Record<AiChatToolName, AiToolCatalogEntry>,
);

export function getAiToolCatalogEntry(toolName: AiChatToolName): AiToolCatalogEntry {
  return AI_TOOL_CATALOG[toolName];
}

export function listAiToolCatalogEntries(): ReadonlyArray<AiToolCatalogEntry> {
  return Object.values(AI_TOOL_CATALOG);
}

export function getAiToolCatalogParityReport(): AiToolCatalogParityReport {
  const policyOnlyTools = POLICY_TOOL_NAMES.filter(
    (toolName) => !SCHEMA_TOOL_NAME_SET.has(toolName),
  );
  const schemaOnlyTools = Object.keys(toolArgumentSchemas).filter(
    (toolName) => !(toolName in AI_TOOL_POLICY_MATRIX),
  );
  return {
    ok: policyOnlyTools.length === 0 && schemaOnlyTools.length === 0,
    policyOnlyTools,
    schemaOnlyTools,
  };
}

export function assertAiToolCatalogParity(): void {
  const report = getAiToolCatalogParityReport();
  if (!report.ok) {
    throw new Error(
      `AiToolCatalog parity mismatch: policyOnly=[${report.policyOnlyTools.join(',')}], schemaOnly=[${report.schemaOnlyTools.join(',')}]`,
    );
  }
}

export class BackgroundCatalogTrustError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`background TaskRunner rejected interactive catalog tool: ${toolName}`);
    this.name = 'BackgroundCatalogTrustError';
    this.toolName = toolName;
  }
}

export function resolveToolCatalogTrust(toolName: string): AiToolCatalogTrust {
  if (isReadOnlyLocalContextToolName(toolName)) return 'background';
  if (toolName in AI_TOOL_CATALOG) {
    return AI_TOOL_CATALOG[toolName as AiChatToolName].trust;
  }
  return 'interactive';
}

export function assertBackgroundCatalogTool(toolName: string): void {
  if (resolveToolCatalogTrust(toolName) !== 'background') {
    throw new BackgroundCatalogTrustError(toolName);
  }
}
