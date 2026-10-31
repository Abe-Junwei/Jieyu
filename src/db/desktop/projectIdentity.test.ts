import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefinition, readFieldValue, setFieldValue } from './customFields';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { ensureProjectIdentity, getProjectIdentity } from './projectIdentity';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-project-identity-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('project identity', () => {
  it('keeps an existing title and refuses a second row', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p1', '{"zh":"木雅"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    expect(ensureProjectIdentity(project.db, dir)).toMatchObject({
      id: 'p1',
      title: { zh: '木雅' },
    });
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p2', '{"zh":"另一"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    expect(() => getProjectIdentity(project.db)).toThrow('project is missing');
    project.close();
  });

  it('records the folder name once and reads it back after another open', () => {
    const dir = folder();
    const first = openDesktopSession(dir, [dir]);
    const opened = callDesktopSession(first.sessionId, 'project.get', {}) as {
      id: string;
      title: { und: string };
    };
    expect(opened.title.und).toBe(basename(dir));
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'project.get', {})).toMatchObject({
      id: opened.id,
      title: { und: basename(dir) },
    });
  });

  it('rolls back a new project when a required project field is missing', () => {
    const dir = folder();
    const project = openProject(dir);
    createDefinition(project.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
      defaultValue: '不要填',
    });
    expect(() => ensureProjectIdentity(project.db, dir)).toThrow(
      'project is missing a required field',
    );
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM project').get()).toEqual({ n: 0 });
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get()).toEqual({
      n: 0,
    });
    project.close();

    expect(() => openDesktopSession(dir, [dir])).toThrow('project is missing a required field');
    const again = openProject(dir);
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM project').get()).toEqual({ n: 0 });
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get()).toEqual({
      n: 0,
    });
    again.close();
  });

  it('keeps an existing project open when a required project field has no value', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p1', '{"zh":"木雅"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    createDefinition(project.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
    });
    expect(ensureProjectIdentity(project.db, dir)).toMatchObject({ id: 'p1' });
    expect(project.db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get()).toEqual({
      n: 0,
    });
    project.close();
    const session = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(session.sessionId, 'project.get', {})).toMatchObject({ id: 'p1' });
    expect(
      requireDesktopSession(session.sessionId)
        .db.prepare('SELECT COUNT(*) AS n FROM custom_field_values')
        .get(),
    ).toEqual({ n: 0 });
  });

  it('stores explicit field values while creating the project and keeps them on a later open', () => {
    const dir = folder();
    const prepared = openProject(dir);
    const field = createDefinition(prepared.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
      defaultValue: '不要填',
    });
    const created = ensureProjectIdentity(prepared.db, dir, { [field.id]: '木雅' });
    expect(readFieldValue(prepared.db, field.id, 'project', created.id)).toBe('木雅');
    const stamp = prepared.db.prepare('SELECT created_at, updated_at FROM project').get();
    prepared.close();

    const session = openDesktopSession(dir, [dir]);
    const db = requireDesktopSession(session.sessionId).db;
    expect(callDesktopSession(session.sessionId, 'project.get', {})).toMatchObject({
      id: created.id,
    });
    expect(readFieldValue(db, field.id, 'project', created.id)).toBe('木雅');
    expect(db.prepare('SELECT created_at, updated_at FROM project').get()).toEqual(stamp);
    expect(db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get()).toEqual({ n: 1 });
  });

  it('accepts the same values through the open that creates the project', () => {
    const dir = folder();
    const prepared = openProject(dir);
    const field = createDefinition(prepared.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
    });
    prepared.close();
    const session = openDesktopSession(dir, [dir], undefined, { [field.id]: '木雅' });
    const db = requireDesktopSession(session.sessionId).db;
    const identity = getProjectIdentity(db);
    expect(readFieldValue(db, field.id, 'project', identity?.id ?? '')).toBe('木雅');
  });

  it('rolls back a new project when an initial field value is invalid', () => {
    const dir = folder();
    const prepared = openProject(dir);
    const field = createDefinition(prepared.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
    });
    prepared.close();
    expect(() => openDesktopSession(dir, [dir], undefined, { [field.id]: 1 })).toThrow(
      'custom field value is invalid',
    );
    const again = openProject(dir);
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM project').get()).toEqual({ n: 0 });
    expect(again.db.prepare('SELECT COUNT(*) AS n FROM custom_field_values').get()).toEqual({
      n: 0,
    });
    again.close();
  });

  it('rejects field values for an existing project and keeps the stored value', () => {
    const dir = folder();
    const prepared = openProject(dir);
    prepared.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p1', '{"zh":"木雅"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    const field = createDefinition(prepared.db, {
      targetType: 'project',
      name: { zh: '必填' },
      fieldType: 'text',
      required: true,
    });
    setFieldValue(prepared.db, {
      definitionId: field.id,
      targetType: 'project',
      targetId: 'p1',
      value: '原值',
      expectedRevision: 1,
    });
    const stamp = prepared.db.prepare('SELECT created_at, updated_at FROM project').get();
    prepared.close();
    expect(() => openDesktopSession(dir, [dir], undefined, { [field.id]: '新值' })).toThrow(
      'project is already initialized',
    );
    const again = openProject(dir);
    expect(readFieldValue(again.db, field.id, 'project', 'p1')).toBe('原值');
    expect(again.db.prepare('SELECT created_at, updated_at FROM project').get()).toEqual(stamp);
    again.close();
  });
});
