import type { ContextMenuItem } from '../../components/ContextMenu';
import { t, type Locale } from '../../i18n';
import type { AnnotationRelationMark } from '../useAnnotationRelationController';
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

export function buildAnnotationTokenMenuItems(input: {
  locale: Locale;
  tokenId: string;
  mweSelected: boolean;
  morphs: readonly { id: string; form: string }[];
  suppletionLemma: string;
  canAllomorph: boolean;
  onSeed: () => void;
  onToggleMwe?: () => void;
  onMarkRelation?: (mark: AnnotationRelationMark) => void;
}): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (input.morphs.length === 0) {
    items.push({
      testId: `annotation-igt-seed-morph-${input.tokenId}`,
      label: t(input.locale, 'workspace.annotation.morphemeSeed'),
      onClick: input.onSeed,
    });
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
      children: relations,
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
