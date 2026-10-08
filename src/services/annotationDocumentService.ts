/**
 * 标注文档（rev5 4.1 / 4.2-8 / D4 / N1 / N11，切片 2B-E）。
 * Annotation documents (rev5 4.1 / 4.2-8 / D4 / N1 / N11, slice 2B-E).
 *
 * - documentId 是全局唯一的 UUID；`isDefault` 是属性，项目行上另存 `defaultDocumentId`。
 * - 层归属于文档：层上的 `documentId` 缺省时表示“项目的默认文档”（本批每个项目只有一份文档）。
 * - 读操作从不写库；默认文档只在写路径（新建项目、导入）上建立。
 * - documentId is a globally unique UUID; `isDefault` is an attribute and the project row stores
 *   `defaultDocumentId`. A layer without `documentId` belongs to the project's default document.
 * - Reads never write; the default document is created on write paths only (new project, import).
 */
import {
  dexieStoresForAnnotationDocumentsRw,
  getDb,
  withTransaction,
  type AnnotationDocumentDocType,
  type JieyuDatabase,
  type LayerDocType,
} from '../db';
import {
  collectLayerUnitGraphIdsByTextId,
  deleteLayerUnitGraphByIds,
  deleteLayerUnitGraphByRecordIds,
} from './LayerUnitSegmentWritePrimitives';
import { newCatalogUuid } from './projectCatalogScope';

export class AnnotationDocumentProjectNotFoundError extends Error {
  readonly textId: string;
  constructor(textId: string) {
    super(`project "${textId}" does not exist`);
    this.name = 'AnnotationDocumentProjectNotFoundError';
    this.textId = textId;
  }
}

async function ensureDefaultDocumentIn(
  db: JieyuDatabase,
  textId: string,
): Promise<AnnotationDocumentDocType> {
  const text = await db.dexie.texts.get(textId);
  if (!text) throw new AnnotationDocumentProjectNotFoundError(textId);
  const current =
    text.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? await db.dexie.annotation_documents.get(text.defaultDocumentId)
      : undefined;
  if (current && current.textId === textId) {
    if (current.isDefault) return current;
    const fixed = { ...current, isDefault: true, updatedAt: new Date().toISOString() };
    await db.dexie.annotation_documents.put(fixed);
    return fixed;
  }
  const now = new Date().toISOString();
  const doc: AnnotationDocumentDocType = {
    id: newCatalogUuid(),
    textId,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
  // 同一项目其他文档不再是默认 | No other document of this project stays default
  const others = await db.dexie.annotation_documents.where('textId').equals(textId).toArray();
  for (const other of others) {
    if (other.isDefault) {
      await db.dexie.annotation_documents.put({ ...other, isDefault: false, updatedAt: now });
    }
  }
  await db.dexie.annotation_documents.add(doc);
  await db.dexie.texts.put({ ...text, defaultDocumentId: doc.id, updatedAt: now });
  return doc;
}

/**
 * 写路径：确保项目有默认文档，返回其 id（幂等；可嵌套在包含 texts + annotation_documents 的事务里）。
 * Write path: make sure the project has a default document and return its id (idempotent; may nest in
 * a transaction that includes texts + annotation_documents).
 */
export async function ensureDefaultAnnotationDocument(textId: string): Promise<string> {
  const owner = textId.trim();
  if (owner.length === 0) throw new AnnotationDocumentProjectNotFoundError(textId);
  const db = await getDb();
  try {
    const doc = await withTransaction(
      db,
      'rw',
      [...dexieStoresForAnnotationDocumentsRw(db)],
      () => ensureDefaultDocumentIn(db, owner),
      { label: 'annotationDocument.ensureDefault' },
    );
    return doc.id;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof AnnotationDocumentProjectNotFoundError) throw cause;
    throw error;
  }
}

/** 只读：项目的文档列表 | Read-only: the project's documents */
export async function listAnnotationDocuments(
  textId: string,
): Promise<AnnotationDocumentDocType[]> {
  const owner = textId.trim();
  if (owner.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.annotation_documents.where('textId').equals(owner).toArray();
  return rows.sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** 只读：默认文档 id（没有时返回 undefined，不会创建）| Read-only default document id (never creates) */
export async function readDefaultAnnotationDocumentId(textId: string): Promise<string | undefined> {
  const db = await getDb();
  const text = await db.dexie.texts.get(textId.trim());
  const id = text?.defaultDocumentId;
  return id !== undefined && id.length > 0 ? id : undefined;
}

/** 层所属文档：层上没写时归默认文档 | A layer's document; absent means the default document */
export function resolveLayerDocumentId(
  layer: Pick<LayerDocType, 'documentId'>,
  defaultDocumentId: string | undefined,
): string | undefined {
  const own = layer.documentId;
  return own !== undefined && own.length > 0 ? own : defaultDocumentId;
}

export type ProjectDocumentsManifest = {
  defaultDocumentId: string | undefined;
  documents: Array<{
    documentId: string;
    isDefault: boolean;
    layerIds: string[];
    sourceIds: string[];
  }>;
};

/**
 * 只读：按 rev5 7.2 的 `projects[].documents[]` 形状列出文档（数据层；完整 manifest 在第 3 批）。
 * Read-only: documents in the rev5 7.2 `projects[].documents[]` shape (data level; full manifest is Batch 3).
 */
export async function buildProjectDocumentsManifest(
  textId: string,
): Promise<ProjectDocumentsManifest> {
  const db = await getDb();
  const owner = textId.trim();
  const [text, documents, layers] = await Promise.all([
    db.dexie.texts.get(owner),
    db.dexie.annotation_documents.where('textId').equals(owner).toArray(),
    db.collections.layers.findByIndex('textId', owner),
  ]);
  const defaultDocumentId =
    text?.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? text.defaultDocumentId
      : undefined;
  const layerIdsByDocument = new Map<string, string[]>();
  for (const layerDoc of layers) {
    const layer = layerDoc.toJSON();
    const documentId = resolveLayerDocumentId(layer, defaultDocumentId);
    if (documentId === undefined) continue;
    layerIdsByDocument.set(documentId, [...(layerIdsByDocument.get(documentId) ?? []), layer.id]);
  }
  return {
    defaultDocumentId,
    documents: documents.map((doc) => ({
      documentId: doc.id,
      isDefault: doc.id === defaultDocumentId,
      layerIds: (layerIdsByDocument.get(doc.id) ?? []).sort(),
      sourceIds: [...(doc.sourceIds ?? [])],
    })),
  };
}

/**
 * 某文档的单元图：默认文档 = 不属于其他文档的层上的单元 + 无层宿主（被其他文档单元引用的宿主除外）。
 * A document's unit graph: for the default document, units on layers not owned by another document plus
 * layer-less hosts (except hosts still referenced by another document's units).
 */
async function collectDocumentUnitIds(
  db: JieyuDatabase,
  textId: string,
  documentId: string,
  defaultDocumentId: string | undefined,
): Promise<{ unitIds: string[]; wholeProject: boolean }> {
  const tiers = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
  const ownerOf = (tier: { documentId?: string }) =>
    tier.documentId !== undefined && tier.documentId.length > 0
      ? tier.documentId
      : defaultDocumentId;
  const foreignLayerIds = new Set(
    tiers.filter((tier) => ownerOf(tier) !== documentId).map((t) => t.id),
  );
  const isDefault = documentId === defaultDocumentId;
  if (isDefault && foreignLayerIds.size === 0) return { unitIds: [], wholeProject: true };
  const units = await db.dexie.layer_units.where('textId').equals(textId).toArray();
  const kept = units.filter((unit) =>
    unit.layerId !== undefined && unit.layerId.length > 0
      ? foreignLayerIds.has(unit.layerId)
      : !isDefault,
  );
  const referenced = new Set<string>();
  for (const unit of kept) {
    if (unit.parentUnitId) referenced.add(unit.parentUnitId);
    if (unit.rootUnitId) referenced.add(unit.rootUnitId);
  }
  const keptIds = new Set(kept.map((unit) => unit.id));
  return {
    unitIds: units
      .filter((unit) => !keptIds.has(unit.id) && !referenced.has(unit.id))
      .map((unit) => unit.id),
    wholeProject: false,
  };
}

function targetPairs(targetType: string, ids: readonly string[]): Array<[string, string]> {
  return ids.map((id) => [targetType, id] as [string, string]);
}

/**
 * 被替换单元的附属行：词元、语素、词元-词条链接、备注、segment_meta、派生向量（JY-12：不留孤儿）。
 * Rows hanging off replaced units: tokens, morphemes, token-lexeme links, notes, segment_meta and
 * derived embeddings (JY-12: no orphans). Runs inside the caller's transaction.
 */
async function deleteUnitDependentsIn(
  db: JieyuDatabase,
  unitIds: readonly string[],
): Promise<void> {
  if (unitIds.length === 0) return;
  const ids = [...unitIds];
  const [tokenIds, morphemeIds, contentIds] = await Promise.all([
    db.dexie.unit_tokens.where('unitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.unit_morphemes.where('unitId').anyOf(ids).primaryKeys() as Promise<string[]>,
    db.dexie.layer_unit_contents.where('unitId').anyOf(ids).primaryKeys() as Promise<string[]>,
  ]);
  const linkTargets = [...targetPairs('token', tokenIds), ...targetPairs('morpheme', morphemeIds)];
  if (linkTargets.length > 0) {
    await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).delete();
  }
  await db.dexie.user_notes
    .where('[targetType+targetId]')
    .anyOf([
      ...targetPairs('unit', ids),
      ...targetPairs('token', tokenIds),
      ...targetPairs('morpheme', morphemeIds),
      ...targetPairs('translation', contentIds),
    ])
    .delete();
  await db.dexie.segment_meta.where('segmentId').anyOf(ids).delete();
  await db.dexie.segment_meta.where('hostUnitId').anyOf(ids).delete();
  await db.dexie.embeddings
    .where('sourceId')
    .anyOf([...ids, ...tokenIds, ...morphemeIds])
    .filter((row) => ['unit', 'token', 'morpheme'].includes(row.sourceType))
    .delete();
  if (morphemeIds.length > 0) await db.dexie.unit_morphemes.bulkDelete(morphemeIds);
  if (tokenIds.length > 0) await db.dexie.unit_tokens.bulkDelete(tokenIds);
}

/**
 * 在调用方事务里替换（删除）某文档的单元图及其附属行；层定义保留（导入会复用或追加层）。
 * 调用方事务须包含 `dexieStoresForAnnotationImportRw` 的各表。
 * Delete one document's unit graph and its dependent rows inside the caller's transaction (the
 * transaction must cover `dexieStoresForAnnotationImportRw`); layer definitions are kept.
 */
export async function deleteAnnotationDocumentUnitGraph(
  db: JieyuDatabase,
  textId: string,
  documentId: string,
): Promise<{ deletedUnitIds: string[] }> {
  const text = await db.dexie.texts.get(textId);
  const defaultDocumentId =
    text?.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? text.defaultDocumentId
      : undefined;
  const scope = await collectDocumentUnitIds(db, textId, documentId, defaultDocumentId);
  if (scope.wholeProject) {
    const graph = await collectLayerUnitGraphIdsByTextId(db, textId);
    await deleteUnitDependentsIn(db, graph.unitIds);
    const result = await deleteLayerUnitGraphByRecordIds(db, graph);
    return { deletedUnitIds: result.deletedUnitIds };
  }
  await deleteUnitDependentsIn(db, scope.unitIds);
  const result = await deleteLayerUnitGraphByIds(db, scope.unitIds);
  return { deletedUnitIds: result.deletedUnitIds };
}

/** 在调用方事务里把来源记到文档上 | Record a source on a document inside the caller's transaction */
export async function attachSourceToAnnotationDocument(
  db: JieyuDatabase,
  documentId: string,
  sourceId: string,
): Promise<void> {
  const doc = await db.dexie.annotation_documents.get(documentId);
  if (!doc) return;
  const sourceIds = doc.sourceIds ?? [];
  if (sourceIds.includes(sourceId)) return;
  await db.dexie.annotation_documents.put({
    ...doc,
    sourceIds: [...sourceIds, sourceId],
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 在调用方事务里给新层补上所属文档（读项目的默认文档；没有默认文档时保持缺省 = 默认文档）。
 * Stamp a new layer with its document inside the caller's transaction (reads the project's default
 * document; when there is none the field stays absent, which means the default document).
 */
export async function stampLayerDocumentId<T extends LayerDocType>(
  db: JieyuDatabase,
  layer: T,
): Promise<T> {
  if (layer.documentId !== undefined && layer.documentId.length > 0) return layer;
  const text = await db.dexie.texts.get(layer.textId);
  const defaultDocumentId = text?.defaultDocumentId;
  return defaultDocumentId !== undefined && defaultDocumentId.length > 0
    ? { ...layer, documentId: defaultDocumentId }
    : layer;
}

export type AnnotationDocumentReplacePreview = {
  documentId: string | undefined;
  unitCount: number;
  layerCount: number;
};

/**
 * 只读：再次导入前的覆盖预览——会替换默认文档里多少语段；层定义保留。
 * Read-only overwrite preview before a re-import: how many units of the default document get replaced.
 */
export async function previewAnnotationDocumentReplace(
  textId: string,
): Promise<AnnotationDocumentReplacePreview> {
  const owner = textId.trim();
  const db = await getDb();
  const text = await db.dexie.texts.get(owner);
  const documentId =
    text?.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? text.defaultDocumentId
      : undefined;
  if (!text) return { documentId: undefined, unitCount: 0, layerCount: 0 };
  const tiers = await db.dexie.tier_definitions.where('textId').equals(owner).toArray();
  const ownLayers = tiers.filter((tier) => {
    const owned =
      tier.documentId !== undefined && tier.documentId.length > 0 ? tier.documentId : documentId;
    return owned === documentId;
  });
  if (documentId === undefined) {
    const unitCount = await db.dexie.layer_units.where('textId').equals(owner).count();
    return { documentId, unitCount, layerCount: ownLayers.length };
  }
  const scope = await collectDocumentUnitIds(db, owner, documentId, documentId);
  const unitCount = scope.wholeProject
    ? await db.dexie.layer_units.where('textId').equals(owner).count()
    : scope.unitIds.length;
  return { documentId, unitCount, layerCount: ownLayers.length };
}
