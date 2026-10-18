export class StorageReadbackError extends Error {
  readonly code = 'STORAGE_READBACK';

  constructor(operation: string) {
    super(`storage read-back failed after ${operation}`);
    this.name = 'StorageReadbackError';
  }
}
