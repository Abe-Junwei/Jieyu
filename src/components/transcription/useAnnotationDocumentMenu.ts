/**
 * 第 5 批（D4）：项目中心里的「标注文稿」菜单——列出文稿、切换、新建、重命名、删除当前文稿。
 * Batch 5 (D4): the project hub "Annotation documents" menu — list, switch, create, rename and delete.
 *
 * shortcut: 名称与删除确认用浏览器自带的 prompt / confirm，没有专门的对话框。
 * shortcut: names and the delete confirmation use the browser's prompt / confirm, not a custom dialog.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContextMenuItem } from '../ContextMenu';
import type { AnnotationDocumentDocType } from '../../db';
import { t, tf, type Locale } from '../../i18n';
import {
  canCreateAnnotationDocument,
  createAnnotationDocument,
  deleteAnnotationDocument,
  listAnnotationDocuments,
  previewAnnotationDocumentReplace,
  renameAnnotationDocument,
  switchAnnotationDocument,
} from '../../services/annotationDocumentService';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import { fireAndForget } from '../../utils/fireAndForget';

type UseAnnotationDocumentMenuInput = {
  locale: Locale;
  textId: string;
  /** 菜单打开时刷新列表 | Refresh the list whenever the menu opens */
  isOpen: boolean;
  closeMenu: () => void;
  onDocumentsChanged: () => Promise<void>;
  notifyError: (message: string) => void;
};

/** 文稿显示名：有标题用标题，否则按建立顺序「文稿 N」| Title, else "Document N" by creation order */
export function annotationDocumentLabel(
  locale: Locale,
  doc: AnnotationDocumentDocType,
  index: number,
): string {
  const title = doc.title ? readAnyMultiLangLabel(doc.title)?.trim() : undefined;
  return title && title.length > 0
    ? title
    : tf(locale, 'transcription.projectHub.documents.untitled', { index: index + 1 });
}

export function useAnnotationDocumentMenu(input: UseAnnotationDocumentMenuInput): ContextMenuItem {
  const { locale, textId, isOpen, closeMenu, onDocumentsChanged, notifyError } = input;
  const [documents, setDocuments] = useState<AnnotationDocumentDocType[]>([]);

  const refresh = useCallback(async () => {
    const rows = textId ? await listAnnotationDocuments(textId) : [];
    // 固定按建立时间排列，切换时不跳动 | Stable creation order so switching does not reorder
    setDocuments([...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, [textId]);

  useEffect(() => {
    if (!isOpen) return;
    fireAndForget(refresh(), {
      context: 'src/components/transcription/useAnnotationDocumentMenu.ts:L58',
      policy: 'user-visible',
    });
  }, [isOpen, refresh]);

  const run = useCallback(
    (action: () => Promise<boolean>) => {
      closeMenu();
      fireAndForget(
        (async () => {
          try {
            if (!(await action())) return;
            await onDocumentsChanged();
            await refresh();
          } catch (error) {
            notifyError(
              tf(locale, 'transcription.projectHub.documents.failed', {
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        })(),
        {
          context: 'src/components/transcription/useAnnotationDocumentMenu.ts:L67',
          policy: 'user-visible',
        },
      );
    },
    [closeMenu, locale, notifyError, onDocumentsChanged, refresh],
  );

  return useMemo<ContextMenuItem>(() => {
    const currentIndex = documents.findIndex((doc) => doc.isDefault);
    const current = currentIndex >= 0 ? documents[currentIndex] : undefined;
    const currentLabel = current ? annotationDocumentLabel(locale, current, currentIndex) : '';
    const canCreate = textId.length > 0 && canCreateAnnotationDocument(textId);
    return {
      label: t(locale, 'transcription.projectHub.group.documents'),
      variant: 'category',
      ...(documents.length > 1 ? { meta: currentLabel } : {}),
      children: [
        ...documents.map((doc, index) => ({
          label: annotationDocumentLabel(locale, doc, index),
          testId: `annotation-document-${index + 1}`,
          selectionState: doc.isDefault ? ('selected' as const) : ('unselected' as const),
          selectionVariant: 'check' as const,
          onClick: () =>
            run(async () => {
              if (doc.isDefault) return false;
              await switchAnnotationDocument(textId, doc.id);
              return true;
            }),
        })),
        {
          label: canCreate
            ? t(locale, 'transcription.projectHub.documents.create')
            : t(locale, 'transcription.projectHub.documents.collaboratedHint'),
          testId: 'annotation-document-create',
          separatorBefore: documents.length > 0,
          disabled: !canCreate,
          onClick: () =>
            run(async () => {
              const name = window.prompt(
                t(locale, 'transcription.projectHub.documents.createPrompt'),
                '',
              );
              if (name === null) return false;
              await createAnnotationDocument(textId, name);
              return true;
            }),
        },
        {
          label: t(locale, 'transcription.projectHub.documents.rename'),
          testId: 'annotation-document-rename',
          disabled: !current,
          onClick: () =>
            run(async () => {
              if (!current) return false;
              const name = window.prompt(
                t(locale, 'transcription.projectHub.documents.renamePrompt'),
                current.title ? (readAnyMultiLangLabel(current.title) ?? '') : '',
              );
              if (name === null) return false;
              await renameAnnotationDocument(textId, current.id, name);
              return true;
            }),
        },
        {
          label: t(locale, 'transcription.projectHub.documents.delete'),
          testId: 'annotation-document-delete',
          danger: true,
          disabled: !current || documents.length < 2,
          onClick: () =>
            run(async () => {
              if (!current) return false;
              const preview = await previewAnnotationDocumentReplace(textId, current.id);
              const confirmed = window.confirm(
                tf(locale, 'transcription.projectHub.documents.deleteConfirm', {
                  name: currentLabel,
                  units: preview.unitCount,
                  layers: preview.layerCount,
                }),
              );
              if (!confirmed) return false;
              await deleteAnnotationDocument(textId, current.id);
              return true;
            }),
        },
      ],
    };
  }, [documents, locale, run, textId]);
}
