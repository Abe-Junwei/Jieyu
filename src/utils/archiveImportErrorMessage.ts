/**
 * 把导入格式错误翻成用户看得懂的一句话（RD-1）；其他错误保持原信息。
 * Turn inbound format errors into a readable sentence (RD-1); other errors keep their message.
 */
import { findSnapshotFormatError, ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { t, tf, type Locale } from '../i18n';
import { toErrorMessage } from './saveStateError';

function findOverwriteBlockedError(error: unknown): ProjectOverwriteBlockedError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof ProjectOverwriteBlockedError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function describeArchiveImportError(locale: Locale, error: unknown): string {
  const overwriteError = findOverwriteBlockedError(error);
  if (overwriteError !== null) {
    switch (overwriteError.reason) {
      case 'not-allowed':
        return t(locale, 'transcription.importExport.overwriteNotAllowed');
      case 'local-bytes-would-be-lost':
        return tf(locale, 'transcription.importExport.overwriteBytesAtRisk', {
          count: overwriteError.bytesAtRisk.length,
        });
      case 'snapshot-failed':
        return t(locale, 'transcription.importExport.overwriteSnapshotFailed');
    }
  }
  const formatError = findSnapshotFormatError(error);
  if (formatError === null) return toErrorMessage(error);
  switch (formatError.code) {
    case 'legacy-database':
      return tf(locale, 'transcription.importExport.snapshotLegacyDatabase', {
        dbName: formatError.dbName ?? `schemaVersion ${formatError.schemaVersion ?? '?'}`,
      });
    case 'unsupported-version':
      return tf(locale, 'transcription.importExport.snapshotUnsupportedVersion', {
        version: formatError.schemaVersion ?? '?',
      });
    case 'invalid-records':
      return tf(locale, 'transcription.importExport.snapshotInvalidRecords', {
        count: formatError.invalidCollections.reduce((sum, item) => sum + item.invalid, 0),
        collections: formatError.invalidCollections
          .map((item) => `${item.collection} ×${item.invalid}`)
          .join(', '),
      });
    case 'unsupported-package':
      return t(locale, 'transcription.importExport.packageUnsupported');
    case 'invalid-package':
      return tf(locale, 'transcription.importExport.packageInvalid', {
        problems: formatError.problems.slice(0, 5).join('; '),
        count: formatError.problems.length,
      });
  }
}
