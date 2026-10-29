import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { openProject } from '../openProject';
import { queryCorpus } from '../corpusQuery';
it('paginates broad form query without binding every matching unit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-corpus-'));
  const p = openProject(dir);
  try {
    const t = '2026-10-29';
    p.db
      .prepare(
        'INSERT INTO media(id,relpath,sha256,filename,duration,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run('m', 'a.wav', 'a', 'a.wav', 40000, t);
    const m = p.manuscripts.create({ title: { und: 'm' }, mediaId: 'm' });
    const l = p.layers.create({
      manuscriptId: m.id,
      key: 'tx',
      name: { und: 'tx' },
      tierType: 'time-aligned',
      contentType: 'transcription',
    });
    const u = p.db.prepare(
      'INSERT INTO units(id,layer_id,start_time,end_time,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    );
    const x = p.db.prepare(
      "INSERT INTO unit_texts(id,unit_id,role,body,updated_at) VALUES(?,?,'transcription','ka',?)",
    );
    const k = p.db.prepare(
      "INSERT INTO tokens(id,unit_id,token_index,form_json,gloss_json,created_at,updated_at) VALUES(?,?,0,?, '{}',?,?)",
    );
    p.db.transaction(() => {
      for (let i = 0; i < 33000; i++) {
        const id = `u${i}`;
        u.run(id, l.id, i, i + 1, t, t);
        x.run(`x${i}`, id, t);
        k.run(`k${i}`, id, JSON.stringify({ default: 'ka' }), t, t);
      }
    })();
    expect(() =>
      queryCorpus(p.db, {
        manuscriptId: null,
        text: null,
        form: 'ka',
        gloss: null,
        pos: null,
        lexemeId: null,
        senseId: null,
        limit: 20,
        cursor: null,
      }),
    ).not.toThrow();
  } finally {
    p.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
