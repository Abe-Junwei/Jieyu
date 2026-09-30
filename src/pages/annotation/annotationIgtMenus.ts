import type { ContextMenuItem } from '../../components/ContextMenu';
import { t, tf, type Locale } from '../../i18n';
import { planAnnotationTokenDeletion } from './deleteAnnotationToken';
import type { AnnotationRelationMark } from '../useAnnotationRelationController';
import {
  ANNOTATION_ADDABLE_LINES,
  annotationLineKind,
  annotationLineLabelKey,
  annotationLineLanguage,
  annotationLineMoveTarget,
  type AnnotationLineId,
} from './annotationIgtLines';
import { joinAnnotationTokenForms } from './writeAnnotationFormsToSurface';

export function buildAnnotationRowMenuItems(input: {
  locale: Locale;
  unitId: string;
  hasTokens: boolean;
  playing: boolean;
  onPlay?: (unitId: string) => void;
  onOpenTranscription: () => void;
  onWriteFormsToSurface?: (unitId: string) => void;
  tokenForms?: readonly string[];
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (input.onPlay) {
    items.push({
      testId: `annotation-igt-play-${input.unitId}`,
      label: input.playing
        ? t(input.locale, 'workspace.annotation.playing')
        : t(input.locale, 'workspace.annotation.play'),
      onClick: () => input.onPlay?.(input.unitId),
    });
  }
  if (input.onWriteFormsToSurface && input.hasTokens) {
    items.push({
      testId: `annotation-igt-write-surface-${input.unitId}`,
      label: t(input.locale, 'workspace.annotation.writeFormsToSurface'),
      disabled: joinAnnotationTokenForms(input.tokenForms ?? []).length === 0,
      onClick: () => input.onWriteFormsToSurface?.(input.unitId),
    });
  }
  items.push({
    testId: `annotation-igt-open-transcription-${input.unitId}`,
    label: t(input.locale, 'workspace.annotation.openInTranscription'),
    onClick: input.onOpenTranscription,
  });
  return items;
}

export type AnnotationLanguageLineOption = {
  key: string;
  label: string;
};

export function buildAnnotationLineMenuItems(input: {
  locale: Locale;
  unitId: string;
  lineId: string;
  lines: readonly string[];
  languageLines?: readonly AnnotationLanguageLineOption[];
  workingLanguageIds?: readonly string[];
  objectLanguageIds?: readonly string[];
  languageByLine?: Readonly<Record<string, string>>;
  onMove?: (from: string, to: string) => void;
  onRemove?: (lineId: string) => void;
  onAdd?: (lineId: string) => void;
  onAssignLanguage?: (lineId: string, languageId: string) => void;
  glossLanguageDraft?: string;
  onGlossLanguageDraft?: (value: string) => void;
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const up = annotationLineMoveTarget(input.lines, input.lineId, 'up');
  const down = annotationLineMoveTarget(input.lines, input.lineId, 'down');
  if (input.onMove && up) {
    items.push({
      testId: `annotation-igt-line-up-${input.lineId}-${input.unitId}`,
      label: t(input.locale, 'workspace.annotation.moveLineUp'),
      onClick: () => input.onMove?.(input.lineId, up),
    });
  }
  if (input.onMove && down) {
    items.push({
      testId: `annotation-igt-line-down-${input.lineId}-${input.unitId}`,
      label: t(input.locale, 'workspace.annotation.moveLineDown'),
      onClick: () => input.onMove?.(input.lineId, down),
    });
  }
  const kind = annotationLineKind(input.lineId);
  const removable =
    input.lineId.includes(':') ||
    (ANNOTATION_ADDABLE_LINES as readonly AnnotationLineId[]).includes(kind);
  if (input.onRemove && removable && input.lineId !== 'source' && input.lineId !== 'translation') {
    items.push({
      testId: `annotation-igt-remove-line-${input.lineId}-${input.unitId}`,
      label: t(input.locale, 'workspace.annotation.removeLine'),
      separatorBefore: items.length > 0,
      onClick: () => input.onRemove?.(input.lineId),
    });
  }
  const shown = new Set(input.lines);
  const missing = ANNOTATION_ADDABLE_LINES.filter((lineId) => !shown.has(lineId));
  const languageChoices = (input.languageLines ?? []).filter((line) => !shown.has(line.key));
  const addChildren: ContextMenuItem[] = [
    ...missing.map((lineId) => ({
      testId: `annotation-igt-add-line-${lineId}-${input.unitId}`,
      label: t(input.locale, annotationLineLabelKey(lineId)),
      onClick: () => input.onAdd?.(lineId),
    })),
    ...languageChoices.map((line) => ({
      testId: `annotation-igt-add-line-${line.key}-${input.unitId}`,
      label: line.label,
      onClick: () => input.onAdd?.(line.key),
    })),
  ];
  const workingLanguages = input.workingLanguageIds ?? [];
  const objectLanguages = input.objectLanguageIds ?? [];
  if (input.onAdd) {
    for (const languageId of objectLanguages) {
      const key = `source:lang:${languageId}`;
      if (shown.has(key)) continue;
      addChildren.push({
        testId: `annotation-igt-add-layer-source-${languageId}-${input.unitId}`,
        label: annotationLanguageLineLabel(input.locale, 'source', languageId),
        onClick: () => input.onAdd?.(key),
      });
    }
    for (const languageId of workingLanguages) {
      const key = `translation:lang:${languageId}`;
      if (shown.has(key)) continue;
      addChildren.push({
        testId: `annotation-igt-add-layer-translation-${languageId}-${input.unitId}`,
        label: annotationLanguageLineLabel(input.locale, 'translation', languageId),
        onClick: () => input.onAdd?.(key),
      });
    }
  }
  if (input.onAdd && workingLanguages.length > 0) {
    for (const languageId of workingLanguages) {
      const key = `gloss:${languageId}`;
      if (shown.has(key)) continue;
      addChildren.push({
        testId: `annotation-igt-add-line-${key}-${input.unitId}`,
        label: annotationLanguageLineLabel(input.locale, key, languageId),
        selectionVariant: 'dot',
        selectionState: 'unselected',
        onClick: () => input.onAdd?.(key),
      });
    }
  } else if (input.onAdd && input.onGlossLanguageDraft) {
    addChildren.push({
      testId: `annotation-igt-add-gloss-language-${input.unitId}`,
      label: t(input.locale, 'workspace.annotation.lineGloss'),
      keepOpen: true,
      searchField: {
        value: input.glossLanguageDraft ?? '',
        placeholder: t(input.locale, 'workspace.annotation.lineLanguage'),
        testId: `annotation-igt-add-gloss-language-input-${input.unitId}`,
        onChange: input.onGlossLanguageDraft,
        onBlur: (value) => {
          const languageId = value.trim();
          if (languageId.length === 0) return;
          const key = `gloss:${languageId}`;
          if (shown.has(key)) return;
          input.onAdd?.(key);
        },
      },
    });
  }
  const languageMenu = annotationLineLanguageMenu(input);
  if (languageMenu) items.push(languageMenu);
  if (input.onAdd && addChildren.length > 0) {
    items.push({
      label: t(input.locale, 'workspace.annotation.addLine'),
      separatorBefore: items.length > 0,
      children: addChildren,
    });
  }
  return items;
}

function annotationLineLanguageMenu(input: {
  locale: Locale;
  unitId: string;
  lineId: string;
  workingLanguageIds?: readonly string[];
  languageByLine?: Readonly<Record<string, string>>;
  onAssignLanguage?: (lineId: string, languageId: string) => void;
}): ContextMenuItem | null {
  const kind = annotationLineKind(input.lineId);
  if (kind !== 'gloss' && kind !== 'translation' && kind !== 'literal') return null;
  const languages = input.workingLanguageIds ?? [];
  if (languages.length === 0 || !input.onAssignLanguage) return null;
  const current = input.languageByLine?.[input.lineId] ?? annotationLineLanguage(input.lineId);
  return {
    label: t(input.locale, 'workspace.annotation.lineLanguage'),
    separatorBefore: true,
    children: languages.map((languageId) => ({
      testId: `annotation-igt-line-language-${input.lineId}-${languageId}-${input.unitId}`,
      label: languageId,
      selectionVariant: 'dot' as const,
      selectionState: current === languageId ? ('selected' as const) : ('unselected' as const),
      onClick: () => input.onAssignLanguage?.(input.lineId, languageId),
    })),
  };
}

export function annotationLanguageLineLabel(
  locale: Locale,
  key: string,
  languageLabel?: string,
): string {
  const kindLabel = t(locale, annotationLineLabelKey(annotationLineKind(key)));
  const language = (languageLabel ?? annotationLineLanguage(key)).trim();
  if (language.length === 0) return kindLabel;
  return tf(locale, 'workspace.annotation.lineWithLanguage', { line: kindLabel, language });
}

export function buildAnnotationTokenMenuItems(input: {
  locale: Locale;
  tokenId: string;
  mweSelected: boolean;
  morphs: readonly { id: string; form: string }[];
  suppletionLemma: string;
  canAllomorph: boolean;
  onSplit: () => void;
  onMerge: () => void;
  onDelete?: (confirmLoss: boolean) => void;
  tokenIdsInOrder?: readonly string[];
  linkCount?: number;
  onSeed: () => void;
  onCite?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  languageValue?: string;
  onLanguageChange?: (value: string) => void;
  onLanguageBlur?: (value: string) => void;
  objectLanguageIds?: readonly string[];
  pos?: string;
  storedPos?: string;
  onApplyPosByForm?: (pos: string) => void;
  onAddAlternative?: (pos: string) => void;
  onToggleMwe?: () => void;
  onMarkRelation?: (mark: AnnotationRelationMark) => void;
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    {
      testId: `annotation-igt-split-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.tokenSplit'),
      onClick: input.onSplit,
    },
    {
      testId: `annotation-igt-merge-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.tokenMerge'),
      onClick: input.onMerge,
    },
  ];
  if (input.onDelete) {
    const plan = planAnnotationTokenDeletion({
      tokenIdsInOrder: input.tokenIdsInOrder ?? [input.tokenId],
      tokenId: input.tokenId,
      morphCount: input.morphs.length,
      linkCount: input.linkCount ?? 0,
    });
    items.push({
      testId: `annotation-igt-delete-${input.tokenId}`,
      label:
        plan.kind === 'confirm'
          ? tf(input.locale, 'workspace.annotation.deleteTokenLoss', {
              morphs: plan.morphCount,
              links: plan.linkCount,
            })
          : t(input.locale, 'workspace.annotation.deleteToken'),
      onClick: () => input.onDelete?.(plan.kind === 'confirm'),
    });
  }
  if (input.morphs.length === 0) {
    items.push({
      testId: `annotation-igt-seed-morph-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.morphemeSeed'),
      onClick: input.onSeed,
    });
  }
  const lexicon: ContextMenuItem[] = [];
  if (input.onLink) {
    lexicon.push({
      testId: `annotation-igt-link-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.lexemeLink'),
      onClick: input.onLink,
    });
  }
  if (input.onUnlink) {
    lexicon.push({
      testId: `annotation-igt-unlink-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.lexemeUnlink'),
      onClick: input.onUnlink,
    });
  }
  if (input.onCite) {
    lexicon.push({
      testId: `annotation-igt-cite-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.citeExample'),
      onClick: input.onCite,
    });
  }
  const lexiconFirst = lexicon[0];
  if (lexiconFirst) {
    items.push({ ...lexiconFirst, separatorBefore: true }, ...lexicon.slice(1));
  }
  if (input.onToggleMwe) {
    items.push({
      testId: `annotation-igt-mwe-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.includeInMwe'),
      selectionState: input.mweSelected ? 'selected' : 'unselected',
      selectionVariant: 'check',
      onClick: input.onToggleMwe,
    });
  }
  const relations = tokenRelationItems(input);
  if (relations.length > 0) {
    items.push({
      label: t(input.locale, 'workspace.annotation.relationsMenu'),
      separatorBefore: true,
      children: relations,
    });
  }
  const pos = input.pos?.trim() ?? '';
  const storedPos = input.storedPos?.trim() ?? '';
  if (input.onApplyPosByForm && pos.length > 0) {
    items.push({
      testId: `annotation-igt-pos-apply-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.applyPosByForm'),
      separatorBefore: true,
      onClick: () => input.onApplyPosByForm?.(pos),
    });
  }
  if (input.onAddAlternative && storedPos.length > 0 && pos.length > 0 && pos !== storedPos) {
    items.push({
      testId: `annotation-igt-alt-add-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.addAlternative'),
      onClick: () => input.onAddAlternative?.(pos),
    });
  }
  const objectLanguages = input.objectLanguageIds ?? [];
  if (objectLanguages.length > 0 && input.onLanguageBlur) {
    items.push({
      label: t(input.locale, 'workspace.annotation.tokenLanguage'),
      separatorBefore: true,
      children: objectLanguages.map((languageId) => ({
        testId: `annotation-igt-language-${input.tokenId}-${languageId}`,
        label: languageId,
        selectionVariant: 'dot' as const,
        selectionState:
          (input.languageValue ?? '') === languageId
            ? ('selected' as const)
            : ('unselected' as const),
        onClick: () => input.onLanguageBlur?.(languageId),
      })),
    });
  } else if (input.onLanguageChange && input.onLanguageBlur) {
    items.push({
      label: t(input.locale, 'workspace.annotation.tokenLanguage'),
      separatorBefore: true,
      keepOpen: true,
      searchField: {
        value: input.languageValue ?? '',
        testId: `annotation-igt-language-${input.tokenId}`,
        onChange: input.onLanguageChange,
        onBlur: input.onLanguageBlur,
      },
    });
  }
  return items;
}

function tokenRelationItems(input: {
  locale: Locale;
  tokenId: string;
  morphs: readonly { id: string; form: string }[];
  suppletionLemma: string;
  canAllomorph: boolean;
  onMarkRelation?: (mark: AnnotationRelationMark) => void;
}): ContextMenuItem[] {
  const mark = input.onMarkRelation;
  if (!mark) return [];
  const items: ContextMenuItem[] = [];
  input.morphs.forEach((morph, index) => {
    const earlier = input.morphs[index - 1];
    if (earlier !== undefined) {
      items.push({
        testId: `annotation-igt-redup-${morph.id}`,
        label: `${t(input.locale, 'workspace.annotation.copiesPrevious')} · ${morph.form}`,
        onClick: () =>
          mark({
            kind: 'reduplicates',
            tokenId: input.tokenId,
            reduplicantId: morph.id,
            stemId: earlier.id,
          }),
      });
      items.push({
        testId: `annotation-igt-share-${morph.id}`,
        label: `${t(input.locale, 'workspace.annotation.sameFeature')} · ${morph.form}`,
        onClick: () =>
          mark({
            kind: 'sharedFeature',
            laterMorphId: morph.id,
            earlierMorphId: earlier.id,
          }),
      });
    }
    items.push({
      testId: `annotation-igt-inc-${morph.id}`,
      label: `${t(input.locale, 'workspace.annotation.markIncorporated')} · ${morph.form}`,
      onClick: () => mark({ kind: 'incorporation', morphId: morph.id }),
    });
    if (input.canAllomorph) {
      items.push({
        testId: `annotation-igt-allomorph-${morph.id}`,
        label: `${t(input.locale, 'workspace.annotation.markAllomorph')} · ${morph.form}`,
        onClick: () => mark({ kind: 'allomorph', morphId: morph.id }),
      });
    }
  });
  if (input.suppletionLemma.length > 0) {
    items.push({
      testId: `annotation-igt-suppletion-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.markSuppletion'),
      onClick: () =>
        mark({
          kind: 'suppletes',
          tokenId: input.tokenId,
          underlying: input.suppletionLemma,
        }),
    });
  }
  (
    [
      ['substitutesSegment', 'workspace.annotation.markSubstitution'],
      ['deletesSegment', 'workspace.annotation.markDeletion'],
      ['overwritesTone', 'workspace.annotation.markTone'],
    ] as const
  ).forEach(([kind, key]) => {
    items.push({
      testId: `annotation-igt-${kind}-${input.tokenId}`,
      label: t(input.locale, key),
      onClick: () => mark({ kind, tokenId: input.tokenId }),
    });
  });
  return items;
}
