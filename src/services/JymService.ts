/**
 * JYM：单项目可编辑包，默认带受管媒体与附件字节（rev5 D1、7.1–7.4；第 3 批第二个切片）。
 * 实现在 `projectPackageService`，与 JYT 共用；这里是 JYM 入口与项目中心预览用的类型。
 * JYM: single-project editable package that carries managed media and attachment bytes by default
 * (rev5 D1, 7.1–7.4; batch 3, second slice). The implementation lives in `projectPackageService`,
 * shared with JYT; this module holds the JYM entry points and the project-hub preview types.
 */
import type { ImportConflictStrategy } from '../db/types';
import {
  downloadProjectPackage,
  exportProjectPackage,
  overwriteProjectWithPackage,
  previewProjectPackageRestore,
  restoreProjectPackageAsNew,
  type ProjectPackageExportOptions,
  type ProjectPackageKind,
  type ProjectPackageOverwriteResult,
  type ProjectPackageReadOptions,
  type ProjectPackageRestorePreview,
  type ProjectPackageRestoreResult,
} from './projectPackageService';

export {
  JYM_PACKAGE_POLICY,
  LEGACY_PACKAGE_MIMETYPES,
  PROJECT_PACKAGE_MIMETYPES,
  ProjectPackageTooLargeError,
} from './projectPackageService';

type JymReadOptions = Omit<ProjectPackageReadOptions, 'expectedKind'>;

export function exportProjectToJym(
  textId: string,
  options?: ProjectPackageExportOptions,
): Promise<Uint8Array> {
  return exportProjectPackage('jym', textId, options);
}

export function downloadProjectJym(
  textId: string,
  baseName?: string,
  options?: ProjectPackageExportOptions,
): Promise<void> {
  return downloadProjectPackage('jym', textId, baseName, options);
}

export function previewJymRestore(
  archiveBytes: Uint8Array,
  options?: JymReadOptions & { overwriteTargetProjectId?: string },
): Promise<ProjectPackageRestorePreview> {
  return previewProjectPackageRestore(archiveBytes, { ...options, expectedKind: 'jym' });
}

export function restoreJymAsNewProject(
  archiveBytes: Uint8Array,
  options?: JymReadOptions,
): Promise<ProjectPackageRestoreResult> {
  return restoreProjectPackageAsNew(archiveBytes, { ...options, expectedKind: 'jym' });
}

export function overwriteProjectWithJym(
  archiveBytes: Uint8Array,
  options: JymReadOptions & { targetProjectId: string },
): Promise<ProjectPackageOverwriteResult> {
  return overwriteProjectWithPackage(archiveBytes, { ...options, expectedKind: 'jym' });
}

// ─── 项目中心预览用的类型 | Project-hub preview types ─────────────────────────

type ArchiveKind = ProjectPackageKind;

interface JieyuArchiveManifest {
  formatVersion: number;
  kind: ArchiveKind;
  schemaVersion: number;
  exportedAt: string;
  systemRefs?: Array<{ id: string }>;
}

export interface JieyuArchiveImportPreviewCollection {
  name: string;
  incoming: number;
  conflicts: number;
  existing: number;
  willInsertUpsert: number;
  willInsertSkipExisting: number;
  willInsertReplaceAll: number;
}

/** 项目包的恢复方式（D5）| How a project package is restored (D5) */
export type ProjectArchiveRestoreMode = 'restore-as-new' | 'overwrite-current';

export interface JieyuArchiveRestoreAsNewPreview {
  sourceProjectTitle: string;
  mediaWithoutBytes: number;
  /** JYM 带字节恢复的媒体与附件 | Media and attachments a JYM restores with bytes */
  includedBytesCount: number;
  includedBytesTotal: number;
  skippedLanguageIds: string[];
  /** 只在当前项目从未协作过时出现（D5、D6、T33）| Present only for a never-collaborated current project */
  overwriteCurrentProject?: {
    targetProjectId: string;
    targetTitle: string;
    /** false：会丢本机字节，不能覆盖（4.2-7）| false: local bytes would be lost */
    available: boolean;
    bytesAtRiskCount: number;
  };
}

export interface JieyuArchiveImportPreview {
  kind: ArchiveKind;
  manifest: JieyuArchiveManifest;
  /** JYT / JYM 一律恢复为新项目（或覆盖当前项目），没有导入策略可选（D5）| Always restore-as-new (D5) */
  restoreAsNewProject: JieyuArchiveRestoreAsNewPreview;
  collections: JieyuArchiveImportPreviewCollection[];
  /** 当前代码里不存在的系统引用（rev5 4.2-9）| System refs the running code cannot resolve */
  unresolvedSystemRefs: string[];
  totalIncoming: number;
  totalConflicts: number;
}

export type { ArchiveKind, ImportConflictStrategy, JieyuArchiveManifest };
