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
} from '../../db';
import type { OrthographyInteropMetadata } from '../../utils/orthographyInteropMetadata';
import type { InterchangeLoss } from '../../utils/interchangeLossReport';
import type { EafNoteKind, EafRolePromptTier, EafTierRole } from '../../utils/eafTierRole';

export type TimelineInteropMetadata = Pick<
  OrthographyInteropMetadata,
  'timelineMode' | 'logicalDurationSec' | 'timebaseLabel'
>;

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
  lexemeId?: string;
  morphemes?: Array<{
    form: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
    lexemeId?: string;
  }>;
};

export type EafSecondaryMediaDescriptor = {
  filename: string;
  mimeType?: string;
  url?: string;
};

export type EafImportOptions = {
  tierRoles?: Readonly<Record<string, EafTierRole>>;
};

export type EafSideChannelNote = {
  kind: EafNoteKind;
  text: string;
  parentAnnotationId?: string;
};

export type EafTranscriptionTier = {
  tierName: string;
  locale?: string;
  units: EafImportResult['units'];
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
      /** Parent ANNOTATION_REF when the row is a REF_ANNOTATION */
      annotationRef?: string;
    }>
  >;
  /**
   * Further transcription layers: a second independent tier with role transcription,
   * or a DoReCo `ph` phonetic tier. Absent when there are none.
   */
  extraTranscriptionTiers?: EafTranscriptionTier[];
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
  tierConstraints: Map<
    string,
    { constraint: LayerConstraint; parentTierId?: string; symbolicSubdivision?: boolean }
  >;
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
    annotationRef?: string;
    kind?: EafNoteKind;
    targetType?: 'unit' | 'text';
    category?: 'comment' | 'fieldwork';
  }>;
  /** interlinear-text title items, keyed by language. Written only when the document title is empty. */
  documentTitle?: Record<string, string>;
  /** HEADER `URN` property: the ELAN document identity used to match re-imports (rev5 4.2-2). */
  documentUrn?: string;
  /** Non-empty participant-note bodies, keyed by PARTICIPANT. */
  speakerNotes?: Array<{ participant: string; text: string; lang?: string }>;
  /** Controlled vocabulary, speaker dialect, and addressee parked on the parent annotation. */
  sideChannelNotes?: EafSideChannelNote[];
  /** HEADER TIME_UNITS was not one of the ELAN enumerations. Times were read as milliseconds. */
  unrecognizedTimeUnit?: boolean;
  /** Losses known at parse time. Write-time losses are added by the import handler. */
  losses?: InterchangeLoss[];
  /** Phrase tiers to confirm when the default EAF choice is not unique. */
  tierRolePrompt?: readonly EafRolePromptTier[];
}
