import { useCallback, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { AutoGlossPreviewMatch } from '../ai/autoGlossPreview';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  applyAnnotationAutoGlossPreview,
  previewAnnotationAutoGloss,
} from './annotation/applyAnnotationAutoGloss';
import type { AnnotationSaveNotice } from './useAnnotationWorkspaceController';

export type AnnotationAutoGlossController = {
  previewUnitId: string;
  matches: AutoGlossPreviewMatch[];
  saveNotice: AnnotationSaveNotice;
  onPreview: (unitId: string) => void;
  onApply: (unitId: string) => void;
};

export function useAnnotationAutoGlossController(input: {
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
  rows: readonly AnnotationIgtRow[];
  reloadWorkspace: () => Promise<unknown>;
}): AnnotationAutoGlossController {
  const { drafts, rows, reloadWorkspace } = input;
  const locale = useLocale();
  const [matches, setMatches] = useState<AutoGlossPreviewMatch[]>([]);
  const [previewUnitId, setPreviewUnitId] = useState('');
  const [saveNotice, setSaveNotice] = useState<AnnotationSaveNotice>({ kind: 'idle', message: '' });

  const skipTokenIds = useCallback(
    (unitId: string) => {
      const row = rows.find((item) => item.id === unitId);
      const ids = new Set<string>();
      for (const token of row?.tokens ?? []) {
        if (drafts[token.id]) ids.add(token.id);
      }
      return ids;
    },
    [drafts, rows],
  );

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
      if (unitId.length === 0) return;
      setSaveNotice({ kind: 'saving', message: '' });
      void previewAnnotationAutoGloss(unitId, skipTokenIds(unitId))
        .then((result) => {
          setMatches(result.matches);
          setPreviewUnitId(unitId);
          setSaveNotice({ kind: 'idle', message: '' });
        })
        .catch(fail);
    },
    [fail, skipTokenIds],
  );

  const onApply = useCallback(
    (unitId: string) => {
      if (unitId.length === 0 || matches.length === 0 || previewUnitId !== unitId) return;
      setSaveNotice({ kind: 'saving', message: '' });
      void applyAnnotationAutoGlossPreview(unitId, matches)
        .then(async () => {
          setMatches([]);
          setPreviewUnitId('');
          await reloadWorkspace();
          setSaveNotice({ kind: 'saved', message: '' });
        })
        .catch(fail);
    },
    [fail, matches, previewUnitId, reloadWorkspace],
  );

  return { previewUnitId, matches, saveNotice, onPreview, onApply };
}
