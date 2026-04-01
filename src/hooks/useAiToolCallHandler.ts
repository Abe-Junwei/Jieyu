import { useCallback, useRef } from 'react';
import type { LayerLinkDocType, UtteranceDocType, LayerDocType, MediaItemDocType } from '../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';
import { AutoGlossService } from '../ai/AutoGlossService';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import { loadRecentVoiceSessions } from '../services/VoiceSessionStore';
import { createLogger } from '../observability/logger';
import type { AppShellSearchScope } from '../utils/appShellEvents';
import { t, tf, useLocale, type Locale } from '../i18n';

const log = createLogger('useAiToolCallHandler');

/** 补偿上下文：记录最近成功创建的层，用于后续链接失败时回滚 | Compensation context: track recently created layers for rollback on link failure */
interface CompensationEntry {
  layerId: string;
  layerType: 'transcription' | 'translation';
  createdAt: number;
}

type Params = {
  utterances: UtteranceDocType[];
  selectedUtterance: UtteranceDocType | undefined;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  selectedLayerId: string;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createNextUtterance: (utt: UtteranceDocType, duration: number) => Promise<void>;
  splitUtterance: (utteranceId: string, splitTime: number) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteLayer: (id: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  /** 更新单个 token 词性 | Update POS for a single token */
  updateTokenPos?: (tokenId: string, pos: string | null) => Promise<void> | void;
  /** 按 form 批量更新词性 | Batch-update POS by form within an utterance */
  batchUpdateTokenPosByForm?: (utteranceId: string, form: string, pos: string | null) => Promise<number> | number;
  /** 更新单个 token 的 gloss | Update gloss for a single token */
  updateTokenGloss?: (tokenId: string, gloss: string | null, lang?: string) => Promise<void> | void;
  /** 通用的 ActionId 执行（undo/redo/mark/delete/playPause 等）| Generic ActionId executor */
  executeAction?: (actionId: string) => void;
  /** 获取当前所有句段列表（用于 nav_to_segment 解析）| Get all current utterances */
  getSegments?: () => UtteranceDocType[];
  /** 导航到指定句段（用于 nav_to_segment）| Navigate to a segment by ID */
  navigateTo?: (segmentId: string) => void;
  /** 打开搜索并预填查询 | Open search with prefilled query */
  openSearch?: (detail: { query: string; scope?: AppShellSearchScope; layerKinds?: Array<'transcription' | 'translation' | 'gloss'> }) => void;
  /** 跳转到绝对时间 | Seek to absolute time */
  seekToTime?: (timeSeconds: number) => void;
  /** 在绝对时间点分割句段 | Split segment at absolute time */
  splitAtTime?: (timeSeconds: number) => boolean;
  /** 缩放并定位句段 | Zoom and focus a segment */
  zoomToSegment?: (segmentId: string, zoomLevel?: number) => boolean;
  /** 依据 source/target layer orthography 变换 AI 写回文本 | Transform AI writeback text using source/target layer orthography */
  transformTextForLayerWrite?: (input: {
    text: string;
    targetLayerId?: string;
    selectedLayerId?: string;
  }) => Promise<string>;
};

/**
 * 执行上下文：每次工具调用时构建，传入对应适配器
 * Execution context built per tool call and passed to the matching adapter.
 */
interface ExecutionContext {
  call: AiChatToolCall;
  locale: Locale;
  utterances: UtteranceDocType[];
  selectedUtterance: UtteranceDocType | undefined;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  selectedLayerId: string;
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  /** translationLayers 的最新 ref，用于补偿回查 | Latest-ref for post-async layer lookup */
  translationLayersRef: { readonly current: LayerDocType[] };
  layerLinks: LayerLinkDocType[];
  compensationRef: { current: Map<string, CompensationEntry> };
  COMPENSATION_TTL_MS: number;
  // 预绑定的解析工具函数（已捕获当前 call 和快照数据）
  // Pre-bound resolver helpers (already closed over current call + snapshot)
  resolveRequestedUtterance: () => UtteranceDocType | null;
  resolveRequestedTranslationLayerId: () => string;
  resolveTranscriptionLayerForLink: () => LayerDocType | null;
  resolveTranslationLayerForLink: () => LayerDocType | null;
  layerMatchesLanguage: (layer: LayerDocType, languageQuery: string) => boolean;
  parseLayerHintFromOpaqueId: (value: string) => { layerType: 'translation' | 'transcription'; languageQuery: string } | null;
  // 回调 | Callbacks
  createLayer: Params['createLayer'];
  createNextUtterance: Params['createNextUtterance'];
  splitUtterance: Params['splitUtterance'];
  deleteUtterance: Params['deleteUtterance'];
  deleteLayer: Params['deleteLayer'];
  toggleLayerLink: Params['toggleLayerLink'];
  saveUtteranceText: Params['saveUtteranceText'];
  saveTextTranslationForUtterance: Params['saveTextTranslationForUtterance'];
  updateTokenPos?: Params['updateTokenPos'];
  batchUpdateTokenPosByForm?: Params['batchUpdateTokenPosByForm'];
  updateTokenGloss?: Params['updateTokenGloss'];
  executeAction: ((actionId: string) => void) | undefined;
  getSegments?: () => UtteranceDocType[];
  navigateTo?: (segmentId: string) => void;
  openSearch?: Params['openSearch'];
  seekToTime?: Params['seekToTime'];
  splitAtTime?: Params['splitAtTime'];
  zoomToSegment?: Params['zoomToSegment'];
  transformTextForLayerWrite?: Params['transformTextForLayerWrite'];
}

/**
 * 操作对象适配器：每个适配器负责一类对象（句段、层、词汇标注、词…）的 tool call 执行
 * Object adapter: each adapter handles tool calls for one object domain (segment, layer, gloss, token…).
 */
interface ToolObjectAdapter {
  readonly handles: ReadonlyArray<AiChatToolCall['name']>;
  execute: (ctx: ExecutionContext) => Promise<AiChatToolResult>;
}

// ─────────────────────────────────────────────────────────────
//  语言/层工具函数（纯函数，无 React 依赖）
//  Language/layer utility functions (pure, no React dependency)
// ─────────────────────────────────────────────────────────────

function _normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function _buildLanguageTokens(query: string): string[] {
  const q = _normalizeText(query);
  const tokens = new Set<string>([q]);
  const code = resolveLanguageQuery(query);
  if (code) {
    tokens.add(code);
    const entry = SUPPORTED_VOICE_LANGS.flatMap((g) => g.langs).find((l) => l.code === code);
    if (entry) {
      entry.label.split(/\s*\/\s*/).forEach((part) => tokens.add(_normalizeText(part)));
    }
  }
  return Array.from(tokens).filter((token) => token.length > 0);
}

function _parseLayerHintFromOpaqueId(value: string): { layerType: 'translation' | 'transcription'; languageQuery: string } | null {
  const normalized = _normalizeText(value);
  if (!normalized) return null;
  const layerType = /translation|译|翻译/.test(normalized)
    ? 'translation'
    : (/transcription|转写|转录|听写/.test(normalized) ? 'transcription' : null);
  if (!layerType) return null;
  const langFragment = normalized
    .replace(/translation|transcription|layer|tier|译|翻译|转写|转录|听写|层|_/g, '')
    .trim();
  if (!langFragment) return null;
  const code = resolveLanguageQuery(langFragment);
  if (!code) return null;
  return { layerType, languageQuery: code };
}

function _layerMatchesLanguage(layer: LayerDocType, languageQuery: string): boolean {
  const fields = [layer.languageId, layer.key, layer.name.zho, layer.name.eng]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => _normalizeText(value));
  const tokens = _buildLanguageTokens(languageQuery).map((t) => _normalizeText(t));
  return tokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
}

function _formatVoiceLayerKinds(layerKinds: Array<'transcription' | 'translation' | 'gloss'>, locale: Locale): string {
  const keyByLayerKind = {
    transcription: 'transcription.aiTool.layerKind.transcription',
    translation: 'transcription.aiTool.layerKind.translation',
    gloss: 'transcription.aiTool.layerKind.gloss',
  } as const;
  return layerKinds.map((kind) => t(locale, keyByLayerKind[kind])).join(' / ');
}

function _formatVoiceHistoryActorLabel(intentType: string, locale: Locale): string {
  return intentType === 'chat'
    ? t(locale, 'transcription.aiTool.voice.historyActorUser')
    : t(locale, 'transcription.aiTool.voice.historyActorAssistant');
}

function _formatLayerTypeLabel(layerType: 'transcription' | 'translation', locale: Locale): string {
  return layerType === 'translation'
    ? t(locale, 'transcription.aiTool.layer.typeTranslation')
    : t(locale, 'transcription.aiTool.layer.typeTranscription');
}

// ─────────────────────────────────────────────────────────────
//  句段对象适配器 | Segment object adapter
// ─────────────────────────────────────────────────────────────

const segmentAdapter: ToolObjectAdapter = {
  handles: [
    'create_transcription_segment',
    'split_transcription_segment',
    'delete_transcription_segment',
    'set_transcription_text',
    'set_translation_text',
    'clear_translation_segment',
  ],
  async execute(ctx) {
    const { call, locale } = ctx;

    if (call.name === 'create_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.createMissingUtteranceId') };
      }
      const baseUtterance = ctx.resolveRequestedUtterance();
      if (!baseUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedId }) };
      }
      const mediaDuration = typeof ctx.selectedUtteranceMedia?.duration === 'number'
        ? ctx.selectedUtteranceMedia.duration
        : baseUtterance.endTime + 2;
      await ctx.createNextUtterance(baseUtterance, mediaDuration);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.createDone') };
    }

    if (call.name === 'split_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedId }) };
      }
      const start = Number(targetUtterance.startTime);
      const end = Number(targetUtterance.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitInvalidRange') };
      }
      const providedSplitTime = call.arguments.splitTime;
      if (typeof providedSplitTime !== 'number' || !Number.isFinite(providedSplitTime)) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.splitMissingTime') };
      }
      const splitTime = providedSplitTime;
      // 约束切分点位于句段内部，并给两侧保留最小时长 | Keep split point strictly inside with minimum span on each side.
      const minSpan = 0.05;
      if (splitTime <= start + minSpan || splitTime >= end - minSpan) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.segment.splitOutOfRange', {
            minTime: (start + minSpan).toFixed(2),
            maxTime: (end - minSpan).toFixed(2),
          }),
        };
      }
      await ctx.splitUtterance(targetUtterance.id, splitTime);
      return { ok: true, message: tf(locale, 'transcription.aiTool.segment.splitDone', { splitTime: splitTime.toFixed(2) }) };
    }

    if (call.name === 'delete_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.deleteMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedId }) };
      }
      await ctx.deleteUtterance(targetUtterance.id);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.deleteDone') };
    }

    if (call.name === 'set_transcription_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingText') };
      }
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranscriptionMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedId }) };
      }
      const targetLayerId = ctx.transcriptionLayers.some((layer) => layer.id === ctx.selectedLayerId)
        ? ctx.selectedLayerId
        : undefined;
      const transformedText = ctx.transformTextForLayerWrite
        ? await ctx.transformTextForLayerWrite({
            text,
            ...(targetLayerId !== undefined ? { targetLayerId } : {}),
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveUtteranceText(targetUtterance.id, transformedText, targetLayerId);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranscriptionDone') };
    }

    if (call.name === 'set_translation_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingText') };
      }
      const requestedUtteranceId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedUtteranceId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedUtteranceId }) };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.setTranslationMissingLayerId') };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: requestedLayerId }) };
      }
      const transformedText = ctx.transformTextForLayerWrite
        ? await ctx.transformTextForLayerWrite({
            text,
            targetLayerId,
            selectedLayerId: ctx.selectedLayerId,
          })
        : text;
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, transformedText, targetLayerId);
      return { ok: true, message: t(locale, 'transcription.aiTool.segment.setTranslationDone') };
    }

    if (call.name === 'clear_translation_segment') {
      const requestedUtteranceId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedUtteranceId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingUtteranceId') };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedUtteranceId }) };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: t(locale, 'transcription.aiTool.segment.clearTranslationMissingLayerId') };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: requestedLayerId }) };
      }
      const targetLayer = ctx.translationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.segment.translationLayerNotFound', { layerId: targetLayerId }) };
      }
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, '', targetLayerId);
      const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.segment.clearTranslationDone', {
          utteranceId: targetUtterance.id,
          layerLabel,
        }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.segment.unsupportedTool', { toolName: call.name }) };
  },
};

// ─────────────────────────────────────────────────────────────
//  层对象适配器 | Layer object adapter
// ─────────────────────────────────────────────────────────────

const layerAdapter: ToolObjectAdapter = {
  handles: [
    'create_transcription_layer',
    'create_translation_layer',
    'delete_layer',
    'link_translation_layer',
    'unlink_translation_layer',
  ],
  async execute(ctx) {
    const { call, compensationRef, COMPENSATION_TTL_MS, locale } = ctx;

    if (call.name === 'create_transcription_layer') {
      const rawLang = String(call.arguments.languageId ?? call.arguments.languageQuery ?? '').trim();
      if (!rawLang) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.createTranscriptionMissingLanguageId') };
      }
      // 统一规范化：人类可读名 → ISO 639-3 代码；无法识别时返回澄清，避免盲目创建。
      // Normalize to ISO 639-3; if unresolved, return clarify signal instead of blind create.
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.layer.languageUnrecognized', { rawLang }) };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const ok = await ctx.createLayer('transcription', {
        languageId,
        ...(alias ? { alias } : {}),
      });
      return {
        ok,
        message: ok
          ? tf(locale, 'transcription.aiTool.layer.createTranscriptionDone', {
            languageId,
            aliasSuffix: alias ? ` / ${alias}` : '',
          })
          : t(locale, 'transcription.aiTool.layer.createTranscriptionFailed'),
      };
    }

    if (call.name === 'create_translation_layer') {
      const rawLang = String(call.arguments.languageId ?? call.arguments.languageQuery ?? '').trim();
      if (!rawLang) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.createTranslationMissingLanguageId') };
      }
      // 统一规范化：人类可读名 → ISO 639-3 代码；无法识别时返回澄清，避免盲目创建。
      // Normalize to ISO 639-3; if unresolved, return clarify signal instead of blind create.
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.layer.languageUnrecognized', { rawLang }) };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const modalityRaw = String(call.arguments.modality ?? 'text').trim().toLowerCase();
      const modality: 'text' | 'audio' | 'mixed' = modalityRaw === 'audio' || modalityRaw === 'mixed'
        ? modalityRaw
        : 'text';
      const prevLayerIds = new Set(ctx.translationLayers.map((l) => l.id));
      const ok = await ctx.createLayer('translation', {
        languageId,
        ...(alias ? { alias } : {}),
      }, modality);
      if (ok) {
        // 记录补偿上下文：对比新增层 ID | Record compensation: diff for new layer ID
        const newLayer = ctx.translationLayersRef.current.find((l) => !prevLayerIds.has(l.id));
        if (newLayer) {
          compensationRef.current.set(call.requestId ?? 'default', { layerId: newLayer.id, layerType: 'translation', createdAt: Date.now() });
        }
      }
      return {
        ok,
        message: ok
          ? tf(locale, 'transcription.aiTool.layer.createTranslationDone', {
            languageId,
            aliasSuffix: alias ? ` / ${alias}` : '',
            modality,
          })
          : t(locale, 'transcription.aiTool.layer.createTranslationFailed'),
      };
    }

    if (call.name === 'delete_layer') {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length > 0) {
        const exists = ctx.transcriptionLayers.some((layer) => layer.id === requestedLayerId)
          || ctx.translationLayers.some((layer) => layer.id === requestedLayerId);
        if (exists) {
          await ctx.deleteLayer(requestedLayerId);
          return { ok: true, message: tf(locale, 'transcription.aiTool.layer.deleteDone', { layerId: requestedLayerId }) };
        }

        // 兼容语义化 layerId（例如 transcription_layer_mandarin）
        // Fallback for semantic layer IDs (e.g. transcription_layer_mandarin).
        const hint = ctx.parseLayerHintFromOpaqueId(requestedLayerId);
        if (!hint) {
          return { ok: false, message: tf(locale, 'transcription.aiTool.layer.targetNotFound', { layerId: requestedLayerId }) };
        }

        const pool = hint.layerType === 'translation'
          ? ctx.translationLayers
          : ctx.transcriptionLayers;
        const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, hint.languageQuery));
        if (matched.length === 0) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
              languageQuery: hint.languageQuery,
              layerType: _formatLayerTypeLabel(hint.layerType, locale),
            }),
          };
        }
        if (matched.length > 1) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
              layerType: _formatLayerTypeLabel(hint.layerType, locale),
            }),
          };
        }

        const targetLayer = matched[0]!;
        await ctx.deleteLayer(targetLayer.id);
        return { ok: true, message: tf(locale, 'transcription.aiTool.layer.deleteDone', { layerId: targetLayer.id }) };
      }

      const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
      const languageQuery = String(call.arguments.languageQuery ?? '').trim();
      if (!layerType || !languageQuery) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.deleteMissingTarget') };
      }

      const pool = layerType === 'translation'
        ? ctx.translationLayers
        : layerType === 'transcription'
          ? ctx.transcriptionLayers
          : [];
      if (pool.length === 0) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.noAvailableByType', {
            layerType: _formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
          }),
        };
      }

      const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, languageQuery));
      if (matched.length === 0) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
            languageQuery,
            layerType: _formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
          }),
        };
      }
      if (matched.length > 1) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
            layerType: _formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
          }),
        };
      }

      const targetLayer = matched[0]!;
      await ctx.deleteLayer(targetLayer.id);
      return { ok: true, message: tf(locale, 'transcription.aiTool.layer.deleteDone', { layerId: targetLayer.id }) };
    }

    if (call.name === 'link_translation_layer' || call.name === 'unlink_translation_layer') {
      const requestedTranscriptionLayerId = String(call.arguments.transcriptionLayerId ?? '').trim();
      const requestedTranscriptionLayerKey = String(call.arguments.transcriptionLayerKey ?? '').trim();
      if (!requestedTranscriptionLayerId && !requestedTranscriptionLayerKey) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.linkMissingTranscriptionTarget') };
      }

      const requestedTranslationLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (!requestedTranslationLayerId) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.linkMissingTranslationTarget') };
      }

      const trcLayer = ctx.resolveTranscriptionLayerForLink();
      if (!trcLayer) {
        // 补偿检查：链接失败时回滚最近创建的层 | Compensation: rollback recently created layer on link failure
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try {
            await ctx.deleteLayer(comp.layerId);
          } catch (error) {
            log.warn('Compensation rollback failed after missing transcription layer', {
              requestId: call.requestId ?? 'default',
              layerId: comp.layerId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return { ok: false, message: tf(locale, 'transcription.aiTool.layer.linkMissingTranscriptionRollback', { layerId: comp.layerId }) };
        }
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.linkMissingTranscription') };
      }
      const trlLayer = ctx.resolveTranslationLayerForLink();
      if (!trlLayer) {
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try {
            await ctx.deleteLayer(comp.layerId);
          } catch (error) {
            log.warn('Compensation rollback failed after missing translation layer', {
              requestId: call.requestId ?? 'default',
              layerId: comp.layerId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return { ok: false, message: tf(locale, 'transcription.aiTool.layer.linkMissingTranslationRollback', { layerId: comp.layerId }) };
        }
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.linkMissingTranslation') };
      }

      const exists = trlLayer.parentLayerId === trcLayer.id;
      const shouldLink = call.name === 'link_translation_layer';

      if (!shouldLink && exists) {
        const fallbackParent = ctx.transcriptionLayers.find(
          (layer) => layer.id !== trcLayer.id && (layer.constraint ?? 'independent_boundary') === 'independent_boundary',
        );
        if (!fallbackParent) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.layer.unlinkRequiresFallbackParent'),
          };
        }
        try {
          await ctx.toggleLayerLink(fallbackParent.key, trlLayer.id);
        } catch (linkError) {
          const comp = compensationRef.current.get(call.requestId ?? 'default');
          if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
            compensationRef.current.delete(call.requestId ?? 'default');
            try {
              await ctx.deleteLayer(comp.layerId);
            } catch (error) {
              log.warn('Compensation rollback failed after relink fallback error', {
                requestId: call.requestId ?? 'default',
                layerId: comp.layerId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            const errMsg = linkError instanceof Error ? linkError.message : t(locale, 'transcription.aiTool.layer.unlinkFailed');
            return { ok: false, message: tf(locale, 'transcription.aiTool.layer.linkRollbackAfterError', { errMsg, layerId: comp.layerId }) };
          }
          throw linkError;
        }

        compensationRef.current.delete(call.requestId ?? 'default');
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.unlinkDoneWithFallback', {
            transcriptionLayer: trcLayer.name.zho ?? trcLayer.name.eng ?? trcLayer.key,
            translationLayer: trlLayer.name.zho ?? trlLayer.name.eng ?? trlLayer.key,
            fallbackLayer: fallbackParent.name.zho ?? fallbackParent.name.eng ?? fallbackParent.key,
          }),
        };
      }

      try {
        if (exists !== shouldLink) {
          await ctx.toggleLayerLink(trcLayer.key, trlLayer.id);
        }
      } catch (linkError) {
        // 补偿：toggleLayerLink 异常时回滚最近创建的层 | Compensation on toggleLayerLink exception
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try {
            await ctx.deleteLayer(comp.layerId);
          } catch (error) {
            log.warn('Compensation rollback failed after link toggle error', {
              requestId: call.requestId ?? 'default',
              layerId: comp.layerId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          const errMsg = linkError instanceof Error ? linkError.message : t(locale, 'transcription.aiTool.layer.linkFailed');
          return { ok: false, message: tf(locale, 'transcription.aiTool.layer.linkRollbackAfterError', { errMsg, layerId: comp.layerId }) };
        }
        throw linkError;
      }

      // 链接成功，清除补偿上下文 | Link succeeded, clear compensation
      compensationRef.current.delete(call.requestId ?? 'default');
      const trcLabel = trcLayer.name.zho ?? trcLayer.name.eng ?? trcLayer.key;
      const trlLabel = trlLayer.name.zho ?? trlLayer.name.eng ?? trlLayer.key;
      return {
        ok: true,
        message: shouldLink
          ? tf(locale, 'transcription.aiTool.layer.linkDone', { transcriptionLayer: trcLabel, translationLayer: trlLabel })
          : tf(locale, 'transcription.aiTool.layer.unlinkDone', { transcriptionLayer: trcLabel, translationLayer: trlLabel }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.layer.unsupportedTool', { toolName: call.name }) };
  },
};

// ─────────────────────────────────────────────────────────────
//  词汇标注适配器 | Gloss object adapter
// ─────────────────────────────────────────────────────────────

const glossAdapter: ToolObjectAdapter = {
  handles: ['auto_gloss_utterance'],
  async execute(ctx) {
    const { call, locale } = ctx;
    const requestedId = String(call.arguments.utteranceId ?? '').trim();
    if (requestedId.length === 0) {
      return { ok: false, message: t(locale, 'transcription.aiTool.gloss.missingUtteranceId') };
    }
    const targetUtterance = ctx.resolveRequestedUtterance();
    if (!targetUtterance) {
      return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { utteranceId: requestedId }) };
    }
    const service = new AutoGlossService();
    const result = await service.glossUtterance(targetUtterance.id);
    if (result.matched.length === 0) {
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.gloss.noMatches', {
          total: result.total,
          skipped: result.skipped,
        }),
      };
    }
    const labels = result.matched.map((m) => {
      const form = Object.values(m.tokenForm)[0] ?? '';
      const gloss = Object.values(m.gloss)[0] ?? '';
      return `${form}→${gloss}`;
    }).join('、');
    return {
      ok: true,
      message: tf(locale, 'transcription.aiTool.gloss.done', {
        matched: result.matched.length,
        total: result.total,
        labels,
      }),
    };
  },
};

// ─────────────────────────────────────────────────────────────
//  词（token）对象适配器 | Token object adapter
// ─────────────────────────────────────────────────────────────

const tokenAdapter: ToolObjectAdapter = {
  handles: ['set_token_pos', 'set_token_gloss'],
  async execute(ctx) {
    const { call, locale } = ctx;

    if (call.name === 'set_token_pos') {
      // 优先按 tokenId 精确更新；fallback 为 utteranceId + form 批量更新
      // Prefer exact update by tokenId; fallback to batch update by utteranceId + form.
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const posRaw = call.arguments.pos;
      const pos = posRaw === null || posRaw === '' ? null : String(posRaw ?? '').trim() || null;

      if (tokenId.length > 0) {
        if (!ctx.updateTokenPos) {
          return { ok: false, message: t(locale, 'transcription.aiTool.token.setPosCallbackMissing') };
        }
        await ctx.updateTokenPos(tokenId, pos);
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.token.setPosDone', {
            tokenId,
            pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
          }),
        };
      }

      // 按 form 批量更新 | Batch update by form within an utterance
      const utteranceId = String(call.arguments.utteranceId ?? '').trim();
      const form = String(call.arguments.form ?? '').trim();
      if (!utteranceId || !form) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setPosMissingTarget') };
      }
      if (!ctx.batchUpdateTokenPosByForm) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.batchSetPosCallbackMissing') };
      }
      const updated = await ctx.batchUpdateTokenPosByForm(utteranceId, form, pos);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.batchSetPosDone', {
          updated,
          form,
          pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
      };
    }

    if (call.name === 'set_token_gloss') {
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const glossRaw = call.arguments.gloss;
      const gloss = glossRaw === null || glossRaw === '' ? null : String(glossRaw ?? '').trim() || null;
      const lang = String(call.arguments.lang ?? 'eng').trim() || 'eng';

      if (!tokenId) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setGlossMissingTokenId') };
      }
      if (!ctx.updateTokenGloss) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setGlossCallbackMissing') };
      }
      await ctx.updateTokenGloss(tokenId, gloss, lang);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.setGlossDone', {
          tokenId,
          lang,
          gloss: gloss ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.token.unsupportedTool', { toolName: call.name }) };
  },
};

// ─────────────────────────────────────────────────────────────
//  语音指令适配器 | Voice action adapter
//  Handles VoiceActionTool names that map to ActionIds or delegate
//  to existing adapters (auto_gloss_segment / auto_translate_segment).
// ─────────────────────────────────────────────────────────────

const voiceAdapter: ToolObjectAdapter = {
  handles: [
    'play_pause',
    'undo',
    'redo',
    'search_segments',
    'toggle_notes',
    'mark_segment',
    'delete_segment',
    'auto_gloss_segment',
    'auto_translate_segment',
    'focus_segment',
    'zoom_to_segment',
    'nav_to_segment',
    'nav_to_time',
    'split_at_time',
    'merge_prev',
    'merge_next',
    'auto_segment',
    'suggest_segment_improvement',
    'analyze_segment_quality',
    'get_current_segment',
    'get_project_summary',
    'get_recent_history',
  ],
  async execute(ctx) {
    const { call, locale } = ctx;
    const executeMappedAction = (
      action: Parameters<NonNullable<typeof ctx.executeAction>>[0],
      successMessage: string,
    ) => {
      if (!ctx.executeAction) {
        return { ok: false as const, message: t(locale, 'transcription.aiTool.voice.actionUnsupported') };
      }
      ctx.executeAction(action);
      return { ok: true as const, message: successMessage };
    };

    // ── ActionId-mapped tools (delegate to executeAction) ──────────────────
    if (call.name === 'play_pause') {
      return executeMappedAction('playPause', t(locale, 'transcription.aiTool.voice.playPauseDone'));
    }
    if (call.name === 'undo') {
      return executeMappedAction('undo', t(locale, 'transcription.aiTool.voice.undoDone'));
    }
    if (call.name === 'redo') {
      return executeMappedAction('redo', t(locale, 'transcription.aiTool.voice.redoDone'));
    }
    if (call.name === 'search_segments') {
      const query = String(call.arguments.query ?? '').trim();
      const rawLayers = Array.isArray(call.arguments.layers)
        ? call.arguments.layers.filter((item): item is 'transcription' | 'translation' | 'gloss' => (
          item === 'transcription' || item === 'translation' || item === 'gloss'
        ))
        : [];
      if (!query) {
        return { ok: false, message: t(locale, 'transcription.aiTool.voice.searchQueryRequired') };
      }
      if (ctx.openSearch) {
        ctx.openSearch({ query, scope: 'global', ...(rawLayers.length > 0 ? { layerKinds: rawLayers } : {}) });
        return {
          ok: true,
          message: rawLayers.length > 0
            ? tf(locale, 'transcription.aiTool.voice.searchOpenedWithScope', {
              query,
              scope: _formatVoiceLayerKinds(rawLayers, locale),
            })
            : tf(locale, 'transcription.aiTool.voice.searchOpened', { query }),
        };
      }
      if (!ctx.executeAction) {
        return { ok: false, message: tf(locale, 'transcription.aiTool.voice.searchUnsupportedManual', { query }) };
      }
      ctx.executeAction('search');
      return { ok: true, message: tf(locale, 'transcription.aiTool.voice.searchManual', { query }) };
    }
    if (call.name === 'toggle_notes') {
      return executeMappedAction('toggleNotes', t(locale, 'transcription.aiTool.voice.toggleNotesDone'));
    }
    if (call.name === 'mark_segment') {
      return executeMappedAction('markSegment', t(locale, 'transcription.aiTool.voice.markSegmentDone'));
    }
    if (call.name === 'delete_segment') {
      return executeMappedAction('deleteSegment', t(locale, 'transcription.aiTool.voice.deleteSegmentDone'));
    }

    // ── Auto-annotation delegation (reuse existing adapter logic) ──────────
    // auto_gloss_segment / auto_translate_segment map to the existing
    // auto_gloss_utterance / auto_translate_utterance adapter entries.
    if (call.name === 'auto_gloss_segment') {
      const glossAdapterInst = ADAPTER_MAP['auto_gloss_utterance'];
      if (glossAdapterInst) return glossAdapterInst.execute(ctx);
      return { ok: false, message: t(locale, 'transcription.aiTool.voice.autoGlossUnavailable') };
    }
    if (call.name === 'auto_translate_segment') {
      // auto_translate_segment is not yet implemented in the tool adapter registry.
      // Return a clear message so the user knows the feature is pending.
      return { ok: false, message: t(locale, 'transcription.aiTool.voice.autoTranslateUnavailable') };
    }

    // ── Navigation / view tools (require runtime segment context) ───────────
    if (call.name === 'nav_to_segment') {
      const idx = Number(call.arguments.segmentIndex);
      if (!Number.isFinite(idx) || idx < 1) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentInvalidIndex') };
      const segments = ctx.getSegments?.();
      if (!segments || segments.length === 0) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentEmpty') };
      const target = segments[idx - 1];
      if (!target) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.navSegmentOutOfRange', { index: idx, total: segments.length }) };
      if (!ctx.navigateTo) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navigateUnsupported') };
      ctx.navigateTo(target.id);
      return { ok: true, message: tf(locale, 'transcription.aiTool.voice.navSegmentDone', { index: idx, total: segments.length }) };
    }
    if (call.name === 'nav_to_time') {
      const timeSeconds = Number(call.arguments.timeSeconds);
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navTimeInvalid') };
      if (!ctx.seekToTime) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.navTimeUnsupported', { timeSeconds }) };
      ctx.seekToTime(timeSeconds);
      return { ok: true, message: tf(locale, 'transcription.aiTool.voice.navTimeDone', { timeSeconds: timeSeconds.toFixed(2) }) };
    }
    if (call.name === 'split_at_time') {
      const timeSeconds = Number(call.arguments.timeSeconds);
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return { ok: false, message: t(locale, 'transcription.aiTool.voice.splitAtTimeInvalid') };
      if (!ctx.splitAtTime) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.splitAtTimeUnsupported', { timeSeconds }) };
      const ok = ctx.splitAtTime(timeSeconds);
      if (!ok) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.splitAtTimeNoSegment', { timeSeconds: timeSeconds.toFixed(2) }) };
      return { ok: true, message: tf(locale, 'transcription.aiTool.voice.splitAtTimeDone', { timeSeconds: timeSeconds.toFixed(2) }) };
    }
    if (call.name === 'merge_prev') {
      return executeMappedAction('mergePrev', t(locale, 'transcription.aiTool.voice.mergePrevDone'));
    }
    if (call.name === 'merge_next') {
      return executeMappedAction('mergeNext', t(locale, 'transcription.aiTool.voice.mergeNextDone'));
    }
    // ── View tools ──────────────────────────────────────────────────────────────
    if (call.name === 'focus_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      if (!segId) return { ok: false, message: t(locale, 'transcription.aiTool.voice.focusSegmentMissingId') };
      const found = ctx.utterances.find((u) => u.id === segId);
      if (!found) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.segmentNotFound', { segmentId: segId }) };
      if (!ctx.navigateTo) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.focusSegmentUnsupported', { segmentId: segId }) };
      ctx.navigateTo(segId);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.focusSegmentDone', {
          segmentId: segId,
          startTime: found.startTime.toFixed(2),
          endTime: found.endTime.toFixed(2),
        }),
      };
    }
    if (call.name === 'zoom_to_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      const zoomLevel = typeof call.arguments.zoomLevel === 'number' ? call.arguments.zoomLevel : undefined;
      if (!segId) return { ok: false, message: t(locale, 'transcription.aiTool.voice.zoomSegmentMissingId') };
      const found = ctx.utterances.find((u) => u.id === segId);
      if (!found) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.segmentNotFound', { segmentId: segId }) };
      if (ctx.zoomToSegment) {
        const ok = ctx.zoomToSegment(segId, zoomLevel);
        if (!ok) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.zoomSegmentFailed', { segmentId: segId }) };
        return {
          ok: true,
          message: typeof zoomLevel === 'number'
            ? tf(locale, 'transcription.aiTool.voice.zoomSegmentDoneWithLevel', { segmentId: segId, zoomLevel })
            : tf(locale, 'transcription.aiTool.voice.zoomSegmentDone', { segmentId: segId }),
        };
      }
      if (!ctx.navigateTo) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.zoomSegmentNavigateFallbackUnsupported', { segmentId: segId }) };
      ctx.navigateTo(segId);
      return { ok: true, message: tf(locale, 'transcription.aiTool.voice.zoomSegmentNavigateFallbackDone', { segmentId: segId }) };
    }

    // ── Context query tools ─────────────────────────────────────────────────────
    if (call.name === 'get_current_segment') {
      const utt = ctx.selectedUtterance;
      if (!utt) return { ok: false, message: t(locale, 'transcription.aiTool.voice.currentSegmentNone') };
      const dur = (utt.endTime - utt.startTime).toFixed(2);
      const status = utt.annotationStatus ?? 'raw';
      const speaker = utt.speaker
        ? tf(locale, 'transcription.aiTool.voice.currentSegmentSpeakerSuffix', { speaker: utt.speaker })
        : '';
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.currentSegmentDone', {
          segmentId: utt.id,
          startTime: utt.startTime.toFixed(2),
          endTime: utt.endTime.toFixed(2),
          duration: dur,
          status,
          speakerSuffix: speaker,
        }),
      };
    }
    if (call.name === 'get_recent_history') {
      try {
        const sessions = await loadRecentVoiceSessions(8);
        if (sessions.length === 0) return { ok: true, message: t(locale, 'transcription.aiTool.voice.historyNone') };
        const lines = sessions.flatMap((s) => s.entries.slice(-2)).slice(-8);
        if (lines.length === 0) return { ok: true, message: t(locale, 'transcription.aiTool.voice.historyEmpty') };
        const entries = lines.map((e, i) => {
          const label = _formatVoiceHistoryActorLabel(e.intent.type, locale);
          return tf(locale, 'transcription.aiTool.voice.historyEntry', {
            index: i + 1,
            actor: label,
            text: e.sttText.slice(0, 50),
          });
        }).join('\n');
        return { ok: true, message: tf(locale, 'transcription.aiTool.voice.historyDone', { entries }) };
      } catch (err) {
        console.error('[Jieyu] useAiToolCallHandler: failed to read voice command history', err);
        return { ok: false, message: t(locale, 'transcription.aiTool.voice.historyReadFailed') };
      }
    }
    if (call.name === 'get_project_summary') {
      const total = ctx.utterances.length;
      const done = ctx.utterances.filter((u) => u.annotationStatus && u.annotationStatus !== 'raw').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.projectSummaryDone', {
          total,
          done,
          pct,
          selected: ctx.selectedUtterance ? 1 : 0,
        }),
      };
    }

    // ── AI-assisted tools (not yet implemented — suggest voice chat instead) ────
    if (call.name === 'auto_segment') {
      return { ok: false, message: t(locale, 'transcription.aiTool.voice.autoSegmentUnavailable') };
    }
    if (call.name === 'suggest_segment_improvement') {
      return { ok: false, message: t(locale, 'transcription.aiTool.voice.suggestSegmentImprovementUnavailable') };
    }
    if (call.name === 'analyze_segment_quality') {
      return { ok: false, message: t(locale, 'transcription.aiTool.voice.analyzeSegmentQualityUnavailable') };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.voice.unknownTool', { toolName: call.name }) };
  },
};

// ─────────────────────────────────────────────────────────────
//  适配器注册表：tool name → adapter 映射
//  Adapter registry: tool name → adapter mapping
// ─────────────────────────────────────────────────────────────

const ALL_ADAPTERS: ToolObjectAdapter[] = [segmentAdapter, layerAdapter, glossAdapter, tokenAdapter, voiceAdapter];

const ADAPTER_MAP: Partial<Record<string, ToolObjectAdapter>> = {};
for (const adapter of ALL_ADAPTERS) {
  for (const toolName of adapter.handles) {
    ADAPTER_MAP[toolName] = adapter;
  }
}

// ─────────────────────────────────────────────────────────────
//  Hook 主体
//  Main hook
// ─────────────────────────────────────────────────────────────

export function useAiToolCallHandler({
  utterances,
  selectedUtterance,
  selectedUtteranceMedia,
  selectedLayerId,
  transcriptionLayers,
  translationLayers,
  layerLinks,
  createLayer,
  createNextUtterance,
  splitUtterance,
  deleteUtterance,
  deleteLayer,
  toggleLayerLink,
  saveUtteranceText,
  saveTextTranslationForUtterance,
  updateTokenPos,
  batchUpdateTokenPosByForm,
  updateTokenGloss,
  executeAction,
  getSegments,
  navigateTo,
  openSearch,
  seekToTime,
  splitAtTime,
  zoomToSegment,
  transformTextForLayerWrite,
}: Params): (call: AiChatToolCall) => Promise<AiChatToolResult> {
  const locale = useLocale();
  const utterancesRef = useLatest(utterances);
  const selectedUtteranceRef = useLatest(selectedUtterance);
  const selectedUtteranceMediaRef = useLatest(selectedUtteranceMedia);
  const selectedLayerIdRef = useLatest(selectedLayerId);
  const transcriptionLayersRef = useLatest(transcriptionLayers);
  const translationLayersRef = useLatest(translationLayers);
  const layerLinksRef = useLatest(layerLinks);

  // 补偿上下文：60 秒内创建的层可被链接失败回滚 | Compensation: layers created within 60s eligible for rollback
  // Map keyed by call.requestId so concurrent calls don't overwrite each other's compensation
  const compensationRef = useRef<Map<string, CompensationEntry>>(new Map());
  const COMPENSATION_TTL_MS = 60_000;

  return useCallback(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
    const currentUtterances = utterancesRef.current;
    const currentSelectedUtterance = selectedUtteranceRef.current;
    const currentSelectedUtteranceMedia = selectedUtteranceMediaRef.current;
    const currentTranscriptionLayers = transcriptionLayersRef.current;
    const currentTranslationLayers = translationLayersRef.current;
    const currentLayerLinks = layerLinksRef.current;

    // 预绑定解析函数（已捕获当前 call + 快照数据）
    // Pre-bind resolver helpers (closed over current call + snapshot)
    const resolveRequestedUtterance = (): UtteranceDocType | null => {
      const requestedId = String(call.arguments.utteranceId ?? call.arguments.segmentId ?? '').trim();
      if (requestedId.length === 0) return null;
      return currentUtterances.find((item) => item.id === requestedId) ?? null;
    };

    const resolveRequestedTranslationLayerId = (): string => {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) return '';
      if (!currentTranslationLayers.some((layer) => layer.id === requestedLayerId)) return '';
      return requestedLayerId;
    };

    const resolveTranscriptionLayerForLink = (): LayerDocType | null => {
      const requestedLayerId = String(call.arguments.transcriptionLayerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranscriptionLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      const requestedLayerKey = String(call.arguments.transcriptionLayerKey ?? '').trim();
      if (requestedLayerKey) {
        return currentTranscriptionLayers.find((layer) => layer.key === requestedLayerKey) ?? null;
      }
      return null;
    };

    const resolveTranslationLayerForLink = (): LayerDocType | null => {
      const requestedLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranslationLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      return null;
    };

    const ctx: ExecutionContext = {
      call,
      locale,
      utterances: currentUtterances,
      selectedUtterance: currentSelectedUtterance,
      selectedUtteranceMedia: currentSelectedUtteranceMedia,
      selectedLayerId: selectedLayerIdRef.current,
      transcriptionLayers: currentTranscriptionLayers,
      translationLayers: currentTranslationLayers,
      translationLayersRef,
      layerLinks: currentLayerLinks,
      compensationRef,
      COMPENSATION_TTL_MS,
      resolveRequestedUtterance,
      resolveRequestedTranslationLayerId,
      resolveTranscriptionLayerForLink,
      resolveTranslationLayerForLink,
      layerMatchesLanguage: _layerMatchesLanguage,
      parseLayerHintFromOpaqueId: _parseLayerHintFromOpaqueId,
      createLayer,
      createNextUtterance,
      splitUtterance,
      deleteUtterance,
      deleteLayer,
      toggleLayerLink,
      saveUtteranceText,
      saveTextTranslationForUtterance,
      updateTokenPos,
      batchUpdateTokenPosByForm,
      updateTokenGloss,
      executeAction,
      getSegments: getSegments!,
      navigateTo: navigateTo!,
      openSearch,
      seekToTime,
      splitAtTime,
      zoomToSegment,
      transformTextForLayerWrite,
    };

    const adapter = ADAPTER_MAP[call.name];
    if (!adapter) {
      return { ok: false, message: tf(locale, 'transcription.aiTool.unsupportedTool', { toolName: call.name }) };
    }
    return adapter.execute(ctx);
  }, [
    locale,
    createLayer,
    createNextUtterance,
    splitUtterance,
    deleteLayer,
    deleteUtterance,
    toggleLayerLink,
    saveTextTranslationForUtterance,
    saveUtteranceText,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    executeAction,
    getSegments,
    navigateTo,
    openSearch,
    seekToTime,
    splitAtTime,
    zoomToSegment,
    transformTextForLayerWrite,
    utterancesRef,
    selectedUtteranceRef,
    selectedUtteranceMediaRef,
    selectedLayerIdRef,
    transcriptionLayersRef,
    translationLayersRef,
    layerLinksRef,
  ]);
}
