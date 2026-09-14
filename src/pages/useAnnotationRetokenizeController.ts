import { useCallback, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  applyAnnotationRetokenize,
  previewAnnotationRetokenize,
  type AnnotationRetokenizePreview,
} from './annotation/annotationRetokenize';
import type { AnnotationSaveNotice } from './useAnnotationWorkspaceController';

export type AnnotationRetokenizeController = {
  previewUnitId: string;
  proposedForms: string[];
  unchanged: boolean;
  saveNotice: AnnotationSaveNotice;
  onPreview: (unitId: string) => void;
  onApply: (unitId: string) => void;
};

export function useAnnotationRetokenizeController(input: {
  textId: string;
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  rows: readonly AnnotationIgtRow[];
  reloadWorkspace: () => Promise<unknown>;
}): AnnotationRetokenizeController {
  const { textId, drafts, rows, reloadWorkspace } = input;
  const locale = useLocale();
  const [preview, setPreview] = useState<AnnotationRetokenizePreview | null>(null);
  const [saveNotice, setSaveNotice] = useState<AnnotationSaveNotice>({ kind: 'idle', message: '' });
  const applyingRef = useRef(false);

  const fail = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t(locale, 'workspace.annotation.saveError');
      setSaveNotice({ kind: 'error', message });
    },
    [locale],
  );

  const onPreview = useCallback(
    (unitId: string) => {
      const row = rows.find((item) => item.id === unitId);
      if (!row) return;
      const next = previewAnnotationRetokenize({
        unitId,
        surface: row.surface,
        currentForms: row.tokens.map((token) => token.form),
      });
      setPreview(next);
      setSaveNotice({ kind: 'idle', message: '' });
    },
    [rows],
  );

  const onApply = useCallback(
    (unitId: string) => {
      const row = rows.find((item) => item.id === unitId);
      if (
        !row ||
        !preview ||
        preview.unitId !== unitId ||
        preview.unchanged ||
        preview.proposedForms.length === 0 ||
        applyingRef.current
      ) {
        return;
      }
      applyingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      const draftTokenIds = new Set(
        row.tokens.filter((token) => drafts[token.id]).map((token) => token.id),
      );
      void applyAnnotationRetokenize({
        textId,
        unitId,
        surface: row.surface,
        proposedForms: preview.proposedForms,
        draftTokenIds,
      })
        .then(async (result) => {
          setPreview(null);
          if (result.kind !== 'unchanged') await reloadWorkspace();
          setSaveNotice({ kind: 'saved', message: '' });
        })
        .catch(fail)
        .finally(() => {
          applyingRef.current = false;
        });
    },
    [drafts, fail, preview, reloadWorkspace, rows, textId],
  );

  return {
    previewUnitId: preview?.unitId ?? '',
    proposedForms: preview?.proposedForms ?? [],
    unchanged: preview?.unchanged ?? true,
    saveNotice,
    onPreview,
    onApply,
  };
}
