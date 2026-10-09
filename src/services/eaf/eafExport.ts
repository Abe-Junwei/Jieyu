import type { LayerDocType, LayerLinkDocType, LayerUnitDocType, SpeakerDocType } from '../../db';
import {
  buildOrthographyInteropMetadata,
  type OrthographyInteropMetadata,
} from '../../utils/orthographyInteropMetadata';
import { readEnglishFallbackMultiLangLabel } from '../../utils/multiLangLabels';
import type { EafTierRole } from '../../utils/eafTierRole';
import type { EafExportInput } from './eafTypes';
import {
  escapeXml,
  JIEYU_LAYER_META_PREFIX,
  JIEYU_PROJECT_META_TIMELINE,
  parseEafMetaFromLayerKey,
  resolveEafMediaMimeType,
} from './eafXml';
import { buildEafAdditionalTierXml } from './eafExportAdditionalTiers';
import { buildNoteTierXml } from './eafExportNotes';
import { buildEafWordTierXml } from './eafExportWords';

import { finalizeXmlExport } from '../../utils/xmlSafeText';

export function exportToEaf(input: EafExportInput): string {
  const {
    mediaItem,
    units,
    anchors,
    layers,
    orthographies,
    translations,
    userNotes,
    timelineMetadata,
    layerSegments,
    layerSegmentContents,
    speakers,
    layerLinks,
    tokens = [],
    morphemes = [],
    onWarning,
    onXmlSanitized,
  } = input;
  const sorted = [...units].sort((a, b) => a.startTime - b.startTime);
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const));

  // Build speaker lookup map for PARTICIPANT export
  const speakerById = new Map<string, SpeakerDocType>();
  for (const s of speakers ?? []) speakerById.set(s.id, s);
  const speakerByNormalizedName = new Map<string, SpeakerDocType>();
  for (const speaker of speakers ?? []) {
    const normalized = speaker.name.trim().toLocaleLowerCase('zh-Hans-CN');
    if (normalized) speakerByNormalizedName.set(normalized, speaker);
  }

  const resolveSpeakerDisplayName = (speakerKey: string | undefined): string | undefined => {
    const trimmed = speakerKey?.trim();
    if (!trimmed) return undefined;
    const byId = speakerById.get(trimmed);
    if (byId) return byId.name;
    const byName = speakerByNormalizedName.get(trimmed.toLocaleLowerCase('zh-Hans-CN'));
    if (byName) return byName.name;
    return trimmed;
  };

  // Helper: get the dominant speaker ID from a list of unit IDs (for tier PARTICIPANT)
  const getDominantSpeaker = (uttIds: string[]): string | undefined => {
    const counts = new Map<string, number>();
    for (const id of uttIds) {
      const utt = unitById.get(id);
      if (utt?.speakerId) counts.set(utt.speakerId, (counts.get(utt.speakerId) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;
    let dominant: string | undefined;
    let maxCount = 0;
    for (const [sid, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = sid;
      }
    }
    return dominant;
  };

  const resolveSegmentSpeakerId = (segment: LayerUnitDocType): string | undefined => {
    const explicitSpeakerId = segment.speakerId?.trim();
    if (explicitSpeakerId) return explicitSpeakerId;
    const ownerUnit = segment.unitId ? unitById.get(segment.unitId) : undefined;
    const ownerSpeakerId = ownerUnit?.speakerId?.trim();
    return ownerSpeakerId && ownerSpeakerId.length > 0 ? ownerSpeakerId : undefined;
  };

  const getDominantSpeakerFromSegments = (segments: LayerUnitDocType[]): string | undefined => {
    const counts = new Map<string, number>();
    for (const segment of segments) {
      const speakerId = resolveSegmentSpeakerId(segment);
      if (!speakerId) continue;
      counts.set(speakerId, (counts.get(speakerId) ?? 0) + 1);
    }
    if (counts.size === 0) return undefined;
    let dominant: string | undefined;
    let maxCount = 0;
    for (const [speakerId, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = speakerId;
      }
    }
    return dominant;
  };

  // Build time slots — use shared anchors when available
  let tsCounter = 1;
  const timeSlots: Array<{ id: string; ms: number }> = [];
  const uttSlotMap = new Map<string, { tsStart: string; tsEnd: string }>();

  if (anchors && anchors.length > 0) {
    // Standoff mode: map anchor IDs to TIME_SLOT IDs (shared anchors → shared TIME_SLOTs)
    const anchorToTsId = new Map<string, string>();
    const anchorById = new Map(anchors.map((a) => [a.id, a]));

    const getOrCreateTsForAnchor = (anchorId: string, fallbackMs: number): string => {
      const existing = anchorToTsId.get(anchorId);
      if (existing) return existing;
      const tsId = `ts${tsCounter++}`;
      const anchor = anchorById.get(anchorId);
      timeSlots.push({
        id: tsId,
        ms: anchor ? Math.round(anchor.time * 1000) : Math.round(fallbackMs * 1000),
      });
      anchorToTsId.set(anchorId, tsId);
      return tsId;
    };

    for (const utt of sorted) {
      const tsStart = utt.startAnchorId
        ? getOrCreateTsForAnchor(utt.startAnchorId, utt.startTime)
        : `ts${tsCounter++}`;
      const tsEnd = utt.endAnchorId
        ? getOrCreateTsForAnchor(utt.endAnchorId, utt.endTime)
        : `ts${tsCounter++}`;

      // Add fallback time slots for units without anchors
      if (!utt.startAnchorId) timeSlots.push({ id: tsStart, ms: Math.round(utt.startTime * 1000) });
      if (!utt.endAnchorId) timeSlots.push({ id: tsEnd, ms: Math.round(utt.endTime * 1000) });

      uttSlotMap.set(utt.id, { tsStart, tsEnd });
    }
  } else {
    // Legacy mode: each unit gets its own pair of time slots
    for (const utt of sorted) {
      const tsStart = `ts${tsCounter++}`;
      const tsEnd = `ts${tsCounter++}`;
      timeSlots.push({ id: tsStart, ms: Math.round(utt.startTime * 1000) });
      timeSlots.push({ id: tsEnd, ms: Math.round(utt.endTime * 1000) });
      uttSlotMap.set(utt.id, { tsStart, tsEnd });
    }
  }

  // Build annotation ID counter
  let annCounter = 1;

  // Determine default transcription layer
  const transcriptionLayers = layers.filter((l) => l.layerType === 'transcription');
  const defaultTrcLayer = transcriptionLayers.find((l) => l.isDefault) ?? transcriptionLayers[0];
  const defaultTrcId = defaultTrcLayer?.id;
  const defaultTrcLocale = defaultTrcLayer?.languageId ?? 'en';
  const defaultTrcMeta = defaultTrcLayer ? parseEafMetaFromLayerKey(defaultTrcLayer.key) : {};
  const defaultTierId = defaultTrcMeta.tierId ?? 'default';
  const tierIdentityMetadata = new Map<string, OrthographyInteropMetadata>();
  const registerTierIdentityMetadata = (tierId: string, layer?: LayerDocType) => {
    const metadata = buildOrthographyInteropMetadata(layer, orthographies) ?? {};
    const role: EafTierRole | undefined =
      layer?.layerType === 'translation'
        ? 'translation'
        : layer?.layerType === 'transcription'
          ? 'transcription'
          : undefined;
    const next = { ...metadata, ...(role ? { role } : {}) };
    if (Object.keys(next).length > 0) tierIdentityMetadata.set(tierId, next);
  };
  registerTierIdentityMetadata(defaultTierId, defaultTrcLayer);

  // 层 ID -> 导出 tier 名称映射（用于 parentLayerId 优先导出）
  // Layer ID -> exported tier name mapping (for parentLayerId-first export semantics)
  const tierNameByLayerId = new Map<string, string>();
  if (defaultTrcLayer) {
    tierNameByLayerId.set(defaultTrcLayer.id, defaultTierId);
  }
  for (const layer of layers) {
    const layerMeta = parseEafMetaFromLayerKey(layer.key);
    const tierName = layerMeta.tierId ?? readEnglishFallbackMultiLangLabel(layer.name) ?? layer.key;
    tierNameByLayerId.set(layer.id, tierName);
    registerTierIdentityMetadata(tierName, layer);
  }

  const transcriptionLayerIdByKey = new Map<string, string>();
  for (const layer of transcriptionLayers) {
    const key = layer.key?.trim() ?? '';
    if (key.length > 0 && !transcriptionLayerIdByKey.has(key)) {
      transcriptionLayerIdByKey.set(key, layer.id);
    }
  }

  const hostLinksByTranslationLayerId = new Map<string, LayerLinkDocType[]>();
  for (const link of layerLinks ?? []) {
    const bucket = hostLinksByTranslationLayerId.get(link.layerId) ?? [];
    bucket.push(link);
    hostLinksByTranslationLayerId.set(link.layerId, bucket);
  }

  // Transcription tier (default)
  const uttAnnotationIdMap = new Map<string, string>(); // uttId → annotationId（用于翻译层 REF_ANNOTATION）
  const transcriptionAnnotations = sorted.map((utt) => {
    const slots = uttSlotMap.get(utt.id)!;
    const tr = defaultTrcId
      ? translations.find(
          (t) => t.unitId === utt.id && t.layerId === defaultTrcId && t.modality === 'text',
        )
      : undefined;
    const text = tr?.text ?? utt.transcription?.default ?? '';
    const annotationId = tr?.externalRef ?? `a${annCounter++}`;
    uttAnnotationIdMap.set(utt.id, annotationId);
    return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
  });

  const scratch = {
    tsCounter,
    annCounter,
    timeSlots,
    usedConstraintTypes: new Set<string>(),
  };
  const translationTierXml = buildEafAdditionalTierXml({
    layers,
    defaultTrcId,
    translations,
    sorted,
    layerSegments,
    layerSegmentContents,
    uttSlotMap,
    uttAnnotationIdMap,
    defaultTierId,
    tierNameByLayerId,
    transcriptionLayerIdByKey,
    hostLinksByTranslationLayerId,
    onWarning,
    resolveSpeakerDisplayName,
    getDominantSpeaker,
    getDominantSpeakerFromSegments,
    scratch,
  });
  tsCounter = scratch.tsCounter;
  annCounter = scratch.annCounter;
  const usedConstraintTypes = scratch.usedConstraintTypes;
  const wordTierXml = buildEafWordTierXml({
    tokens,
    morphemes,
    sorted,
    uttAnnotationIdMap,
    defaultTierId,
    defaultTrcLocale,
    scratch,
  });
  annCounter = scratch.annCounter;

  const headerLines: string[] = [];
  if (mediaItem) {
    headerLines.push(
      `        <MEDIA_DESCRIPTOR MEDIA_URL="${escapeXml(mediaItem.url ?? mediaItem.filename)}" MIME_TYPE="${escapeXml(resolveEafMediaMimeType(mediaItem))}" RELATIVE_MEDIA_URL="./${escapeXml(mediaItem.filename)}" />`,
    );
  }
  for (const [tierId, metadata] of tierIdentityMetadata) {
    headerLines.push(
      `        <PROPERTY NAME="${escapeXml(`${JIEYU_LAYER_META_PREFIX}${tierId}`)}">${escapeXml(JSON.stringify(metadata))}</PROPERTY>`,
    );
  }
  if (timelineMetadata && Object.keys(timelineMetadata).length > 0) {
    headerLines.push(
      `        <PROPERTY NAME="${escapeXml(JIEYU_PROJECT_META_TIMELINE)}">${escapeXml(JSON.stringify(timelineMetadata))}</PROPERTY>`,
    );
  }
  const hasSpeakerDialect = (speakers ?? []).some((speaker) => speaker.dialect?.trim());
  if ((userNotes && userNotes.length > 0) || hasSpeakerDialect) {
    headerLines.push(
      `        <PROPERTY NAME="${escapeXml(`${JIEYU_LAYER_META_PREFIX}notes`)}">${escapeXml(JSON.stringify({ role: 'notes' }))}</PROPERTY>`,
    );
  }
  const mediaHeader =
    headerLines.length > 0
      ? `    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
${headerLines.join('\n')}
    </HEADER>`
      : '    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds" />';

  // 尾部元素：LINGUISTIC_TYPE + LANGUAGE | Footer: type declarations + language declarations
  const footerLines: string[] = [
    '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />',
  ];

  if (usedConstraintTypes.size > 0) {
    if (usedConstraintTypes.has('symbolic_association')) {
      footerLines.push(
        '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />',
      );
    }
    if (usedConstraintTypes.has('time_subdivision')) {
      footerLines.push(
        '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-subdivision-lt" TIME_ALIGNABLE="true" CONSTRAINTS="Time_Subdivision" GRAPHIC_REFERENCES="false" />',
      );
    }
    if (usedConstraintTypes.has('independent')) {
      footerLines.push(
        '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-independent-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />',
      );
    }
    if (usedConstraintTypes.has('symbolic_subdivision')) {
      footerLines.push(
        '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="word-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />',
      );
    }
  }

  const additionalLayers = layers.filter(
    (l) =>
      l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  const usedLocales = new Set<string>();
  usedLocales.add(defaultTrcLocale);
  const localeLabelById = new Map<string, string>();
  if (defaultTrcMeta.langLabel) localeLabelById.set(defaultTrcLocale, defaultTrcMeta.langLabel);
  for (const layer of additionalLayers) {
    if (layer.languageId) {
      usedLocales.add(layer.languageId);
      const layerMeta = parseEafMetaFromLayerKey(layer.key);
      if (layerMeta.langLabel) localeLabelById.set(layer.languageId, layerMeta.langLabel);
    }
  }

  for (const loc of usedLocales) {
    const label = localeLabelById.get(loc) ?? loc;
    footerLines.push(
      `    <LANGUAGE LANG_ID="${escapeXml(loc)}" LANG_LABEL="${escapeXml(label)}" />`,
    );
  }

  return finalizeXmlExport(
    `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv3.0.xsd">
${mediaHeader}
    <TIME_ORDER>
${timeSlots.map((ts) => `        <TIME_SLOT TIME_SLOT_ID="${ts.id}" TIME_VALUE="${ts.ms}" />`).join('\n')}
    </TIME_ORDER>
${(() => {
  const dominantSpeakerId = getDominantSpeaker(sorted.map((u) => u.id));
  const participantName = resolveSpeakerDisplayName(dominantSpeakerId);
  const participantAttr = participantName ? ` PARTICIPANT="${escapeXml(participantName)}"` : '';
  return `    <TIER TIER_ID="${escapeXml(defaultTierId)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}"${participantAttr}>
${transcriptionAnnotations.join('\n')}
    </TIER>`;
})()}
${wordTierXml.join('\n')}
${translationTierXml.join('\n')}
${buildNoteTierXml(sorted, uttSlotMap, userNotes ?? [], annCounter, uttAnnotationIdMap, speakers ?? [], defaultTierId)}
${footerLines.join('\n')}
</ANNOTATION_DOCUMENT>
`,
    onXmlSanitized,
  );
}

export function downloadEaf(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.eaf') ? filename : `${filename}.eaf`;
  a.click();
  URL.revokeObjectURL(url);
}
