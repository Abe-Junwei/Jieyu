/**
 * 第 5 批：标注文稿的显示名。
 * Batch 5: display name of an annotation document.
 */
import type { AnnotationDocumentDocType } from '../db';
import { tf, type Locale } from '../i18n';
import { readAnyMultiLangLabel } from './multiLangLabels';

/** 文稿显示名：有标题用标题，否则按列表顺序「文稿 N」| Title, else "Document N" by list order */
export function annotationDocumentLabel(
  locale: Locale,
  doc: AnnotationDocumentDocType,
  index: number,
): string {
  const title = doc.title ? readAnyMultiLangLabel(doc.title)?.trim() : undefined;
  return title !== undefined && title.length > 0
    ? title
    : tf(locale, 'transcription.projectHub.documents.untitled', { index: index + 1 });
}
