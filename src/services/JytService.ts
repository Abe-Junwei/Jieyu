/**
 * JYT：单项目、不含媒体的轻量包（rev5 D1、7.1–7.4；第 3 批第一个切片）。
 * 实现在 `projectPackageService`，与 JYM 共用；这里是 JYT 入口。
 * JYT: single-project lightweight package without media (rev5 D1, 7.1–7.4; batch 3, first slice).
 * The implementation lives in `projectPackageService`, shared with JYM; these are the JYT entry points.
 */
import {
  downloadProjectPackage,
  exportProjectPackage,
  LEGACY_PACKAGE_MIMETYPES,
  overwriteProjectWithPackage,
  previewProjectPackageRestore,
  PROJECT_PACKAGE_MIMETYPES,
  restoreProjectPackageAsNew,
  type ProjectPackageOverwriteResult,
  type ProjectPackageReadOptions,
  type ProjectPackageRestorePreview,
  type ProjectPackageRestoreResult,
} from './projectPackageService';
import type { JieyuArchiveEncryptionOptions } from './projectArchiveContainer';

export const JYT_MIMETYPE = PROJECT_PACKAGE_MIMETYPES.jyt;
/** 第 3 批之前的整库 JYT（只用来给出明确的拒绝）| Pre-batch-3 whole-DB JYT (only to reject clearly) */
export const LEGACY_JYT_MIMETYPE = LEGACY_PACKAGE_MIMETYPES.jyt;

type JytReadOptions = Omit<ProjectPackageReadOptions, 'expectedKind'>;

export interface JytExportOptions {
  encryption?: JieyuArchiveEncryptionOptions;
}

export function exportProjectToJyt(
  textId: string,
  options?: JytExportOptions,
): Promise<Uint8Array> {
  return exportProjectPackage('jyt', textId, options);
}

export function downloadProjectJyt(
  textId: string,
  baseName?: string,
  options?: JytExportOptions,
): Promise<void> {
  return downloadProjectPackage('jyt', textId, baseName, options);
}

export function previewJytRestore(
  archiveBytes: Uint8Array,
  options?: JytReadOptions & { overwriteTargetProjectId?: string },
): Promise<ProjectPackageRestorePreview> {
  return previewProjectPackageRestore(archiveBytes, { ...options, expectedKind: 'jyt' });
}

export function restoreJytAsNewProject(
  archiveBytes: Uint8Array,
  options?: JytReadOptions,
): Promise<ProjectPackageRestoreResult> {
  return restoreProjectPackageAsNew(archiveBytes, { ...options, expectedKind: 'jyt' });
}

export function overwriteProjectWithJyt(
  archiveBytes: Uint8Array,
  options: JytReadOptions & { targetProjectId: string },
): Promise<ProjectPackageOverwriteResult> {
  return overwriteProjectWithPackage(archiveBytes, { ...options, expectedKind: 'jyt' });
}
