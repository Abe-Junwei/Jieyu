// @vitest-environment jsdom
/**
 * R-LIFT-XPROJ（代码审查 JY-07 的移植）：项目 A 导出的 LIFT 导入项目 B 时，作为 B 的副本导入，
 * 不失败、不留半截写入、A 不受影响。
 * R-LIFT-XPROJ (ported from code review JY-07): a LIFT file exported from project A imports into
 * project B as copies: no failure, no partial write, A untouched.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type LexemeEntryDoc } from '../db';
import { DMLEX_SUBSENSE } from '../db/dmlexTypes';
import { LinguisticService } from '../services/LinguisticService';
import { defaultLiftImportDeps, importLexemesFromLiftXml } from './lexiconLiftImport';
import { serializeLexemesToLift } from './lexiconLiftExport';

const NOW = '2026-10-09T00:00:00.000Z';

// fox 在前、owl 在后：后面的词条不能删掉前面词条的 subsense 关系
// fox first, owl after it: a later entry must not drop an earlier entry's subsense relations
const foxXml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu">
  <entry id="lex-fox">
    <lexical-unit><form lang="eng"><text>fox</text></form></lexical-unit>
    <sense id="sense-fox">
      <gloss lang="en"><text>vulpine</text></gloss>
      <subsense id="sense-kit"><gloss lang="en"><text>young fox</text></gloss></subsense>
    </sense>
  </entry>
  <entry id="lex-owl">
    <lexical-unit><form lang="eng"><text>owl</text></form></lexical-unit>
  </entry>
</lift>`;

const henXml = `<?xml version="1.0" encoding="UTF-8"?>
<lift version="0.13" producer="Jieyu">
  <entry id="lex-hen">
    <lexical-unit><form lang="eng"><text>hen</text></form></lexical-unit>
    <sense id="sense-hen">
      <gloss lang="en"><text>bird</text></gloss>
      <subsense id="sense-chick"><gloss lang="en"><text>young hen</text></gloss></subsense>
    </sense>
  </entry>
</lift>`;

function entry(id: string, textId: string, headword: string): LexemeEntryDoc {
  return { id, textId, entry: { id, headword }, createdAt: NOW, updatedAt: NOW };
}

async function rowsOf(textId: string): Promise<LexemeEntryDoc[]> {
  return (await LinguisticService.lexemes.list(textId)).sort((a, b) => a.id.localeCompare(b.id));
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  for (const id of ['proj-A', 'proj-B']) {
    await db.texts.put({ id, title: { default: id }, createdAt: NOW, updatedAt: NOW });
  }
});

describe('R-LIFT-XPROJ: LIFT exported from project A imported into project B', () => {
  it('imports as copies in B (no failure, no partial write, A untouched)', async () => {
    await LinguisticService.lexemes.save(entry('lex-new-only-in-file', 'proj-A', 'ŋa˧˥'));
    await LinguisticService.lexemes.save(entry('lex-a', 'proj-A', 'tʰa˥'));
    const xml = serializeLexemesToLift(await LinguisticService.lexemes.list('proj-A'));
    // 文件里有一条 A 已经没有的词条 | The file has an entry A no longer has
    await db.lexemes.delete('lex-new-only-in-file');
    const beforeA = await rowsOf('proj-A');

    const result = await importLexemesFromLiftXml(xml, 'proj-B');

    expect(result.ok).toBe(true);
    const inB = await rowsOf('proj-B');
    expect(inB.map((row) => row.entry.headword).sort()).toEqual(['tʰa˥', 'ŋa˧˥'].sort());
    // A 仍占用 lex-a，所以 B 里的副本拿到新 id；A 没有的那条保留原 id
    // A still owns lex-a, so B's copy gets a new id; the entry A no longer has keeps its id
    expect(inB.map((row) => row.id)).toContain('lex-new-only-in-file');
    expect(inB.map((row) => row.id)).not.toContain('lex-a');
    for (const row of inB) expect(row.entry.id).toBe(row.id);
    expect(await rowsOf('proj-A')).toEqual(beforeA);
    if (result.ok) expect(result.losses).toContainEqual({ code: 'regenerated-id', count: 1 });
  });

  it('rewrites sense ids and DMLex relation refs of a regenerated entry', async () => {
    expect((await importLexemesFromLiftXml(foxXml, 'proj-A')).ok).toBe(true);
    const result = await importLexemesFromLiftXml(foxXml, 'proj-B');
    expect(result.ok).toBe(true);

    const fox = (await rowsOf('proj-B')).find((row) => row.entry.headword === 'fox')!;
    expect(fox.id).not.toBe('lex-fox');
    const senseIds = (fox.entry.senses ?? []).map((sense) => sense.id);
    expect(senseIds).toHaveLength(2);
    expect(senseIds).not.toContain('sense-fox');
    expect(senseIds).not.toContain('sense-kit');
    const resourceB = await LinguisticService.lexemes.getResource('proj-B');
    const subsense = resourceB?.resource.relations?.find((r) => r.type === DMLEX_SUBSENSE);
    expect(subsense?.members.map((m) => m.ref)).toEqual(senseIds);
    // A 的行、义项和关系原样保留 | A's rows, senses and relations are unchanged
    const foxA = (await rowsOf('proj-A')).find((row) => row.entry.headword === 'fox')!;
    expect(foxA.id).toBe('lex-fox');
    expect((foxA.entry.senses ?? []).map((sense) => sense.id)).toEqual(['sense-fox', 'sense-kit']);
    const resourceA = await LinguisticService.lexemes.getResource('proj-A');
    expect(resourceA?.resource.relations?.find((r) => r.type === DMLEX_SUBSENSE)?.members).toEqual([
      { ref: 'sense-fox' },
      { ref: 'sense-kit' },
    ]);
  });

  it('re-importing into the same project still replaces by id (no regeneration)', async () => {
    expect((await importLexemesFromLiftXml(foxXml, 'proj-A')).ok).toBe(true);
    const again = await importLexemesFromLiftXml(foxXml, 'proj-A');
    expect(again.ok).toBe(true);
    expect((await rowsOf('proj-A')).map((row) => row.id)).toEqual(['lex-fox', 'lex-owl']);
    if (again.ok) {
      expect(again.losses).toContainEqual({ code: 'replaced-by-id', count: 2 });
      expect(again.losses.some((loss) => loss.code === 'regenerated-id')).toBe(false);
    }
  });

  it('writes nothing when a save fails half way (one transaction)', async () => {
    const base = defaultLiftImportDeps('proj-B');
    let saves = 0;
    const result = await importLexemesFromLiftXml(foxXml, 'proj-B', {
      ...base,
      save: async (doc) => {
        saves += 1;
        if (saves === 2) throw new Error('disk full');
        return base.save(doc);
      },
    });
    expect(result).toEqual({ ok: false, reason: 'save-failed' });
    expect(saves).toBe(2);
    expect((await db.lexemes.toArray()).filter((row) => row.textId === 'proj-B')).toEqual([]);
  });

  it('keeps the subsense relations of every entry in the file and of other project entries', async () => {
    expect((await importLexemesFromLiftXml(foxXml, 'proj-A')).ok).toBe(true);
    expect((await importLexemesFromLiftXml(henXml, 'proj-A')).ok).toBe(true);
    // 再次导入 fox 文件只替换 fox 的关系 | Re-importing the fox file only replaces fox's relations
    expect((await importLexemesFromLiftXml(foxXml, 'proj-A')).ok).toBe(true);

    const resource = await LinguisticService.lexemes.getResource('proj-A');
    const subsenses = (resource?.resource.relations ?? [])
      .filter((relation) => relation.type === DMLEX_SUBSENSE)
      .map((relation) => relation.members.map((member) => member.ref));
    expect(subsenses.sort()).toEqual([
      ['sense-fox', 'sense-kit'],
      ['sense-hen', 'sense-chick'],
    ]);
  });
});
