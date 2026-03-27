/**
 * EAF (ELAN Annotation Format) import/export service.
 *
 * EAF is the XML format used by ELAN (https://archive.mpi.nl/tla/elan).
 * This service converts between Jieyu's data model and EAF 3.0.
 */

import type { UtteranceDocType, AnchorDocType, LayerDocType, UtteranceTextDocType, MediaItemDocType, UserNoteDocType, LayerConstraint, LayerSegmentDocType, LayerSegmentContentDocType } from '../db';

// ── Types ───────────────────────────────────────────────────

export interface EafExportInput {
  mediaItem?: MediaItemDocType;
  utterances: UtteranceDocType[];
  anchors?: AnchorDocType[];
  layers: LayerDocType[];
  translations: UtteranceTextDocType[];
  userNotes?: UserNoteDocType[];
  /** 独立边界层的 segment 数据（按 layerId 分组）| Segment data for independent-boundary layers, keyed by layerId */
  layerSegments?: Map<string, LayerSegmentDocType[]>;
  /** 独立边界层的 segment 内容（按 layerId 分组，内层按 segmentId）| Segment content for independent-boundary layers */
  layerSegmentContents?: Map<string, Map<string, LayerSegmentContentDocType>>;
  /** 默认转写层 ID（用于区分非默认独立转写层）| Default transcription layer ID */
  defaultTranscriptionLayerId?: string;
}

export interface EafImportResult {
  mediaFilename: string;
  /** Utterances extracted from the default transcription tier */
  utterances: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
    /** PARTICIPANT attribute from the tier | tier 上的 PARTICIPANT 属性 */
    speakerId?: string;
    /** ANNOTATION_ID from EAF for round-trip consistency */
    annotationId?: string;
  }>;
  /** Translation tiers keyed by tier name */
  translationTiers: Map<string, Array<{
    startTime: number;
    endTime: number;
    text: string;
    /** ANNOTATION_ID from EAF for round-trip consistency */
    annotationId?: string;
  }>>;
  /** DEFAULT_LOCALE of the first (transcription) tier, if present | 首层的 DEFAULT_LOCALE */
  defaultLocale?: string;
  /** Map of tier name → DEFAULT_LOCALE for additional tiers | 附加层的语言 */
  tierLocales: Map<string, string>;
  /** Unique PARTICIPANT values found across tiers | 所有层中出现的 PARTICIPANT */
  participants: string[];
  /** Name of the first (transcription) tier | 首层（转写层）的名称 */
  transcriptionTierName?: string;
  /** <LANGUAGE> 元素中的语言 ID → 语言标签映射 | LANG_ID → LANG_LABEL from <LANGUAGE> elements */
  languageLabels: Map<string, string>;
  /** 每个 tier 的 ELAN 约束信息 | Per-tier ELAN constraint info (constraint + parentTierId) */
  tierConstraints: Map<string, { constraint: LayerConstraint; parentTierId?: string }>;
}

// ── Export ───────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 从层 key 解析 EAF 元数据（tierId/langLabel）| Parse EAF metadata from layer key (tierId/langLabel) */
function parseEafMetaFromLayerKey(layerKey?: string): { tierId?: string; langLabel?: string } {
  if (!layerKey) return {};
  const marker = '__eafmeta_';
  const idx = layerKey.indexOf(marker);
  if (idx < 0) return {};
  const encoded = layerKey.slice(idx + marker.length);
  if (!encoded) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as { tierId?: unknown; langLabel?: unknown };
    return {
      ...(typeof parsed.tierId === 'string' && parsed.tierId.trim().length > 0 ? { tierId: parsed.tierId.trim() } : {}),
      ...(typeof parsed.langLabel === 'string' && parsed.langLabel.trim().length > 0 ? { langLabel: parsed.langLabel.trim() } : {}),
    };
  } catch (err) {
    console.error('[Jieyu] EafService: failed to parse locale info from layerKey', { layerKey, err });
    return {};
  }
}

export function exportToEaf(input: EafExportInput): string {
  const { mediaItem, utterances, anchors, layers, translations, userNotes, layerSegments, layerSegmentContents } = input;
  const sorted = [...utterances].sort((a, b) => a.startTime - b.startTime);

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
      timeSlots.push({ id: tsId, ms: anchor ? Math.round(anchor.time * 1000) : Math.round(fallbackMs * 1000) });
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

      // Add fallback time slots for utterances without anchors
      if (!utt.startAnchorId) timeSlots.push({ id: tsStart, ms: Math.round(utt.startTime * 1000) });
      if (!utt.endAnchorId) timeSlots.push({ id: tsEnd, ms: Math.round(utt.endTime * 1000) });

      uttSlotMap.set(utt.id, { tsStart, tsEnd });
    }
  } else {
    // Legacy mode: each utterance gets its own pair of time slots
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

  // 层 ID -> 导出 tier 名称映射（用于 parentLayerId 优先导出）
  // Layer ID -> exported tier name mapping (for parentLayerId-first export semantics)
  const tierNameByLayerId = new Map<string, string>();
  if (defaultTrcLayer) {
    tierNameByLayerId.set(defaultTrcLayer.id, defaultTierId);
  }
  for (const layer of layers) {
    const layerMeta = parseEafMetaFromLayerKey(layer.key);
    const tierName = layerMeta.tierId ?? layer.name?.eng ?? layer.name?.zho ?? layer.key;
    tierNameByLayerId.set(layer.id, tierName);
  }

  // Transcription tier (default)
  const uttAnnotationIdMap = new Map<string, string>(); // uttId → annotationId（用于翻译层 REF_ANNOTATION）
  const transcriptionAnnotations = sorted.map((utt) => {
    const slots = uttSlotMap.get(utt.id)!;
    const tr = defaultTrcId
      ? translations.find((t) => t.utteranceId === utt.id && t.layerId === defaultTrcId && t.modality === 'text')
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

  // Additional tiers: non-default transcription layers + translation layers
  const additionalLayers = layers.filter(
    (l) => l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  const translationTierXml: string[] = [];
  const usedConstraintTypes = new Set<string>(); // Track which LINGUISTIC_TYPEs are needed | 跟踪需要哪些 LINGUISTIC_TYPE
  let hasTranslationLayers = false;

  for (const layer of additionalLayers) {
    const layerTranslations = translations.filter((t) => t.layerId === layer.id && t.modality === 'text');
    const layerTranslationsByUtterance = new Map<string, UtteranceTextDocType[]>();
    for (const row of layerTranslations) {
      const bucket = layerTranslationsByUtterance.get(row.utteranceId);
      if (bucket) bucket.push(row);
      else layerTranslationsByUtterance.set(row.utteranceId, [row]);
    }
    const layerMeta = parseEafMetaFromLayerKey(layer.key);
    const tierName = layerMeta.tierId ?? layer.name?.eng ?? layer.name?.zho ?? layer.key;
    const isTranslation = layer.layerType === 'translation';

    if (isTranslation) {
      // 翻译层：使用 REF_ANNOTATION + PARENT_REF | Translation: REF_ANNOTATION + PARENT_REF
      hasTranslationLayers = true;
      
      // Determine constraint | 确定约束类型
      const constraint = layer.constraint ?? 'symbolic_association';
      if (constraint === 'independent_boundary') {
        usedConstraintTypes.add('independent');
      } else if (constraint === 'time_subdivision') {
        usedConstraintTypes.add('time_subdivision');
      } else {
        usedConstraintTypes.add('symbolic_association');
      }
      
      const useAlignableAnnotation = constraint === 'independent_boundary' || constraint === 'time_subdivision';
      // Build segment lookup for segment-specific boundaries | 构建 segment 查找（用于独立边界导出）
      const layerSegs = useAlignableAnnotation ? layerSegments?.get(layer.id) : undefined;
      const segByUttId = new Map<string, LayerSegmentDocType[]>();
      if (layerSegs) {
        for (const seg of layerSegs) {
          if (!seg.utteranceId) continue;
          const arr = segByUttId.get(seg.utteranceId);
          if (arr) arr.push(seg);
          else segByUttId.set(seg.utteranceId, [seg]);
        }
      }
      const annotations = sorted
        .map((utt) => {
          if (useAlignableAnnotation) {
            // Use segment boundaries when available. Multi-segment utterances are exported as one annotation per segment.
            // 优先使用 segment 边界；多 segment 句子按 segment 逐条导出。
            const segArr = [...(segByUttId.get(utt.id) ?? [])]
              .sort((a, b) => (a.startTime - b.startTime) || ((a.ordinal ?? 0) - (b.ordinal ?? 0)));
            const candidates = layerTranslationsByUtterance.get(utt.id) ?? [];

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
            const tr = layerTranslationsByUtterance.get(utt.id)?.[0];
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
        const shouldIncludeParentRef = constraint !== 'independent_boundary';
        const parentTierId = layer.parentLayerId
          ? (tierNameByLayerId.get(layer.parentLayerId) ?? defaultTierId)
          : defaultTierId;
        const parentRefAttr = shouldIncludeParentRef
          ? ` PARENT_REF="${escapeXml(parentTierId)}"`
          : '';
        const linguisticTypeRef = constraint === 'independent_boundary'
          ? 'translation-independent-lt'
          : constraint === 'time_subdivision'
            ? 'translation-subdivision-lt'
            : 'translation-lt';
        const timeAlignableAttr = ` LINGUISTIC_TYPE_REF="${linguisticTypeRef}"`;
        translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}"${timeAlignableAttr}${parentRefAttr} DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}">
${annotations.join('\n')}
    </TIER>`);
      }
    } else {
      // 转写层（独立边界层优先按 segment 导出）| Transcription layers (independent-boundary layers export by segment first)
      const isIndependentTrc = layer.layerType === 'transcription'
        && layer.constraint === 'independent_boundary';
      const layerSegs = isIndependentTrc ? layerSegments?.get(layer.id) : undefined;

      if (layerSegs && layerSegs.length > 0) {
        // 独立转写层：用 segment 边界 + segment content 导出 | Independent transcription: export from segment data
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
          translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}">
${segAnnotations.join('\n')}
    </TIER>`);
        }
      } else {
        // 普通非默认转写层：用当前 layerTranslations（来自 V2 聚合）导出 | Regular non-default transcription: export from V2-derived layerTranslations
        const annotations = sorted
          .map((utt) => {
            const tr = layerTranslations.find((t) => t.utteranceId === utt.id);
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
          translationTierXml.push(`    <TIER TIER_ID="${escapeXml(tierName)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${escapeXml(layer.languageId ?? 'en')}">
${annotations.join('\n')}
    </TIER>`);
        }
      }
    }
  }

  const mediaHeader = mediaItem
    ? `    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <MEDIA_DESCRIPTOR MEDIA_URL="${escapeXml(mediaItem.url ?? mediaItem.filename)}" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./${escapeXml(mediaItem.filename)}" />
    </HEADER>`
    : '    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds" />';

  // 尾部元素：LINGUISTIC_TYPE + LANGUAGE | Footer: type declarations + language declarations
  const footerLines: string[] = [
    '    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />',
  ];
  
  if (hasTranslationLayers) {
    if (usedConstraintTypes.has('symbolic_association')) {
      footerLines.push('    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />');
    }
    if (usedConstraintTypes.has('time_subdivision')) {
      footerLines.push('    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-subdivision-lt" TIME_ALIGNABLE="true" CONSTRAINTS="Time_Subdivision" GRAPHIC_REFERENCES="false" />');
    }
    if (usedConstraintTypes.has('independent')) {
      footerLines.push('    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="translation-independent-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />');
    }
  }

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
    footerLines.push(`    <LANGUAGE LANG_ID="${escapeXml(loc)}" LANG_LABEL="${escapeXml(label)}" />`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${new Date().toISOString()}" FORMAT="3.0" VERSION="3.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.mpi.nl/tools/elan/EAFv3.0.xsd">
${mediaHeader}
    <TIME_ORDER>
${timeSlots.map((ts) => `        <TIME_SLOT TIME_SLOT_ID="${ts.id}" TIME_VALUE="${ts.ms}" />`).join('\n')}
    </TIME_ORDER>
    <TIER TIER_ID="${escapeXml(defaultTierId)}" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}">
${transcriptionAnnotations.join('\n')}
    </TIER>
${translationTierXml.join('\n')}
${buildNoteTierXml(sorted, uttSlotMap, userNotes ?? [], annCounter)}
${footerLines.join('\n')}
</ANNOTATION_DOCUMENT>
`;
}

function buildNoteTierXml(
  sorted: UtteranceDocType[],
  uttSlotMap: Map<string, { tsStart: string; tsEnd: string }>,
  notes: UserNoteDocType[],
  annCounterStart: number,
): string {
  if (notes.length === 0) return '';

  // Group notes by utterance
  const notesByUtt = new Map<string, UserNoteDocType[]>();
  for (const note of notes) {
    if (note.targetType !== 'utterance') continue;
    const arr = notesByUtt.get(note.targetId);
    if (arr) arr.push(note);
    else notesByUtt.set(note.targetId, [note]);
  }

  let counter = annCounterStart;
  const annotations = sorted
    .map((utt) => {
      const uttNotes = notesByUtt.get(utt.id);
      if (!uttNotes || uttNotes.length === 0) return null;
      const slots = uttSlotMap.get(utt.id);
      if (!slots) return null;
      const text = uttNotes.map((n) => {
        const prefix = n.category ? `[${n.category}] ` : '';
        return prefix + (n.content['default'] ?? Object.values(n.content)[0] ?? '');
      }).join(' | ');
      return `        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a${counter++}" TIME_SLOT_REF1="${slots.tsStart}" TIME_SLOT_REF2="${slots.tsEnd}">
                <ANNOTATION_VALUE>${escapeXml(text)}</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>`;
    })
    .filter(Boolean);

  if (annotations.length === 0) return '';

  return `    <TIER TIER_ID="notes" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
${annotations.join('\n')}
    </TIER>`;
}

// ── Import helpers ──────────────────────────────────────────

type AnnotationEntry = { startTime: number; endTime: number; text: string; annotationId?: string };

/** 从 ALIGNABLE_ANNOTATION 解析标注 | Parse ALIGNABLE_ANNOTATION elements within a tier */
function parseAlignableAnnotations(
  tier: Element,
  timeSlotMap: Map<string, number>,
): AnnotationEntry[] {
  const result: AnnotationEntry[] = [];
  tier.querySelectorAll('ALIGNABLE_ANNOTATION').forEach((ann) => {
    const annotationId = ann.getAttribute('ANNOTATION_ID') ?? undefined;
    const ts1 = ann.getAttribute('TIME_SLOT_REF1');
    const ts2 = ann.getAttribute('TIME_SLOT_REF2');
    const value = ann.querySelector('ANNOTATION_VALUE')?.textContent ?? '';
    if (ts1 && ts2) {
      const startMs = timeSlotMap.get(ts1);
      const endMs = timeSlotMap.get(ts2);
      if (startMs != null && endMs != null) {
        result.push({
          startTime: startMs / 1000,
          endTime: endMs / 1000,
          text: value,
          ...(annotationId ? { annotationId } : {}),
        });
      }
    }
  });
  return result;
}

/** 从 REF_ANNOTATION 解析标注，通过 annotationTimeMap 解析时间 | Parse REF_ANNOTATION, resolve time via parent map */
function parseRefAnnotations(
  tier: Element,
  annotationTimeMap: Map<string, { startTime: number; endTime: number }>,
): AnnotationEntry[] {
  const result: AnnotationEntry[] = [];
  tier.querySelectorAll('REF_ANNOTATION').forEach((ann) => {
    const annotationId = ann.getAttribute('ANNOTATION_ID') ?? undefined;
    const annotationRef = ann.getAttribute('ANNOTATION_REF');
    const value = ann.querySelector('ANNOTATION_VALUE')?.textContent ?? '';
    if (annotationRef) {
      const parentTime = annotationTimeMap.get(annotationRef);
      if (parentTime) {
        result.push({
          startTime: parentTime.startTime,
          endTime: parentTime.endTime,
          text: value,
          ...(annotationId ? { annotationId } : {}),
        });
        // 注册自身以支持多级嵌套 | Register self for multi-level nesting
        if (annotationId) annotationTimeMap.set(annotationId, parentTime);
      }
    }
  });
  return result;
}

// ── Import ──────────────────────────────────────────────────

export function importFromEaf(xmlString: string): EafImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`EAF XML 解析失败: ${parseError.textContent}`);
  }

  // Extract media filename
  const mediaDesc = doc.querySelector('MEDIA_DESCRIPTOR');
  const relUrl = mediaDesc?.getAttribute('RELATIVE_MEDIA_URL') ?? '';
  const mediaUrl = mediaDesc?.getAttribute('MEDIA_URL') ?? '';
  const mediaFilename = relUrl.replace(/^\.\//, '') || mediaUrl.split('/').pop() || 'unknown.wav';

  // ── <LANGUAGE> 元素 → 语言 ID/标签映射 | Parse <LANGUAGE> elements ──
  const languageLabels = new Map<string, string>();
  doc.querySelectorAll('LANGUAGE').forEach((el) => {
    const langId = el.getAttribute('LANG_ID');
    const langLabel = el.getAttribute('LANG_LABEL');
    if (langId && langLabel) languageLabels.set(langId, langLabel);
  });

  // ── <LINGUISTIC_TYPE> → 层结构分类 | Parse <LINGUISTIC_TYPE> for tier classification ──
  const linguisticTypes = new Map<string, { timeAlignable: boolean; constraints?: string }>();
  doc.querySelectorAll('LINGUISTIC_TYPE').forEach((el) => {
    const typeId = el.getAttribute('LINGUISTIC_TYPE_ID');
    const timeAlignable = el.getAttribute('TIME_ALIGNABLE') !== 'false';
    const constraints = el.getAttribute('CONSTRAINTS') ?? undefined;
    if (typeId) linguisticTypes.set(typeId, { timeAlignable, ...(constraints ? { constraints } : {}) });
  });

  // Parse time slots
  const timeSlotMap = new Map<string, number>();
  doc.querySelectorAll('TIME_SLOT').forEach((el) => {
    const id = el.getAttribute('TIME_SLOT_ID');
    const val = el.getAttribute('TIME_VALUE');
    if (id && val) timeSlotMap.set(id, parseInt(val, 10));
  });

  // ── 层解析 | Parse tiers ──
  const tiers = doc.querySelectorAll('TIER');
  let utterances: EafImportResult['utterances'] = [];
  const translationTiers = new Map<string, EafImportResult['translationTiers'] extends Map<string, infer V> ? V : never>();
  let defaultLocale: string | undefined;
  const tierLocales = new Map<string, string>();
  const participantSet = new Set<string>();
  let transcriptionTierName: string | undefined;
  // 标注 ID → 时间，用于 REF_ANNOTATION 时间解析 | Annotation ID → time for REF_ANNOTATION resolution
  const annotationTimeMap = new Map<string, { startTime: number; endTime: number }>();
  let foundPrimaryTranscription = false;
  // 每层的约束信息 | Per-tier constraint info
  const tierConstraints = new Map<string, { constraint: LayerConstraint; parentTierId?: string }>();

  tiers.forEach((tier, tierIndex) => {
    const tierId = tier.getAttribute('TIER_ID') ?? `tier_${tierIndex}`;
    const participant = tier.getAttribute('PARTICIPANT') ?? undefined;
    const locale = tier.getAttribute('DEFAULT_LOCALE') ?? undefined;
    const typeRef = tier.getAttribute('LINGUISTIC_TYPE_REF') ?? undefined;
    const parentRef = tier.getAttribute('PARENT_REF') ?? undefined;

    if (participant) participantSet.add(participant);

    // 判断层类型：有 LINGUISTIC_TYPE 声明则用它，否则回退到 PARENT_REF 推断
    // Determine tier type: prefer LINGUISTIC_TYPE info, fallback to PARENT_REF heuristic
    const lingType = typeRef ? linguisticTypes.get(typeRef) : undefined;
    const isTimeAlignable = lingType != null ? lingType.timeAlignable : !parentRef;
    const isIndependentTier = isTimeAlignable && !parentRef;

    // 映射 ELAN CONSTRAINTS → LayerConstraint | Map ELAN CONSTRAINTS → LayerConstraint
    const eafConstraint = lingType?.constraints;
    const constraint: LayerConstraint = eafConstraint === 'Symbolic_Association'
      ? 'symbolic_association'
      : eafConstraint === 'Time_Subdivision'
        ? 'time_subdivision'
        : (isTimeAlignable ? 'independent_boundary' : 'symbolic_association');
    tierConstraints.set(tierId, {
      constraint,
      ...(parentRef ? { parentTierId: parentRef } : {}),
    });

    if (isIndependentTier) {
      // ── 独立时间对齐层（转写层）| Independent time-aligned tier (transcription) ──
      const annotations = parseAlignableAnnotations(tier, timeSlotMap);
      for (const a of annotations) {
        if (a.annotationId) {
          annotationTimeMap.set(a.annotationId, { startTime: a.startTime, endTime: a.endTime });
        }
      }

      if (!foundPrimaryTranscription) {
        foundPrimaryTranscription = true;
        if (locale) defaultLocale = locale;
        transcriptionTierName = tierId;
        utterances = annotations.map((a) => ({
          startTime: a.startTime,
          endTime: a.endTime,
          transcription: a.text,
          ...(participant ? { speakerId: participant } : {}),
          ...(a.annotationId ? { annotationId: a.annotationId } : {}),
        }));
      } else {
        // 非首个转写层 → 归入附加层 | Non-primary transcription tier → additional tier
        if (locale) tierLocales.set(tierId, locale);
        translationTiers.set(tierId, annotations);
      }
    } else {
      // ── 依赖层（翻译/注释）| Dependent tier (translation/annotation) ──
      if (locale) tierLocales.set(tierId, locale);

      // 优先解析 REF_ANNOTATION，回退到 ALIGNABLE_ANNOTATION 兼容不规范文件
      // Prefer REF_ANNOTATION (standard), fallback to ALIGNABLE_ANNOTATION (compat)
      const refAnns = parseRefAnnotations(tier, annotationTimeMap);
      if (refAnns.length > 0) {
        translationTiers.set(tierId, refAnns);
      } else {
        const alignAnns = parseAlignableAnnotations(tier, timeSlotMap);
        if (alignAnns.length > 0) {
          translationTiers.set(tierId, alignAnns);
        }
      }
    }
  });

  return {
    mediaFilename,
    utterances,
    translationTiers,
    ...(defaultLocale ? { defaultLocale } : {}),
    tierLocales,
    participants: [...participantSet],
    ...(transcriptionTierName ? { transcriptionTierName } : {}),
    languageLabels,
    tierConstraints,
  };
}

// ── File helpers ────────────────────────────────────────────

export function downloadEaf(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.eaf') ? filename : `${filename}.eaf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File, encoding = 'utf-8'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`文件读取失败: ${reader.error?.message ?? 'unknown'}`));
    reader.readAsText(file, encoding);
  });
}
