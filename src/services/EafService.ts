/**
 * EAF import/export facade.
 * Export lives in `eaf/eafExport.ts`. Import lives in `eaf/eafImport.ts`.
 */

export type {
  EafExportInput,
  EafExportWarning,
  EafImportOptions,
  EafImportResult,
  EafImportToken,
  EafSecondaryMediaDescriptor,
  EafSideChannelNote,
  EafTranscriptionTier,
} from './eaf/eafTypes';

export { resolveEafMediaMimeType } from './eaf/eafXml';
export { downloadEaf, exportToEaf } from './eaf/eafExport';
export { importFromEaf, readFileAsText } from './eaf/eafImport';
