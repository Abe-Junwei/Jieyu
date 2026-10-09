/**
 * 第 5 批反向门：有多份标注文稿的项目不能开启协作、也不能上传（同步不带文稿行，远端会把各文稿的层
 * 并在一起显示）。正向门见 `canCreateAnnotationDocument`（协作过的项目不能新建文稿）。
 * Batch 5 reverse gate: a project with several annotation documents cannot start collaboration or upload
 * (sync carries no document rows, so the remote would merge every document's layers). The forward gate
 * is `canCreateAnnotationDocument` (a collaborated project cannot add documents).
 *
 * 同步读取用内存缓存：协作桥启动时、以及文稿新建 / 删除后刷新。
 * shortcut: 用 JYT / JYB 覆盖导入把多份文稿带进一个正在同步的项目时，缓存要到下次协作桥启动（切换项目或
 * 重新打开）才更新；在那之前出站写入不受这道门拦。
 * Sync reads use an in-memory cache refreshed when the bridge starts and after documents are created or
 * deleted. shortcut: a JYT / JYB overwrite that brings several documents into a project that is already
 * syncing only updates the cache at the next bridge start.
 */
import { getDb } from '../db';

const multiDocumentProjects = new Map<string, boolean>();

export class AnnotationDocumentCollaborationBlockedError extends Error {
  constructor(readonly textId: string) {
    super(`project "${textId}" has several annotation documents; collaboration and upload are off`);
    this.name = 'AnnotationDocumentCollaborationBlockedError';
  }
}

/** 已知有多份文稿（同步，读缓存）| Known to hold several documents (sync, cached) */
export function isMultiDocumentProject(textId: string): boolean {
  return multiDocumentProjects.get(textId.trim()) === true;
}

/** 重新数一次文稿并更新缓存；返回是否有多份 | Recount documents, update the cache, return whether several */
export async function refreshMultiDocumentGate(textId: string): Promise<boolean> {
  const owner = textId.trim();
  if (owner.length === 0) return false;
  const db = await getDb();
  const several = (await db.dexie.annotation_documents.where('textId').equals(owner).count()) > 1;
  multiDocumentProjects.set(owner, several);
  return several;
}

/** 有多份文稿就抛错（上传类操作前调用）| Throw when several documents (before uploads) */
export function assertCollaborationAllowed(textId: string): void {
  if (isMultiDocumentProject(textId)) throw new AnnotationDocumentCollaborationBlockedError(textId);
}
