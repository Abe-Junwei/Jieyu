import {
  getDb,
  withTransaction,
  type LayerUnitDocType,
  type TokenLexemeLinkDocType,
  type TokenLexemeLinkTargetType,
  type UnitMorphemeDocType,
  type UnitTokenDocType,
} from '../db';
import { normalizeUnitDocForStorage } from '../utils/camDataUtils';
import {
  hasEmbeddedDefaultTextChanged,
  invalidateUnitEmbeddings,
} from '../ai/embeddings/EmbeddingInvalidationService';
import {
  bulkUpsertUnitLayerUnits,
  getUnitDocProjectionById,
  listUnitDocsForText,
  listUnitDocsFromCanonicalLayerUnits,
  upsertUnitLayerUnit,
} from './LayerSegmentGraphService';
import { enforceTimeSubdivisionParentBounds } from './LayerSegmentationTextService';
import { readOtherDocumentLayerIds } from './annotationDocumentService';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';
import {
  dispatchWorkspaceLexemeUpdated,
  dispatchWorkspaceUnitUpdated,
} from '../utils/workspaceEvents';

type JieyuDb = Awaited<ReturnType<typeof getDb>>;

async function lookupUnitIdForLexemeLinkTarget(
  db: JieyuDb,
  targetType: TokenLexemeLinkTargetType,
  targetId: string,
): Promise<string> {
  if (targetType === 'token') {
    const tok = await db.dexie.unit_tokens.get(targetId);
    return tok?.unitId.trim() ?? '';
  }
  const mor = await db.dexie.unit_morphemes.get(targetId);
  return mor?.unitId.trim() ?? '';
}

function emitUniqueUnitUpdated(items: readonly LayerUnitDocType[]): void {
  const seen = new Set<string>();
  for (const row of items) {
    const unitId = row.id.trim();
    if (unitId.length === 0 || seen.has(unitId)) continue;
    seen.add(unitId);
    dispatchWorkspaceUnitUpdated({
      unitId,
      ...(row.layerId ? { layerId: row.layerId } : {}),
    });
  }
}

async function emitWorkspaceRefreshForTokenLexemeLinks(
  db: JieyuDb,
  links: readonly Pick<TokenLexemeLinkDocType, 'targetType' | 'targetId' | 'lexemeId'>[],
): Promise<void> {
  const unitIds = new Set<string>();
  const lexemeIds = new Set<string>();
  for (const link of links) {
    const lexemeId = link.lexemeId.trim();
    if (lexemeId.length > 0) lexemeIds.add(lexemeId);
    const unitId = await lookupUnitIdForLexemeLinkTarget(db, link.targetType, link.targetId);
    if (unitId.length > 0) unitIds.add(unitId);
  }
  for (const unitId of unitIds) {
    dispatchWorkspaceUnitUpdated({ unitId });
  }
  for (const lexemeId of lexemeIds) {
    dispatchWorkspaceLexemeUpdated({ lexemeId });
  }
}

export async function saveUnit(data: LayerUnitDocType): Promise<string> {
  const db = await getDb();
  const normalized = normalizeUnitDocForStorage(data);
  const existing = await getUnitDocProjectionById(db, normalized.id);
  await enforceTimeSubdivisionParentBounds(
    db,
    normalized.id,
    normalized.startTime,
    normalized.endTime,
  );
  await upsertUnitLayerUnit(db, normalized);
  if (hasEmbeddedDefaultTextChanged(existing, normalized)) {
    await invalidateUnitEmbeddings(db, [normalized.id]);
  }
  scheduleSegmentMetaSyncForUnitIds([normalized.id], 'linguisticServiceUnitTokenOps.saveUnit');
  dispatchWorkspaceUnitUpdated({
    unitId: normalized.id,
    ...(normalized.layerId ? { layerId: normalized.layerId } : {}),
  });
  return normalized.id;
}

export async function saveUnitsBatch(
  items: LayerUnitDocType[],
  options?: { expectedAnalysisGraphFingerprint?: Readonly<Record<string, string>> },
): Promise<void> {
  const db = await getDb();
  const normalized = items.map(normalizeUnitDocForStorage);
  const existingRows = await Promise.all(
    normalized.map((item) => getUnitDocProjectionById(db, item.id)),
  );
  const changedUnitIds = normalized
    .filter((item, index) => hasEmbeddedDefaultTextChanged(existingRows[index], item))
    .map((item) => item.id);
  for (const row of normalized) {
    await enforceTimeSubdivisionParentBounds(db, row.id, row.startTime, row.endTime);
  }
  await bulkUpsertUnitLayerUnits(db, normalized, options);
  if (changedUnitIds.length > 0) {
    await invalidateUnitEmbeddings(db, changedUnitIds);
  }
  scheduleSegmentMetaSyncForUnitIds(
    normalized.map((item) => item.id),
    'linguisticServiceUnitTokenOps.saveUnits',
  );
  emitUniqueUnitUpdated(normalized);
}

export async function getTokensByUnitId(unitId: string): Promise<UnitTokenDocType[]> {
  const db = await getDb();
  const docs = await db.collections.unit_tokens.findByIndex('unitId', unitId);
  return docs.map((doc) => doc.toJSON()).sort((a, b) => a.tokenIndex - b.tokenIndex);
}

/** Batch-load tokens for export (FLEx / Toolbox). */
export async function listTokensByUnitIds(unitIds: readonly string[]): Promise<UnitTokenDocType[]> {
  const ids = [...new Set(unitIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.unit_tokens.where('unitId').anyOf(ids).toArray();
  return rows.sort((a, b) => a.unitId.localeCompare(b.unitId) || a.tokenIndex - b.tokenIndex);
}

export async function getMorphemesByTokenId(tokenId: string): Promise<UnitMorphemeDocType[]> {
  const db = await getDb();
  const docs = await db.collections.unit_morphemes.findByIndex('tokenId', tokenId);
  return docs.map((doc) => doc.toJSON()).sort((a, b) => a.morphemeIndex - b.morphemeIndex);
}

/** Batch-load morphemes for export (FLEx / Toolbox). */
export async function listMorphemesByTokenIds(
  tokenIds: readonly string[],
): Promise<UnitMorphemeDocType[]> {
  const ids = [...new Set(tokenIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.unit_morphemes.where('tokenId').anyOf(ids).toArray();
  return rows.sort(
    (a, b) => a.tokenId.localeCompare(b.tokenId) || a.morphemeIndex - b.morphemeIndex,
  );
}

export async function saveToken(data: UnitTokenDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.unit_tokens.insert(data);
  return doc.primary;
}

export async function saveTokensBatch(items: UnitTokenDocType[]): Promise<void> {
  const db = await getDb();
  await db.collections.unit_tokens.bulkInsert(items);
}

export async function updateTokenPos(tokenId: string, pos: string | null): Promise<void> {
  const db = await getDb();
  const trimmed = (pos ?? '').trim();
  const updatedAt = new Date().toISOString();
  let unitId = '';
  const changed = await db.dexie.unit_tokens
    .where('id')
    .equals(tokenId)
    .modify((row) => {
      unitId = row.unitId;
      if (trimmed.length > 0) row.pos = trimmed;
      else delete row.pos;
      row.updatedAt = updatedAt;
    });
  if (changed === 0) {
    throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
  }
  dispatchWorkspaceUnitUpdated({ unitId });
}

export async function updateTokenForm(
  tokenId: string,
  form: string,
  lang = 'default',
): Promise<void> {
  const db = await getDb();
  const key = lang.trim().length > 0 ? lang.trim() : 'default';
  const trimmed = form.trim();
  const updatedAt = new Date().toISOString();
  let unitId = '';
  const changed = await db.dexie.unit_tokens
    .where('id')
    .equals(tokenId)
    .modify((row) => {
      unitId = row.unitId;
      row.form = { ...row.form, [key]: trimmed };
      row.updatedAt = updatedAt;
    });
  if (changed === 0) {
    throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
  }
  dispatchWorkspaceUnitUpdated({ unitId });
}

export async function updateTokenGloss(
  tokenId: string,
  gloss: string | null,
  lang = 'eng',
  reviewStatus?: 'draft' | 'suggested' | 'confirmed' | 'rejected',
): Promise<void> {
  const db = await getDb();
  const trimmed = (gloss ?? '').trim();
  const now = new Date().toISOString();
  let unitId = '';
  const changed = await db.dexie.unit_tokens
    .where('id')
    .equals(tokenId)
    .modify((row) => {
      unitId = row.unitId;
      if (trimmed.length > 0) {
        row.gloss = { ...(row.gloss ?? {}), [lang]: trimmed };
      } else if (row.gloss) {
        const { [lang]: _removed, ...rest } = row.gloss;
        if (Object.keys(rest).length > 0) row.gloss = rest;
        else delete row.gloss;
      }
      if (reviewStatus) {
        row.provenance = {
          actorType: row.provenance?.actorType ?? 'human',
          method: row.provenance?.method ?? 'manual',
          createdAt: row.provenance?.createdAt ?? now,
          ...row.provenance,
          reviewStatus,
          updatedAt: now,
        };
      }
      row.updatedAt = now;
    });
  if (changed === 0) {
    throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
  }
  dispatchWorkspaceUnitUpdated({ unitId });
}

export async function updateTokenLanguage(
  tokenId: string,
  languageId: string | null,
): Promise<void> {
  const db = await getDb();
  const existing = await db.dexie.unit_tokens.get(tokenId);
  if (!existing) {
    throw new Error(`未找到 token: ${tokenId}`);
  }
  const trimmed = (languageId ?? '').trim();
  const updatedAt = new Date().toISOString();
  const changed = await db.dexie.unit_tokens
    .where('id')
    .equals(tokenId)
    .modify((row) => {
      if (trimmed.length > 0) row.languageId = trimmed;
      else delete row.languageId;
      row.updatedAt = updatedAt;
    });
  if (changed === 0) {
    throw new Error(`未找到 token: ${tokenId}`);
  }
  dispatchWorkspaceUnitUpdated({ unitId: existing.unitId });
}

export async function batchUpdateTokenPosByForm(
  unitId: string,
  form: string,
  pos: string | null,
  orthographyKey = 'default',
): Promise<number> {
  const db = await getDb();
  const normalizedForm = form.trim();
  if (!normalizedForm) return 0;

  const rows = await db.dexie.unit_tokens.where('unitId').equals(unitId).toArray();
  const normalizedPos = (pos ?? '').trim();
  const now = new Date().toISOString();

  const matches = rows.filter((row) => {
    const direct = row.form[orthographyKey];
    if (direct === normalizedForm) return true;
    return Object.values(row.form).some((v) => v === normalizedForm);
  });

  if (matches.length === 0) return 0;

  await db.dexie.unit_tokens
    .where('id')
    .anyOf(matches.map((row) => row.id))
    .modify((row) => {
      if (normalizedPos.length > 0) row.pos = normalizedPos;
      else delete row.pos;
      row.updatedAt = now;
    });

  dispatchWorkspaceUnitUpdated({ unitId });
  return matches.length;
}

export async function saveMorpheme(data: UnitMorphemeDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.unit_morphemes.insert(data);
  return doc.primary;
}

export async function saveMorphemesBatch(items: UnitMorphemeDocType[]): Promise<void> {
  const db = await getDb();
  await db.collections.unit_morphemes.bulkInsert(items);
}

/** Replace all morphemes for one token, then return the stored rows. */
export async function replaceMorphemesForToken(
  tokenId: string,
  items: readonly UnitMorphemeDocType[],
): Promise<UnitMorphemeDocType[]> {
  const id = tokenId.trim();
  if (id.length === 0) return [];
  const db = await getDb();
  const stored = await withTransaction(db, 'rw', [db.dexie.unit_morphemes], async () => {
    await db.collections.unit_morphemes.removeBySelector({ tokenId: id });
    if (items.length > 0) {
      await db.collections.unit_morphemes.bulkInsert([...items]);
    }
    return getMorphemesByTokenId(id);
  });
  const unitId = items[0]?.unitId ?? stored[0]?.unitId;
  if (unitId && unitId.trim().length > 0) {
    dispatchWorkspaceUnitUpdated({ unitId });
  }
  return stored;
}

export async function removeToken(tokenId: string): Promise<void> {
  const db = await getDb();
  await withTransaction(
    db,
    'rw',
    [db.dexie.unit_morphemes, db.dexie.unit_tokens, db.dexie.token_lexeme_links],
    async () => {
      // 只删与 token 同项目的 morpheme（GAP-1）| Only morphemes of the token's own project (GAP-1)
      const token = await db.dexie.unit_tokens.get(tokenId);
      const morphemeIds = (await db.dexie.unit_morphemes.where('tokenId').equals(tokenId).toArray())
        .filter((row) => token === undefined || row.textId === token.textId)
        .map((row) => row.id);
      if (morphemeIds.length > 0) await db.dexie.unit_morphemes.bulkDelete(morphemeIds);
      await db.collections.unit_tokens.remove(tokenId);
      await db.collections.token_lexeme_links.removeBySelector({
        targetType: 'token',
        targetId: tokenId,
      });
    },
    { label: 'unit-token-remove' },
  );
}

export async function saveTokenLexemeLink(data: TokenLexemeLinkDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.token_lexeme_links.insert(data);
  await emitWorkspaceRefreshForTokenLexemeLinks(db, [data]);
  return doc.primary;
}

export async function getTokenLexemeLinks(
  targetType: TokenLexemeLinkTargetType,
  targetId: string,
): Promise<TokenLexemeLinkDocType[]> {
  const db = await getDb();
  return db.dexie.token_lexeme_links
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .toArray();
}

export async function removeTokenLexemeLinks(
  targetType: TokenLexemeLinkTargetType,
  targetId: string,
): Promise<void> {
  const db = await getDb();
  const existing = await db.dexie.token_lexeme_links
    .where('[targetType+targetId]')
    .equals([targetType, targetId])
    .toArray();
  await db.collections.token_lexeme_links.removeBySelector({ targetType, targetId });
  await emitWorkspaceRefreshForTokenLexemeLinks(db, existing);
}

/** Remove specific lexeme↔token links by primary id (e.g. auto-gloss rollback). */
export async function removeTokenLexemeLinksByIds(linkIds: readonly string[]): Promise<void> {
  if (linkIds.length === 0) return;
  const db = await getDb();
  const existing: TokenLexemeLinkDocType[] = [];
  for (const id of linkIds) {
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    const row = await db.dexie.token_lexeme_links.get(trimmed);
    if (row !== undefined) existing.push(row);
  }
  for (let i = linkIds.length - 1; i >= 0; i -= 1) {
    const id = linkIds[i]!;
    await db.collections.token_lexeme_links.remove(id);
  }
  await emitWorkspaceRefreshForTokenLexemeLinks(db, existing);
}

export async function getAllUnits(): Promise<LayerUnitDocType[]> {
  const db = await getDb();
  return listUnitDocsFromCanonicalLayerUnits(db);
}

export async function getUnitAtTime(time: number): Promise<LayerUnitDocType | undefined> {
  const db = await getDb();
  const docs = await listUnitDocsFromCanonicalLayerUnits(db);
  return docs.find((u) => u.startTime <= time && u.endTime >= time);
}

/** 单个项目的 unit（走 `textId` 索引，不再整表读出再过滤，JY-15）| One project's units via the index (JY-15) */
/**
 * 项目的单元。第 5 批：默认不含其他文稿层上的单元；`allDocuments` 取全部。
 * A project's units. Batch 5: units on another document's layers are left out unless `allDocuments`.
 */
export async function getUnitsByTextId(
  textId: string,
  options?: { allDocuments?: boolean },
): Promise<LayerUnitDocType[]> {
  const db = await getDb();
  if (options?.allDocuments === true) return listUnitDocsForText(db, textId);
  const otherDocumentLayerIds = await readOtherDocumentLayerIds(db, textId);
  return listUnitDocsForText(
    db,
    textId,
    otherDocumentLayerIds.size > 0 ? otherDocumentLayerIds : undefined,
  );
}
