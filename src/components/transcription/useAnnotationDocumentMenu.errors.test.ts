/**
 * 第 5 批：文稿错误提示本地化，不露内部 id。
 * Batch 5: document error messages are localized and never show internal ids.
 */
import { describe, expect, it } from 'vitest';
import {
  AnnotationDocumentCollaboratedProjectError,
  AnnotationDocumentLastDocumentError,
  AnnotationDocumentNotFoundError,
  AnnotationDocumentProjectNotFoundError,
  AnnotationDocumentSnapshotFailedError,
} from '../../services/annotationDocumentService';
import { annotationDocumentErrorMessage } from './useAnnotationDocumentMenu';

describe('annotationDocumentErrorMessage', () => {
  const errors = [
    new AnnotationDocumentProjectNotFoundError('text_secret_id'),
    new AnnotationDocumentNotFoundError('adoc_secret_id'),
    new AnnotationDocumentLastDocumentError(),
    new AnnotationDocumentSnapshotFailedError(new Error('quota exceeded for adoc_secret_id')),
    new AnnotationDocumentCollaboratedProjectError('text_secret_id'),
    new Error('raw failure in adoc_secret_id'),
  ];

  it('gives each known error its own zh-CN text without ids or English', () => {
    const messages = errors.map((error) => annotationDocumentErrorMessage('zh-CN', error));
    expect(new Set(messages).size).toBe(errors.length);
    for (const message of messages) {
      expect(message).not.toMatch(/secret_id|[A-Za-z]{4,}/);
    }
  });

  it('localizes in en-US too', () => {
    expect(
      annotationDocumentErrorMessage('en-US', new AnnotationDocumentLastDocumentError()),
    ).toContain('at least one document');
  });
});
