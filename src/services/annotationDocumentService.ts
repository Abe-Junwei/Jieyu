/**
 * 标注文档（rev5 4.1 / 4.2-8 / D4 / N1 / N11，切片 2B-E）。
 * Annotation documents (rev5 4.1 / 4.2-8 / D4 / N1 / N11, slice 2B-E).
 *
 * - documentId 是全局唯一的 UUID；`isDefault` 是属性，项目行上另存 `defaultDocumentId`。
 * - 层归属于文档：层上的 `documentId` 缺省时表示“项目的默认文档”（本批每个项目只有一份文档）。
 * - 读操作从不写库；默认文档只在写路径（新建项目、导入）上建立。
 * - 第 5 批多文稿：工作台显示的“当前文稿”就是项目的默认文档；切换 = 改 `defaultDocumentId`。
 *   默认文档变化之前，先把没写 documentId 的层显式记到原默认文档，层不会跟着默认文档“漂移”。
 * - documentId is a globally unique UUID; `isDefault` is an attribute and the project row stores
 *   `defaultDocumentId`. A layer without `documentId` belongs to the project's default document.
 * - Reads never write; the default document is created on write paths only (new project, import).
 * - Batch 5 multi-document: the workspace's "current document" is the project's default document;
 *   switching rewrites `defaultDocumentId`. Before the default changes, layers without a
 *   documentId are stamped with the outgoing default so they never drift with it.
 */
import {
  dexieStoresForAnnotationDocumentsRw,
  dexieStoresForAnnotationImportRw,
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
import { isProjectNeverCollaborated } from '../collaboration/cloud/projectCollaborationHistory';

export class AnnotationDocumentProjectNotFoundError extends Error {
  readonly textId: string;
  constructor(textId: string) {
    super(`project "${textId}" does not exist`);
    this.name = 'AnnotationDocumentProjectNotFoundError';
    this.textId = textId;
  }
}

/** 文档不属于该项目 | The document does not belong to the project */
export class AnnotationDocumentNotFoundError extends Error {
  readonly documentId: string;
  constructor(documentId: string) {
    super(`annotation document "${documentId}" does not exist in this project`);
    this.name = 'AnnotationDocumentNotFoundError';
    this.documentId = documentId;
  }
}

/** 不能删除项目的最后一份文档 | The last document of a project cannot be deleted */
export class AnnotationDocumentLastDocumentError extends Error {
  constructor() {
    super('a project keeps at least one annotation document');
    this.name = 'AnnotationDocumentLastDocumentError';
  }
}

/**
 * 协作过（或判定不了，D6）的项目不能新建文稿：协作同步不携带 annotation_documents。
 * Collaborated (or undecidable, D6) projects cannot add documents: sync does not carry them.
 */
export class AnnotationDocumentCollaboratedProjectError extends Error {
  readonly textId: string;
  constructor(textId: string) {
    super(`project "${textId}" has collaborated; new annotation documents are local-only projects`);
    this.name = 'AnnotationDocumentCollaboratedProjectError';
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
 * 某文档的单元图：不属于其他文档的层上的单元（被其他文档单元引用的宿主除外）。只有项目里的层全属于
 * 默认文档时才按整个项目替换（含无层宿主）。
 * A document's unit graph: units on layers not owned by another document (except hosts still referenced
 * by another document's units). Only when every layer belongs to the default document is the whole
 * project replaced (layer-less hosts included).
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
  // 有多份文稿时，无层宿主归属不明，一律保留 | With several documents layer-less hosts are ambiguous: keep
  const kept = units.filter((unit) =>
    unit.layerId !== undefined && unit.layerId.length > 0
      ? foreignLayerIds.has(unit.layerId)
      : true,
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
 * 只读：再次导入前的覆盖预览——会替换某文档（缺省为当前文稿）里多少语段、它有几个层；删除文稿前也用它。
 * Read-only preview: how many units / layers a document (default: the current one) holds; used before a
 * re-import replaces it and before the document is deleted.
 */
export async function previewAnnotationDocumentReplace(
  textId: string,
  targetDocumentId?: string,
): Promise<AnnotationDocumentReplacePreview> {
  const owner = textId.trim();
  const db = await getDb();
  const text = await db.dexie.texts.get(owner);
  const defaultDocumentId =
    text?.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? text.defaultDocumentId
      : undefined;
  const documentId = targetDocumentId ?? defaultDocumentId;
  if (!text) return { documentId: undefined, unitCount: 0, layerCount: 0 };
  const tiers = await db.dexie.tier_definitions.where('textId').equals(owner).toArray();
  const ownLayers = tiers.filter(
    (tier) => resolveLayerDocumentId(tier, defaultDocumentId) === documentId,
  );
  if (documentId === undefined) {
    const unitCount = await db.dexie.layer_units.where('textId').equals(owner).count();
    return { documentId, unitCount, layerCount: ownLayers.length };
  }
  const scope = await collectDocumentUnitIds(db, owner, documentId, defaultDocumentId);
  const unitCount = scope.wholeProject
    ? await db.dexie.layer_units.where('textId').equals(owner).count()
    : scope.unitIds.length;
  return { documentId, unitCount, layerCount: ownLayers.length };
}

/** 第 5 批多文稿写操作的事务表 | Stores for the Batch 5 document write operations */
function documentWriteStores(db: JieyuDatabase) {
  return [...dexieStoresForAnnotationDocumentsRw(db), db.dexie.tier_definitions] as const;
}

function unwrapDocumentError(error: unknown): unknown {
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof AnnotationDocumentProjectNotFoundError ||
    cause instanceof AnnotationDocumentNotFoundError ||
    cause instanceof AnnotationDocumentLastDocumentError ||
    cause instanceof AnnotationDocumentCollaboratedProjectError
    ? cause
    : error;
}

/**
 * 在调用方事务里把没写 documentId 的层（含桥接行）显式记到给定文档。默认文档改变之前调用。
 * Stamp layers (and bridge rows) without a documentId with the given document, inside the caller's
 * transaction. Call before the default document changes.
 */
async function stampUnownedLayersIn(
  db: JieyuDatabase,
  textId: string,
  documentId: string | undefined,
): Promise<void> {
  if (documentId === undefined) return;
  const rows = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
  const unowned = rows.filter((row) => row.documentId === undefined || row.documentId.length === 0);
  if (unowned.length > 0) {
    await db.dexie.tier_definitions.bulkPut(unowned.map((row) => ({ ...row, documentId })));
  }
}

/** 在调用方事务里把 documentId 设为项目的默认（当前）文档 | Make documentId the default inside the tx */
async function setDefaultDocumentIn(
  db: JieyuDatabase,
  textId: string,
  documentId: string,
): Promise<void> {
  const text = await db.dexie.texts.get(textId);
  if (!text) throw new AnnotationDocumentProjectNotFoundError(textId);
  const now = new Date().toISOString();
  await stampUnownedLayersIn(db, textId, text.defaultDocumentId);
  const documents = await db.dexie.annotation_documents.where('textId').equals(textId).toArray();
  for (const doc of documents) {
    const isDefault = doc.id === documentId;
    if (doc.isDefault !== isDefault) {
      await db.dexie.annotation_documents.put({ ...doc, isDefault, updatedAt: now });
    }
  }
  if (text.defaultDocumentId !== documentId) {
    await db.dexie.texts.put({ ...text, defaultDocumentId: documentId, updatedAt: now });
  }
}

async function requireDocumentIn(
  db: JieyuDatabase,
  textId: string,
  documentId: string,
): Promise<AnnotationDocumentDocType> {
  const doc = await db.dexie.annotation_documents.get(documentId);
  if (!doc || doc.textId !== textId) throw new AnnotationDocumentNotFoundError(documentId);
  return doc;
}

function documentTitle(title: string | undefined): { title?: { und: string } } {
  const trimmed = title?.trim() ?? '';
  return trimmed.length > 0 ? { title: { und: trimmed } } : {};
}

/** 只读：项目能否新建文稿（D6：只对从未协作的项目开放）| Can the project add documents (D6) */
export function canCreateAnnotationDocument(textId: string): boolean {
  return textId.trim().length > 0 && isProjectNeverCollaborated(textId);
}

/**
 * 新建一份空文稿并设为当前文稿（第 5 批，D4）。只对从未协作的项目开放。
 * Create an empty document and make it the current one (Batch 5, D4). Never-collaborated projects only.
 */
export async function createAnnotationDocument(textId: string, title?: string): Promise<string> {
  const owner = textId.trim();
  if (!canCreateAnnotationDocument(owner))
    throw new AnnotationDocumentCollaboratedProjectError(owner);
  const db = await getDb();
  try {
    return await withTransaction(
      db,
      'rw',
      [...documentWriteStores(db)],
      async () => {
        // 先确保原默认文档存在，原有层才有归属 | Existing layers need an owning default document first
        await ensureDefaultDocumentIn(db, owner);
        const now = new Date().toISOString();
        const id = newCatalogUuid();
        await db.dexie.annotation_documents.add({
          id,
          textId: owner,
          isDefault: false,
          ...documentTitle(title),
          createdAt: now,
          updatedAt: now,
        });
        await setDefaultDocumentIn(db, owner, id);
        return id;
      },
      { label: 'annotationDocument.create' },
    );
  } catch (error) {
    throw unwrapDocumentError(error);
  }
}

/** 改名（只改 title；空名清除 title，界面回退到序号名）| Rename (title only; empty clears it) */
export async function renameAnnotationDocument(
  textId: string,
  documentId: string,
  title: string,
): Promise<void> {
  const db = await getDb();
  try {
    await withTransaction(
      db,
      'rw',
      [db.dexie.annotation_documents],
      async () => {
        const { title: _previous, ...doc } = await requireDocumentIn(db, textId.trim(), documentId);
        await db.dexie.annotation_documents.put({
          ...doc,
          ...documentTitle(title),
          updatedAt: new Date().toISOString(),
        });
      },
      { label: 'annotationDocument.rename' },
    );
  } catch (error) {
    throw unwrapDocumentError(error);
  }
}

/** 切换当前文稿 | Switch the current document */
export async function switchAnnotationDocument(textId: string, documentId: string): Promise<void> {
  const owner = textId.trim();
  const db = await getDb();
  try {
    await withTransaction(
      db,
      'rw',
      [...documentWriteStores(db)],
      async () => {
        await requireDocumentIn(db, owner, documentId);
        await setDefaultDocumentIn(db, owner, documentId);
      },
      { label: 'annotationDocument.switch' },
    );
  } catch (error) {
    throw unwrapDocumentError(error);
  }
}

export type AnnotationDocumentDeleteResult = {
  currentDocumentId: string;
  deletedUnitIds: string[];
  deletedLayerIds: string[];
};

/**
 * 删除一份文稿：它的层（含桥接行、层关系、层标注）和单元图一起删，同一次提交；其他文稿不动。
 * 删的是当前文稿时，最早建立的剩余文稿成为当前文稿。最后一份文稿不能删。来源记录保留（属于项目）。
 * Delete one document: its layers (bridge rows, layer links, tier annotations) and unit graph go in one
 * commit; other documents are untouched. Deleting the current document makes the oldest remaining one
 * current. The last document cannot be deleted. Source records stay (they belong to the project).
 */
export async function deleteAnnotationDocument(
  textId: string,
  documentId: string,
): Promise<AnnotationDocumentDeleteResult> {
  const owner = textId.trim();
  const db = await getDb();
  try {
    return await withTransaction(
      db,
      'rw',
      [...dexieStoresForAnnotationImportRw(db), db.dexie.tier_annotations],
      async () => {
        await requireDocumentIn(db, owner, documentId);
        const documents = await db.dexie.annotation_documents
          .where('textId')
          .equals(owner)
          .toArray();
        const remaining = documents
          .filter((doc) => doc.id !== documentId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const next = remaining.find((doc) => doc.isDefault) ?? remaining[0];
        if (!next) throw new AnnotationDocumentLastDocumentError();
        // 先让层归属显式化并换掉当前文稿，此后层的归属不再依赖默认文档
        // Make layer ownership explicit and move the default away; ownership no longer depends on it
        await setDefaultDocumentIn(db, owner, next.id);
        const { deletedUnitIds } = await deleteAnnotationDocumentUnitGraph(db, owner, documentId);
        const tiers = await db.dexie.tier_definitions.where('textId').equals(owner).toArray();
        const layerIds = tiers.filter((tier) => tier.documentId === documentId).map((t) => t.id);
        if (layerIds.length > 0) {
          await db.dexie.tier_annotations.where('tierId').anyOf(layerIds).delete();
          await db.dexie.layer_links.where('layerId').anyOf(layerIds).delete();
          await db.dexie.layer_links.where('hostTranscriptionLayerId').anyOf(layerIds).delete();
          await db.dexie.tier_definitions.bulkDelete(layerIds);
        }
        await db.dexie.annotation_documents.delete(documentId);
        return { currentDocumentId: next.id, deletedUnitIds, deletedLayerIds: layerIds };
      },
      { label: 'annotationDocument.delete' },
    );
  } catch (error) {
    throw unwrapDocumentError(error);
  }
}

export type AnnotationDocumentScope = {
  /** 当前（默认）文稿 | Current (default) document */
  defaultDocumentId: string | undefined;
  /** 项目里存在的文稿 | Documents that exist in the project */
  documentIds: ReadonlySet<string>;
};

/** 只读：项目的文稿范围 | Read-only: the project's document scope */
export async function readAnnotationDocumentScope(
  db: JieyuDatabase,
  textId: string,
): Promise<AnnotationDocumentScope> {
  const owner = textId.trim();
  const [text, documentIds] = await Promise.all([
    db.dexie.texts.get(owner),
    db.dexie.annotation_documents.where('textId').equals(owner).primaryKeys() as Promise<string[]>,
  ]);
  const defaultDocumentId =
    text?.defaultDocumentId !== undefined && text.defaultDocumentId.length > 0
      ? text.defaultDocumentId
      : undefined;
  return { defaultDocumentId, documentIds: new Set(documentIds) };
}

/**
 * 层是否属于当前文稿。没写 documentId、或指向本机不存在的文稿（协作同步不带文稿行）的层归当前文稿，
 * 不会凭空消失。
 * Whether a layer belongs to the current document. A layer without a documentId, or pointing at a
 * document that does not exist locally (collaboration sync does not carry document rows), belongs to
 * the current document so it never disappears.
 */
export function isLayerInCurrentDocument(
  layer: { documentId?: string },
  scope: AnnotationDocumentScope,
): boolean {
  const own = layer.documentId;
  if (own === undefined || own.length === 0 || !scope.documentIds.has(own)) return true;
  return own === scope.defaultDocumentId;
}

/**
 * 第 5 批：把一次导入写进新建的文稿。导入结束（成功、失败或被导入流程自己吞掉的错误）后新文稿若仍是空的，
 * 就删掉并切回原文稿；已经写进内容的新文稿保留，不删导入的数据。返回值 `kept` 表示新文稿是否留下。
 * Batch 5: run an import inside a freshly created document. Afterwards (success, failure, or an error the
 * import handled itself) a still-empty new document is removed and the previous document becomes current
 * again; a new document that holds content is kept (imported data is never deleted). `kept` tells which.
 */
export async function runInNewAnnotationDocument<T>(
  textId: string,
  run: () => Promise<T>,
): Promise<{ result: T; kept: boolean }> {
  const owner = textId.trim();
  const previous = await ensureDefaultAnnotationDocument(owner);
  const created = await createAnnotationDocument(owner);
  const rollBackIfEmpty = async (): Promise<boolean> => {
    const left = await previewAnnotationDocumentReplace(owner, created);
    if (left.unitCount > 0 || left.layerCount > 0) return true;
    await deleteAnnotationDocument(owner, created);
    await switchAnnotationDocument(owner, previous);
    return false;
  };
  let result: T;
  try {
    result = await run();
  } catch (error) {
    await rollBackIfEmpty();
    throw error;
  }
  return { result, kept: await rollBackIfEmpty() };
}
