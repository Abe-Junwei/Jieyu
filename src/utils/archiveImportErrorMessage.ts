/**
 * 把导入格式错误翻成用户看得懂的一句话（RD-1）；其他错误保持原信息。
 * Turn inbound format errors into a readable sentence (RD-1); other errors keep their message.
 */
import { findSnapshotFormatError } from '../db/snapshotFormatError';
import { tf, type Locale } from '../i18n';
import { toErrorMessage } from './saveStateError';

export function describeArchiveImportError(locale: Locale, error: unknown): string {
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
  }
}
