import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { t, useLocale } from '../i18n';
import { pickDefaultTranscriptionText } from '../utils/transcriptionFormatters';
import { ANNOTATION_LEIPZIG_TEMPLATE_ID } from './annotation/annotationLeipzigGloss';
import {
  collectDirtyAnnotationMorphemeWrites,
  dropMorphemeDraftsForIds,
  planMorphemeFormsFromToken,
  type AnnotationMorphemeDraft,
} from './annotation/annotationMorphemeDrafts';
import {
  buildSeedMorphemes,
  mapStoredMorphemes,
  saveAnnotationMorphemesForToken,
} from './annotation/saveAnnotationMorphemes';
import {
  removeAnnotationTokenLexemeLink,
  saveAnnotationTokenLexemeLink,
  type AnnotationTokenLexemeLinkView,
} from './annotation/saveAnnotationLexemeLink';
import {
  mergeAnnotationUnitTokenWithNext,
  splitAnnotationUnitToken,
} from './annotation/splitMergeAnnotationTokens';
import type { AnnotationIgtRow, AnnotationSaveNotice } from './useAnnotationWorkspaceController';

export type AnnotationMorphologyController = {
  morphsByTokenId: Record<string, ReturnType<typeof mapStoredMorphemes>>;
  linksByTokenId: Record<string, AnnotationTokenLexemeLinkView | undefined>;
  drafts: Record<string, AnnotationMorphemeDraft>;
  linkQueries: Record<string, string>;
  saveNotice: AnnotationSaveNotice;
  validatorProfileId: string;
  structuralProfilesHref: string;
  onMorphDraftChange: (
    morphId: string,
    field: keyof AnnotationMorphemeDraft,
    value: string,
  ) => void;
  onLinkQueryChange: (tokenId: string, value: string) => void;
  onSeedMorphemes: (unitId: string, tokenId: string, tokenForm: string) => void;
  onSaveMorphemes: (unitId: string, tokenId: string) => void;
  onSplitToken: (unitId: string, tokenId: string) => void;
  onMergeToken: (unitId: string, tokenId: string) => void;
  onLinkLexeme: (tokenId: string) => void;
  onUnlinkLexeme: (tokenId: string) => void;
};

export function useAnnotationMorphologyController(input: {
  textId: string;
  rows: readonly AnnotationIgtRow[];
  reloadWorkspace: () => Promise<unknown>;
}): AnnotationMorphologyController {
  const { textId, rows, reloadWorkspace } = input;
  const locale = useLocale();
  const [drafts, setDrafts] = useState<Record<string, AnnotationMorphemeDraft>>({});
  const [linkQueries, setLinkQueries] = useState<Record<string, string>>({});
  const [saveNotice, setSaveNotice] = useState<AnnotationSaveNotice>({ kind: 'idle', message: '' });
  const savingRef = useRef(false);
  const tokenIds = rows.flatMap((row) => row.tokens.map((token) => token.id));

  const dataQuery = useQuery({
    queryKey: ['annotation-morphology', textId, tokenIds.join('|')],
    queryFn: async () => {
      const [morphRows, lexemes, linkGroups] = await Promise.all([
        LinguisticService.units.listMorphemesByTokenIds(tokenIds),
        LinguisticService.lexemes.list(),
        Promise.all(
          tokenIds.map(async (tokenId) => ({
            tokenId,
            links: await LinguisticService.units.listTokenLexemeLinks('token', tokenId),
          })),
        ),
      ]);
      const lemmaById = new Map(
        lexemes.map((lexeme) => [lexeme.id, pickDefaultTranscriptionText(lexeme.lemma)]),
      );
      const linksByTokenId: Record<string, AnnotationTokenLexemeLinkView | undefined> = {};
      for (const group of linkGroups) {
        const link = group.links[0];
        linksByTokenId[group.tokenId] = link
          ? {
              linkId: link.id,
              lexemeId: link.lexemeId,
              lemma: lemmaById.get(link.lexemeId) ?? link.lexemeId,
            }
          : undefined;
      }
      return { morphs: mapStoredMorphemes(morphRows), linksByTokenId };
    },
    enabled: textId.length > 0,
  });

  const morphsByTokenId = useMemo(() => {
    const grouped: Record<string, ReturnType<typeof mapStoredMorphemes>> = {};
    for (const morph of dataQuery.data?.morphs ?? []) {
      const list = grouped[morph.tokenId] ?? [];
      list.push(morph);
      grouped[morph.tokenId] = list;
    }
    return grouped;
  }, [dataQuery.data]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveNotice({ kind: 'saving', message: '' });
      try {
        await action();
        setSaveNotice({ kind: 'saved', message: '' });
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : t(locale, 'workspace.annotation.saveError');
        setSaveNotice({ kind: 'error', message });
      } finally {
        savingRef.current = false;
      }
    },
    [locale],
  );

  const onMorphDraftChange = useCallback(
    (morphId: string, field: keyof AnnotationMorphemeDraft, value: string) => {
      const morph = (dataQuery.data?.morphs ?? []).find((item) => item.id === morphId);
      if (!morph) return;
      setDrafts((prev) => {
        const current = { form: morph.form, gloss: morph.gloss, ...prev[morphId] };
        const merged = { ...current, [field]: value };
        if (merged.form === morph.form && merged.gloss === morph.gloss) {
          return dropMorphemeDraftsForIds(prev, [morphId]);
        }
        return { ...prev, [morphId]: merged };
      });
    },
    [dataQuery.data],
  );

  const onLinkQueryChange = useCallback((tokenId: string, value: string) => {
    setLinkQueries((prev) => ({ ...prev, [tokenId]: value }));
  }, []);

  const onSeedMorphemes = useCallback(
    (unitId: string, tokenId: string, tokenForm: string) => {
      void run(async () => {
        const forms = planMorphemeFormsFromToken(tokenForm);
        if (forms.length === 0) {
          throw new Error(t(locale, 'workspace.annotation.morphemeSplitError'));
        }
        await saveAnnotationMorphemesForToken({
          textId,
          unitId,
          tokenId,
          morphs: buildSeedMorphemes({ textId, unitId, tokenId, forms }),
        });
        await dataQuery.refetch();
      });
    },
    [dataQuery, locale, run, textId],
  );

  const onSaveMorphemes = useCallback(
    (unitId: string, tokenId: string) => {
      void run(async () => {
        const morphs = morphsByTokenId[tokenId] ?? [];
        const writes = collectDirtyAnnotationMorphemeWrites(morphs, drafts);
        if (writes.length === 0) return;
        const next = morphs.map((morph) => writes.find((item) => item.id === morph.id) ?? morph);
        await saveAnnotationMorphemesForToken({
          textId,
          unitId,
          tokenId,
          morphs: next,
        });
        setDrafts((prev) =>
          dropMorphemeDraftsForIds(
            prev,
            morphs.map((item) => item.id),
          ),
        );
        await dataQuery.refetch();
      });
    },
    [dataQuery, drafts, morphsByTokenId, run, textId],
  );

  const onSplitToken = useCallback(
    (unitId: string, tokenId: string) => {
      void run(async () => {
        await splitAnnotationUnitToken(unitId, tokenId);
        await reloadWorkspace();
        await dataQuery.refetch();
      });
    },
    [dataQuery, reloadWorkspace, run],
  );

  const onMergeToken = useCallback(
    (unitId: string, tokenId: string) => {
      void run(async () => {
        await mergeAnnotationUnitTokenWithNext(unitId, tokenId);
        await reloadWorkspace();
        await dataQuery.refetch();
      });
    },
    [dataQuery, reloadWorkspace, run],
  );

  const onLinkLexeme = useCallback(
    (tokenId: string) => {
      void run(async () => {
        await saveAnnotationTokenLexemeLink(tokenId, linkQueries[tokenId] ?? '');
        setLinkQueries((prev) => ({ ...prev, [tokenId]: '' }));
        await dataQuery.refetch();
      });
    },
    [dataQuery, linkQueries, run],
  );

  const onUnlinkLexeme = useCallback(
    (tokenId: string) => {
      void run(async () => {
        await removeAnnotationTokenLexemeLink(tokenId);
        await dataQuery.refetch();
      });
    },
    [dataQuery, run],
  );

  return {
    morphsByTokenId,
    linksByTokenId: dataQuery.data?.linksByTokenId ?? {},
    drafts,
    linkQueries,
    saveNotice,
    validatorProfileId: ANNOTATION_LEIPZIG_TEMPLATE_ID,
    structuralProfilesHref: '/assets/structural-profiles',
    onMorphDraftChange,
    onLinkQueryChange,
    onSeedMorphemes,
    onSaveMorphemes,
    onSplitToken,
    onMergeToken,
    onLinkLexeme,
    onUnlinkLexeme,
  };
}
