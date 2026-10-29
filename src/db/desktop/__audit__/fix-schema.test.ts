import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { expect, it } from 'vitest';
import { openProject } from '../openProject';
import { exportDesktopJyt, importDesktopJyt } from '../projectExchange';
import { createDefinition } from '../customFields';
import { createConversation } from '../conversations';

it('rejects a second transcription row for the same unit in a JYT', () => {
  const source = mkdtempSync(join(tmpdir(), 'fix-schema-source-'));
  const dest = mkdtempSync(join(tmpdir(), 'fix-schema-dest-'));
  const project = openProject(source);
  try {
    project.db
      .prepare(
        'INSERT INTO media(id,relpath,sha256,filename,duration,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('m', 'a.wav', 'a', 'a.wav', 1, '2026-10-29');
    const manuscript = project.manuscripts.create({ title: { und: 'm' }, mediaId: 'm' });
    const layer = project.layers.create({
      manuscriptId: manuscript.id,
      key: 'tx',
      name: { und: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    project.units.create({ layerId: layer.id, startTime: 0, endTime: 1, text: 'first' });
    const files = unzipSync(exportDesktopJyt(project.db));
    const payload = JSON.parse(strFromU8(files['data/project.json']!)) as {
      tables: { unit_texts: Record<string, unknown>[] };
    };
    const first = payload.tables.unit_texts[0];
    if (first === undefined) throw new Error('unit text missing');
    payload.tables.unit_texts.push({ ...first, id: 'duplicate-role', body: 'second' });
    files['data/project.json'] = strToU8(JSON.stringify(payload));
    expect(() => importDesktopJyt(dest, zipSync(files))).toThrow('unit text role is duplicated');
  } finally {
    project.close();
    rmSync(source, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});

it('stores supplied values for a required conversation field', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fix-required-'));
  const project = openProject(dir);
  try {
    const definition = createDefinition(project.db, {
      targetType: 'conversation',
      name: { und: 'required' },
      fieldType: 'text',
      required: true,
    });
    expect(() => createConversation(project.db, { title: 'empty' })).toThrow(
      'conversation is missing a required field',
    );
    const created = createConversation(project.db, {
      title: 'filled',
      fieldValues: { [definition.id]: 'kept' },
    });
    expect(created.title).toBe('filled');
  } finally {
    project.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
