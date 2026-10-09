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
import { createLogger } from '../observability/logger';

const log = createLogger('annotationDocumentService');

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
 * 删除文稿前的快照没有存成功（或读回核对失败），删除已中止，什么都没改。
 * The pre-delete snapshot could not be saved or verified; the delete was aborted and nothing changed.
 */
export class AnnotationDocumentSnapshotFailedError extends Error {
  constructor(cause: unknown) {
    super(
      `pre-delete snapshot failed; the document was not deleted (${cause instanceof Error ? cause.message : String(cause)})`,
      { cause },
    );
    this.name = 'AnnotationDocumentSnapshotFailedError';
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

/**
 * 层归属哪份文稿——全模块唯一的规则（显示、删除、替换、清单共用）：documentId 指向本项目存在的文稿时
 * 归它；没写、或指向本机不存在的文稿（协作同步不带文稿行）时归当前（默认）文稿，不会凭空消失。
 * The one rule for which document owns a layer (display, delete, replace and manifest share it): the
 * layer's documentId when that document exists in the project; otherwise (absent, or a document that
 * does not exist locally) the current (default) document, so the layer never disappears.
 */
export function resolveLayerOwner(
  layer: Pick<LayerDocType, 'documentId'>,
  scope: AnnotationDocumentScope,
): string | undefined {
  const own = layer.documentId;
  return own !== undefined && own.length > 0 && scope.documentIds.has(own)
    ? own
    : scope.defaultDocumentId;
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
  const scope: AnnotationDocumentScope = {
    defaultDocumentId,
    documentIds: new Set(documents.map((doc) => doc.id)),
  };
  const layerIdsByDocument = new Map<string, string[]>();
  for (const layerDoc of layers) {
    const layer = layerDoc.toJSON();
    const documentId = resolveLayerOwner(layer, scope);
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
  scope: AnnotationDocumentScope,
  forDocumentDelete = false,
): Promise<{ unitIds: string[]; wholeProject: boolean }> {
  const tiers = await db.dexie.tier_definitions.where('textId').equals(textId).toArray();
  const foreignLayerIds = new Set(
    tiers.filter((tier) => resolveLayerOwner(tier, scope) !== documentId).map((t) => t.id),
  );
  // 删除文稿从不整项目替换（无层宿主留给剩下的文稿）| A document delete never replaces the whole project
  const isDefault = documentId === scope.defaultDocumentId && !forDocumentDelete;
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
 * `forDelete`：删除文稿时传删除前的归属范围；此时不会整项目替换。
 * `forDelete`: on a document delete, the pre-delete ownership scope; never replaces the whole project.
 */
export async function deleteAnnotationDocumentUnitGraph(
  db: JieyuDatabase,
  textId: string,
  documentId: string,
  forDelete?: { ownershipScope: AnnotationDocumentScope },
): Promise<{ deletedUnitIds: string[] }> {
  const scope = await collectDocumentUnitIds(
    db,
    textId,
    documentId,
    forDelete?.ownershipScope ?? (await readAnnotationDocumentScope(db, textId)),
    forDelete !== undefined,
  );
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
  if (!text) return { documentId: undefined, unitCount: 0, layerCount: 0 };
  const ownershipScope = await readAnnotationDocumentScope(db, owner);
  const documentId = targetDocumentId ?? ownershipScope.defaultDocumentId;
  const tiers = await db.dexie.tier_definitions.where('textId').equals(owner).toArray();
  const ownLayers = tiers.filter((tier) => resolveLayerOwner(tier, ownershipScope) === documentId);
  if (documentId === undefined) {
    const unitCount = await db.dexie.layer_units.where('textId').equals(owner).count();
    return { documentId, unitCount, layerCount: ownLayers.length };
  }
  const scope = await collectDocumentUnitIds(db, owner, documentId, ownershipScope);
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

/**
 * B5-1：被删层上的行，即使挂在其他文稿保留的单元上（无层宿主、跨文稿父子）也一起删：内容（及其备注）、
 * segment_meta 和派生统计快照。在调用方事务里执行。
 * B5-1: rows on the deleted layers, even on units another document keeps (layer-less hosts, cross-document
 * parents): contents (and their notes), segment_meta and derived statistics snapshots. Caller's transaction.
 */
async function deleteLayerScopedRowsIn(
  db: JieyuDatabase,
  layerIds: readonly string[],
): Promise<void> {
  const ids = [...layerIds];
  const contentIds = (await db.dexie.layer_unit_contents
    .where('layerId')
    .anyOf(ids)
    .primaryKeys()) as string[];
  if (contentIds.length > 0) {
    await db.dexie.user_notes
      .where('[targetType+targetId]')
      .anyOf(targetPairs('translation', contentIds))
      .delete();
    await db.dexie.layer_unit_contents.bulkDelete(contentIds);
  }
  await db.dexie.segment_meta.where('layerId').anyOf(ids).delete();
  await db.dexie.segment_quality_snapshots.where('layerId').anyOf(ids).delete();
  await db.dexie.scope_stats_snapshots.where('layerId').anyOf(ids).delete();
  await db.dexie.translation_status_snapshots.where('layerId').anyOf(ids).delete();
}

export type AnnotationDocumentDeleteResult = {
  currentDocumentId: string;
  deletedUnitIds: string[];
  deletedLayerIds: string[];
  /** 删除前快照的序号（jieyu_overwrite_snapshots）| Seq of the pre-delete snapshot */
  snapshotSeq: number;
};

/**
 * 删除前把整个项目存一份覆盖前快照（复用第 3 批的快照库与“从快照恢复”界面），写后读回核对。
 * Save a verified project snapshot before the delete (reuses the Batch 3 snapshot store and its
 * restore UI).
 */
async function savePreDeleteSnapshot(textId: string): Promise<number> {
  try {
    const [scoped, store] = await Promise.all([
      import('../db/projectScopedSnapshot'),
      import('../db/projectOverwriteSnapshotStore'),
    ]);
    const before = await scoped.exportProjectScopedDatabaseAsJson(textId);
    return await store.saveProjectOverwriteSnapshot({
      projectId: textId,
      packageKind: 'document-delete',
      snapshot: { schemaVersion: before.schemaVersion, collections: before.collections },
    });
  } catch (error) {
    throw new AnnotationDocumentSnapshotFailedError(error);
  }
}

/**
 * 删除一份文稿：它的层（含桥接行、层关系、层标注）和单元图一起删，同一次提交；其他文稿不动。
 * 删的是当前文稿时，最早建立的剩余文稿成为当前文稿。最后一份文稿不能删。来源记录保留（属于项目）。
 * Delete one document: its layers (bridge rows, layer links, tier annotations) and unit graph go in one
 * commit; other documents are untouched. Deleting the current document makes the oldest remaining one
 * current. The last document cannot be deleted. Source records stay (they belong to the project).
 * 删除前先存一份核对过的项目快照，快照失败就不删（AnnotationDocumentSnapshotFailedError）。
 * A verified project snapshot is saved first; if it fails nothing is deleted.
 */
export async function deleteAnnotationDocument(
  textId: string,
  documentId: string,
): Promise<AnnotationDocumentDeleteResult> {
  const owner = textId.trim();
  const db = await getDb();
  // 先做不写库的检查，免得为注定失败的删除留快照 | Cheap checks first, so a doomed delete leaves no snapshot
  const target = await db.dexie.annotation_documents.get(documentId);
  if (!target || target.textId !== owner) throw new AnnotationDocumentNotFoundError(documentId);
  if ((await db.dexie.annotation_documents.where('textId').equals(owner).count()) < 2) {
    throw new AnnotationDocumentLastDocumentError();
  }
  const snapshotSeq = await savePreDeleteSnapshot(owner);
  return { ...(await deleteDocumentRows(db, owner, documentId)), snapshotSeq };
}

/**
 * 删除文稿的写入部分（一个事务）。只有 `deleteAnnotationDocument`（先存快照）和“导入为新文稿”丢弃本次
 * 刚建的文稿时调用。
 * The write part of a document delete (one transaction). Only `deleteAnnotationDocument` (after its
 * snapshot) and "import as a new document" discarding the document it just created call it.
 */
async function deleteDocumentRows(
  db: JieyuDatabase,
  owner: string,
  documentId: string,
): Promise<Omit<AnnotationDocumentDeleteResult, 'snapshotSeq'>> {
  try {
    return await withTransaction(
      db,
      'rw',
      [
        ...dexieStoresForAnnotationImportRw(db),
        db.dexie.tier_annotations,
        db.dexie.segment_quality_snapshots,
        db.dexie.scope_stats_snapshots,
        db.dexie.translation_status_snapshots,
      ],
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
        // 归属按删除前的范围判（与确认框、工作台一致），再换掉当前文稿
        // Ownership is judged in the pre-delete scope (as the dialog and workspace show it)
        const ownershipScope = await readAnnotationDocumentScope(db, owner);
        const tiers = await db.dexie.tier_definitions.where('textId').equals(owner).toArray();
        const layerIds = tiers
          .filter((tier) => resolveLayerOwner(tier, ownershipScope) === documentId)
          .map((t) => t.id);
        await setDefaultDocumentIn(db, owner, next.id);
        const { deletedUnitIds } = await deleteAnnotationDocumentUnitGraph(db, owner, documentId, {
          ownershipScope,
        });
        if (layerIds.length > 0) {
          await db.dexie.tier_annotations.where('tierId').anyOf(layerIds).delete();
          await db.dexie.layer_links.where('layerId').anyOf(layerIds).delete();
          await db.dexie.layer_links.where('hostTranscriptionLayerId').anyOf(layerIds).delete();
          await db.dexie.tier_definitions.bulkDelete(layerIds);
          await deleteLayerScopedRowsIn(db, layerIds);
        }
        await db.dexie.annotation_documents.delete(documentId);
        return {
          currentDocumentId: next.id,
          deletedUnitIds,
          deletedLayerIds: layerIds,
        };
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
  return resolveLayerOwner(layer, scope) === scope.defaultDocumentId;
}

/**
 * 第 5 批：项目里属于其他（非当前）文稿的层 id。工作台之外按当前文稿列层、单元、统计时用它排除。
 * Batch 5: ids of the project's layers that belong to another (non-current) document. Used outside the
 * workbench to leave other documents' layers, units and statistics out.
 */
export async function readOtherDocumentLayerIds(
  db: JieyuDatabase,
  textId: string,
): Promise<Set<string>> {
  const owner = textId.trim();
  if (owner.length === 0) return new Set();
  const [scope, tiers] = await Promise.all([
    readAnnotationDocumentScope(db, owner),
    db.dexie.tier_definitions.where('textId').equals(owner).toArray(),
  ]);
  return new Set(
    tiers.filter((tier) => !isLayerInCurrentDocument(tier, scope)).map((tier) => tier.id),
  );
}

/**
 * 第 5 批：把一次导入写进新建的文稿。导入抛错、或 `isFailed(result)` 为真（导入流程自己吞掉的错误）时，
 * 新文稿连同写了一半的内容一律删掉并切回原文稿（B5-3）；成功但没写进内容时同样删掉；成功且有内容时保留。
 * 返回值 `kept` 表示新文稿是否留下。
 * Batch 5: run an import inside a freshly created document. If the import throws or `isFailed(result)`
 * (an error the import handled itself), the new document and its half-written rows are removed and the
 * previous document becomes current again (B5-3); an empty successful import is removed too; a successful
 * import with content is kept. `kept` tells which.
 */
export async function runInNewAnnotationDocument<T>(
  textId: string,
  run: () => Promise<T>,
  isFailed?: (result: T) => boolean,
): Promise<{ result: T; kept: boolean }> {
  const owner = textId.trim();
  const previous = await ensureDefaultAnnotationDocument(owner);
  const created = await createAnnotationDocument(owner);
  // 丢弃本次刚建的文稿（只含这次导入写的内容，源文件还在），不占用户的删除前快照名额
  // Discard the document this call created (only this import's rows; the source file still exists),
  // without spending one of the user's pre-delete snapshot slots
  const discard = async (): Promise<void> => {
    await deleteDocumentRows(await getDb(), owner, created);
    await switchAnnotationDocument(owner, previous);
  };
  let result: T;
  try {
    result = await run();
  } catch (error) {
    // B5-3：导入中途失败，半成品文稿一律丢弃；回滚失败也不盖掉原错误
    // B5-3: a failed import always discards the half-written document; a failed rollback keeps the error
    await discard().catch((rollbackError: unknown) =>
      log.error('discarding the new document failed', { rollbackError }),
    );
    throw error;
  }
  if (isFailed?.(result) === true) {
    await discard();
    return { result, kept: false };
  }
  const left = await previewAnnotationDocumentReplace(owner, created);
  if (left.unitCount > 0 || left.layerCount > 0) return { result, kept: true };
  await discard();
  return { result, kept: false };
}
