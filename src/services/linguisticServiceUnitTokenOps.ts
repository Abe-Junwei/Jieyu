import {
  getDb,
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
  listUnitDocsFromCanonicalLayerUnits,
  upsertUnitLayerUnit,
} from './LayerSegmentGraphService';
import { enforceTimeSubdivisionParentBounds } from './LayerSegmentationTextService';
import { SegmentMetaService } from './SegmentMetaService';

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
  void SegmentMetaService.syncForUnitIds([normalized.id]).catch(() => {
    // SegmentMeta 为统一读模型，刷新失败不应阻塞保存 | SegmentMeta is a shared read model; refresh failures must not block saves.
  });
  return normalized.id;
}

export async function saveUnitsBatch(items: LayerUnitDocType[]): Promise<void> {
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
  await bulkUpsertUnitLayerUnits(db, normalized);
  if (changedUnitIds.length > 0) {
    await invalidateUnitEmbeddings(db, changedUnitIds);
  }
  void SegmentMetaService.syncForUnitIds(normalized.map((item) => item.id)).catch(() => {
    // SegmentMeta 为统一读模型，刷新失败不应阻塞批量保存 | SegmentMeta is a shared read model; refresh failures must not block batch saves.
  });
}

export async function getTokensByUnitId(unitId: string): Promise<UnitTokenDocType[]> {
  const db = await getDb();
  const docs = await db.collections.unit_tokens.findByIndex('unitId', unitId);
  return docs.map((doc) => doc.toJSON()).sort((a, b) => a.tokenIndex - b.tokenIndex);
}

export async function getMorphemesByTokenId(tokenId: string): Promise<UnitMorphemeDocType[]> {
  const db = await getDb();
  const docs = await db.collections.unit_morphemes.findByIndex('tokenId', tokenId);
  return docs.map((doc) => doc.toJSON()).sort((a, b) => a.morphemeIndex - b.morphemeIndex);
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
  const existing = await db.collections.unit_tokens.findOne({ selector: { id: tokenId } }).exec();
  if (!existing) {
    throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
  }

  const row = existing.toJSON();
  const trimmed = (pos ?? '').trim();
  const nextPos = trimmed.length > 0 ? trimmed : undefined;
  const { pos: _oldPos, ...rest } = row;

  await db.collections.unit_tokens.insert({
    ...rest,
    ...(nextPos ? { pos: nextPos } : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateTokenGloss(
  tokenId: string,
  gloss: string | null,
  lang = 'eng',
): Promise<void> {
  const db = await getDb();
  const existing = await db.collections.unit_tokens.findOne({ selector: { id: tokenId } }).exec();
  if (!existing) {
    throw new Error(`\u672a\u627e\u5230 token: ${tokenId}`);
  }

  const row = existing.toJSON();
  const trimmed = (gloss ?? '').trim();

  let nextGloss: Record<string, string> | undefined;
  if (trimmed.length > 0) {
    nextGloss = { ...(row.gloss ?? {}), [lang]: trimmed };
  } else if (row.gloss) {
    const { [lang]: _removed, ...rest } = row.gloss;
    nextGloss = Object.keys(rest).length > 0 ? rest : undefined;
  }

  const { gloss: _oldGloss, ...rest } = row;
  await db.collections.unit_tokens.insert({
    ...rest,
    ...(nextGloss ? { gloss: nextGloss } : {}),
    updatedAt: new Date().toISOString(),
  });
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

  const tokens = await db.collections.unit_tokens.findByIndex('unitId', unitId);
  const rows = tokens.map((doc) => doc.toJSON());
  const normalizedPos = (pos ?? '').trim();
  const now = new Date().toISOString();

  const matches = rows.filter((row) => {
    const direct = row.form[orthographyKey];
    if (direct === normalizedForm) return true;
    return Object.values(row.form).some((v) => v === normalizedForm);
  });

  if (matches.length === 0) return 0;

  await db.collections.unit_tokens.bulkInsert(
    matches.map((row) => {
      const { pos: _oldPos, ...rest } = row;
      return {
        ...rest,
        ...(normalizedPos ? { pos: normalizedPos } : {}),
        updatedAt: now,
      };
    }),
  );

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

export async function removeToken(tokenId: string): Promise<void> {
  const db = await getDb();
  await db.collections.unit_morphemes.removeBySelector({ tokenId });
  await db.collections.unit_tokens.remove(tokenId);
  await db.collections.token_lexeme_links.removeBySelector({
    targetType: 'token',
    targetId: tokenId,
  });
}

export async function saveTokenLexemeLink(data: TokenLexemeLinkDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.token_lexeme_links.insert(data);
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
  await db.collections.token_lexeme_links.removeBySelector({ targetType, targetId });
}

/** Remove specific lexeme↔token links by primary id (e.g. auto-gloss rollback). */
export async function removeTokenLexemeLinksByIds(linkIds: readonly string[]): Promise<void> {
  if (linkIds.length === 0) return;
  const db = await getDb();
  for (let i = linkIds.length - 1; i >= 0; i -= 1) {
    const id = linkIds[i]!;
    await db.collections.token_lexeme_links.remove(id);
  }
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

export async function getUnitsByTextId(textId: string): Promise<LayerUnitDocType[]> {
  const db = await getDb();
  const all = await listUnitDocsFromCanonicalLayerUnits(db);
  return all.filter((u) => u.textId === textId);
}
