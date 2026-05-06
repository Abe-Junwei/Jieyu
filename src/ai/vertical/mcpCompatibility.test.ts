import { describe, expect, it } from 'vitest';
import { listAiToolRegistryShadowEntries } from './aiToolRegistryShadow';
import { toMcpToolSchema } from './mcpCompatibility';

describe('mcpCompatibility', () => {
  it('converts every shadow entry to a valid MCP Tool Schema', () => {
    const entries = listAiToolRegistryShadowEntries();
    for (const entry of entries) {
      const mcp = toMcpToolSchema(entry);
      expect(typeof mcp.name).toBe('string');
      expect(mcp.name).toBe(entry.toolName);
      expect(typeof mcp.inputSchema).toBe('object');
      const hasSchemaShape = ['type', 'properties', 'anyOf', 'allOf', 'oneOf', '$ref', '$schema'].some(
        (k) => k in mcp.inputSchema,
      );
      expect(hasSchemaShape).toBe(true);
    }
  });
});
