import type {
  LayerDocType,
  LayerLinkDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
} from '../../db';
import { layerTranscriptionTreeParentId } from '../../db';
import { readEnglishFallbackMultiLangLabel } from '../../utils/multiLangLabels';
import type { EafExportInput } from './eafTypes';
import type { EafExportScratch } from './eafExportScratch';
import { escapeXml, parseEafMetaFromLayerKey } from './eafXml';

export function buildEafAdditionalTierXml(input: {
  layers: LayerDocType[];
  defaultTrcId: string | undefined;
  translations: LayerUnitContentDocType[];
  sorted: LayerUnitDocType[];
  layerSegments: Map<string, LayerUnitDocType[]> | undefined;
  layerSegmentContents: Map<string, Map<string, LayerUnitContentDocType>> | undefined;
  uttSlotMap: Map<string, { tsStart: string; tsEnd: string }>;
  uttAnnotationIdMap: Map<string, string>;
  defaultTierId: string;
  tierNameByLayerId: Map<string, string>;
  transcriptionLayerIdByKey: Map<string, string>;
  hostLinksByTranslationLayerId: Map<string, LayerLinkDocType[]>;
  onWarning: EafExportInput['onWarning'];
  resolveSpeakerDisplayName: (speakerKey: string | undefined) => string | undefined;
  getDominantSpeaker: (uttIds: string[]) => string | undefined;
  getDominantSpeakerFromSegments: (segments: LayerUnitDocType[]) => string | undefined;
  scratch: EafExportScratch;
}): string[] {
  const {
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
  } = input;
  let tsCounter = scratch.tsCounter;
  let annCounter = scratch.annCounter;
  const { timeSlots, usedConstraintTypes } = scratch;
  const additionalLayers = layers.filter(
    (l) =>
      l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  const translationTierXml: string[] = [];

  for (const layer of additionalLayers) {
    const layerTranslations = translations.filter(
      (t) => t.layerId === layer.id && t.modality === 'text',
    );
    const layerTranslationsByUnit = new Map<string, LayerUnitContentDocType[]>();
    for (const row of layerTranslations) {
      const unitId = row.unitId?.trim();
      if (!unitId) continue;
      const bucket = layerTranslationsByUnit.get(unitId);
      if (bucket) bucket.push(row);
      else layerTranslationsByUnit.set(unitId, [row]);
    }
    const layerMeta = parseEafMetaFromLayerKey(layer.key);
    const tierName = layerMeta.tierId ?? readEnglishFallbackMultiLangLabel(layer.name) ?? layer.key;
    const isTranslation = layer.layerType === 'translation';

    if (isTranslation) {
      // 翻译层：使用 REF_ANNOTATION + PARENT_REF | Translation: REF_ANNOTATION + PARENT_REF

      // Determine constraint | 确定约束类型
      const constraint = layer.constraint ?? 'symbolic_association';
      if (constraint === 'independent_boundary') {
        usedConstraintTypes.add('independent');
      } else if (constraint === 'time_subdivision') {
        usedConstraintTypes.add('time_subdivision');
      } else {
        usedConstraintTypes.add('symbolic_association');
      }

      const useAlignableAnnotation =
        constraint === 'independent_boundary' || constraint === 'time_subdivision';
      // Build segment lookup for segment-specific boundaries | 构建 segment 查找（用于独立边界导出）
      const layerSegs = useAlignableAnnotation ? layerSegments?.get(layer.id) : undefined;
      const segByUttId = new Map<string, LayerUnitDocType[]>();
      if (layerSegs) {
        for (const seg of layerSegs) {
          if (!seg.unitId) continue;
          const arr = segByUttId.get(seg.unitId);
          if (arr) arr.push(seg);
          else segByUttId.set(seg.unitId, [seg]);
        }
      }
      const annotations = sorted
        .map((utt) => {
          if (useAlignableAnnotation) {
            // Use segment boundaries when available. Multi-segment units are exported as one annotation per segment.
            // 优先使用 segment 边界；多 segment 句子按 segment 逐条导出。
            const segArr = [...(segByUttId.get(utt.id) ?? [])].sort(
              (a, b) => a.startTime - b.startTime || (a.ordinal ?? 0) - (b.ordinal ?? 0),
            );
            const candidates = layerTranslationsByUnit.get(utt.id) ?? [];

            if (segArr.length > 0) {
              const segmentAnnotations = segArr
                .map((seg, idx) => {
                  const tr = candidates[idx] ?? candidates[0];
                  if (!tr?.text) return null;
                  const tsStart = `ts${tsCounter++}`;
                  const tsEnd = `ts${tsCounter++}`;
                  timeSlots.push({ id: tsStart, ms: Math.round(seg.startTime * 1000) });
                  timeSlots.push({ id: tsEnd, ms: Math.round(seg.endTime * 1000) });
                  const annotationId = tr.externalRef ?? `a${annCounter++}`;
                  return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" TIME_SLOT_REF1="${tsStart}" TIME_SLOT_REF2="${tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(tr.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
                })
                .filter((item): item is string => item !== null);
              if (segmentAnnotations.length === 0) return null;
              return segmentAnnotations.join('\n');
            }

            const tr = candidates[0];
            if (!tr?.text) return null;
            const annotationId = tr.externalRef ?? `a${annCounter++}`;
            const slots = uttSlotMap.get(utt.id)!;
            return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(tr.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
          } else {
            // Symbolic association: use REF_ANNOTATION
            const tr = layerTranslationsByUnit.get(utt.id)?.[0];
            if (!tr?.text) return null;
            const annotationId = tr.externalRef ?? `a${annCounter++}`;
            const parentAnnId = uttAnnotationIdMap.get(utt.id);
            if (!parentAnnId) return null;
            return `        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" ANNOTATION_REF="${escapeXml(parentAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(tr.text)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`;
          }
        })
        .filter(Boolean);

      if (annotations.length > 0) {
        const translationHostLinks = hostLinksByTranslationLayerId.get(layer.id) ?? [];
        const hostIds: string[] = [];
        const seenHostIds = new Set<string>();
        let preferredHostTranscriptionLayerId: string | undefined;

        for (const link of translationHostLinks) {
          const hostIdFromId =
            typeof link.hostTranscriptionLayerId === 'string'
              ? link.hostTranscriptionLayerId.trim()
              : '';
          const resolvedHostId =
            hostIdFromId.length > 0
              ? hostIdFromId
              : (transcriptionLayerIdByKey.get(link.transcriptionLayerKey?.trim() ?? '') ?? '');
          if (!resolvedHostId || seenHostIds.has(resolvedHostId)) continue;
          seenHostIds.add(resolvedHostId);
          hostIds.push(resolvedHostId);
          if (!preferredHostTranscriptionLayerId && link.isPreferred) {
            preferredHostTranscriptionLayerId = resolvedHostId;
          }
        }

        const effectivePreferredHostTranscriptionLayerId =
          preferredHostTranscriptionLayerId ?? hostIds[0];
        if (hostIds.length > 1) {
          onWarning?.({
            code: 'translation-multi-host-lossy',
            layerId: layer.id,
            hostCount: hostIds.length,
            ...(effectivePreferredHostTranscriptionLayerId
              ? { preferredHostTranscriptionLayerId: effectivePreferredHostTranscriptionLayerId }
              : {}),
          });
        }

        const shouldIncludeParentRef = constraint !== 'independent_boundary';
        // 翻译宿主 tier 仅来自 layer_links（preferred / 首条）；不再回读 translation.parentLayerId | PARENT_REF from links only
        const parentTierId = effectivePreferredHostTranscriptionLayerId
          ? (tierNameByLayerId.get(effectivePreferredHostTranscriptionLayerId) ?? defaultTierId)
          : defaultTierId;
        const parentRefAttr = shouldIncludeParentRef
          ? ` PARENT_REF="${escapeXml(parentTierId)}"`
          : '';
        const linguisticTypeRef =
          constraint === 'independent_boundary'
            ? 'translation-independent-lt'
            : constraint === 'time_subdivision'
              ? 'translation-subdivision-lt'
              : 'translation-lt';
        const timeAlignableAttr = ` LINGUISTIC_TYPE_REF="${linguisticTypeRef}"`;
        const participantId =
          layerSegs && layerSegs.length > 0
            ? getDominantSpeakerFromSegments(layerSegs)
            : getDominantSpeaker(
                layerTranslations
                  .map((t) => t.unitId)
                  .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
              );
        const participantName = resolveSpeakerDisplayName(participantId);
        const participantAttr = participantName
          ? ` PARTICIPANT="${escapeXml(participantName)}"`
          : '';
        translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}"${timeAlignableAttr}${parentRefAttr} DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}"${participantAttr}>
${annotations.join('\n')}
    </TIER>`);
      }
    } else {
      // 转写层（独立边界/时间细分层优先按 segment 导出）| Segment-backed transcription layers export from segment graph first
      const isIndependentTrc =
        layer.layerType === 'transcription' && layer.constraint === 'independent_boundary';
      const isTimeSubdivisionTrc =
        layer.layerType === 'transcription' && layer.constraint === 'time_subdivision';
      const layerSegs =
        isIndependentTrc || isTimeSubdivisionTrc ? layerSegments?.get(layer.id) : undefined;

      if (layerSegs && layerSegs.length > 0) {
        if (isTimeSubdivisionTrc) {
          usedConstraintTypes.add('time_subdivision');
        }
        // 独立/时间细分转写层：用 segment 边界 + segment content 导出 | Export transcription tiers from segment data
        const contentMap = layerSegmentContents?.get(layer.id);
        const sortedSegs = [...layerSegs].sort((a, b) => a.startTime - b.startTime);
        const segAnnotations = sortedSegs
          .map((seg) => {
            const content = contentMap?.get(seg.id);
            const text = content?.text ?? '';
            if (!text) return null;
            const startMs = Math.round(seg.startTime * 1000);
            const endMs = Math.round(seg.endTime * 1000);
            const tsStartId = `ts${tsCounter++}`;
            const tsEndId = `ts${tsCounter++}`;
            timeSlots.push({ id: tsStartId, ms: startMs }, { id: tsEndId, ms: endMs });
            const annotationId = `a${annCounter++}`;
            return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" TIME_SLOT_REF1="${tsStartId}" TIME_SLOT_REF2="${tsEndId}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
          })
          .filter(Boolean);

        if (segAnnotations.length > 0) {
          const participantId = getDominantSpeakerFromSegments(layerSegs);
          const participantName = resolveSpeakerDisplayName(participantId);
          const participantAttr = participantName
            ? ` PARTICIPANT="${escapeXml(participantName)}"`
            : '';
          const trcTreeParentId = layerTranscriptionTreeParentId(layer);
          const parentRefAttr =
            isTimeSubdivisionTrc && trcTreeParentId
              ? ` PARENT_REF="${escapeXml(tierNameByLayerId.get(trcTreeParentId) ?? defaultTierId)}"`
              : '';
          const linguisticTypeRef = isTimeSubdivisionTrc
            ? 'translation-subdivision-lt'
            : 'default-lt';
          translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}" LINGUISTIC_TYPE_REF="${linguisticTypeRef}"${parentRefAttr} DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}"${participantAttr}>
${segAnnotations.join('\n')}
    </TIER>`);
        }
      } else {
        // 普通非默认转写层：用当前 layerTranslations（来自 V2 聚合）导出 | Regular non-default transcription: export from V2-derived layerTranslations
        const annotations = sorted
          .map((utt) => {
            const tr = layerTranslations.find((t) => t.unitId === utt.id);
            if (!tr?.text) return null;
            const slots = uttSlotMap.get(utt.id)!;
            const annotationId = tr?.externalRef ?? `a${annCounter++}`;
            return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="${escapeXml(annotationId)}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(tr.text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
          })
          .filter(Boolean);

        if (annotations.length > 0) {
          const annotationUnitIds = sorted.flatMap((utt) => {
            const tr = layerTranslations.find((t) => t.unitId === utt.id);
            return tr?.text ? [utt.id] : [];
          });
          const participantId = getDominantSpeaker(annotationUnitIds);
          const participantName = resolveSpeakerDisplayName(participantId);
          const participantAttr = participantName
            ? ` PARTICIPANT="${escapeXml(participantName)}"`
            : '';
          translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}"${participantAttr}>
${annotations.join('\n')}
    </TIER>`);
        }
      }
    }
  }

  scratch.tsCounter = tsCounter;
  scratch.annCounter = annCounter;
  return translationTierXml;
}
