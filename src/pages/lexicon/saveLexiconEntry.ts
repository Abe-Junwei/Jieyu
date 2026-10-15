import { LinguisticService } from '../../app/languageAssetPageAccess';
import { isLexemeEntry } from '../../app/jieyuDbPageAccess';
import { dmlexResourceIdForProject, getDb, withTransaction } from '../../db';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../../types/jieyuDbDocTypes';
import {
  applyLexiconEntryFields,
  lexemeHeadword,
  type LexiconEntryFields,
} from '../../utils/dmlexEntry';
import { dispatchWorkspaceLexemeUpdated } from '../../utils/workspaceEvents';

export type { LexiconEntryFields, LexiconSenseDraft } from '../../utils/dmlexEntry';

export type LexiconEntrySaveDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeEntryDoc[]>;
  loadResource: () => Promise<LexemeResourceDoc | null>;
  saveResource: (doc: LexemeResourceDoc) => Promise<string>;
  /** 事务提交之后才调用。失败路径不广播。 */
  announce?: (ids: readonly string[]) => void;
  /** 默认把读取、两份写入和读回包进 lexemes 表的一次事务。 */
  runAtomic?: <T>(work: () => Promise<T>) => Promise<T>;
};

/** 默认依赖：所有读写都显式带上项目 | Default deps: every read/write names the project */
function defaultDepsFor(textId: string): LexiconEntrySaveDeps {
  return {
    save: (doc) => LinguisticService.lexemes.save(doc, { announce: false }),
    list: async () => {
      const rows = await LinguisticService.lexemes.list(textId);
      return rows.filter(isLexemeEntry);
    },
    loadResource: () => LinguisticService.lexemes.getResource(textId),
    saveResource: (doc) => LinguisticService.lexemes.save(doc, { announce: false }),
    announce: (ids) => {
      for (const lexemeId of ids) dispatchWorkspaceLexemeUpdated({ lexemeId });
    },
    runAtomic: async (work) => {
      const db = await getDb();
      return withTransaction(db, 'rw', [db.dexie.lexemes], work, { label: 'lexicon-entry-save' });
    },
  };
}

export function mergeLexemeIntoList(
  list: LexemeEntryDoc[],
  stored: LexemeEntryDoc,
): LexemeEntryDoc[] {
  const idx = list.findIndex((row) => row.id === stored.id);
  if (idx < 0) return [...list, stored];
  const next = list.slice();
  next[idx] = stored;
  return next;
}

export async function saveLexiconEntry(
  input: { existing: LexemeEntryDoc | null; fields: LexiconEntryFields; textId: string },
  deps: LexiconEntrySaveDeps = defaultDepsFor(input.textId),
): Promise<LexemeEntryDoc> {
  const runAtomic = deps.runAtomic ?? ((work) => work());
  const stored = await runAtomic(async () => {
    const now = new Date().toISOString();
    const resource = await deps.loadResource();
    const applied = applyLexiconEntryFields(
      input.existing,
      input.fields,
      resource,
      now,
      input.textId,
    );
    await deps.save(applied.entry);
    await deps.saveResource(applied.resource);
    const readback = (await deps.list()).find((row) => row.id === applied.entry.id);
    if (!readback || !isLexemeEntry(readback)) {
      throw new Error(`lexeme readback missing ${applied.entry.id}`);
    }
    if (lexemeHeadword(readback) !== input.fields.headword.trim()) {
      throw new Error(`lexeme headword readback mismatch for ${applied.entry.id}`);
    }
    return readback;
  });
  deps.announce?.([stored.id, dmlexResourceIdForProject(input.textId)]);
  return stored;
}
