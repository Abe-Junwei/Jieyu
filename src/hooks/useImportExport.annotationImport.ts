export type AnnotationImportBridgeStrategy = 'preserve-source' | 'bridge-target' | 'preserve-source-and-bridge';

export const DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY: AnnotationImportBridgeStrategy = 'preserve-source-and-bridge';

export function shouldWriteOriginalSourceText(strategy: AnnotationImportBridgeStrategy): boolean {
  return strategy === 'preserve-source' || strategy === 'preserve-source-and-bridge';
}

export function shouldWriteBridgedTargetText(strategy: AnnotationImportBridgeStrategy): boolean {
  return strategy === 'bridge-target' || strategy === 'preserve-source-and-bridge';
}