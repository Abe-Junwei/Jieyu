import type { LayerConstraint } from '../../db';
import type { OrthographyInteropMetadata } from '../../utils/orthographyInteropMetadata';
import {
  absorbEafFlexTier,
  countsAsEafSpeakerTier,
  flexTierDisposition,
  flexTierLocale,
  isPhoneticTranscriptionTier,
  isUtteranceNoteTier,
  parseAlignableAnnotations,
  parseRefAnnotations,
  phoneticTranscriptionTier,
  type EafPickAnnotation,
  type EafTierPick,
  publishFilledTier,
  publishTranslationTier,
  recordControlledVocabularyNotes,
  stashUnassignedTier,
  unitsFromPickedAnnotations,
  utteranceNoteRows,
} from '../../utils/eafTierPick';
import { formatEafSideChannelNote, parseEafSideChannelNote } from '../../utils/eafTierRole';
import type { EafImportResult, EafSideChannelNote, EafTranscriptionTier } from './eafTypes';
import { readEafTierLanguageId } from './eafXml';

type AnnotationEntry = EafPickAnnotation;

type LinguisticTypeInfo = {
  timeAlignable: boolean;
  constraints?: string;
  controlledVocabularyRef?: string;
};

export type EafImportDraft = {
  units: EafImportResult['units'];
  foundPrimaryTranscription: boolean;
  defaultLocale: string | undefined;
  transcriptionTierName: string | undefined;
};

export function importOneEafTier(
  draft: EafImportDraft,
  tier: Element,
  tierIndex: number,
  ctx: {
    linguisticTypes: Map<string, LinguisticTypeInfo>;
    timeSlotMap: Map<string, number>;
    tierMetadata: Map<string, OrthographyInteropMetadata>;
    translationTiers: EafImportResult['translationTiers'];
    tierLocales: Map<string, string>;
    participantSet: Set<string>;
    annotationTimeMap: Map<string, { startTime: number; endTime: number }>;
    tierConstraints: EafImportResult['tierConstraints'];
    importedUserNotes: NonNullable<EafImportResult['userNotes']>;
    documentTitle: Record<string, string>;
    speakerNotes: NonNullable<EafImportResult['speakerNotes']>;
    unmappedTierIds: string[];
    baseline: { wordTierId?: string; speakerId?: string };
    sideChannelNotes: EafSideChannelNote[];
    extraTranscriptionTiers: EafTranscriptionTier[];
    wordTierEntries: Array<{ tierId: string; anns: AnnotationEntry[] }>;
    childOfWordTier: Map<
      string,
      Array<{ tierId: string; eafConstraint?: string; anns: AnnotationEntry[] }>
    >;
    alignableByTierId: Map<string, AnnotationEntry[]>;
    hasExplicitRoles: boolean;
    fieldPick: EafTierPick;
    tierPick: EafTierPick | undefined;
    anchorSources: AnnotationEntry[];
    childAnnotationIdByParentId: Map<string, string>;
    parentTierIdByTierId: Map<string, string>;
  },
): void {
  const {
    linguisticTypes,
    timeSlotMap,
    tierMetadata,
    translationTiers,
    tierLocales,
    participantSet,
    annotationTimeMap,
    tierConstraints,
    importedUserNotes,
    documentTitle,
    speakerNotes,
    unmappedTierIds,
    baseline,
    sideChannelNotes,
    extraTranscriptionTiers,
    wordTierEntries,
    childOfWordTier,
    alignableByTierId,
    hasExplicitRoles,
    fieldPick,
    tierPick,
    anchorSources,
    childAnnotationIdByParentId,
    parentTierIdByTierId,
  } = ctx;

  const tierId = tier.getAttribute('TIER_ID') ?? `tier_${tierIndex}`;
  const participant = tier.getAttribute('PARTICIPANT') ?? undefined;
  const unitSpeaker = participant && participant !== '***' ? participant : undefined;
  const disposition = tierPick ? flexTierDisposition(tierId) : undefined;
  const locale = disposition
    ? flexTierLocale(
        tierId,
        tier.getAttribute('LANG_REF')?.trim(),
        tier.getAttribute('DEFAULT_LOCALE')?.trim(),
      )
    : readEafTierLanguageId(tier);
  const typeRef = tier.getAttribute('LINGUISTIC_TYPE_REF') ?? undefined;
  const parentRef = tier.getAttribute('PARENT_REF') ?? undefined;
  if (parentRef !== undefined && parentRef.length > 0) parentTierIdByTierId.set(tierId, parentRef);

  if (participant && participant !== '***' && countsAsEafSpeakerTier(tierId)) {
    participantSet.add(participant);
  }

  const tierRole = tierMetadata.get(tierId)?.role;
  const tierNoteKind = tierMetadata.get(tierId)?.noteKind;
  if (tierRole === 'exclude') return;

  if (tierRole === undefined && isPhoneticTranscriptionTier(tierId)) {
    const refAnns = parseRefAnnotations(tier, annotationTimeMap);
    const phoneticAnns = refAnns.length > 0 ? refAnns : (alignableByTierId.get(tierId) ?? []);
    const phonetic = phoneticTranscriptionTier({
      tierId,
      ...(locale ? { locale } : {}),
      ...(unitSpeaker ? { speakerId: unitSpeaker } : {}),
      annotations: phoneticAnns,
    });
    if (phonetic) extraTranscriptionTiers.push(phonetic);
    if (locale) tierLocales.set(tierId, locale);
    return;
  }

  if (tierRole === undefined && isUtteranceNoteTier(tierId)) {
    const refAnns = parseRefAnnotations(tier, annotationTimeMap);
    const noteAnns = refAnns.length > 0 ? refAnns : (alignableByTierId.get(tierId) ?? []);
    importedUserNotes.push(...utteranceNoteRows(noteAnns));
    return;
  }

  // Jieyu-exported notes tier must round-trip as user_notes, not a translation layer.
  if (tierId === 'notes' || tierRole === 'notes' || tierNoteKind) {
    const noteAnns = [
      ...parseAlignableAnnotations(tier, timeSlotMap),
      ...parseRefAnnotations(tier, annotationTimeMap),
    ];
    for (const a of noteAnns) {
      if (!a.text.trim()) continue;
      const parsedNote = parseEafSideChannelNote(a.text);
      const kind = parsedNote?.kind ?? tierNoteKind;
      const text = parsedNote
        ? formatEafSideChannelNote(parsedNote.kind, parsedNote.value)
        : a.text;
      if (kind) {
        sideChannelNotes.push({
          kind,
          text: parsedNote?.value ?? a.text,
          ...(a.annotationRef
            ? { parentAnnotationId: a.annotationRef }
            : a.annotationId
              ? { parentAnnotationId: a.annotationId }
              : {}),
        });
        continue;
      }
      importedUserNotes.push({
        startTime: a.startTime,
        endTime: a.endTime,
        text,
        ...(a.annotationRef ? { annotationRef: a.annotationRef } : {}),
      });
    }
    return;
  }

  // 判断层类型：有 LINGUISTIC_TYPE 声明则用它，否则回退到 PARENT_REF 推断
  // Determine tier type: prefer LINGUISTIC_TYPE info, fallback to PARENT_REF heuristic
  const lingType = typeRef ? linguisticTypes.get(typeRef) : undefined;
  const isTimeAlignable = lingType != null ? lingType.timeAlignable : !parentRef;
  const isIndependentTier = isTimeAlignable && !parentRef;
  const eafConstraint = lingType?.constraints;
  const isSymbolicSubdivision = eafConstraint === 'Symbolic_Subdivision';

  // 映射 ELAN CONSTRAINTS → LayerConstraint | Map ELAN CONSTRAINTS → LayerConstraint
  // Symbolic_Subdivision is not a Jieyu LayerConstraint; tokens absorb word tiers.
  const constraint: LayerConstraint =
    eafConstraint === 'Symbolic_Association'
      ? 'symbolic_association'
      : eafConstraint === 'Time_Subdivision'
        ? 'time_subdivision'
        : isTimeAlignable
          ? 'independent_boundary'
          : 'symbolic_association';
  tierConstraints.set(tierId, {
    constraint,
    ...(parentRef ? { parentTierId: parentRef } : {}),
    ...(isSymbolicSubdivision ? { symbolicSubdivision: true } : {}),
  });

  if (
    hasExplicitRoles &&
    tierRole === undefined &&
    stashUnassignedTier({
      tierId,
      parentTierId: parentRef,
      eafConstraint,
      annotations: parseRefAnnotations(tier, annotationTimeMap),
      alignable: alignableByTierId.get(tierId) ?? [],
      pick: fieldPick,
      anchorSources,
      wordTierEntries,
      childOfWordTier,
    })
  ) {
    if (locale) tierLocales.set(tierId, locale);
    return;
  }

  if (tierPick && disposition && disposition !== 'phrase-transcription') {
    if (locale) tierLocales.set(tierId, locale);
    const refAnns = parseRefAnnotations(tier, annotationTimeMap);
    const classified = refAnns.length > 0 ? refAnns : (alignableByTierId.get(tierId) ?? []);
    absorbEafFlexTier({
      disposition,
      tierId,
      ...(parentRef ? { parentTierId: parentRef } : {}),
      ...(locale ? { locale } : {}),
      ...(participant ? { participant } : {}),
      ...(eafConstraint ? { eafConstraint } : {}),
      annotations: classified,
      translationTiers,
      anchorSources,
      wordForms: wordTierEntries,
      wordChildren: childOfWordTier,
      notes: importedUserNotes,
      documentTitle,
      speakerNotes,
      unmappedTierIds,
      baseline,
    });
    return;
  }

  if (isIndependentTier) {
    // ── 独立时间对齐层（转写层）| Independent time-aligned tier (transcription) ──
    const annotations = parseAlignableAnnotations(tier, timeSlotMap);
    for (const a of annotations) {
      if (a.annotationId) {
        annotationTimeMap.set(a.annotationId, { startTime: a.startTime, endTime: a.endTime });
      }
    }

    const mappedUnits = annotations.map((a) => ({
      startTime: a.startTime,
      endTime: a.endTime,
      transcription: a.text,
      ...(unitSpeaker ? { speakerId: unitSpeaker } : {}),
      ...(a.annotationId ? { annotationId: a.annotationId } : {}),
    }));
    if (lingType?.controlledVocabularyRef) {
      recordControlledVocabularyNotes(sideChannelNotes, annotations);
    }
    if (tierPick) {
      if (tierId === tierPick.transcriptionTierId) {
        draft.foundPrimaryTranscription = true;
        if (locale) draft.defaultLocale = locale;
        draft.transcriptionTierName = tierId;
        draft.units = mappedUnits;
      } else if (tierPick.anchorTierIds.has(tierId)) {
        anchorSources.push(...annotations);
      } else {
        if (locale) tierLocales.set(tierId, locale);
        publishTranslationTier(translationTiers, tierId, annotations, unmappedTierIds);
      }
      return;
    }
    if (tierRole === 'translation') {
      if (locale) tierLocales.set(tierId, locale);
      publishFilledTier(translationTiers, tierId, annotations);
    } else if (!draft.foundPrimaryTranscription) {
      draft.foundPrimaryTranscription = true;
      if (locale) draft.defaultLocale = locale;
      draft.transcriptionTierName = tierId;
      draft.units = mappedUnits;
    } else if (tierRole === 'transcription') {
      if (locale) tierLocales.set(tierId, locale);
      extraTranscriptionTiers.push({
        tierName: tierId,
        ...(locale ? { locale } : {}),
        units: mappedUnits,
      });
    } else {
      if (locale) tierLocales.set(tierId, locale);
      publishTranslationTier(translationTiers, tierId, annotations, unmappedTierIds);
    }
  } else {
    // ── 依赖层（翻译/注释/词层）| Dependent tier (translation / word / morph) ──
    if (locale) tierLocales.set(tierId, locale);

    const refAnns = parseRefAnnotations(tier, annotationTimeMap);
    const anns = refAnns.length > 0 ? refAnns : parseAlignableAnnotations(tier, timeSlotMap);
    if (anns.length === 0) return;

    if (
      (tierPick !== undefined && tierId === tierPick.transcriptionTierId) ||
      (tierPick === undefined && tierRole === 'transcription' && !draft.foundPrimaryTranscription)
    ) {
      const parentAnns = parentRef ? (alignableByTierId.get(parentRef) ?? []) : [];
      const built = unitsFromPickedAnnotations(anns, parentAnns, unitSpeaker);
      draft.units = built.units;
      for (const [parentId, childId] of built.childAnnotationIdByParentId) {
        childAnnotationIdByParentId.set(parentId, childId);
      }
      draft.foundPrimaryTranscription = true;
      if (locale) draft.defaultLocale = locale;
      draft.transcriptionTierName = tierId;
      return;
    }
    if (tierPick && tierPick.anchorTierIds.has(tierId)) {
      anchorSources.push(...anns);
      return;
    }
    if (tierPick && tierPick.phraseSubdivisionTierIds.has(tierId)) {
      publishTranslationTier(translationTiers, tierId, anns, unmappedTierIds);
      return;
    }

    const parentIsWordTier = parentRef
      ? wordTierEntries.some((entry) => entry.tierId === parentRef)
      : false;

    const parentsTranscriptionTier =
      parentRef === draft.transcriptionTierName ||
      extraTranscriptionTiers.some((entry) => entry.tierName === parentRef);
    const parentIsAnchor =
      parentRef !== undefined && (tierPick?.anchorTierIds.has(parentRef) ?? false);
    if (tierPick?.wordTierIds.has(tierId) && parentRef && parentIsWordTier) {
      const list = childOfWordTier.get(parentRef) ?? [];
      list.push({
        tierId,
        ...(eafConstraint ? { eafConstraint } : {}),
        anns,
      });
      childOfWordTier.set(parentRef, list);
      return;
    }
    if (
      tierPick?.wordTierIds.has(tierId) &&
      parentRef &&
      (parentsTranscriptionTier || parentIsAnchor)
    ) {
      wordTierEntries.push({ tierId, anns });
      return;
    }
    if (
      isSymbolicSubdivision &&
      parentRef &&
      (parentsTranscriptionTier || (parentIsAnchor && (tierPick?.wordTierIds.has(tierId) ?? false)))
    ) {
      wordTierEntries.push({ tierId, anns });
      return;
    }
    if (lingType?.controlledVocabularyRef) {
      recordControlledVocabularyNotes(sideChannelNotes, anns);
      return;
    }

    if (parentIsWordTier && parentRef) {
      const list = childOfWordTier.get(parentRef) ?? [];
      list.push({
        tierId,
        ...(eafConstraint ? { eafConstraint } : {}),
        anns,
      });
      childOfWordTier.set(parentRef, list);
      return;
    }

    publishTranslationTier(translationTiers, tierId, anns, unmappedTierIds);
  }
}
