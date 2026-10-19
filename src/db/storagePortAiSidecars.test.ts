import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { storagePort } from './storagePort';
import type { AgentArtifactDoc, AuditLogDocType, McpToolCallAuditDoc } from './types';

const NOW = '2026-10-18T00:00:00.000Z';

describe('storage port AI sidecar writes', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('writes an MCP tool-call audit and reads the same row back', async () => {
    const doc: McpToolCallAuditDoc = {
      id: 'mcp_aud_1',
      schemaVersion: 1,
      timestamp: NOW,
      jsonRpcId: 7,
      toolName: 'jieyu_list_segments',
      argumentsJson: '{"limit":10}',
      runtimeContextJson: '{}',
      outcome: 'success',
      durationMs: 12,
    };
    await storagePort().insertMcpToolCallAudit(doc);
    await expect(db.mcp_tool_call_audits.get('mcp_aud_1')).resolves.toMatchObject({
      toolName: 'jieyu_list_segments',
      outcome: 'success',
    });
  });

  it('saves an agent artifact and its audit row together', async () => {
    const doc: AgentArtifactDoc = {
      id: 'art_1',
      schemaVersion: 0,
      kind: 'source_set_snapshot',
      uri: 'jieyu://source-set/set_1',
      title: 'Set 1',
      mimeType: 'application/json',
      bodyJson: '{}',
      createdAt: NOW,
    };
    const audit: AuditLogDocType = {
      id: 'aud_art_1',
      collection: 'agent_artifacts',
      documentId: 'art_1',
      action: 'create',
      field: 'agent_artifact',
      newValue: doc.uri,
      source: 'system',
      timestamp: NOW,
    };
    await expect(storagePort().saveAgentArtifact(doc, audit)).resolves.toMatchObject({
      id: 'art_1',
      uri: doc.uri,
    });
    await expect(storagePort().readAgentArtifact('art_1')).resolves.toMatchObject({
      title: 'Set 1',
    });
    await expect(db.audit_logs.get('aud_art_1')).resolves.toMatchObject({ documentId: 'art_1' });
    await expect(storagePort().readAgentArtifact(' ')).resolves.toBeUndefined();
  });
});
