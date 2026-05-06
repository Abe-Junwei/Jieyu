import { describe, expect, it } from 'vitest';
import {
  assertAiToolRegistryShadowParity,
  getAiToolRegistryShadowParityReport,
  listAiToolRegistryShadowEntries,
  toMcpToolSchema,
} from './aiToolRegistryShadow';

describe('aiToolRegistryShadow', () => {
  it('parity report has no orphan tools (policy vs schema)', () => {
    const report = getAiToolRegistryShadowParityReport();
    expect(report.ok).toBe(true);
    expect(report.policyOnlyTools).toEqual([]);
    expect(report.schemaOnlyTools).toEqual([]);
  });

  it('assertParity does not throw', () => {
    expect(() => assertAiToolRegistryShadowParity()).not.toThrow();
  });

  it('every shadow entry converts to a valid MCP Tool Schema', () => {
    const entries = listAiToolRegistryShadowEntries();
    for (const entry of entries) {
      const mcp = toMcpToolSchema(entry);
      expect(typeof mcp.name).toBe('string');
      expect(mcp.name).toBe(entry.toolName);
      expect(typeof mcp.inputSchema).toBe('object');
      // JSON Schema may use type, properties, anyOf, allOf, $schema, etc.
      const hasSchemaShape = ['type', 'properties', 'anyOf', 'allOf', 'oneOf', '$ref', '$schema'].some(
        (k) => k in mcp.inputSchema,
      );
      expect(hasSchemaShape).toBe(true);
    }
  });
});
