import { describe, expect, it } from 'vitest';
import { parsePostgresProjectChangeRow } from './projectChangeRowParse';
import type { CollaborationProjectChangeRecord } from './syncTypes';

function minimalValidRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    project_id: 'p1',
    actor_id: 'a1',
    client_id: 'c1',
    client_op_id: 'op-1',
    protocol_version: 1,
    project_revision: 1,
    base_revision: 0,
    entity_type: 'layer',
    entity_id: 'e1',
    op_type: 'upsert_layer',
    source_kind: 'user',
    created_at: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('parsePostgresProjectChangeRow', () => {
  it('parses a minimal valid row', () => {
    const row = parsePostgresProjectChangeRow(minimalValidRow());
    expect(row).not.toBeNull();
    expect((row as CollaborationProjectChangeRecord).entityId).toBe('e1');
  });

  it('returns null for missing required string field', () => {
    const r = { ...minimalValidRow(), project_id: '' };
    expect(parsePostgresProjectChangeRow(r)).toBeNull();
  });

  it('returns null for invalid entity_type', () => {
    expect(parsePostgresProjectChangeRow(minimalValidRow({ entity_type: 'nope' }))).toBeNull();
  });
});
