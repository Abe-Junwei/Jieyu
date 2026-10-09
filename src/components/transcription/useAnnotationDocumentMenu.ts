/**
 * 第 5 批（D4）：项目中心里的「标注文稿」菜单——列出文稿、切换、新建、重命名、删除当前文稿。
 * Batch 5 (D4): the project hub "Annotation documents" menu — list, switch, create, rename and delete.
 * 名称输入与删除确认走应用内对话框（AnnotationDocumentDialog），不用浏览器 prompt / confirm。
 * Names and the delete confirmation use the in-app AnnotationDocumentDialog, not browser prompt / confirm.
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
import type {
  AnnotationDocumentDialogProps,
  AnnotationDocumentDialogRequest,
} from './AnnotationDocumentDialog';

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

export function useAnnotationDocumentMenu(input: UseAnnotationDocumentMenuInput): {
  menu: ContextMenuItem;
  dialog: AnnotationDocumentDialogProps;
} {
  const { locale, textId, isOpen, closeMenu, onDocumentsChanged, notifyError } = input;
  const [documents, setDocuments] = useState<AnnotationDocumentDocType[]>([]);
  const [request, setRequest] = useState<AnnotationDocumentDialogRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const rows = textId ? await listAnnotationDocuments(textId) : [];
    // 固定按建立时间排列，切换时不跳动 | Stable creation order so switching does not reorder
    setDocuments([...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, [textId]);

  useEffect(() => {
    if (!isOpen) return;
    fireAndForget(refresh(), {
      context: 'src/components/transcription/useAnnotationDocumentMenu.ts:L66',
      policy: 'user-visible',
    });
  }, [isOpen, refresh]);

  const reportError = useCallback(
    (error: unknown) =>
      notifyError(
        tf(locale, 'transcription.projectHub.documents.failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
    [locale, notifyError],
  );

  /** 菜单项：关菜单后执行；返回 true 表示文稿变了 | Menu action after closing the menu; true = changed */
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
            reportError(error);
          }
        })(),
        {
          context: 'src/components/transcription/useAnnotationDocumentMenu.ts:L86',
          policy: 'user-visible',
        },
      );
    },
    [closeMenu, onDocumentsChanged, refresh, reportError],
  );

  /** 对话框确认：成功才关；失败留着对话框并提示 | Dialog confirm: closes on success, stays open on failure */
  const confirmDialog = useCallback(
    async (confirmed: AnnotationDocumentDialogRequest) => {
      setBusy(true);
      try {
        if (confirmed.kind === 'create') await createAnnotationDocument(textId, confirmed.name);
        else if (confirmed.kind === 'rename')
          await renameAnnotationDocument(textId, confirmed.documentId, confirmed.name);
        else await deleteAnnotationDocument(textId, confirmed.documentId);
        setRequest(null);
        await onDocumentsChanged();
        await refresh();
      } catch (error) {
        reportError(error);
      } finally {
        setBusy(false);
      }
    },
    [onDocumentsChanged, refresh, reportError, textId],
  );

  const dialog = useMemo<AnnotationDocumentDialogProps>(
    () => ({
      locale,
      request,
      busy,
      onChange: setRequest,
      onCancel: () => setRequest(null),
      onConfirm: (confirmed) =>
        fireAndForget(confirmDialog(confirmed), {
          context: 'src/components/transcription/useAnnotationDocumentMenu.ts:L134',
          policy: 'user-visible',
        }),
    }),
    [busy, confirmDialog, locale, request],
  );

  const menu = useMemo<ContextMenuItem>(() => {
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
          onClick: () => {
            closeMenu();
            setRequest({ kind: 'create', name: '' });
          },
        },
        {
          label: t(locale, 'transcription.projectHub.documents.rename'),
          testId: 'annotation-document-rename',
          disabled: !current,
          onClick: () => {
            if (!current) return;
            closeMenu();
            setRequest({
              kind: 'rename',
              documentId: current.id,
              name: current.title ? (readAnyMultiLangLabel(current.title) ?? '') : '',
            });
          },
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
              setRequest({
                kind: 'delete',
                documentId: current.id,
                label: currentLabel,
                units: preview.unitCount,
                layers: preview.layerCount,
              });
              return false;
            }),
        },
      ],
    };
  }, [closeMenu, documents, locale, run, textId]);

  return { menu, dialog };
}
