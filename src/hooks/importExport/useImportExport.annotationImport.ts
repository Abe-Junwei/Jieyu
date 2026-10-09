export type AnnotationImportBridgeStrategy =
  | 'preserve-source'
  | 'bridge-target'
  | 'preserve-source-and-bridge';

export const DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY: AnnotationImportBridgeStrategy =
  'preserve-source-and-bridge';

export function shouldWriteOriginalSourceText(strategy: AnnotationImportBridgeStrategy): boolean {
  return strategy === 'preserve-source' || strategy === 'preserve-source-and-bridge';
}

export function shouldWriteBridgedTargetText(strategy: AnnotationImportBridgeStrategy): boolean {
  return strategy === 'bridge-target' || strategy === 'preserve-source-and-bridge';
}

/** 第 5 批：导入写进当前文稿（替换它）或新建一份文稿 | Batch 5: import into the current document or a new one */
export type AnnotationImportTarget = 'current-document' | 'new-document';
