/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_LAST_EXPORT_KEY,
  markBackupCompleted,
  readLastExportTimestamp,
} from './backupExportTimestamp';

describe('backupExportTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('readLastExportTimestamp seeds storage when empty', () => {
    expect(window.localStorage.getItem(BACKUP_LAST_EXPORT_KEY)).toBeNull();
    const t = readLastExportTimestamp();
    expect(t).toBe(Date.now());
    expect(window.localStorage.getItem(BACKUP_LAST_EXPORT_KEY)).toBe(String(t));
  });

  it('markBackupCompleted updates timestamp', () => {
    readLastExportTimestamp();
    vi.setSystemTime(new Date('2026-01-15T14:00:00.000Z'));
    markBackupCompleted();
    expect(Number(window.localStorage.getItem(BACKUP_LAST_EXPORT_KEY))).toBe(Date.now());
  });
});
