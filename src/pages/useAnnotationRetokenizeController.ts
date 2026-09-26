import { useCallback, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  annotationRetokenizeHasSnapshot,
  applyAnnotationRetokenize,
  previewAnnotationRetokenize,
  restoreAnnotationRetokenize,
  type AnnotationRetokenizePreview,
} from './annotation/annotationRetokenize';
import type { AnnotationSaveNotice } from './useAnnotationWorkspaceController';

export type AnnotationRetokenizeController = {
  previewUnitId: string;
  proposedForms: string[];
  unchanged: boolean;
  saveNotice: AnnotationSaveNotice;
  forceUnitId: string;
  snapshotUnitId: string;
  onPreview: (unitId: string) => void;
  onApply: (unitId: string) => void;
  onOverwrite: (unitId: string) => void;
  onRestore: (unitId: string) => void;
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
  const [forceOffer, setForceOffer] = useState<{ unitId: string; proposedForms: string[] } | null>(
    null,
  );
  const [snapshotUnitId, setSnapshotUnitId] = useState('');
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
      void annotationRetokenizeHasSnapshot(unitId)
        .then((hasSnapshot) => {
          setSnapshotUnitId(hasSnapshot ? unitId : '');
        })
        .catch(fail);
    },
    [fail, rows],
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
          if (result.kind === 'candidate') {
            setForceOffer({ unitId, proposedForms: preview.proposedForms });
          }
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

  const onOverwrite = useCallback(
    (unitId: string) => {
      const row = rows.find((item) => item.id === unitId);
      if (
        !row ||
        !forceOffer ||
        forceOffer.unitId !== unitId ||
        forceOffer.proposedForms.length === 0 ||
        applyingRef.current
      ) {
        return;
      }
      const draftTokenIds = new Set(
        row.tokens.filter((token) => drafts[token.id]).map((token) => token.id),
      );
      if (draftTokenIds.size > 0) {
        setSaveNotice({
          kind: 'error',
          message: t(locale, 'workspace.annotation.retokenizeDirty'),
        });
        return;
      }
      applyingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      void applyAnnotationRetokenize({
        textId,
        unitId,
        surface: row.surface,
        proposedForms: forceOffer.proposedForms,
        mode: 'force',
      })
        .then(async (result) => {
          if (result.kind === 'forced') {
            setForceOffer(null);
            setSnapshotUnitId(unitId);
            await reloadWorkspace();
          }
          setSaveNotice({ kind: 'saved', message: '' });
        })
        .catch(fail)
        .finally(() => {
          applyingRef.current = false;
        });
    },
    [drafts, fail, forceOffer, locale, reloadWorkspace, rows, textId],
  );

  const onRestore = useCallback(
    (unitId: string) => {
      if (snapshotUnitId !== unitId || applyingRef.current) return;
      applyingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      void restoreAnnotationRetokenize({ textId, unitId })
        .then(async (result) => {
          if (result.restored) {
            setSnapshotUnitId('');
            setForceOffer(null);
            await reloadWorkspace();
          }
          setSaveNotice({ kind: 'saved', message: '' });
        })
        .catch(fail)
        .finally(() => {
          applyingRef.current = false;
        });
    },
    [fail, reloadWorkspace, snapshotUnitId, textId],
  );

  return {
    previewUnitId: preview?.unitId ?? '',
    proposedForms: preview?.proposedForms ?? [],
    unchanged: preview?.unchanged ?? true,
    saveNotice,
    forceUnitId: forceOffer?.unitId ?? '',
    snapshotUnitId,
    onPreview,
    onApply,
    onOverwrite,
    onRestore,
  };
}
