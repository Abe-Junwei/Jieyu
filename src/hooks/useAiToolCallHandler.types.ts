import type { LayerLinkDocType, LayerUnitDocType, LayerDocType, MediaItemDocType } from '../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import type { AppShellSearchScope } from '../utils/appShellEvents';
import type { Locale } from '../i18n';
import type { SegmentTargetDescriptor } from './useAiToolCallHandler.segmentTargeting';

/** 补偿上下文：记录最近成功创建的层，用于后续链接失败时回滚 | Compensation context: track recently created layers for rollback on link failure */
export interface CompensationEntry {
  layerId: string;
  layerType: 'transcription' | 'translation';
  createdAt: number;
}

export type UseAiToolCallHandlerParams = {
  units: LayerUnitDocType[];
  selectedUnit: LayerUnitDocType | undefined;
  selectedUnitMedia?: MediaItemDocType | undefined;
  selectedLayerId: string;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createAdjacentUnit: (utt: LayerUnitDocType, duration: number) => Promise<void>;
  createTranscriptionSegment?: (targetId: string) => Promise<void>;
  splitUnit: (unitId: string, splitTime: number) => Promise<void>;
  splitTranscriptionSegment?: (targetId: string, splitTime: number) => Promise<void>;
  mergeWithPrevious?: (id: string) => Promise<void>;
  mergeWithNext?: (id: string) => Promise<void>;
  /** Preferred: merge selected timeline units (batch targets are unit ids after mapping). */
  mergeSelectedUnits?: (ids: Set<string>) => Promise<void>;
  mergeSelectedSegments?: (ids: Set<string>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  /** Preferred: delete selected timeline units (batch targets are unit ids after mapping). */
  deleteSelectedUnits?: (ids: Set<string>) => Promise<void>;
  deleteLayer: (id: string, options?: { keepUnits?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  rebindTranslationLayerHost?: (input: {
    translationLayerId: string;
    removeTranscriptionLayerId: string;
    fallbackTranscriptionLayerKey: string;
  }) => Promise<void>;
  saveUnitText: (unitId: string, text: string, layerId?: string) => Promise<void>;
  saveUnitLayerText: (unitId: string, text: string, layerId: string) => Promise<void>;
  saveSegmentContentForLayer?: (segmentId: string, layerId: string, value: string) => Promise<void>;
  /** Read committed segment-layer text (segmentation v2 map); enables rollback for `propose_changes` child writes. */
  readSegmentLayerText?: (segmentId: string, layerId: string) => string;
  /** Read current unit text for a layer from the in-memory read model; enables rollback for unit-scoped writes. */
  readUnitLayerText?: (unitId: string, layerId?: string) => string;
  segmentTargets?: SegmentTargetDescriptor[];
  updateTokenPos?: (tokenId: string, pos: string | null) => Promise<void> | void;
  batchUpdateTokenPosByForm?: (unitId: string, form: string, pos: string | null) => Promise<number> | number;
  updateTokenGloss?: (tokenId: string, gloss: string | null, lang?: string) => Promise<void> | void;
  executeAction?: (actionId: string) => void;
  getSegments?: () => LayerUnitDocType[];
  navigateTo?: (segmentId: string) => void;
  openSearch?: (detail: { query: string; scope?: AppShellSearchScope; layerKinds?: Array<'transcription' | 'translation' | 'gloss'> }) => void;
  seekToTime?: (timeSeconds: number) => void;
  splitAtTime?: (timeSeconds: number) => boolean;
  zoomToSegment?: (segmentId: string, zoomLevel?: number) => boolean;
  bridgeTextForLayerWrite?: (input: {
    text: string;
    targetLayerId?: string;
    selectedLayerId?: string;
  }) => Promise<string>;
};

/**
 * 执行上下文：每次工具调用时构建，传入对应适配器
 * Execution context built per tool call and passed to the matching adapter.
 */
export interface ExecutionContext {
  call: AiChatToolCall;
  locale: Locale;
  units: LayerUnitDocType[];
  selectedUnit: LayerUnitDocType | undefined;
  selectedUnitMedia: MediaItemDocType | undefined;
  selectedLayerId: string;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  translationLayersRef: { readonly current: LayerDocType[] };
  layerLinks: LayerLinkDocType[];
  compensationRef: { current: Map<string, CompensationEntry> };
  COMPENSATION_TTL_MS: number;
  hasRequestedUnitTarget: () => boolean;
  describeRequestedUnitTarget: () => string;
  resolveRequestedUnit: () => LayerUnitDocType | null;
  resolveRequestedSegmentTarget: () => SegmentTargetDescriptor | null;
  resolveRequestedTranslationLayerId: () => string;
  resolveTranscriptionLayerForLink: () => LayerDocType | null;
  resolveTranslationLayerForLink: () => LayerDocType | null;
  layerMatchesLanguage: (layer: LayerDocType, languageQuery: string) => boolean;
  parseLayerHintFromOpaqueId: (value: string) => { layerType: 'translation' | 'transcription'; languageQuery: string } | null;
  createLayer: UseAiToolCallHandlerParams['createLayer'];
  createAdjacentUnit: UseAiToolCallHandlerParams['createAdjacentUnit'];
  createTranscriptionSegment?: UseAiToolCallHandlerParams['createTranscriptionSegment'];
  splitUnit: UseAiToolCallHandlerParams['splitUnit'];
  splitTranscriptionSegment?: UseAiToolCallHandlerParams['splitTranscriptionSegment'];
  mergeWithPrevious?: UseAiToolCallHandlerParams['mergeWithPrevious'];
  mergeWithNext?: UseAiToolCallHandlerParams['mergeWithNext'];
  mergeSelectedUnits?: UseAiToolCallHandlerParams['mergeSelectedUnits'];
  mergeSelectedSegments?: UseAiToolCallHandlerParams['mergeSelectedSegments'];
  deleteUnit: UseAiToolCallHandlerParams['deleteUnit'];
  deleteSelectedUnits?: UseAiToolCallHandlerParams['deleteSelectedUnits'];
  deleteLayer: UseAiToolCallHandlerParams['deleteLayer'];
  toggleLayerLink: UseAiToolCallHandlerParams['toggleLayerLink'];
  rebindTranslationLayerHost?: UseAiToolCallHandlerParams['rebindTranslationLayerHost'];
  saveUnitText: UseAiToolCallHandlerParams['saveUnitText'];
  saveUnitLayerText: UseAiToolCallHandlerParams['saveUnitLayerText'];
  saveSegmentContentForLayer?: UseAiToolCallHandlerParams['saveSegmentContentForLayer'];
  readSegmentLayerText?: UseAiToolCallHandlerParams['readSegmentLayerText'];
  readUnitLayerText?: UseAiToolCallHandlerParams['readUnitLayerText'];
  updateTokenPos?: UseAiToolCallHandlerParams['updateTokenPos'];
  batchUpdateTokenPosByForm?: UseAiToolCallHandlerParams['batchUpdateTokenPosByForm'];
  updateTokenGloss?: UseAiToolCallHandlerParams['updateTokenGloss'];
  executeAction: ((actionId: string) => void) | undefined;
  getSegments?: () => LayerUnitDocType[];
  navigateTo?: (segmentId: string) => void;
  openSearch?: UseAiToolCallHandlerParams['openSearch'];
  seekToTime?: UseAiToolCallHandlerParams['seekToTime'];
  splitAtTime?: UseAiToolCallHandlerParams['splitAtTime'];
  zoomToSegment?: UseAiToolCallHandlerParams['zoomToSegment'];
  bridgeTextForLayerWrite?: UseAiToolCallHandlerParams['bridgeTextForLayerWrite'];
}

/**
 * 操作对象适配器：每个适配器负责一类对象（句段、层、词汇标注、词…）的 tool call 执行
 * Object adapter: each adapter handles tool calls for one object domain (segment, layer, gloss, token…).
 */
export interface ToolObjectAdapter {
  readonly handles: ReadonlyArray<AiChatToolCall['name']>;
  execute: (ctx: ExecutionContext) => Promise<AiChatToolResult>;
}
