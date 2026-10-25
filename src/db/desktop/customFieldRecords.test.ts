import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import {
  createDefinition,
  locateCustomFieldValues,
  missingFields,
  readFieldValue,
  setFieldValue,
} from './customFields';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-custom-records-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('record custom fields', () => {
  it('reads and writes source, note, conversation, and message values', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
    project.db
      .prepare(
        `INSERT INTO sources (id, media_id, label, external_id, created_at, updated_at)
         VALUES ('s1', 'm1', 'tape', 'ext', ?, ?)`,
      )
      .run(T, T);
    project.db
      .prepare(
        `INSERT INTO notes (id, target_type, target_id, body, created_at, updated_at)
         VALUES ('n1', 'unit', 'u1', 'old', ?, ?)`,
      )
      .run(T, T);
    project.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at) VALUES ('c1', 'talk', ?, ?)`,
      )
      .run(T, T);
    project.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, body, created_at)
         VALUES ('g1', 'c1', 'user', 'hello', ?)`,
      )
      .run(T);
    const hosts = [
      ['source', 's1'],
      ['note', 'n1'],
      ['conversation', 'c1'],
      ['message', 'g1'],
    ] as const;
    const definitions = hosts.map(([targetType]) =>
      createDefinition(project.db, {
        targetType,
        name: { zh: targetType },
        fieldType: 'text',
        required: true,
        defaultValue: 'hello',
      }),
    );
    for (const [index, [targetType, targetId]] of hosts.entries()) {
      const definition = definitions[index];
      if (definition === undefined) throw new Error('definition is missing');
      expect(readFieldValue(project.db, definition.id, targetType, targetId)).toBeNull();
      expect(missingFields(project.db, targetType, targetId)).toEqual([definition.id]);
    }
    project.db.prepare(`UPDATE notes SET body = 'next' WHERE id = 'n1'`).run();
    project.db.prepare(`UPDATE sources SET label = 'reel' WHERE id = 's1'`).run();
    project.db.prepare(`UPDATE conversations SET title = 'later' WHERE id = 'c1'`).run();
    project.db.prepare(`UPDATE messages SET body = 'again' WHERE id = 'g1'`).run();
    expect(missingFields(project.db, 'note', 'n1')).toEqual([definitions[1]?.id]);
    const sourceField = definitions[0];
    const noteField = definitions[1];
    if (sourceField === undefined || noteField === undefined)
      throw new Error('definition is missing');
    setFieldValue(project.db, {
      definitionId: sourceField.id,
      targetType: 'source',
      targetId: 's1',
      value: 'kept',
      expectedRevision: 1,
    });
    const ref = createDefinition(project.db, {
      targetType: 'note',
      name: { zh: '指' },
      fieldType: 'ref',
      targetTypes: ['source', 'note', 'conversation', 'message'],
      cardinality: 'one',
    });
    for (const [targetType, targetId] of hosts) {
      setFieldValue(project.db, {
        definitionId: ref.id,
        targetType: 'note',
        targetId: 'n1',
        value: { targetType, targetId },
        expectedRevision: 1,
      });
    }
    expect(() =>
      setFieldValue(project.db, {
        definitionId: ref.id,
        targetType: 'note',
        targetId: 'n1',
        value: { targetType: 'message', targetId: 'missing' },
        expectedRevision: 1,
      }),
    ).toThrow('custom field value is invalid');
    expect(readFieldValue(project.db, ref.id, 'note', 'n1')).toEqual({
      targetType: 'message',
      targetId: 'g1',
    });
    expect(() =>
      setFieldValue(
        project.db,
        {
          definitionId: noteField.id,
          targetType: 'note',
          targetId: 'n1',
          value: 'boom',
          expectedRevision: 1,
        },
        () => {
          throw new Error('fail write');
        },
      ),
    ).toThrow('fail write');
    expect(readFieldValue(project.db, noteField.id, 'note', 'n1')).toBeNull();
    expect(() => missingFields(project.db, 'source', 'missing')).toThrow('source is missing');
    project.close();

    const session = openDesktopSession(dir, [dir]);
    expect(
      callDesktopSession(session.sessionId, 'customFields.setValue', {
        definitionId: noteField.id,
        targetType: 'note',
        targetId: 'n1',
        value: 'kept',
        expectedRevision: 1,
      }),
    ).toMatchObject({ value: 'kept' });
    resetDesktopSessions();
    const reopened = openProject(dir);
    expect(readFieldValue(reopened.db, sourceField.id, 'source', 's1')).toBe('kept');
    expect(readFieldValue(reopened.db, noteField.id, 'note', 'n1')).toBe('kept');
    expect(locateCustomFieldValues(reopened.db, sourceField.id)).toEqual([
      { targetType: 'source', targetId: 's1' },
    ]);
    const note = reopened.db.prepare(`SELECT body FROM notes WHERE id = 'n1'`).get() as {
      body: string;
    };
    expect(note.body).toBe('next');
    reopened.close();
  });
});
