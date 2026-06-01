import { describe, expect, it } from 'vitest';
import { RECOVERY_EXPORT_COLLECTIONS } from './io';

describe('RECOVERY_EXPORT_COLLECTIONS', () => {
  it('includes user_notes and does not reference a non-existent notes store', () => {
    expect(RECOVERY_EXPORT_COLLECTIONS).toContain('user_notes');
    expect(RECOVERY_EXPORT_COLLECTIONS).not.toContain('notes');
  });
});
