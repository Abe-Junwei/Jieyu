// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PENDING_APPROVAL_TTL_MS,
  clearPendingApproval,
  loadPendingApproval,
  savePendingApproval,
} from './aiRuntimeV2Pending';

describe('aiRuntimeV2Pending local storage (R2 migration)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps v1 active entries and drops corrupt / wrong-version rows without throwing', () => {
    savePendingApproval('c1', {
      requestId: 'r1',
      toolName: 'delete_transcription_segment',
      messages: [{ role: 'user', content: 'x' }],
      createdAt: 100,
    });
    localStorage.setItem('jieyu.aiRuntimeV2.pending.c2', '{not-json');
    localStorage.setItem(
      'jieyu.aiRuntimeV2.pending.c3',
      JSON.stringify({
        version: 99,
        requestId: 'r',
        toolName: 't',
        messages: [],
        createdAt: 1,
        expiresAt: 9e12,
      }),
    );
    expect(loadPendingApproval('c1', 200).kind).toBe('active');
    expect(loadPendingApproval('c2', 200).kind).toBe('none');
    expect(loadPendingApproval('c3', 200).kind).toBe('none');
    clearPendingApproval('c1');
    expect(loadPendingApproval('c1', 200).kind).toBe('none');
  });

  it('expired entries are removed and reported once', () => {
    savePendingApproval('c1', {
      requestId: 'r-old',
      toolName: 'delete_layer',
      messages: [],
      createdAt: 0,
    });
    const first = loadPendingApproval('c1', PENDING_APPROVAL_TTL_MS);
    expect(first.kind).toBe('expired');
    expect(loadPendingApproval('c1', PENDING_APPROVAL_TTL_MS + 1).kind).toBe('none');
  });
});
