/**
 * 存储操作的错误。SQLite 和 Dexie 共用，不引用 `engine`。
 */
export class RecordingRemovalBlockedError extends Error {
  readonly code = 'RECORDING_REMOVAL_BLOCKED' as const;

  constructor(
    readonly mediaId: string,
    readonly reason: 'missing' | 'has-bytes' | 'not-acoustic',
  ) {
    super(`removeEmptyRecording: ${mediaId} blocked (${reason})`);
    this.name = 'RecordingRemovalBlockedError';
  }
}

export function recordingRemovalBlockReason(
  error: unknown,
): RecordingRemovalBlockedError['reason'] | undefined {
  if (error instanceof RecordingRemovalBlockedError) return error.reason;
  if (error instanceof Error && error.cause instanceof RecordingRemovalBlockedError) {
    return error.cause.reason;
  }
  return undefined;
}
