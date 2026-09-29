import type { LayerConstraint } from '../../db';
import { ingestTextFile } from '../../utils/textIngestion';
import {
  parseOrthographyInteropMetadata,
  type OrthographyInteropMetadata,
} from '../../utils/orthographyInteropMetadata';
import { createLogger } from '../../observability/logger';
import type { InterchangeLoss } from '../../utils/interchangeLossReport';
import { eafTimeValueToSeconds, resolveEafTimeUnit } from '../../utils/eafTimeUnits';
import { attachEafWordTiers, fillEmptyTranscriptionFromTokens } from '../../utils/eafWordAttach';
import {
  anchorNotesForUnits,
  detachMorphChildTiers,
  maxEafChildrenPerParent,
  parseAlignableAnnotations,
  parseRefAnnotations,
  pickEafTiers,
  type EafPickAnnotation,
  retargetAnnotationsToChildIds,
  unitsFromAnchorAnnotations,
} from '../../utils/eafTierPick';
import type {
  EafImportOptions,
  EafImportResult,
  EafSecondaryMediaDescriptor,
  EafSideChannelNote,
  EafTranscriptionTier,
  TimelineInteropMetadata,
} from './eafTypes';
import {
  extractTimelineMetadata,
  JIEYU_LAYER_META_PREFIX,
  JIEYU_PROJECT_META_TIMELINE,
  mediaFilenameFromDescriptor,
} from './eafXml';
import { importOneEafTier } from './eafImportTier';
import {
  resolveImportedEafTierLanguage,
  type EafLanguageRecord,
} from '../../utils/eafTierLanguage';

const log = createLogger('EafService');

type AnnotationEntry = EafPickAnnotation;

export function importFromEaf(xmlString: string, options?: EafImportOptions): EafImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`EAF XML 解析失败: ${parseError.textContent}`);
  }

  // Extract media descriptors (first = primary filename; rest = secondary metadata)
  const mediaDescriptors = Array.from(doc.querySelectorAll('MEDIA_DESCRIPTOR'));
  const mediaFilename = mediaDescriptors[0]
    ? mediaFilenameFromDescriptor(mediaDescriptors[0])
    : 'unknown.wav';
  const secondaryMedia: EafSecondaryMediaDescriptor[] = mediaDescriptors.slice(1).map((el) => {
    const filename = mediaFilenameFromDescriptor(el);
    const mimeType = el.getAttribute('MIME_TYPE')?.trim() || undefined;
    const url = el.getAttribute('MEDIA_URL')?.trim() || undefined;
    return {
      filename,
      ...(mimeType ? { mimeType } : {}),
      ...(url ? { url } : {}),
    };
  });

  // ── <LANGUAGE> 元素 → 语言 ID/标签映射 | Parse <LANGUAGE> elements ──
  const languageLabels = new Map<string, string>();
  const eafLanguages = new Map<string, EafLanguageRecord>();
  doc.querySelectorAll('LANGUAGE').forEach((el) => {
    const langId = el.getAttribute('LANG_ID')?.trim();
    const langLabel = el.getAttribute('LANG_LABEL')?.trim();
    const langDef = el.getAttribute('LANG_DEF')?.trim();
    if (!langId) return;
    if (langLabel) languageLabels.set(langId, langLabel);
    eafLanguages.set(langId, {
      ...(langLabel ? { label: langLabel } : {}),
      ...(langDef ? { def: langDef } : {}),
    });
  });

  // ── <LINGUISTIC_TYPE> → 层结构分类 | Parse <LINGUISTIC_TYPE> for tier classification ──
  const linguisticTypes = new Map<
    string,
    { timeAlignable: boolean; constraints?: string; controlledVocabularyRef?: string }
  >();
  doc.querySelectorAll('LINGUISTIC_TYPE').forEach((el) => {
    const typeId = el.getAttribute('LINGUISTIC_TYPE_ID');
    const timeAlignable = el.getAttribute('TIME_ALIGNABLE') !== 'false';
    const constraints = el.getAttribute('CONSTRAINTS') ?? undefined;
    const controlledVocabularyRef =
      el.getAttribute('CONTROLLED_VOCABULARY_REF')?.trim() || undefined;
    if (typeId)
      linguisticTypes.set(typeId, {
        timeAlignable,
        ...(constraints ? { constraints } : {}),
        ...(controlledVocabularyRef ? { controlledVocabularyRef } : {}),
      });
  });

  const timeUnit = resolveEafTimeUnit(doc.querySelector('HEADER')?.getAttribute('TIME_UNITS'));
  const timeSlotMap = new Map<string, number>();
  doc.querySelectorAll('TIME_SLOT').forEach((el) => {
    const id = el.getAttribute('TIME_SLOT_ID');
    const val = el.getAttribute('TIME_VALUE');
    if (id === null || id.length === 0 || val === null || val.length === 0) return;
    const parsed = parseInt(val, 10);
    if (Number.isFinite(parsed)) {
      timeSlotMap.set(id, eafTimeValueToSeconds(parsed, timeUnit.unit));
    }
  });
  const tierMetadata = new Map<string, OrthographyInteropMetadata>();
  let timelineMetadata: TimelineInteropMetadata | undefined;
  doc.querySelectorAll('HEADER > PROPERTY').forEach((property) => {
    const name = property.getAttribute('NAME') ?? '';
    // Standard ELAN header properties (MEDIA_FILE, TIME_UNITS, …) are plain text —
    // only Jieyu interop properties carry JSON payloads.
    const isTimelineMeta = name === JIEYU_PROJECT_META_TIMELINE;
    const isLayerMeta = name.startsWith(JIEYU_LAYER_META_PREFIX);
    if (!isTimelineMeta && !isLayerMeta) return;

    try {
      const metadata = parseOrthographyInteropMetadata(JSON.parse(property.textContent ?? ''));
      if (isTimelineMeta) {
        timelineMetadata = extractTimelineMetadata(metadata);
        return;
      }
      const tierId = name.slice(JIEYU_LAYER_META_PREFIX.length).trim();
      if (!tierId) return;
      if (metadata) tierMetadata.set(tierId, metadata);
    } catch (error) {
      log.warn('failed to parse tier metadata property', { name, err: error });
    }
  });
  if (options?.tierRoles) {
    for (const [tierId, role] of Object.entries(options.tierRoles)) {
      const id = tierId.trim();
      if (!id) continue;
      const prev = tierMetadata.get(id);
      tierMetadata.set(id, { ...(prev ?? {}), role });
    }
  }

  // ── 层解析 | Parse tiers ──
  const tiers = doc.querySelectorAll('TIER');
  let units: EafImportResult['units'] = [];
  const translationTiers = new Map<
    string,
    EafImportResult['translationTiers'] extends Map<string, infer V> ? V : never
  >();
  let defaultLocale: string | undefined;
  const tierLocales = new Map<string, string>();
  const participantSet = new Set<string>();
  let transcriptionTierName: string | undefined;
  // 标注 ID → 时间，用于 REF_ANNOTATION 时间解析 | Annotation ID → time for REF_ANNOTATION resolution
  const annotationTimeMap = new Map<string, { startTime: number; endTime: number }>();
  let foundPrimaryTranscription = false;
  // 每层的约束信息 | Per-tier constraint info
  const tierConstraints = new Map<
    string,
    { constraint: LayerConstraint; parentTierId?: string; symbolicSubdivision?: boolean }
  >();
  const importedUserNotes: NonNullable<EafImportResult['userNotes']> = [];
  const documentTitle: Record<string, string> = {};
  const speakerNotes: NonNullable<EafImportResult['speakerNotes']> = [];
  const unmappedTierIds: string[] = [];
  const baseline: { wordTierId?: string; speakerId?: string } = {};
  const sideChannelNotes: EafSideChannelNote[] = [];
  const extraTranscriptionTiers: EafTranscriptionTier[] = [];
  /** Word tiers (Symbolic_Subdivision under primary) — not flattened into translationTiers */
  const wordTierEntries: Array<{ tierId: string; anns: AnnotationEntry[] }> = [];
  /** Dependent tiers under a word tier (gloss / morph), keyed by parent word tier id */
  const childOfWordTier = new Map<
    string,
    Array<{
      tierId: string;
      eafConstraint?: string;
      field?: 'gloss' | 'pos' | 'morph-form';
      anns: AnnotationEntry[];
    }>
  >();
  const tierElements = Array.from(tiers);
  const alignableByTierId = new Map<string, AnnotationEntry[]>();
  for (const tier of tierElements) {
    const tierId = tier.getAttribute('TIER_ID') ?? '';
    if (!tierId) continue;
    const alignable = parseAlignableAnnotations(tier, timeSlotMap);
    alignableByTierId.set(tierId, alignable);
    for (const annotation of alignable) {
      if (!annotation.annotationId) continue;
      annotationTimeMap.set(annotation.annotationId, {
        startTime: annotation.startTime,
        endTime: annotation.endTime,
      });
    }
  }
  const pickFacts = tierElements.map((tier, tierIndex) => {
    const tierId = tier.getAttribute('TIER_ID') ?? `tier_${tierIndex}`;
    const typeRef = tier.getAttribute('LINGUISTIC_TYPE_REF') ?? undefined;
    const parentRef = tier.getAttribute('PARENT_REF') ?? undefined;
    const lingType = typeRef ? linguisticTypes.get(typeRef) : undefined;
    const alignable = alignableByTierId.get(tierId) ?? [];
    const refAnns = parseRefAnnotations(tier, annotationTimeMap);
    const rows = refAnns.length > 0 ? refAnns : alignable;
    const nonemptyTexts = rows.map((row) => row.text.trim()).filter((text) => text.length > 0);
    return {
      tierId,
      ...(typeRef ? { linguisticTypeId: typeRef } : {}),
      ...(parentRef ? { parentTierId: parentRef } : {}),
      timeAlignable: lingType != null ? lingType.timeAlignable : !parentRef,
      symbolicSubdivision: lingType?.constraints === 'Symbolic_Subdivision',
      nonemptyTexts,
      maxChildrenPerParent: maxEafChildrenPerParent(rows),
    };
  });
  const hasExplicitRoles = [...tierMetadata.values()].some((meta) => Boolean(meta.role));
  const fieldPick = pickEafTiers(pickFacts);
  const tierPick = hasExplicitRoles ? undefined : fieldPick;
  const anchorSources: AnnotationEntry[] = [];
  const childAnnotationIdByParentId = new Map<string, string>();
  const parentTierIdByTierId = new Map<string, string>();

  const draft = {
    units,
    foundPrimaryTranscription,
    defaultLocale,
    transcriptionTierName,
  };
  tiers.forEach((tier, tierIndex) => {
    importOneEafTier(draft, tier, tierIndex, {
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
      eafLanguages,
    });
  });
  units = draft.units;
  foundPrimaryTranscription = draft.foundPrimaryTranscription;
  defaultLocale = draft.defaultLocale;
  transcriptionTierName = draft.transcriptionTierName;

  detachMorphChildTiers({
    translationTiers,
    parentTierIdByTierId,
    childOfWordTier,
    unmappedTierIds,
  });

  const builtFromAnchors = tierPick !== undefined && units.length === 0 && anchorSources.length > 0;
  if (builtFromAnchors) {
    units = unitsFromAnchorAnnotations(anchorSources, baseline.speakerId);
  }
  if (tierPick && anchorSources.length > 0) {
    importedUserNotes.push(
      ...anchorNotesForUnits(anchorSources, units, childAnnotationIdByParentId),
    );
  }
  if (childAnnotationIdByParentId.size > 0) {
    for (const [tierId, annotations] of translationTiers) {
      translationTiers.set(
        tierId,
        retargetAnnotationsToChildIds(annotations, childAnnotationIdByParentId),
      );
    }
    for (let index = 0; index < importedUserNotes.length; index += 1) {
      const note = importedUserNotes[index];
      const ref = note?.annotationRef;
      if (!ref) continue;
      const childId = childAnnotationIdByParentId.get(ref);
      if (!childId || !note) continue;
      importedUserNotes[index] = { ...note, annotationRef: childId };
    }
  }

  if (wordTierEntries.length > 0 && units.length > 0) {
    attachEafWordTiers({
      doc,
      units,
      extraUnits: extraTranscriptionTiers.map((entry) => entry.units),
      wordTierEntries,
      childOfWordTier,
      childAnnotationIdByParentId,
      tierLocales,
      readTier: (tier) => {
        const tierId = tier.getAttribute('TIER_ID') ?? '';
        const langRef = tier.getAttribute('LANG_REF')?.trim();
        const defaultLocale = tier.getAttribute('DEFAULT_LOCALE')?.trim();
        const named = resolveImportedEafTierLanguage({
          tierId,
          ...(langRef ? { langRef } : {}),
          ...(defaultLocale ? { defaultLocale } : {}),
          languages: eafLanguages,
        });
        return {
          ...(named ? { locale: named } : {}),
          anns: parseRefAnnotations(tier, annotationTimeMap),
        };
      },
    });
  }
  if (builtFromAnchors) {
    fillEmptyTranscriptionFromTokens(units);
    if (!transcriptionTierName && baseline.wordTierId) transcriptionTierName = baseline.wordTierId;
  }

  const importLosses: InterchangeLoss[] = [];
  if (timeUnit.unrecognized) importLosses.push({ code: 'unrecognized-time-unit' });
  if (unmappedTierIds.length > 0) {
    importLosses.push({ code: 'unmapped-field', name: unmappedTierIds.join(', ') });
  }
  if (
    tierPick?.transcriptionTierId &&
    tierPick.transcriptionTierId !== tierPick.firstIndependentTimeAlignedTierId
  ) {
    importLosses.push({ code: 'guessed-tier', name: tierPick.transcriptionTierId });
  }

  return {
    mediaFilename,
    ...(secondaryMedia.length > 0 ? { secondaryMedia } : {}),
    ...(timelineMetadata ? { timelineMetadata } : {}),
    units,
    translationTiers,
    ...(defaultLocale ? { defaultLocale } : {}),
    tierLocales,
    participants: [...participantSet],
    ...(transcriptionTierName ? { transcriptionTierName } : {}),
    languageLabels,
    tierConstraints,
    tierMetadata,
    ...(importedUserNotes.length > 0 ? { userNotes: importedUserNotes } : {}),
    ...(Object.keys(documentTitle).length > 0 ? { documentTitle } : {}),
    ...(speakerNotes.length > 0 ? { speakerNotes } : {}),
    ...(sideChannelNotes.length > 0 ? { sideChannelNotes } : {}),
    ...(extraTranscriptionTiers.length > 0 ? { extraTranscriptionTiers } : {}),
    ...(timeUnit.unrecognized ? { unrecognizedTimeUnit: true as const } : {}),
    ...(importLosses.length > 0 ? { losses: importLosses } : {}),
    ...(tierPick?.promptTiers ? { tierRolePrompt: tierPick.promptTiers } : {}),
  };
}

/**
 * @deprecated 使用 ingestTextFile 替代 | Use ingestTextFile instead
 */
export async function readFileAsText(file: File, _encoding = 'utf-8'): Promise<string> {
  const result = await ingestTextFile(file, { xmlMode: true });
  return result.text;
}
