import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AnnotationIgtRow } from './useAnnotationWorkspaceController';
import type { AnnotationTokenDraft } from './annotation/annotationTokenDrafts';
import {
  collectAnnotationValidatorGlosses,
  loadAnnotationValidatorPanel,
  type AnnotationValidatorPanelItem,
} from './annotation/annotationValidatorPanel';

export type AnnotationValidatorPanelController = {
  unitId: string;
  pending: boolean;
  errorMessage: string;
  items: AnnotationValidatorPanelItem[];
};

export function useAnnotationValidatorPanelController(input: {
  focusedUnitId: string;
  rows: readonly AnnotationIgtRow[];
  drafts: Readonly<Record<string, AnnotationTokenDraft>>;
}): AnnotationValidatorPanelController {
  const { focusedUnitId, rows, drafts } = input;
  const row = rows.find((item) => item.id === focusedUnitId);
  const glosses = useMemo(() => collectAnnotationValidatorGlosses(row, drafts), [drafts, row]);
  const query = useQuery({
    queryKey: [
      'annotation-validator-panel',
      focusedUnitId,
      glosses.map((item) => `${item.tokenId}:${item.gloss}`).join('\n'),
    ],
    enabled: glosses.length > 0,
    queryFn: () => loadAnnotationValidatorPanel(glosses),
  });
  const errorMessage =
    query.error instanceof Error && query.error.message.trim().length > 0
      ? query.error.message
      : '';

  return {
    unitId: focusedUnitId,
    pending: glosses.length > 0 && query.isLoading,
    errorMessage,
    items: query.data ?? [],
  };
}
