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
import type { SourceRecordDocType } from '../db/types';
import { storagePort } from '../db/storagePort';
import { computeBlobSha256 } from '../utils/blobSha256';
import { newCatalogUuid } from './projectCatalogScope';
import {
  planSourceImport,
  type SourceImportCandidate,
  type SourceImportPlan,
} from './sourceRecordPlan';

export {
  planSourceImport,
  SourceMediaLinkError,
  SourceProjectNotFoundError,
  uniqueSourceDisplayName,
  type SourceImportCandidate,
  type SourceImportPlan,
} from './sourceRecordPlan';

export async function listSourceRecords(textId: string): Promise<SourceRecordDocType[]> {
  const rows = await storagePort().listSourceRecords(textId);
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
  return storagePort().registerImportedSource({
    textId,
    originalName,
    format: input.format,
    importBatchId,
    ...(sha256 ? { sha256 } : {}),
    ...(byteSize !== undefined ? { byteSize } : {}),
    ...(externalDocId ? { externalDocId } : {}),
    ...(mediaId ? { mediaId } : {}),
    ...(linkedMediaFilename ? { linkedMediaFilename } : {}),
  });
}

export async function renameSourceRecord(
  textId: string,
  recordId: string,
  displayName: string,
): Promise<SourceRecordDocType | undefined> {
  return storagePort().renameSourceRecord(textId, recordId, displayName);
}

/** 手动关联 / 取消关联录音（4.2-4）| Manually link or unlink a recording (rev5 4.2-4) */
export async function linkSourceRecordToMedia(
  textId: string,
  recordId: string,
  mediaId: string | null,
): Promise<SourceRecordDocType | undefined> {
  return storagePort().linkSourceRecordMedia(textId, recordId, mediaId);
}
