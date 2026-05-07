// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { auditDocToExportRow, auditDocsToNdjson } from './auditExportAdapter';

function makeAuditDoc(overrides: Partial<Parameters<typeof auditDocToExportRow>[0]> = {}): Parameters<typeof auditDocToExportRow>[0] {
  return {
    id: 'audit_001',
    collection: 'ai_messages',
    documentId: 'msg-001',
    action: 'update',
    field: 'ai_background_memory_extraction',
    oldValue: 'pending',
    newValue: 'completed',
    source: 'ai',
    timestamp: '2026-05-06T12:00:00.000Z',
    requestId: 'req-001',
    metadataJson: '{"schemaVersion":1}',
    ...overrides,
  };
}

describe('auditDocToExportRow', () => {
  it('maps full doc to export row', () => {
    const row = auditDocToExportRow(makeAuditDoc());
    expect(row.id).toBe('audit_001');
    expect(row.collection).toBe('ai_messages');
    expect(row.field).toBe('ai_background_memory_extraction');
    expect(row.requestId).toBe('req-001');
    expect(row.metadataJson).toBe('{"schemaVersion":1}');
  });

  it('omits undefined optional fields', () => {
    const row = auditDocToExportRow(makeAuditDoc({ field: undefined as unknown as string, requestId: undefined as unknown as string, metadataJson: undefined as unknown as string }));
    expect(row).not.toHaveProperty('field');
    expect(row).not.toHaveProperty('requestId');
    expect(row).not.toHaveProperty('metadataJson');
    expect(row.id).toBe('audit_001');
  });
});

describe('auditDocsToNdjson', () => {
  it('returns empty string for empty array', () => {
    expect(auditDocsToNdjson([])).toBe('');
  });

  it('produces valid ndjson with trailing newline', () => {
    const ndjson = auditDocsToNdjson([
      makeAuditDoc({ id: 'audit_001', requestId: 'req-001' }),
      makeAuditDoc({ id: 'audit_002', requestId: 'req-002' }),
    ]);
    const lines = ndjson.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).id).toBe('audit_001');
    expect(JSON.parse(lines[1]!).id).toBe('audit_002');
    expect(ndjson.endsWith('\n')).toBe(true);
  });
});
