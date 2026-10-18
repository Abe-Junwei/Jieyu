import { getDb } from './engine';
import { validateMcpToolCallAuditDoc } from './schemas';
import { StorageReadbackError } from './storageReadbackError';
import type { McpToolCallAuditDoc } from './types';

export async function insertMcpToolCallAudit(doc: McpToolCallAuditDoc): Promise<void> {
  const id = doc.id.trim();
  if (id.length === 0) throw new StorageReadbackError('insertMcpToolCallAudit');
  const row: McpToolCallAuditDoc = { ...doc, id };
  validateMcpToolCallAuditDoc(row);
  const database = await getDb();
  await database.dexie.mcp_tool_call_audits.put(row);
  const stored = await database.dexie.mcp_tool_call_audits.get(id);
  if (
    !stored ||
    stored.id !== id ||
    stored.toolName !== row.toolName ||
    stored.timestamp !== row.timestamp
  ) {
    throw new StorageReadbackError('insertMcpToolCallAudit');
  }
}
