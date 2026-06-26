import type { TimelineImportMismatchNotice } from '../utils/timelineImportMismatch';

export class ImportMismatchRequiresAckError extends Error {
  readonly notices: ReadonlyArray<TimelineImportMismatchNotice>;
  readonly fileName: string;

  constructor(fileName: string, notices: ReadonlyArray<TimelineImportMismatchNotice>) {
    super('ImportMismatchRequiresAck');
    this.name = 'ImportMismatchRequiresAckError';
    this.fileName = fileName;
    this.notices = notices;
  }
}

export function isImportMismatchRequiresAckError(
  error: unknown,
): error is ImportMismatchRequiresAckError {
  return error instanceof ImportMismatchRequiresAckError;
}
