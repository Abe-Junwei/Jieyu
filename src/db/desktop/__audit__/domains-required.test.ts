import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { openProject } from '../openProject';
import { createDefinition } from '../customFields';
import { createConversation } from '../conversations';
import { appendMessage } from '../messages';
import { createContentNote } from '../notes';
import { ensureProjectIdentity } from '../projectIdentity';
it('rejects creating a conversation without its required custom field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-required-'));
  const p = openProject(dir);
  try {
    createDefinition(p.db, {
      targetType: 'conversation',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    expect(() => createConversation(p.db, { title: 'empty required' })).toThrow();
  } finally {
    p.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('rejects appending a message without its required custom field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-required-'));
  const p = openProject(dir);
  try {
    const c = createConversation(p.db, { title: 'c' });
    createDefinition(p.db, {
      targetType: 'message',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    expect(() =>
      appendMessage(p.db, { conversationId: c.id, role: 'user', body: 'empty required' }),
    ).toThrow();
  } finally {
    p.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it('rejects creating a note without its required custom field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-required-'));
  const p = openProject(dir);
  try {
    ensureProjectIdentity(p.db, dir);
    createDefinition(p.db, {
      targetType: 'note',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    expect(() =>
      createContentNote(p.db, { anchor: { kind: 'project' }, content: { und: 'empty required' } }),
    ).toThrow();
  } finally {
    p.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
