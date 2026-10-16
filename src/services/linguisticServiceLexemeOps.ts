import {
  dmlexResourceIdForProject,
  ensureLexemeNestedIds,
  getDb,
  isLexemeEntry,
  isLexemeResource,
  runDexieIndexedQueryOrElse,
  withTransaction,
  type JieyuDatabase,
  type LexemeDocType,
  type LexemeEntryDoc,
  type LexemeResourceDoc,
} from '../db';
import {
  applyLexiconEntryFields,
  lexemeHeadword,
  lexemeMatchValues,
  type LexiconEntryFields,
} from '../utils/dmlexEntry';
import { foldSearchText } from '../utils/searchTextNormalization';
import { pickTranscriptionTextForLanguage } from '../utils/transcriptionFormatters';
import { newId } from '../utils/transcriptionFormatters';
import {
  dispatchWorkspaceLexemeDeleted,
  dispatchWorkspaceLexemeUpdated,
} from '../utils/workspaceEvents';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import {
  activeCatalogProjectId,
  CatalogOwnershipMismatchError,
  requireCatalogProjectId,
} from './projectCatalogScope';

/** 词典 → 转写深链：由 `token_lexeme_links` 解析出的可跳转时间轴单元 | Lexicon → transcription deep-link row */
export interface LexemeTranscriptionJumpTarget {
  textId: string;
  unitId: string;
  layerId: string;
  mediaId?: string;
  unitKind: 'unit' | 'segment';
  /** Transcription-layer sentence. The word form stays on surfaceHint. */
  baselineText?: string;
  surfaceHint?: string;
  linkUpdatedAt: string;
}

function entryRows(docs: LexemeDocType[]): LexemeEntryDoc[] {
  return docs.filter(isLexemeEntry);
}

function compareLexemeEntries(left: LexemeEntryDoc, right: LexemeEntryDoc): number {
  const usageDiff = (right.usageCount ?? 0) - (left.usageCount ?? 0);
  if (usageDiff !== 0) return usageDiff;
  const updatedDiff = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;
  return lexemeHeadword(left).localeCompare(lexemeHeadword(right), 'zh-CN');
}

/** 只读：本项目词条；没有项目时为空（D11）| Read-only: this project's entries; empty without a project */
export async function listLexemes(textId?: string): Promise<LexemeEntryDoc[]> {
  const projectId = activeCatalogProjectId(textId);
  if (projectId.length === 0) return [];
  const db = await getDb();
  const docs = await db.collections.lexemes.findByIndex('textId', projectId);
  return entryRows(docs.map((doc) => doc.toJSON())).sort(compareLexemeEntries);
}

export async function searchLexemes(query: string, textId?: string): Promise<LexemeEntryDoc[]> {
  const normalized = foldSearchText(query.trim());
  if (!normalized) return [];
  const projectId = activeCatalogProjectId(textId);
  if (projectId.length === 0) return [];

  const db = await getDb();
  const docs = await db.collections.lexemes.findByIndex('textId', projectId);
  return entryRows(docs.map((doc) => doc.toJSON())).filter((item) =>
    lexemeMatchValues(item).some((value) => value.includes(normalized)),
  );
}

/** 本项目的 DMLex resource 行（每个项目一行）| This project's DMLex resource row (one per project) */
export async function getDmlexResource(textId?: string): Promise<LexemeResourceDoc | null> {
  const projectId = activeCatalogProjectId(textId);
  if (projectId.length === 0) return null;
  const db = await getDb();
  const doc = await db.collections.lexemes
    .findOne({ selector: { id: dmlexResourceIdForProject(projectId) } })
    .exec();
  if (!doc) return null;
  const json = doc.toJSON();
  return isLexemeResource(json) && json.textId === projectId ? json : null;
}

export type SaveLexemeOptions = {
  /**
   * 默认 true：保存后立即广播“词条已更新”。在外层事务里批量保存时传 false，由调用方在事务提交后
   * 统一广播（GAP-3），否则回滚后 UI 仍会收到不存在的词条。
   * Default true: announce "lexeme updated" right after the save. Batch saves inside an outer
   * transaction pass false and announce after commit (GAP-3); otherwise the UI hears about
   * lexemes a rollback removed.
   */
  announce?: boolean;
};

export async function saveLexeme(
  data: LexemeDocType,
  options: SaveLexemeOptions = {},
): Promise<string> {
  const db = await getDb();
  const projectId = requireCatalogProjectId(data.textId);
  const existing = await db.dexie.lexemes.get(data.id);
  if (existing && existing.textId !== projectId) {
    throw new CatalogOwnershipMismatchError('lexemes', data.id, existing.textId, projectId);
  }
  const stamped: LexemeDocType = { ...data, textId: projectId };
  const stored = isLexemeEntry(stamped) ? ensureLexemeNestedIds(stamped) : stamped;
  const doc = await db.collections.lexemes.insert(stored);
  if (options.announce !== false) dispatchWorkspaceLexemeUpdated({ lexemeId: doc.primary });
  return doc.primary;
}

function writeLexemeInTransaction(doc: LexemeDocType, database: JieyuDatabase): Promise<string> {
  return database.dexie.lexemes.get(doc.id).then((existing) => {
    const projectId = requireCatalogProjectId(doc.textId);
    if (existing && existing.textId !== projectId) {
      throw new CatalogOwnershipMismatchError('lexemes', doc.id, existing.textId, projectId);
    }
    const stamped: LexemeDocType = { ...doc, textId: projectId };
    const stored = isLexemeEntry(stamped) ? ensureLexemeNestedIds(stamped) : stamped;
    return database.dexie.lexemes.put(stored).then(() => stored.id);
  });
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

export async function saveLexiconEntry(input: {
  existing: LexemeEntryDoc | null;
  fields: LexiconEntryFields;
  textId: string;
}): Promise<LexemeEntryDoc> {
  if (input.fields.headword.trim().length === 0) throw new Error('empty headword');
  const textId = input.textId;
  const db = await getDb();
  const stored = await withTransaction(
    db,
    'rw',
    [db.dexie.lexemes],
    () => {
      const now = new Date().toISOString();
      return db.dexie.lexemes
        .get(dmlexResourceIdForProject(textId))
        .then((row) => (row && isLexemeResource(row) && row.textId === textId ? row : null))
        .then((resource) => {
          const applied = applyLexiconEntryFields(
            input.existing,
            input.fields,
            resource,
            now,
            textId,
          );
          return writeLexemeInTransaction(applied.entry, db)
            .then(() => writeLexemeInTransaction(applied.resource, db))
            .then(() => db.dexie.lexemes.where('textId').equals(textId).toArray())
            .then((rows) => {
              const readback = entryRows(rows)
                .sort(compareLexemeEntries)
                .find((row) => row.id === applied.entry.id);
              if (!readback || !isLexemeEntry(readback)) {
                throw new Error(`lexeme readback missing ${applied.entry.id}`);
              }
              if (lexemeHeadword(readback) !== input.fields.headword.trim()) {
                throw new Error(`lexeme headword readback mismatch for ${applied.entry.id}`);
              }
              return readback;
            });
        });
    },
    { label: 'lexicon-entry-save' },
  );
  dispatchWorkspaceLexemeUpdated({ lexemeId: stored.id });
  dispatchWorkspaceLexemeUpdated({ lexemeId: dmlexResourceIdForProject(textId) });
  return stored;
}

export async function deleteLexeme(lexemeId: string): Promise<void> {
  const id = lexemeId.trim();
  if (!id) throw new Error('empty lexeme id');
  const db = await getDb();
  const existing = await db.collections.lexemes.findOne({ selector: { id } }).exec();
  if (!existing) throw new Error('NOT_FOUND');

  await withTransaction(
    db,
    'rw',
    [
      db.dexie.lexemes,
      db.dexie.token_lexeme_links,
      db.dexie.lexeme_asset_links,
      db.dexie.lexeme_assets,
    ],
    async () => {
      const assetLinks = await db.collections.lexeme_asset_links.findByIndex('lexemeId', id);
      for (const linkDoc of assetLinks) {
        const link = linkDoc.toJSON();
        await db.collections.lexeme_asset_links.remove(link.id);
        const assetDoc = await db.collections.lexeme_assets
          .findOne({ selector: { id: link.assetId } })
          .exec();
        if (!assetDoc) continue;
        const asset = assetDoc.toJSON();
        const nextCount = asset.refCount - 1;
        if (nextCount <= 0) {
          await db.collections.lexeme_assets.remove(asset.id);
          continue;
        }
        await db.collections.lexeme_assets.update(asset.id, {
          refCount: nextCount,
          updatedAt: new Date().toISOString(),
        });
      }
      await db.collections.token_lexeme_links.removeBySelector({ lexemeId: id });
      await db.collections.lexemes.remove(id);
    },
    { label: 'lexeme-delete' },
  );

  dispatchWorkspaceLexemeDeleted({ lexemeId: id, deletionMode: 'hard' });
}

function headwordSurface(lexeme: LexemeDocType): string {
  if (!isLexemeEntry(lexeme)) return '';
  return lexemeHeadword(lexeme);
}

/**
 * Import helper: reuse an existing lexeme by lemma surface (+ optional language),
 * otherwise create a minimal lexeme row.
 * Uses Dexie directly so it can run inside annotation-import `withTransaction`.
 */
export async function matchOrCreateLexemeByForm(input: {
  form: string;
  language?: string;
  /** 所属项目（必填）| Owning project (required) */
  textId: string;
}): Promise<string | undefined> {
  const form = input.form.trim();
  if (!form) return undefined;
  const projectId = requireCatalogProjectId(input.textId);
  const language = input.language?.trim();
  const db = await getDb();
  const existing = (await db.dexie.lexemes.where('textId').equals(projectId).toArray()).find(
    (lexeme) => {
      if (headwordSurface(lexeme) !== form) return false;
      if (!language) return true;
      if (!isLexemeEntry(lexeme)) return false;
      const lang = lexeme.entry.senses?.[0]?.headwordTranslations?.[0]?.langCode ?? '';
      return lang === language;
    },
  );
  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = newId('lex');
  const senseId = newId('sense');
  await db.dexie.lexemes.put({
    id,
    entry: {
      id,
      headword: form,
      senses: [
        {
          id: senseId,
          headwordTranslations: [{ text: form, langCode: language || 'und' }],
        },
      ],
    },
    textId: projectId,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * 词条在转写库中的可跳转命中（经 token_lexeme_links → token/morpheme → layer_unit） |
 * Transcription jump targets for a lexeme via token/morpheme links into canonical layer units.
 */
export async function listLexemeTranscriptionJumpTargets(
  lexemeId: string,
  opts?: { limit?: number },
): Promise<LexemeTranscriptionJumpTarget[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 40, 200));
  const id = lexemeId.trim();
  if (!id) return [];

  const db = await getDb();
  const links = await runDexieIndexedQueryOrElse(
    'LinguisticService.lexemes.listTranscriptionJumpTargets:token_lexeme_links',
    () => db.dexie.token_lexeme_links.where('lexemeId').equals(id).toArray(),
    async () => {
      const all = await db.dexie.token_lexeme_links.toArray();
      return all.filter((row) => (row.lexemeId ?? '').trim() === id);
    },
  );
  links.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const seen = new Set<string>();
  const out: LexemeTranscriptionJumpTarget[] = [];

  for (const link of links) {
    if (out.length >= limit) break;

    let unitId = '';
    let textId = '';
    let surfaceHint: string | undefined;

    if (link.targetType === 'token') {
      const tok = await db.dexie.unit_tokens.get(link.targetId);
      if (!tok) continue;
      unitId = tok.unitId.trim();
      textId = tok.textId.trim();
      const rawForm = Object.values(tok.form ?? {}).find(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
    } else {
      const mor = await db.dexie.unit_morphemes.get(link.targetId);
      if (!mor) continue;
      unitId = mor.unitId.trim();
      textId = mor.textId.trim();
      const rawForm = Object.values(mor.form ?? {}).find(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
    }

    if (!unitId || !textId) continue;

    const [layerUnit] = await LayerSegmentQueryService.listUnitsByIds([unitId]);
    if (!layerUnit) continue;

    const layerId = layerUnit.layerId?.trim() ?? '';
    if (!layerId) continue;

    const unitKind: 'unit' | 'segment' = layerUnit.unitType === 'segment' ? 'segment' : 'unit';
    const mediaId = layerUnit.mediaId?.trim() || undefined;
    const contents = await withTransaction(
      db,
      'r',
      [db.dexie.layer_unit_contents],
      async () => db.dexie.layer_unit_contents.where('unitId').equals(unitId).toArray(),
      { label: 'linguisticServiceLexemeOps.unitContents' },
    );
    const layerText = contents.find(
      (row) =>
        row.layerId === layerId &&
        (row.modality === undefined || row.modality === 'text') &&
        (row.text ?? '').trim().length > 0,
    );
    const baselineText =
      layerText?.text?.trim() ||
      pickTranscriptionTextForLanguage(layerUnit.transcription) ||
      undefined;
    const dedupeKey = `${textId}|${layerId}|${unitId}|${unitKind}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      textId,
      unitId,
      layerId,
      ...(mediaId ? { mediaId } : {}),
      unitKind,
      ...(baselineText ? { baselineText } : {}),
      ...(surfaceHint ? { surfaceHint } : {}),
      linkUpdatedAt: link.updatedAt,
    });
  }

  return out;
}
