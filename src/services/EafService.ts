/**
 * EAF (ELAN Annotation Format) import/export service.
 *
 * EAF is the XML format used by ELAN (https://archive.mpi.nl/tla/elan).
 * This service converts between Jieyu's data model and EAF 3.0.
 */

import type {
  LayerUnitDocType,
  AnchorDocType,
  LayerDocType,
  LayerUnitContentDocType,
  MediaItemDocType,
  UserNoteDocType,
  LayerConstraint,
  SpeakerDocType,
  OrthographyDocType,
  LayerLinkDocType,
  UnitTokenDocType,
  UnitMorphemeDocType,
} from '../db';
import { layerTranscriptionTreeParentId } from '../db';
import { ingestTextFile } from '../utils/textIngestion';
import {
  buildOrthographyInteropMetadata,
  parseOrthographyInteropMetadata,
  type OrthographyInteropMetadata,
} from '../utils/orthographyInteropMetadata';
import { readEnglishFallbackMultiLangLabel } from '../utils/multiLangLabels';
import { createLogger } from '../observability/logger';

type TimelineInteropMetadata = Pick<
  OrthographyInteropMetadata,
  'timelineMode' | 'logicalDurationSec' | 'timebaseLabel'
>;

const log = createLogger('EafService');

// ── Types ───────────────────────────────────────────────────

export interface EafExportInput {
  mediaItem?: MediaItemDocType;
  units: LayerUnitDocType[];
  anchors?: AnchorDocType[];
  layers: LayerDocType[];
  orthographies?: OrthographyDocType[];
  translations: LayerUnitContentDocType[];
  userNotes?: UserNoteDocType[];
  /** 逻辑时间元数据（文献项目导出声明）| Logical timeline metadata for document-mode export */
  timelineMetadata?: TimelineInteropMetadata;
  /** 独立边界层的 segment 数据（按 layerId 分组）| Segment data for independent-boundary layers, keyed by layerId */
  layerSegments?: Map<string, LayerUnitDocType[]>;
  /** 独立边界层的 segment 内容（按 layerId 分组，内层按 segmentId）| Segment content for independent-boundary layers */
  layerSegmentContents?: Map<string, Map<string, LayerUnitContentDocType>>;
  /** 默认转写层 ID（用于区分非默认独立转写层）| Default transcription layer ID */
  defaultTranscriptionLayerId?: string;
  /** Speaker entities for PARTICIPANT attribute export | 用于导出 PARTICIPANT 属性的说话人实体 */
  speakers?: SpeakerDocType[];
  /** 翻译宿主关系（layer_links 真相）| Translation host links from layer_links SSOT */
  layerLinks?: LayerLinkDocType[];
  /** Word/morpheme rows for Symbolic_Subdivision export under the primary tier */
  tokens?: UnitTokenDocType[];
  morphemes?: UnitMorphemeDocType[];
  /** 导出告警回调（如多宿主有损导出）| Export warning callback (e.g. lossy multi-host export) */
  onWarning?: (warning: EafExportWarning) => void;
}

export type EafExportWarning = {
  code: 'translation-multi-host-lossy';
  layerId: string;
  hostCount: number;
  preferredHostTranscriptionLayerId?: string;
};

export type EafImportToken = {
  form: Record<string, string>;
  gloss?: Record<string, string>;
  pos?: string;
  morphemes?: Array<{
    form: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
  }>;
};

export type EafSecondaryMediaDescriptor = {
  filename: string;
  mimeType?: string;
  url?: string;
};

export interface EafImportResult {
  mediaFilename: string;
  /** Extra MEDIA_DESCRIPTOR entries after the first (metadata only). */
  secondaryMedia?: EafSecondaryMediaDescriptor[];
  /** 项目级逻辑时间元数据 | Project-level logical timeline metadata */
  timelineMetadata?: TimelineInteropMetadata;
  /** Units extracted from the default transcription tier */
  units: Array<{
    startTime: number;
    endTime: number;
    transcription: string;
    /** PARTICIPANT attribute from the tier | tier 上的 PARTICIPANT 属性 */
    speakerId?: string;
    /** ANNOTATION_ID from EAF for round-trip consistency */
    annotationId?: string;
    /** Word-level tokens from Symbolic_Subdivision child tiers */
    tokens?: EafImportToken[];
  }>;
  /** Translation tiers keyed by tier name */
  translationTiers: Map<
    string,
    Array<{
      startTime: number;
      endTime: number;
      text: string;
      /** ANNOTATION_ID from EAF for round-trip consistency */
      annotationId?: string;
    }>
  >;
  /** Language of the first transcription tier: LANG_REF, else DEFAULT_LOCALE */
  defaultLocale?: string;
  /** Map of tier name → language id (LANG_REF, else DEFAULT_LOCALE) | 附加层的语言 */
  tierLocales: Map<string, string>;
  /** Unique PARTICIPANT values found across tiers | 所有层中出现的 PARTICIPANT */
  participants: string[];
  /** Name of the first (transcription) tier | 首层（转写层）的名称 */
  transcriptionTierName?: string;
  /** <LANGUAGE> 元素中的语言 ID → 语言标签映射 | LANG_ID → LANG_LABEL from <LANGUAGE> elements */
  languageLabels: Map<string, string>;
  /** 每个 tier 的 ELAN 约束信息 | Per-tier ELAN constraint info (constraint + parentTierId) */
  tierConstraints: Map<string, { constraint: LayerConstraint; parentTierId?: string }>;
  /** Jieyu 自定义 tier 身份元数据 | Jieyu custom tier identity metadata */
  tierMetadata: Map<string, OrthographyInteropMetadata>;
  /**
   * Notes recovered from Jieyu-exported `TIER_ID="notes"` (not a translation layer).
   * Matched to units by time on import.
   */
  userNotes?: Array<{
    startTime: number;
    endTime: number;
    text: string;
  }>;
}

const JIEYU_LAYER_META_PREFIX = 'jieyu:layer-meta:';
const JIEYU_PROJECT_META_TIMELINE = 'jieyu:project-meta:timeline';

// ── Export ───────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readMultiLangDefault(value: Record<string, string> | undefined): string {
  if (!value) return '';
  const preferred = value.default ?? value.eng ?? value.zho;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
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
    const parsed = JSON.parse(decodeURIComponent(encoded)) as {
      tierId?: unknown;
      langLabel?: unknown;
    };
    return {
      ...(typeof parsed.tierId === 'string' && parsed.tierId.trim().length > 0
        ? { tierId: parsed.tierId.trim() }
        : {}),
      ...(typeof parsed.langLabel === 'string' && parsed.langLabel.trim().length > 0
        ? { langLabel: parsed.langLabel.trim() }
        : {}),
    };
  } catch (err) {
    log.error('failed to parse locale info from layerKey', { layerKey, err });
    return {};
  }
}

function extractTimelineMetadata(
  metadata?: OrthographyInteropMetadata,
): TimelineInteropMetadata | undefined {
  if (!metadata) return undefined;
  const timelineMode = metadata.timelineMode;
  const logicalDurationSec = metadata.logicalDurationSec;
  const timebaseLabel = metadata.timebaseLabel;
  if (!timelineMode && logicalDurationSec === undefined && !timebaseLabel) return undefined;
  return {
    ...(timelineMode ? { timelineMode } : {}),
    ...(logicalDurationSec !== undefined ? { logicalDurationSec } : {}),
    ...(timebaseLabel ? { timebaseLabel } : {}),
  };
}

/** Infer ELAN MEDIA_DESCRIPTOR MIME_TYPE from media filename / details. */
export function resolveEafMediaMimeType(
  mediaItem: Pick<MediaItemDocType, 'filename' | 'details'>,
): string {
  const detailsMime =
    mediaItem.details && typeof mediaItem.details === 'object' && 'mimeType' in mediaItem.details
      ? mediaItem.details.mimeType
      : undefined;
  if (typeof detailsMime === 'string' && detailsMime.trim()) return detailsMime.trim();

  const name = mediaItem.filename.toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.aac')) return 'audio/aac';
  if (name.endsWith('.wav')) return 'audio/x-wav';
  return 'audio/x-wav';
}

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
    const metadata = buildOrthographyInteropMetadata(layer, orthographies);
    if (metadata) tierIdentityMetadata.set(tierId, metadata);
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

  // Additional tiers: non-default transcription layers + translation layers
  const additionalLayers = layers.filter(
    (l) =>
      l.layerType === 'translation' || (l.layerType === 'transcription' && l.id !== defaultTrcId),
  );
  const translationTierXml: string[] = [];
  const usedConstraintTypes = new Set<string>(); // Track which LINGUISTIC_TYPEs are needed | 跟踪需要哪些 LINGUISTIC_TYPE

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

  // Word / gloss / morph tiers from unit_tokens (Symbolic_Subdivision under primary)
  const wordTierXml: string[] = [];
  const tokensByUnitId = new Map<string, UnitTokenDocType[]>();
  for (const token of tokens) {
    const unitId = token.unitId?.trim();
    if (!unitId) continue;
    const bucket = tokensByUnitId.get(unitId) ?? [];
    bucket.push(token);
    tokensByUnitId.set(unitId, bucket);
  }
  for (const bucket of tokensByUnitId.values()) {
    bucket.sort((a, b) => a.tokenIndex - b.tokenIndex);
  }
  const morphsByTokenId = new Map<string, UnitMorphemeDocType[]>();
  for (const morph of morphemes) {
    const tokenId = morph.tokenId?.trim();
    if (!tokenId) continue;
    const bucket = morphsByTokenId.get(tokenId) ?? [];
    bucket.push(morph);
    morphsByTokenId.set(tokenId, bucket);
  }
  for (const bucket of morphsByTokenId.values()) {
    bucket.sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  }

  if (tokensByUnitId.size > 0) {
    usedConstraintTypes.add('symbolic_subdivision');
    const wordAnnRows: string[] = [];
    const glossAnnRows: string[] = [];
    const morphAnnRows: string[] = [];
    const morphGlossAnnRows: string[] = [];

    for (const utt of sorted) {
      const parentAnnId = uttAnnotationIdMap.get(utt.id);
      const unitTokens = tokensByUnitId.get(utt.id) ?? [];
      if (!parentAnnId || unitTokens.length === 0) continue;
      let previousWordAnnId: string | undefined;
      for (const token of unitTokens) {
        const formText = readMultiLangDefault(token.form);
        if (!formText) continue;
        const wordAnnId = `w${annCounter++}`;
        const previousAttr = previousWordAnnId
          ? ` PREVIOUS_ANNOTATION="${escapeXml(previousWordAnnId)}"`
          : '';
        wordAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="${escapeXml(wordAnnId)}" ANNOTATION_REF="${escapeXml(parentAnnId)}"${previousAttr}>
                <ANNOTATION_VALUE>${escapeXml(formText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
        previousWordAnnId = wordAnnId;
        const glossText = readMultiLangDefault(token.gloss);
        if (glossText) {
          usedConstraintTypes.add('symbolic_association');
          glossAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="a${annCounter++}" ANNOTATION_REF="${escapeXml(wordAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(glossText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
        }
        const tokenMorphs = morphsByTokenId.get(token.id) ?? [];
        let previousMorphAnnId: string | undefined;
        for (const morph of tokenMorphs) {
          const morphText = readMultiLangDefault(morph.form);
          if (!morphText) continue;
          const morphAnnId = `a${annCounter++}`;
          const previousMorphAttr = previousMorphAnnId
            ? ` PREVIOUS_ANNOTATION="${escapeXml(previousMorphAnnId)}"`
            : '';
          morphAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="${escapeXml(morphAnnId)}" ANNOTATION_REF="${escapeXml(wordAnnId)}"${previousMorphAttr}>
                <ANNOTATION_VALUE>${escapeXml(morphText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
          previousMorphAnnId = morphAnnId;
          const morphGlossText = readMultiLangDefault(morph.gloss);
          if (morphGlossText) {
            usedConstraintTypes.add('symbolic_association');
            morphGlossAnnRows.push(`        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="a${annCounter++}" ANNOTATION_REF="${escapeXml(morphAnnId)}">
                <ANNOTATION_VALUE>${escapeXml(morphGlossText)}</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>`);
          }
        }
      }
    }

    if (wordAnnRows.length > 0) {
      wordTierXml.push(`    <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="${escapeXml(defaultTierId)}" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}">
${wordAnnRows.join('\n')}
    </TIER>`);
      if (glossAnnRows.length > 0) {
        wordTierXml.push(`    <TIER TIER_ID="word-gloss" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="words" DEFAULT_LOCALE="en">
${glossAnnRows.join('\n')}
    </TIER>`);
      }
      if (morphAnnRows.length > 0) {
        wordTierXml.push(`    <TIER TIER_ID="morphemes" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="words" DEFAULT_LOCALE="${escapeXml(defaultTrcLocale)}">
${morphAnnRows.join('\n')}
    </TIER>`);
        if (morphGlossAnnRows.length > 0) {
          wordTierXml.push(`    <TIER TIER_ID="morph-gloss" LINGUISTIC_TYPE_REF="translation-lt" PARENT_REF="morphemes" DEFAULT_LOCALE="en">
${morphGlossAnnRows.join('\n')}
    </TIER>`);
        }
      }
    }
  }

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

  return `<?xml version="1.0" encoding="UTF-8"?>
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
${buildNoteTierXml(sorted, uttSlotMap, userNotes ?? [], annCounter)}
${footerLines.join('\n')}
</ANNOTATION_DOCUMENT>
`;
}

function buildNoteTierXml(
  sorted: LayerUnitDocType[],
  uttSlotMap: Map<string, { tsStart: string; tsEnd: string }>,
  notes: UserNoteDocType[],
  annCounterStart: number,
): string {
  if (notes.length === 0) return '';

  // Group notes by unit
  const notesByUtt = new Map<string, UserNoteDocType[]>();
  for (const note of notes) {
    if (note.targetType !== 'unit') continue;
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
      const text = uttNotes
        .map((n) => {
          const prefix = n.category ? `[${n.category}] ` : '';
          return prefix + (n.content['default'] ?? Object.values(n.content)[0] ?? '');
        })
        .join(' | ');
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

type AnnotationEntry = {
  startTime: number;
  endTime: number;
  text: string;
  annotationId?: string;
  /** Parent ANNOTATION_REF for REF_ANNOTATION rows */
  annotationRef?: string;
};

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
    const annotationRef = ann.getAttribute('ANNOTATION_REF') ?? undefined;
    const value = ann.querySelector('ANNOTATION_VALUE')?.textContent ?? '';
    if (annotationRef) {
      const parentTime = annotationTimeMap.get(annotationRef);
      if (parentTime) {
        result.push({
          startTime: parentTime.startTime,
          endTime: parentTime.endTime,
          text: value,
          ...(annotationId ? { annotationId } : {}),
          annotationRef,
        });
        // 注册自身以支持多级嵌套 | Register self for multi-level nesting
        if (annotationId) annotationTimeMap.set(annotationId, parentTime);
      }
    }
  });
  return result;
}

function mediaFilenameFromDescriptor(el: Element): string {
  const relUrl = el.getAttribute('RELATIVE_MEDIA_URL') ?? '';
  const mediaUrl = el.getAttribute('MEDIA_URL') ?? '';
  return relUrl.replace(/^\.\//, '') || mediaUrl.split('/').pop() || 'unknown.wav';
}

function attachWordTierTokensToUnits(
  units: EafImportResult['units'],
  wordTierAnns: AnnotationEntry[],
  glossByWordAnnId: Map<string, string>,
  morphsByWordAnnId: Map<string, Array<{ form: string; gloss?: string }>>,
): void {
  const byParent = new Map<string, AnnotationEntry[]>();
  for (const ann of wordTierAnns) {
    if (!ann.annotationRef || !ann.text.trim()) continue;
    const list = byParent.get(ann.annotationRef) ?? [];
    list.push(ann);
    byParent.set(ann.annotationRef, list);
  }

  for (const unit of units) {
    if (!unit.annotationId) continue;
    const wordAnns = byParent.get(unit.annotationId);
    if (!wordAnns || wordAnns.length === 0) continue;
    const nextTokens = wordAnns.map((wordAnn) => {
      const glossText = wordAnn.annotationId
        ? glossByWordAnnId.get(wordAnn.annotationId)
        : undefined;
      const morphs = wordAnn.annotationId ? morphsByWordAnnId.get(wordAnn.annotationId) : undefined;
      return {
        form: { default: wordAnn.text },
        ...(glossText ? { gloss: { eng: glossText } } : {}),
        ...(morphs && morphs.length > 0
          ? {
              morphemes: morphs.map((m) => ({
                form: { default: m.form },
                ...(m.gloss ? { gloss: { eng: m.gloss } } : {}),
              })),
            }
          : {}),
      };
    });
    unit.tokens = [...(unit.tokens ?? []), ...nextTokens];
  }
}

/**
 * ELAN 3 tiers point at `<LANGUAGE LANG_ID>` via `LANG_REF`.
 * Older files only set `DEFAULT_LOCALE`. Font `<PROPERTY>` rows are not languages.
 */
function readEafTierLanguageId(tier: Element): string | undefined {
  const langRef = tier.getAttribute('LANG_REF')?.trim() ?? '';
  if (langRef.length > 0) return langRef;
  const locale = tier.getAttribute('DEFAULT_LOCALE')?.trim() ?? '';
  return locale.length > 0 ? locale : undefined;
}

// ── Import ──────────────────────────────────────────────────

export function importFromEaf(xmlString: string): EafImportResult {
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
    if (typeId)
      linguisticTypes.set(typeId, { timeAlignable, ...(constraints ? { constraints } : {}) });
  });

  // Parse time slots
  const timeSlotMap = new Map<string, number>();
  doc.querySelectorAll('TIME_SLOT').forEach((el) => {
    const id = el.getAttribute('TIME_SLOT_ID');
    const val = el.getAttribute('TIME_VALUE');
    if (id && val) timeSlotMap.set(id, parseInt(val, 10));
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
  const tierConstraints = new Map<string, { constraint: LayerConstraint; parentTierId?: string }>();
  const importedUserNotes: NonNullable<EafImportResult['userNotes']> = [];
  /** Word tiers (Symbolic_Subdivision under primary) — not flattened into translationTiers */
  const wordTierEntries: Array<{ tierId: string; anns: AnnotationEntry[] }> = [];
  /** Dependent tiers under a word tier (gloss / morph), keyed by parent word tier id */
  const childOfWordTier = new Map<
    string,
    Array<{ tierId: string; eafConstraint?: string; anns: AnnotationEntry[] }>
  >();

  tiers.forEach((tier, tierIndex) => {
    const tierId = tier.getAttribute('TIER_ID') ?? `tier_${tierIndex}`;
    const participant = tier.getAttribute('PARTICIPANT') ?? undefined;
    const locale = readEafTierLanguageId(tier);
    const typeRef = tier.getAttribute('LINGUISTIC_TYPE_REF') ?? undefined;
    const parentRef = tier.getAttribute('PARENT_REF') ?? undefined;

    if (participant) participantSet.add(participant);

    // Jieyu-exported notes tier must round-trip as user_notes, not a translation layer.
    if (tierId === 'notes') {
      const noteAnns = parseAlignableAnnotations(tier, timeSlotMap);
      for (const a of noteAnns) {
        if (!a.text.trim()) continue;
        importedUserNotes.push({
          startTime: a.startTime,
          endTime: a.endTime,
          text: a.text,
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
        units = annotations.map((a) => ({
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
      // ── 依赖层（翻译/注释/词层）| Dependent tier (translation / word / morph) ──
      if (locale) tierLocales.set(tierId, locale);

      const refAnns = parseRefAnnotations(tier, annotationTimeMap);
      const anns = refAnns.length > 0 ? refAnns : parseAlignableAnnotations(tier, timeSlotMap);
      if (anns.length === 0) return;

      const parentIsWordTier = parentRef
        ? wordTierEntries.some((entry) => entry.tierId === parentRef)
        : false;

      if (isSymbolicSubdivision && parentRef && parentRef === transcriptionTierName) {
        // Word tier under primary utterance — absorb into unit.tokens later
        wordTierEntries.push({ tierId, anns });
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

      translationTiers.set(tierId, anns);
    }
  });

  // Attach Symbolic_Subdivision word tokens (+ optional gloss/morph under word tiers)
  if (wordTierEntries.length > 0 && units.length > 0) {
    const glossByWordAnnId = new Map<string, string>();
    const morphsByWordAnnId = new Map<string, Array<{ form: string; gloss?: string }>>();
    const morphTierIds = new Set<string>();

    for (const wordTier of wordTierEntries) {
      const children = childOfWordTier.get(wordTier.tierId) ?? [];
      for (const child of children) {
        if (child.eafConstraint === 'Symbolic_Subdivision') {
          morphTierIds.add(child.tierId);
        }
      }
    }

    const glossByMorphAnnId = new Map<string, string>();
    if (morphTierIds.size > 0) {
      Array.from(doc.querySelectorAll('TIER')).forEach((tier) => {
        const parentRef = tier.getAttribute('PARENT_REF') ?? undefined;
        if (!parentRef || !morphTierIds.has(parentRef)) return;
        const anns = parseRefAnnotations(tier, annotationTimeMap);
        for (const ann of anns) {
          if (!ann.annotationRef || !ann.text.trim()) continue;
          if (!glossByMorphAnnId.has(ann.annotationRef)) {
            glossByMorphAnnId.set(ann.annotationRef, ann.text);
          }
        }
      });
    }

    for (const wordTier of wordTierEntries) {
      const children = childOfWordTier.get(wordTier.tierId) ?? [];
      for (const child of children) {
        const isMorphLike = child.eafConstraint === 'Symbolic_Subdivision';
        for (const ann of child.anns) {
          if (!ann.annotationRef || !ann.text.trim()) continue;
          if (isMorphLike) {
            const morphs = morphsByWordAnnId.get(ann.annotationRef) ?? [];
            const morphGloss =
              ann.annotationId != null ? glossByMorphAnnId.get(ann.annotationId) : undefined;
            morphs.push({
              form: ann.text,
              ...(morphGloss ? { gloss: morphGloss } : {}),
            });
            morphsByWordAnnId.set(ann.annotationRef, morphs);
          } else if (!glossByWordAnnId.has(ann.annotationRef)) {
            glossByWordAnnId.set(ann.annotationRef, ann.text);
          }
        }
      }
      // Merge all word tiers that parent the same utterance (document order)
      attachWordTierTokensToUnits(units, wordTier.anns, glossByWordAnnId, morphsByWordAnnId);
    }
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

/**
 * @deprecated 使用 ingestTextFile 替代 | Use ingestTextFile instead
 */
export async function readFileAsText(file: File, _encoding = 'utf-8'): Promise<string> {
  const result = await ingestTextFile(file, { xmlMode: true });
  return result.text;
}
