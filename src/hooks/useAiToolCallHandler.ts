import { useCallback, useRef } from 'react';
import type { UtteranceDocType, TranslationLayerDocType, MediaItemDocType } from '../../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';
import { AutoGlossService } from '../ai/AutoGlossService';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import { loadRecentVoiceSessions } from '../services/VoiceSessionStore';

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
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  layerLinks: Array<{ transcriptionLayerKey: string; tierId: string }>;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createNextUtterance: (utt: UtteranceDocType, duration: number) => Promise<void>;
  splitUtterance: (utteranceId: string, splitTime: number) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteLayer: (id: string, options?: { skipBrowserConfirm?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, tierId: string) => Promise<void>;
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
};

/**
 * 执行上下文：每次工具调用时构建，传入对应适配器
 * Execution context built per tool call and passed to the matching adapter.
 */
interface ExecutionContext {
  call: AiChatToolCall;
  utterances: UtteranceDocType[];
  selectedUtterance: UtteranceDocType | undefined;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  transcriptionLayers: TranslationLayerDocType[];
  translationLayers: TranslationLayerDocType[];
  /** translationLayers 的最新 ref，用于补偿回查 | Latest-ref for post-async layer lookup */
  translationLayersRef: { readonly current: TranslationLayerDocType[] };
  layerLinks: Array<{ transcriptionLayerKey: string; tierId: string }>;
  compensationRef: { current: Map<string, CompensationEntry> };
  COMPENSATION_TTL_MS: number;
  // 预绑定的解析工具函数（已捕获当前 call 和快照数据）
  // Pre-bound resolver helpers (already closed over current call + snapshot)
  resolveRequestedUtterance: () => UtteranceDocType | null;
  resolveRequestedTranslationLayerId: () => string;
  resolveTranscriptionLayerForLink: () => TranslationLayerDocType | null;
  resolveTranslationLayerForLink: () => TranslationLayerDocType | null;
  layerMatchesLanguage: (layer: TranslationLayerDocType, languageQuery: string) => boolean;
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

function _layerMatchesLanguage(layer: TranslationLayerDocType, languageQuery: string): boolean {
  const fields = [layer.languageId, layer.key, layer.name.zho, layer.name.eng]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => _normalizeText(value));
  const tokens = _buildLanguageTokens(languageQuery).map((t) => _normalizeText(t));
  return tokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
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
    const { call } = ctx;

    if (call.name === 'create_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，新建句段必须显式指定目标句段。' };
      }
      const baseUtterance = ctx.resolveRequestedUtterance();
      if (!baseUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }
      const mediaDuration = typeof ctx.selectedUtteranceMedia?.duration === 'number'
        ? ctx.selectedUtteranceMedia.duration
        : baseUtterance.endTime + 2;
      await ctx.createNextUtterance(baseUtterance, mediaDuration);
      return { ok: true, message: '已在当前句段后创建新区间。' };
    }

    if (call.name === 'split_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，切分句段必须显式指定目标句段。' };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }
      const start = Number(targetUtterance.startTime);
      const end = Number(targetUtterance.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return { ok: false, message: '目标句段时间范围无效，无法切分。' };
      }
      const providedSplitTime = call.arguments.splitTime;
      if (typeof providedSplitTime !== 'number' || !Number.isFinite(providedSplitTime)) {
        return { ok: false, message: '缺少 splitTime，切分句段前请先定位切分点。' };
      }
      const splitTime = providedSplitTime;
      // 约束切分点位于句段内部，并给两侧保留最小时长 | Keep split point strictly inside with minimum span on each side.
      const minSpan = 0.05;
      if (splitTime <= start + minSpan || splitTime >= end - minSpan) {
        return {
          ok: false,
          message: `切分点不在可用范围内（${(start + minSpan).toFixed(2)}s - ${(end - minSpan).toFixed(2)}s）。`,
        };
      }
      await ctx.splitUtterance(targetUtterance.id, splitTime);
      return { ok: true, message: `已在 ${splitTime.toFixed(2)}s 处切分当前句段。` };
    }

    if (call.name === 'delete_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，删除句段必须显式指定目标句段。' };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }
      await ctx.deleteUtterance(targetUtterance.id);
      return { ok: true, message: '句段已删除。' };
    }

    if (call.name === 'set_transcription_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: '缺少 text 参数，无法写入转写文本。' };
      }
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，写入转写文本必须显式指定目标句段。' };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }
      await ctx.saveUtteranceText(targetUtterance.id, text);
      return { ok: true, message: '转写文本已写入。' };
    }

    if (call.name === 'set_translation_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: '缺少 text 参数，无法写入翻译文本。' };
      }
      const requestedUtteranceId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedUtteranceId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，写入翻译文本必须显式指定目标句段。' };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedUtteranceId}` };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: '缺少 layerId，写入翻译文本必须显式指定目标翻译层。' };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: `未找到目标翻译层：${requestedLayerId}` };
      }
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, text, targetLayerId);
      return { ok: true, message: '翻译文本已写入。' };
    }

    if (call.name === 'clear_translation_segment') {
      const requestedUtteranceId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedUtteranceId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，清空翻译必须显式指定目标句段。' };
      }
      const targetUtterance = ctx.resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedUtteranceId}` };
      }
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: '缺少 layerId，清空翻译必须显式指定目标翻译层。' };
      }
      const targetLayerId = ctx.resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: `未找到目标翻译层：${requestedLayerId}` };
      }
      const targetLayer = ctx.translationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return { ok: false, message: `未找到目标翻译层：${targetLayerId}` };
      }
      await ctx.saveTextTranslationForUtterance(targetUtterance.id, '', targetLayerId);
      const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
      return { ok: true, message: `已清空句段 ${targetUtterance.id} 在层 ${layerLabel} 的翻译文本。` };
    }

    return { ok: false, message: `segmentAdapter: 未处理的工具调用：${call.name}` };
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
    const { call, compensationRef, COMPENSATION_TTL_MS } = ctx;

    if (call.name === 'create_transcription_layer') {
      const rawLang = String(call.arguments.languageId ?? call.arguments.languageQuery ?? '').trim();
      if (!rawLang) {
        return { ok: false, message: '缺少 languageId，无法创建转写层。' };
      }
      // 统一规范化：人类可读名 → ISO 639-3 代码；无法识别时返回澄清，避免盲目创建。
      // Normalize to ISO 639-3; if unresolved, return clarify signal instead of blind create.
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return { ok: false, message: `无法识别语言：${rawLang}。请提供有效语言名称或 ISO 639-3 代码。` };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const ok = await ctx.createLayer('transcription', {
        languageId,
        ...(alias ? { alias } : {}),
      });
      return {
        ok,
        message: ok ? `已创建转写层（${languageId}${alias ? ` / ${alias}` : ''}）。` : '创建转写层失败，请检查语言或别名是否冲突。',
      };
    }

    if (call.name === 'create_translation_layer') {
      const rawLang = String(call.arguments.languageId ?? call.arguments.languageQuery ?? '').trim();
      if (!rawLang) {
        return { ok: false, message: '缺少 languageId，无法创建翻译层。' };
      }
      // 统一规范化：人类可读名 → ISO 639-3 代码；无法识别时返回澄清，避免盲目创建。
      // Normalize to ISO 639-3; if unresolved, return clarify signal instead of blind create.
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return { ok: false, message: `无法识别语言：${rawLang}。请提供有效语言名称或 ISO 639-3 代码。` };
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
          ? `已创建翻译层（${languageId}${alias ? ` / ${alias}` : ''}，${modality}）。`
          : '创建翻译层失败，请检查语言或别名是否冲突。',
      };
    }

    if (call.name === 'delete_layer') {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length > 0) {
        const exists = ctx.transcriptionLayers.some((layer) => layer.id === requestedLayerId)
          || ctx.translationLayers.some((layer) => layer.id === requestedLayerId);
        if (exists) {
          await ctx.deleteLayer(requestedLayerId, { skipBrowserConfirm: true });
          return { ok: true, message: `已删除层：${requestedLayerId}` };
        }

        // 兼容语义化 layerId（例如 transcription_layer_mandarin）
        // Fallback for semantic layer IDs (e.g. transcription_layer_mandarin).
        const hint = ctx.parseLayerHintFromOpaqueId(requestedLayerId);
        if (!hint) {
          return { ok: false, message: `未找到目标层：${requestedLayerId}` };
        }

        const pool = hint.layerType === 'translation'
          ? ctx.translationLayers
          : ctx.transcriptionLayers;
        const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, hint.languageQuery));
        if (matched.length === 0) {
          return { ok: false, message: `未找到匹配"${hint.languageQuery}"的${hint.layerType === 'translation' ? '翻译' : '转写'}层。` };
        }
        if (matched.length > 1) {
          return { ok: false, message: `匹配到多个${hint.layerType === 'translation' ? '翻译' : '转写'}层，请改用 layerId 精确指定。` };
        }

        const targetLayer = matched[0]!;
        await ctx.deleteLayer(targetLayer.id, { skipBrowserConfirm: true });
        return { ok: true, message: `已删除层：${targetLayer.id}` };
      }

      const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
      const languageQuery = String(call.arguments.languageQuery ?? '').trim();
      if (!layerType || !languageQuery) {
        return { ok: false, message: '缺少 layerId，删除层必须显式指定 layerId，或提供 layerType + languageQuery。' };
      }

      const pool = layerType === 'translation'
        ? ctx.translationLayers
        : layerType === 'transcription'
          ? ctx.transcriptionLayers
          : [];
      if (pool.length === 0) {
        return { ok: false, message: `未找到可删除的${layerType === 'translation' ? '翻译' : '转写'}层。` };
      }

      const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, languageQuery));
      if (matched.length === 0) {
        return { ok: false, message: `未找到匹配"${languageQuery}"的${layerType === 'translation' ? '翻译' : '转写'}层。` };
      }
      if (matched.length > 1) {
        return { ok: false, message: `匹配到多个${layerType === 'translation' ? '翻译' : '转写'}层，请改用 layerId 精确指定。` };
      }

      const targetLayer = matched[0]!;
      await ctx.deleteLayer(targetLayer.id, { skipBrowserConfirm: true });
      return { ok: true, message: `已删除层：${targetLayer.id}` };
    }

    if (call.name === 'link_translation_layer' || call.name === 'unlink_translation_layer') {
      const requestedTranscriptionLayerId = String(call.arguments.transcriptionLayerId ?? '').trim();
      const requestedTranscriptionLayerKey = String(call.arguments.transcriptionLayerKey ?? '').trim();
      if (!requestedTranscriptionLayerId && !requestedTranscriptionLayerKey) {
        return { ok: false, message: '缺少 transcriptionLayerId/transcriptionLayerKey，必须显式指定目标转写层。' };
      }

      const requestedTranslationLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (!requestedTranslationLayerId) {
        return { ok: false, message: '缺少 translationLayerId/layerId，必须显式指定目标翻译层。' };
      }

      const trcLayer = ctx.resolveTranscriptionLayerForLink();
      if (!trcLayer) {
        // 补偿检查：链接失败时回滚最近创建的层 | Compensation: rollback recently created layer on link failure
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try { await ctx.deleteLayer(comp.layerId, { skipBrowserConfirm: true }); } catch { /* best effort */ }
          return { ok: false, message: `未找到可用转写层，无法设置链接。已自动回滚刚创建的层（${comp.layerId}）。` };
        }
        return { ok: false, message: '未找到可用转写层，无法设置链接。' };
      }
      const trlLayer = ctx.resolveTranslationLayerForLink();
      if (!trlLayer) {
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try { await ctx.deleteLayer(comp.layerId, { skipBrowserConfirm: true }); } catch { /* best effort */ }
          return { ok: false, message: `未找到可用翻译层，无法设置链接。已自动回滚刚创建的层（${comp.layerId}）。` };
        }
        return { ok: false, message: '未找到可用翻译层，无法设置链接。' };
      }

      const exists = ctx.layerLinks.some(
        (link) => link.transcriptionLayerKey === trcLayer.key && link.tierId === trlLayer.id,
      );
      const shouldLink = call.name === 'link_translation_layer';
      try {
        if (exists !== shouldLink) {
          await ctx.toggleLayerLink(trcLayer.key, trlLayer.id);
        }
      } catch (linkError) {
        // 补偿：toggleLayerLink 异常时回滚最近创建的层 | Compensation on toggleLayerLink exception
        const comp = compensationRef.current.get(call.requestId ?? 'default');
        if (comp && Date.now() - comp.createdAt < COMPENSATION_TTL_MS) {
          compensationRef.current.delete(call.requestId ?? 'default');
          try { await ctx.deleteLayer(comp.layerId, { skipBrowserConfirm: true }); } catch { /* best effort */ }
          const errMsg = linkError instanceof Error ? linkError.message : '链接操作失败';
          return { ok: false, message: `${errMsg}。已自动回滚刚创建的层（${comp.layerId}）。` };
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
          ? `已链接：${trcLabel} -> ${trlLabel}`
          : `已取消链接：${trcLabel} -> ${trlLabel}`,
      };
    }

    return { ok: false, message: `layerAdapter: 未处理的工具调用：${call.name}` };
  },
};

// ─────────────────────────────────────────────────────────────
//  词汇标注适配器 | Gloss object adapter
// ─────────────────────────────────────────────────────────────

const glossAdapter: ToolObjectAdapter = {
  handles: ['auto_gloss_utterance'],
  async execute(ctx) {
    const { call } = ctx;
    const requestedId = String(call.arguments.utteranceId ?? '').trim();
    if (requestedId.length === 0) {
      return { ok: false, message: '缺少 utteranceId，自动标注必须显式指定目标句段。' };
    }
    const targetUtterance = ctx.resolveRequestedUtterance();
    if (!targetUtterance) {
      return { ok: false, message: `未找到目标句段：${requestedId}` };
    }
    const service = new AutoGlossService();
    const result = await service.glossUtterance(targetUtterance.id);
    if (result.matched.length === 0) {
      return { ok: true, message: `共 ${result.total} 个 token，未匹配到词库中的条目（已有 gloss 的跳过 ${result.skipped} 个）。` };
    }
    const labels = result.matched.map((m) => {
      const form = Object.values(m.tokenForm)[0] ?? '';
      const gloss = Object.values(m.gloss)[0] ?? '';
      return `${form}→${gloss}`;
    }).join('、');
    return { ok: true, message: `已自动标注 ${result.matched.length}/${result.total} 个 token：${labels}` };
  },
};

// ─────────────────────────────────────────────────────────────
//  词（token）对象适配器 | Token object adapter
// ─────────────────────────────────────────────────────────────

const tokenAdapter: ToolObjectAdapter = {
  handles: ['set_token_pos', 'set_token_gloss'],
  async execute(ctx) {
    const { call } = ctx;

    if (call.name === 'set_token_pos') {
      // 优先按 tokenId 精确更新；fallback 为 utteranceId + form 批量更新
      // Prefer exact update by tokenId; fallback to batch update by utteranceId + form.
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const posRaw = call.arguments.pos;
      const pos = posRaw === null || posRaw === '' ? null : String(posRaw ?? '').trim() || null;

      if (tokenId.length > 0) {
        if (!ctx.updateTokenPos) {
          return { ok: false, message: 'updateTokenPos 回调未注入，无法更新词性。' };
        }
        await ctx.updateTokenPos(tokenId, pos);
        return { ok: true, message: `已将 token（${tokenId}）词性设为：${pos ?? '（清除）'}。` };
      }

      // 按 form 批量更新 | Batch update by form within an utterance
      const utteranceId = String(call.arguments.utteranceId ?? '').trim();
      const form = String(call.arguments.form ?? '').trim();
      if (!utteranceId || !form) {
        return { ok: false, message: '缺少 tokenId（或 utteranceId + form），无法设置词性。' };
      }
      if (!ctx.batchUpdateTokenPosByForm) {
        return { ok: false, message: 'batchUpdateTokenPosByForm 回调未注入，无法批量更新词性。' };
      }
      const updated = await ctx.batchUpdateTokenPosByForm(utteranceId, form, pos);
      return { ok: true, message: `已将 ${updated} 个"${form}" token 的词性设为：${pos ?? '（清除）'}。` };
    }

    if (call.name === 'set_token_gloss') {
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const glossRaw = call.arguments.gloss;
      const gloss = glossRaw === null || glossRaw === '' ? null : String(glossRaw ?? '').trim() || null;
      const lang = String(call.arguments.lang ?? 'eng').trim() || 'eng';

      if (!tokenId) {
        return { ok: false, message: '缺少 tokenId，无法设置 gloss。' };
      }
      if (!ctx.updateTokenGloss) {
        return { ok: false, message: 'updateTokenGloss 回调未注入，无法更新 gloss。' };
      }
      await ctx.updateTokenGloss(tokenId, gloss, lang);
      return { ok: true, message: `已将 token（${tokenId}）的 gloss [${lang}] 设为：${gloss ?? '（清除）'}。` };
    }

    return { ok: false, message: `tokenAdapter: 未处理的工具调用：${call.name}` };
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
    const { call } = ctx;

    // ── ActionId-mapped tools (delegate to executeAction) ──────────────────
    if (call.name === 'play_pause') {
      ctx.executeAction?.('playPause');
      return { ok: true, message: '已切换播放状态。' };
    }
    if (call.name === 'undo') {
      ctx.executeAction?.('undo');
      return { ok: true, message: '已撤销。' };
    }
    if (call.name === 'redo') {
      ctx.executeAction?.('redo');
      return { ok: true, message: '已重做。' };
    }
    if (call.name === 'search_segments') {
      ctx.executeAction?.('search');
      return { ok: true, message: '已打开搜索。' };
    }
    if (call.name === 'toggle_notes') {
      ctx.executeAction?.('toggleNotes');
      return { ok: true, message: '已切换备注面板。' };
    }
    if (call.name === 'mark_segment') {
      ctx.executeAction?.('markSegment');
      return { ok: true, message: '已标记当前句段。' };
    }
    if (call.name === 'delete_segment') {
      ctx.executeAction?.('deleteSegment');
      return { ok: true, message: '已删除当前句段。' };
    }

    // ── Auto-annotation delegation (reuse existing adapter logic) ──────────
    // auto_gloss_segment / auto_translate_segment map to the existing
    // auto_gloss_utterance / auto_translate_utterance adapter entries.
    if (call.name === 'auto_gloss_segment') {
      const glossAdapterInst = ADAPTER_MAP['auto_gloss_utterance'];
      if (glossAdapterInst) return glossAdapterInst.execute(ctx);
      return { ok: false, message: '自动标注功能暂不可用。' };
    }
    if (call.name === 'auto_translate_segment') {
      // auto_translate_segment is not yet implemented in the tool adapter registry.
      // Return a clear message so the user knows the feature is pending.
      return { ok: false, message: '自动翻译工具暂未实现，请通过语音"翻译这句"手动触发。' };
    }

    // ── Navigation / view tools (require runtime segment context) ───────────
    if (call.name === 'nav_to_segment') {
      const idx = Number(call.arguments.segmentIndex);
      if (!Number.isFinite(idx) || idx < 1) return { ok: false, message: 'nav_to_segment 需要有效的 segmentIndex（从 1 开始）。' };
      const segments = ctx.getSegments?.();
      if (!segments || segments.length === 0) return { ok: false, message: '当前没有可导航的句段。' };
      const target = segments[idx - 1];
      if (!target) return { ok: false, message: `第 ${idx} 句不存在，当前共有 ${segments.length} 句。` };
      ctx.navigateTo?.(target.id);
      return { ok: true, message: `已跳转第 ${idx} 句（共 ${segments.length} 句）。` };
    }
    if (call.name === 'nav_to_time') {
      const t = Number(call.arguments.timeSeconds);
      if (!Number.isFinite(t) || t < 0) return { ok: false, message: 'nav_to_time 需要有效的 timeSeconds（秒）。' };
      return { ok: false, message: `跳转至 ${t} 秒需要音频播放支持。` };
    }
    if (call.name === 'split_at_time') {
      const t = Number(call.arguments.timeSeconds);
      if (!Number.isFinite(t) || t < 0) return { ok: false, message: 'split_at_time 需要有效的 timeSeconds。' };
      return { ok: false, message: `在 ${t} 秒处分割需要音频播放支持，请使用"分割"命令。` };
    }
    if (call.name === 'merge_prev') {
      ctx.executeAction?.('mergePrev');
      return { ok: true, message: '已合并上一个句段。' };
    }
    if (call.name === 'merge_next') {
      ctx.executeAction?.('mergeNext');
      return { ok: true, message: '已合并下一个句段。' };
    }
    // ── View tools ──────────────────────────────────────────────────────────────
    if (call.name === 'focus_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      if (!segId) return { ok: false, message: 'focus_segment 需要 segmentId 参数。' };
      const found = ctx.utterances.find((u) => u.id === segId);
      if (!found) return { ok: false, message: `未找到句段：${segId}` };
      ctx.navigateTo?.(segId);
      return { ok: true, message: `已定位到句段 ${segId}（${found.startTime.toFixed(2)}s–${found.endTime.toFixed(2)}s）。` };
    }
    if (call.name === 'zoom_to_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      if (!segId) return { ok: false, message: 'zoom_to_segment 需要 segmentId 参数。' };
      const found = ctx.utterances.find((u) => u.id === segId);
      if (!found) return { ok: false, message: `未找到句段：${segId}` };
      ctx.navigateTo?.(segId);
      return { ok: true, message: `已跳转至句段 ${segId}，请使用鼠标滚轮或缩放控制调整缩放级别。` };
    }

    // ── Context query tools ─────────────────────────────────────────────────────
    if (call.name === 'get_current_segment') {
      const utt = ctx.selectedUtterance;
      if (!utt) return { ok: false, message: '当前没有选中的句段。' };
      const dur = (utt.endTime - utt.startTime).toFixed(2);
      const status = utt.annotationStatus ?? 'raw';
      const speaker = utt.speaker ? `，说话人：${utt.speaker}` : '';
      return {
        ok: true,
        message: `当前句段 [${utt.id}] ${utt.startTime.toFixed(2)}s–${utt.endTime.toFixed(2)}s（${dur}s），标注状态：${status}${speaker}。`,
      };
    }
    if (call.name === 'get_recent_history') {
      try {
        const sessions = await loadRecentVoiceSessions(8);
        if (sessions.length === 0) return { ok: true, message: '暂无语音命令历史。' };
        const lines = sessions.flatMap((s) => s.entries.slice(-2)).slice(-8);
        if (lines.length === 0) return { ok: true, message: '最近无语音命令记录。' };
        const entries = lines.map((e, i) => {
          const label = e.intent.type === 'chat' ? '用户' : '智能体';
          return `${i + 1}. ${label}：${e.sttText.slice(0, 50)}`;
        }).join('\n');
        return { ok: true, message: `最近命令：\n${entries}` };
      } catch {
        return { ok: false, message: '读取命令历史失败。' };
      }
    }
    if (call.name === 'get_project_summary') {
      const total = ctx.utterances.length;
      const done = ctx.utterances.filter((u) => u.annotationStatus && u.annotationStatus !== 'raw').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return { ok: true, message: `项目共 ${total} 句，已标注 ${done} 句（${pct}%），当前选中 ${ctx.selectedUtterance ? '1' : '0'} 句。` };
    }

    // ── AI-assisted tools (not yet implemented — suggest voice chat instead) ────
    if (call.name === 'auto_segment') {
      return { ok: false, message: '自动切分功能尚不可用，请使用"标记句段"或手动分割。' };
    }
    if (call.name === 'suggest_segment_improvement') {
      return { ok: false, message: '改进建议请通过 AI 助手面板（右上角）发送"改进第X句"获取。' };
    }
    if (call.name === 'analyze_segment_quality') {
      return { ok: false, message: '质量分析请通过 AI 助手面板（右上角）发送"分析第X句质量"获取。' };
    }

    return { ok: false, message: `未知语音工具：${call.name}` };
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
}: Params): (call: AiChatToolCall) => Promise<AiChatToolResult> {
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
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) return null;
      return currentUtterances.find((item) => item.id === requestedId) ?? null;
    };

    const resolveRequestedTranslationLayerId = (): string => {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) return '';
      if (!currentTranslationLayers.some((layer) => layer.id === requestedLayerId)) return '';
      return requestedLayerId;
    };

    const resolveTranscriptionLayerForLink = (): TranslationLayerDocType | null => {
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

    const resolveTranslationLayerForLink = (): TranslationLayerDocType | null => {
      const requestedLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranslationLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      return null;
    };

    const ctx: ExecutionContext = {
      call,
      utterances: currentUtterances,
      selectedUtterance: currentSelectedUtterance,
      selectedUtteranceMedia: currentSelectedUtteranceMedia,
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
    };

    const adapter = ADAPTER_MAP[call.name];
    if (!adapter) {
      return { ok: false, message: `暂不支持的工具调用：${call.name}` };
    }
    return adapter.execute(ctx);
  }, [
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
    utterancesRef,
    selectedUtteranceRef,
    selectedUtteranceMediaRef,
    selectedLayerIdRef,
    transcriptionLayersRef,
    translationLayersRef,
    layerLinksRef,
  ]);
}
