/**
 * 导入来源登记（rev5 4.1 SourceRecord / 4.2-1~4；切片 2B-D）。
 * Import source records (rev5 4.1 SourceRecord / 4.2-1~4; slice 2B-D).
 *
 * - 身份一律是 UUID；同名不同内容各占一行，显示名自动加序号区分。
 * - 重新导入的匹配顺序：EAF URN 相同 → 更新已有文档（显示名保持不变）；sha256 相同 → 内容相同，不新增；
 *   只有文件名相同 → 新来源。
 * - 哈希在事务外先算好，事务里登记，写入后读回校验。
 * - 关联录音必须是本项目里存在的那一条；文件名只用于提示，不自动关联。
 * - Identity is a UUID; same name with different content gets its own row and a numbered display name.
 * - Re-import matching: same EAF URN → update the existing document (display name kept); same sha256 →
 *   same content, nothing new; same file name only → a new source.
 * - Hash outside the transaction, register inside it, read back afterwards.
 * - A linked recording must exist in this project; file names only suggest, never auto-link.
 */
import { sourceFormatFromName } from '../utils/projectSourceFiles';
import {
  dexieStoresForSourceRecordsRw,
  getDb,
  withTransaction,
  type SourceRecordDocType,
} from '../db';
import { computeBlobSha256 } from '../utils/blobSha256';
import { newCatalogUuid } from './projectCatalogScope';

export type SourceImportCandidate = {
  textId: string;
  originalName: string;
  format: string;
  sha256?: string;
  externalDocId?: string;
};

/** 登记前的预览结果 | Preview of what registration will do */
export type SourceImportPlan =
  | { kind: 'update-existing'; record: SourceRecordDocType }
  | { kind: 'same-content'; record: SourceRecordDocType }
  | { kind: 'new'; displayName: string };

export class SourceMediaLinkError extends Error {
  constructor(
    public readonly reason: 'media-missing' | 'media-other-project',
    public readonly mediaId: string,
  ) {
    super(
      reason === 'media-missing'
        ? `recording "${mediaId}" does not exist`
        : `recording "${mediaId}" belongs to another project`,
    );
    this.name = 'SourceMediaLinkError';
  }
}

export class SourceProjectNotFoundError extends Error {
  constructor(public readonly textId: string) {
    super(`project "${textId}" does not exist`);
    this.name = 'SourceProjectNotFoundError';
  }
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** 显示名在项目内（不分大小写）唯一 | Display names are unique per project, case-insensitively */
export function uniqueSourceDisplayName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((value) => value.trim().toLocaleLowerCase()));
  const base = name.trim();
  if (!used.has(base.toLocaleLowerCase())) return base;
  const { stem, ext } = splitName(base);
  for (let n = 2; ; n += 1) {
    const next = `${stem} (${n})${ext}`;
    if (!used.has(next.toLocaleLowerCase())) return next;
  }
}

/** 纯函数：按 4.2-2 的顺序判定重新导入 | Pure: classify a (re-)import in rev5 4.2-2 order */
export function planSourceImport(
  candidate: SourceImportCandidate,
  existing: readonly SourceRecordDocType[],
): SourceImportPlan {
  const own = existing.filter((row) => row.textId === candidate.textId);
  const urn = candidate.externalDocId?.trim();
  if (urn) {
    const byUrn = own.find((row) => row.externalDocId === urn);
    if (byUrn) return { kind: 'update-existing', record: byUrn };
  }
  if (candidate.sha256) {
    const bySha = own.find((row) => row.sha256 === candidate.sha256);
    if (bySha) return { kind: 'same-content', record: bySha };
  }
  return {
    kind: 'new',
    displayName: uniqueSourceDisplayName(
      candidate.originalName,
      own.map((row) => row.displayName),
    ),
  };
}

async function assertMediaInProject(
  db: Awaited<ReturnType<typeof getDb>>,
  textId: string,
  mediaId: string,
): Promise<void> {
  const media = await db.dexie.media_items.get(mediaId);
  if (!media) throw new SourceMediaLinkError('media-missing', mediaId);
  if (media.textId !== textId) throw new SourceMediaLinkError('media-other-project', mediaId);
}

export async function listSourceRecords(textId: string): Promise<SourceRecordDocType[]> {
  const projectId = textId.trim();
  if (projectId.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.source_records.where('textId').equals(projectId).toArray();
  return rows.sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.id.localeCompare(b.id));
}

/** 只读预览：不写库 | Read-only preview */
export async function previewSourceImport(
  candidate: SourceImportCandidate,
): Promise<SourceImportPlan> {
  return planSourceImport(candidate, await listSourceRecords(candidate.textId));
}

/** 读 EAF HEADER 里的 URN 属性 | Read the EAF HEADER `URN` property */
export function extractEafDocumentUrn(xml: string): string | undefined {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    for (const property of Array.from(doc.querySelectorAll('HEADER > PROPERTY'))) {
      if (property.getAttribute('NAME') === 'URN') {
        const urn = property.textContent?.trim() ?? '';
        return urn.length > 0 ? urn : undefined;
      }
    }
    return undefined;
  }
  const match = /<PROPERTY\s+NAME="URN"\s*>([^<]*)<\/PROPERTY>/.exec(xml);
  const urn = match?.[1]?.trim() ?? '';
  return urn.length > 0 ? urn : undefined;
}

/**
 * 导入对话框里的来源预览（只读，不写库）：URN 相同 → 将更新已有文档；内容相同 → 提示；同名 → 新显示名。
 * Import-dialog source preview (read-only): same URN → will update the existing document; same content →
 * notice; same name → new numbered display name.
 */
export async function previewSourceImportForFile(
  textId: string,
  file: Blob & { name: string },
): Promise<SourceImportPlan | null> {
  const owner = textId.trim();
  if (owner.length === 0) return null;
  const sha256 = await computeBlobSha256(file);
  const externalDocId = /\.eaf$/i.test(file.name)
    ? extractEafDocumentUrn(await file.text())
    : undefined;
  return previewSourceImport({
    textId: owner,
    originalName: file.name,
    format: sourceFormatFromName(file.name),
    ...(sha256 ? { sha256 } : {}),
    ...(externalDocId ? { externalDocId } : {}),
  });
}

export type RegisterImportedSourceInput = SourceImportCandidate & {
  /** 原件字节，用来在事务外算哈希 | Original bytes; hashed outside the transaction */
  bytes?: Blob;
  byteSize?: number;
  mediaId?: string;
  linkedMediaFilename?: string;
  importBatchId?: string;
};

export async function registerImportedSource(
  input: RegisterImportedSourceInput,
): Promise<{ plan: SourceImportPlan; record: SourceRecordDocType }> {
  const textId = input.textId.trim();
  const originalName = input.originalName.trim();
  if (textId.length === 0 || originalName.length === 0) {
    throw new Error('registerImportedSource requires textId and originalName');
  }
  // 4.2-3：哈希在事务外先算好 | Hash outside the transaction
  const sha256 = input.sha256 ?? (input.bytes ? await computeBlobSha256(input.bytes) : undefined);
  const byteSize = input.byteSize ?? input.bytes?.size;
  const externalDocId = input.externalDocId?.trim() || undefined;
  const mediaId = input.mediaId?.trim() || undefined;
  const linkedMediaFilename = input.linkedMediaFilename?.trim() || undefined;
  const importBatchId = input.importBatchId?.trim() || newCatalogUuid();
  const db = await getDb();

  const result = await unwrapSourceErrors(
    withTransaction(
      db,
      'rw',
      [...dexieStoresForSourceRecordsRw(db)],
      async () => {
        if (!(await db.dexie.texts.get(textId))) throw new SourceProjectNotFoundError(textId);
        if (mediaId) await assertMediaInProject(db, textId, mediaId);
        const existing = await db.dexie.source_records.where('textId').equals(textId).toArray();
        const plan = planSourceImport(
          {
            textId,
            originalName,
            format: input.format,
            ...(sha256 ? { sha256 } : {}),
            ...(externalDocId ? { externalDocId } : {}),
          },
          existing,
        );
        const now = new Date().toISOString();
        if (plan.kind === 'same-content') return { plan, record: plan.record };
        if (plan.kind === 'update-existing') {
          // 更新已有文档：显示名保持不变 | Update the existing document; keep its display name
          const next: SourceRecordDocType = {
            ...plan.record,
            originalName,
            format: input.format,
            importedAt: now,
            importBatchId,
            updatedAt: now,
            ...(sha256 ? { sha256 } : {}),
            ...(byteSize !== undefined ? { byteSize } : {}),
            ...(mediaId ? { mediaId } : {}),
            ...(linkedMediaFilename ? { linkedMediaFilename } : {}),
          };
          await db.dexie.source_records.put(next);
          return { plan, record: next };
        }
        const record: SourceRecordDocType = {
          id: newCatalogUuid(),
          textId,
          originalName,
          displayName: plan.displayName,
          format: input.format,
          importedAt: now,
          importBatchId,
          storedBytes: false,
          updatedAt: now,
          ...(byteSize !== undefined ? { byteSize } : {}),
          ...(sha256 ? { sha256 } : {}),
          ...(externalDocId ? { externalDocId } : {}),
          ...(mediaId ? { mediaId } : {}),
          ...(linkedMediaFilename ? { linkedMediaFilename } : {}),
        };
        await db.dexie.source_records.add(record);
        return { plan, record };
      },
      { label: 'sourceRecordService.register' },
    ),
  );

  // 写入后读回校验 | Read back after the write
  const stored = await db.dexie.source_records.get(result.record.id);
  if (!stored || stored.textId !== textId || stored.sha256 !== result.record.sha256) {
    throw new Error(`source record ${result.record.id} did not read back as written`);
  }
  return { plan: result.plan, record: stored };
}

/** 事务包装会改写错误；把本模块的领域错误还原出来 | Unwrap this module's typed errors from the tx wrapper */
async function unwrapSourceErrors<T>(run: Promise<T>): Promise<T> {
  try {
    return await run;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof SourceMediaLinkError || cause instanceof SourceProjectNotFoundError) {
      throw cause;
    }
    throw error;
  }
}

async function patchSourceRecord(
  textId: string,
  recordId: string,
  patch: (row: SourceRecordDocType) => SourceRecordDocType,
  label: string,
): Promise<SourceRecordDocType | undefined> {
  const db = await getDb();
  return unwrapSourceErrors(
    withTransaction(
      db,
      'rw',
      [...dexieStoresForSourceRecordsRw(db)],
      async () => {
        const row = await db.dexie.source_records.get(recordId);
        if (!row || row.textId !== textId) return undefined;
        const next = patch(row);
        if (next.mediaId) await assertMediaInProject(db, textId, next.mediaId);
        await db.dexie.source_records.put(next);
        return next;
      },
      { label },
    ),
  );
}

export async function renameSourceRecord(
  textId: string,
  recordId: string,
  displayName: string,
): Promise<SourceRecordDocType | undefined> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return undefined;
  return patchSourceRecord(
    textId,
    recordId,
    (row) => ({ ...row, displayName: trimmed, updatedAt: new Date().toISOString() }),
    'sourceRecordService.rename',
  );
}

/** 手动关联 / 取消关联录音（4.2-4）| Manually link or unlink a recording (rev5 4.2-4) */
export async function linkSourceRecordToMedia(
  textId: string,
  recordId: string,
  mediaId: string | null,
): Promise<SourceRecordDocType | undefined> {
  const target = mediaId?.trim() ?? '';
  return patchSourceRecord(
    textId,
    recordId,
    (row) => {
      const { mediaId: _previous, ...rest } = row;
      return {
        ...rest,
        ...(target.length > 0 ? { mediaId: target } : {}),
        updatedAt: new Date().toISOString(),
      };
    },
    'sourceRecordService.link',
  );
}
