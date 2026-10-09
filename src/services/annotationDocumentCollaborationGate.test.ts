// @vitest-environment jsdom
/**
 * 第 5 批反向门：文稿新建 / 删除后缓存跟着更新。
 * Batch 5 reverse gate: the cache follows document create / delete.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  AnnotationDocumentCollaborationBlockedError,
  assertCollaborationAllowed,
  isMultiDocumentProject,
  refreshMultiDocumentGate,
} from './annotationDocumentCollaborationGate';
import {
  createAnnotationDocument,
  deleteAnnotationDocument,
  ensureDefaultAnnotationDocument,
} from './annotationDocumentService';

const A = 'text_b5_gate';
const NOW = '2026-10-09T08:00:00.000Z';

beforeEach(async () => {
  localStorage.clear();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: A, title: { default: A }, createdAt: NOW, updatedAt: NOW });
});

describe('Batch 5: reverse collaboration gate', () => {
  it('one document: allowed; a second document closes the gate; deleting it opens it again', async () => {
    const first = await ensureDefaultAnnotationDocument(A);
    expect(await refreshMultiDocumentGate(A)).toBe(false);
    expect(() => assertCollaborationAllowed(A)).not.toThrow();

    const second = await createAnnotationDocument(A);
    expect(isMultiDocumentProject(A)).toBe(true);
    expect(() => assertCollaborationAllowed(A)).toThrow(
      AnnotationDocumentCollaborationBlockedError,
    );

    await deleteAnnotationDocument(A, second);
    expect(isMultiDocumentProject(A)).toBe(false);
    expect(await db.annotation_documents.get(first)).toBeDefined();
  });
});
