import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DESKTOP_PROJECT_SCHEMA_SQL } from './schema';

const T = '2026-10-25T00:00:00.000Z';

type SqliteDatabase = InstanceType<typeof Database>;

function open(): SqliteDatabase {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(DESKTOP_PROJECT_SCHEMA_SQL);
  return db;
}

function constraintCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    if (code.startsWith('SQLITE_CONSTRAINT')) return code;
    throw error;
  }
  return '';
}

function seed(db: SqliteDatabase): void {
  db.prepare(
    'INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run('p', '{"zh":"项目"}', T, T);
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('m1', 'a.wav', 'aa', 'a.wav', 1, T);
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('m2', 'b.wav', 'bb', 'b.wav', 1, T);
  db.prepare('INSERT INTO speakers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    'sp',
    'A',
    T,
    T,
  );
  db.prepare(
    'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('ms1', '{"zh":"一"}', 'm1', T, T);
  db.prepare(
    'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run('ms2', '{"zh":"二"}', 'm2', T, T);
}

function layer(
  db: SqliteDatabase,
  id: string,
  manuscriptId: string,
  key: string,
  parentId: string | null = null,
): void {
  db.prepare(
    `INSERT INTO layers (
      id, manuscript_id, key, name_json, tier_type, content_type, parent_id, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, '{"zh":"转写"}', 'time-aligned', 'transcription', ?, 0, ?, ?)`,
  ).run(id, manuscriptId, key, parentId, T, T);
}

describe('desktop project schema', () => {
  it('creates the desktop project tables', () => {
    const db = open();
    const names = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    db.close();
    expect(names).toEqual([
      { name: 'conversations' },
      { name: 'language_aliases' },
      { name: 'language_catalog_history' },
      { name: 'language_display_names' },
      { name: 'languages' },
      { name: 'layers' },
      { name: 'lexemes' },
      { name: 'manuscripts' },
      { name: 'media' },
      { name: 'messages' },
      { name: 'morphemes' },
      { name: 'notes' },
      { name: 'orthographies' },
      { name: 'orthography_bridges' },
      { name: 'project' },
      { name: 'sources' },
      { name: 'speakers' },
      { name: 'token_lexeme_links' },
      { name: 'tokens' },
      { name: 'unit_texts' },
      { name: 'units' },
    ]);
  });

  it('rejects an empty project title and keeps a nonempty map', () => {
    const db = open();
    expect(
      constraintCode(() => {
        db.prepare(
          'INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
        ).run('p', '{}', T, T);
      }),
    ).toMatch(/^SQLITE_CONSTRAINT/);
    db.prepare(
      'INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run('p', '{"zh":"项目"}', T, T);
    const settings = db.prepare('SELECT settings_json FROM project WHERE id = ?').get('p') as {
      settings_json: string;
    };
    db.close();
    expect(settings.settings_json).toBe('{}');
  });

  it('rejects a bad layer enum, a duplicate key, and a parent in another manuscript', () => {
    const db = open();
    seed(db);
    layer(db, 'ly1', 'ms1', 'tx');
    expect(
      constraintCode(() => {
        db.prepare(
          `INSERT INTO layers (
          id, manuscript_id, key, name_json, tier_type, content_type, sort_order, created_at, updated_at
        ) VALUES ('ly-bad', 'ms1', 'other', '{}', 'paragraph', 'transcription', 0, ?, ?)`,
        ).run(T, T);
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(constraintCode(() => layer(db, 'ly-dup', 'ms1', 'tx'))).toBe('SQLITE_CONSTRAINT_UNIQUE');
    layer(db, 'ly2', 'ms2', 'tx');
    expect(constraintCode(() => layer(db, 'ly-cross', 'ms1', 'child', 'ly2'))).toBe(
      'SQLITE_CONSTRAINT_FOREIGNKEY',
    );
    layer(db, 'ly-child', 'ms1', 'child', 'ly1');
    db.close();
  });

  it('rejects a missing recording, a backwards interval, and a parent unit in another manuscript', () => {
    const db = open();
    seed(db);
    layer(db, 'ly1', 'ms1', 'tx');
    layer(db, 'ly2', 'ms2', 'tx');
    expect(
      constraintCode(() => {
        db.prepare(
          'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run('ms-missing', '{}', 'missing', T, T);
      }),
    ).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    const insertUnit = db.prepare(
      `INSERT INTO units (
        id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    expect(constraintCode(() => insertUnit.run('u-back', 'ly1', null, null, 2, 1, T, T))).toBe(
      'SQLITE_CONSTRAINT_CHECK',
    );
    insertUnit.run('u1', 'ly1', null, null, 0, 1, T, T);
    insertUnit.run('u2', 'ly2', 'sp', null, 0, 1, T, T);
    expect(constraintCode(() => insertUnit.run('u-cross', 'ly1', null, 'u2', 0, 1, T, T))).toBe(
      'SQLITE_CONSTRAINT_TRIGGER',
    );
    insertUnit.run('u-child', 'ly1', null, 'u1', 0, 0, T, T);
    expect(
      constraintCode(() => {
        db.prepare('UPDATE units SET analysis_graph_json = ? WHERE id = ?').run('[]', 'u1');
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(
      constraintCode(() => {
        db.prepare('UPDATE units SET analysis_generation = ? WHERE id = ?').run(-1, 'u1');
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(
      constraintCode(() => insertUnit.run('u-speaker', 'ly1', 'missing', null, 0, 1, T, T)),
    ).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    db.close();
  });

  it('rejects a non-positive literature duration and a non-array mapping history', () => {
    const db = open();
    seed(db);
    expect(
      constraintCode(() => {
        db.prepare('UPDATE manuscripts SET logical_duration_sec = 0 WHERE id = ?').run('ms1');
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(
      constraintCode(() => {
        db.prepare('UPDATE manuscripts SET time_mapping_history_json = ? WHERE id = ?').run(
          '{}',
          'ms1',
        );
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    db.close();
  });

  it('rejects a duplicate token index and an unknown note target', () => {
    const db = open();
    seed(db);
    layer(db, 'ly1', 'ms1', 'tx');
    db.prepare(
      `INSERT INTO units (
        id, layer_id, start_time, end_time, created_at, updated_at
      ) VALUES ('u1', 'ly1', 0, 1, ?, ?)`,
    ).run(T, T);
    db.prepare(
      `INSERT INTO tokens (
        id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('t1', 'u1', 0, '{"default":"a"}', '{}', T, T);
    expect(
      constraintCode(() => {
        db.prepare(
          `INSERT INTO tokens (
            id, unit_id, token_index, form_json, gloss_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run('t2', 'u1', 0, '{"default":"b"}', '{}', T, T);
      }),
    ).toBe('SQLITE_CONSTRAINT_UNIQUE');
    expect(
      constraintCode(() => {
        db.prepare(
          'INSERT INTO notes (id, target_type, target_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run('n1', 'manuscript', 'ms1', 'x', T, T);
      }),
    ).toBe('SQLITE_CONSTRAINT_CHECK');
    db.close();
  });

  it('rejects an empty language code and a repeated ISO 639-3', () => {
    const db = open();
    const insert = db.prepare(
      `INSERT INTO languages (id, name_json, source_type, iso6393, created_at, updated_at)
       VALUES (?, '{"en":"Example"}', 'user-custom', ?, ?, ?)`,
    );
    expect(constraintCode(() => insert.run('l1', '', T, T))).toBe('SQLITE_CONSTRAINT_CHECK');
    insert.run('l1', 'eng', T, T);
    expect(constraintCode(() => insert.run('l2', 'eng', T, T))).toBe('SQLITE_CONSTRAINT_UNIQUE');
    db.close();
  });

  it('keeps an entry body and a resource body apart', () => {
    const db = open();
    const insert = db.prepare(
      `INSERT INTO lexemes (id, kind, entry_json, resource_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    expect(constraintCode(() => insert.run('both', 'entry', '{}', '{}', T, T))).toBe(
      'SQLITE_CONSTRAINT_CHECK',
    );
    insert.run('entry', 'entry', '{}', null, T, T);
    insert.run('resource', 'resource', null, '{}', T, T);
    expect(constraintCode(() => insert.run('resource-2', 'resource', null, '{}', T, T))).toBe(
      'SQLITE_CONSTRAINT_UNIQUE',
    );
    db.close();
  });
});
