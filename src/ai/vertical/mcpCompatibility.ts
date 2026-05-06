/**
 * PR-6: MCP Tool Schema compatibility layer.
 * Converts Jieyu AI tool definitions to MCP Tool Schema shape.
 * No runtime dependency on @modelcontextprotocol/sdk.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AiToolRegistryShadowEntry } from './aiToolRegistryShadow';

/** MCP Tool Schema shape (subset, sufficient for tools/list and tools/call). */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export function toMcpToolSchema(entry: AiToolRegistryShadowEntry): McpToolSchema {
  const jsonSchema = zodToJsonSchema(entry.schema as never, { $refStrategy: 'none' });
  return {
    name: entry.toolName,
    description: `${entry.toolName} (${entry.writeMode})`,
    inputSchema: typeof jsonSchema === 'object' && jsonSchema !== null ? jsonSchema : { type: 'object' },
  };
}
