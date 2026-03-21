import { useCallback } from 'react';
import type { UtteranceDocType, TranslationLayerDocType, MediaItemDocType } from '../../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';
import { AutoGlossService } from '../ai/AutoGlossService';

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
  deleteUtterance: (id: string) => Promise<void>;
  deleteLayer: (id: string) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, tierId: string) => Promise<void>;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
};

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
  deleteUtterance,
  deleteLayer,
  toggleLayerLink,
  saveUtteranceText,
  saveTextTranslationForUtterance,
}: Params): (call: AiChatToolCall) => Promise<AiChatToolResult> {
  const normalizeText = (value: string): string => value.trim().toLowerCase();

  const buildLanguageTokens = (query: string): string[] => {
    const q = normalizeText(query);
    const tokens = new Set<string>([q]);
    if (/(日本|日语|日文|日本语|japanese|\bja\b|\bjpn\b)/i.test(query)) {
      ['日本', '日语', '日文', '日本语', 'japanese', 'ja', 'jpn'].forEach((token) => tokens.add(token));
    }
    if (/(英语|英文|english|\ben\b|\beng\b)/i.test(query)) {
      ['英语', '英文', 'english', 'en', 'eng'].forEach((token) => tokens.add(token));
    }
    if (/(中文|汉语|普通话|chinese|\bzh\b|\bzho\b)/i.test(query)) {
      ['中文', '汉语', '普通话', 'chinese', 'zh', 'zho'].forEach((token) => tokens.add(token));
    }
    return Array.from(tokens).filter((token) => token.length > 0);
  };

  const layerMatchesLanguage = (layer: TranslationLayerDocType, languageQuery: string): boolean => {
    const fields = [
      layer.languageId,
      layer.key,
      layer.name.zho,
      layer.name.eng,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => normalizeText(value));

    const tokens = buildLanguageTokens(languageQuery).map((token) => normalizeText(token));
    return tokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
  };

  const utterancesRef = useLatest(utterances);
  const selectedUtteranceRef = useLatest(selectedUtterance);
  const selectedUtteranceMediaRef = useLatest(selectedUtteranceMedia);
  const selectedLayerIdRef = useLatest(selectedLayerId);
  const transcriptionLayersRef = useLatest(transcriptionLayers);
  const translationLayersRef = useLatest(translationLayers);
  const layerLinksRef = useLatest(layerLinks);

  return useCallback(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
    const currentUtterances = utterancesRef.current;
    const currentSelectedUtterance = selectedUtteranceRef.current;
    const currentSelectedUtteranceMedia = selectedUtteranceMediaRef.current;
    const currentSelectedLayerId = selectedLayerIdRef.current;
    const currentTranscriptionLayers = transcriptionLayersRef.current;
    const currentTranslationLayers = translationLayersRef.current;
    const currentLayerLinks = layerLinksRef.current;
    const fallbackUtterance = currentUtterances
      .slice()
      .sort((a, b) => a.startTime - b.startTime)[currentUtterances.length - 1];

    const resolveTargetUtterance = (): UtteranceDocType | null => {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length > 0) {
        return currentUtterances.find((item) => item.id === requestedId) ?? null;
      }

      if (currentSelectedUtterance) return currentSelectedUtterance;
      return fallbackUtterance ?? null;
    };

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

    const resolveTargetTranslationLayerId = (): string => {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length > 0 && currentTranslationLayers.some((layer) => layer.id === requestedLayerId)) {
        return requestedLayerId;
      }

      if (currentSelectedLayerId && currentTranslationLayers.some((layer) => layer.id === currentSelectedLayerId)) {
        return currentSelectedLayerId;
      }

      return currentTranslationLayers[0]?.id ?? '';
    };

    const resolveTargetLayerId = (): string => {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId) return requestedLayerId;
      return currentSelectedLayerId || '';
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
      if (currentSelectedLayerId) {
        const selected = currentTranscriptionLayers.find((layer) => layer.id === currentSelectedLayerId);
        if (selected) return selected;
      }
      return currentTranscriptionLayers[0] ?? null;
    };

    const resolveTranslationLayerForLink = (): TranslationLayerDocType | null => {
      const requestedLayerId = String(call.arguments.translationLayerId ?? call.arguments.layerId ?? '').trim();
      if (requestedLayerId) {
        return currentTranslationLayers.find((layer) => layer.id === requestedLayerId) ?? null;
      }
      if (currentSelectedLayerId) {
        const selected = currentTranslationLayers.find((layer) => layer.id === currentSelectedLayerId);
        if (selected) return selected;
      }
      return currentTranslationLayers[0] ?? null;
    };

    if (call.name === 'create_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，切分句段必须显式指定目标句段。' };
      }

      const baseUtterance = resolveRequestedUtterance();
      if (!baseUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }

      const mediaDuration = typeof currentSelectedUtteranceMedia?.duration === 'number'
        ? currentSelectedUtteranceMedia.duration
        : baseUtterance.endTime + 2;
      await createNextUtterance(baseUtterance, mediaDuration);
      return { ok: true, message: '已在当前句段后创建新区间。' };
    }

    if (call.name === 'delete_transcription_segment') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，删除句段必须显式指定目标句段。' };
      }

      const targetUtterance = resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }

      await deleteUtterance(targetUtterance.id);
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

      const targetUtterance = resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedId}` };
      }

      await saveUtteranceText(targetUtterance.id, text);
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

      const targetUtterance = resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedUtteranceId}` };
      }

      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: '缺少 layerId，写入翻译文本必须显式指定目标翻译层。' };
      }

      const targetLayerId = resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: `未找到目标翻译层：${requestedLayerId}` };
      }

      await saveTextTranslationForUtterance(targetUtterance.id, text, targetLayerId);
      return { ok: true, message: '翻译文本已写入。' };
    }

    if (call.name === 'clear_translation_segment') {
      const requestedUtteranceId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedUtteranceId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，清空翻译必须显式指定目标句段。' };
      }

      const targetUtterance = resolveRequestedUtterance();
      if (!targetUtterance) {
        return { ok: false, message: `未找到目标句段：${requestedUtteranceId}` };
      }

      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length === 0) {
        return { ok: false, message: '缺少 layerId，清空翻译必须显式指定目标翻译层。' };
      }

      const targetLayerId = resolveRequestedTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: `未找到目标翻译层：${requestedLayerId}` };
      }

      const targetLayer = currentTranslationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return { ok: false, message: `未找到目标翻译层：${targetLayerId}` };
      }

      await saveTextTranslationForUtterance(targetUtterance.id, '', targetLayerId);
      const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
      return { ok: true, message: `已清空句段 ${targetUtterance.id} 在层 ${layerLabel} 的翻译文本。` };
    }

    if (call.name === 'create_transcription_layer') {
      const languageId = String(call.arguments.languageId ?? '').trim();
      if (!languageId) {
        return { ok: false, message: '缺少 languageId，无法创建转写层。' };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const ok = await createLayer('transcription', {
        languageId,
        ...(alias ? { alias } : {}),
      });
      return {
        ok,
        message: ok ? `已创建转写层（${languageId}${alias ? ` / ${alias}` : ''}）。` : '创建转写层失败，请检查语言或别名是否冲突。',
      };
    }

    if (call.name === 'create_translation_layer') {
      const languageId = String(call.arguments.languageId ?? '').trim();
      if (!languageId) {
        return { ok: false, message: '缺少 languageId，无法创建翻译层。' };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const modalityRaw = String(call.arguments.modality ?? 'text').trim().toLowerCase();
      const modality: 'text' | 'audio' | 'mixed' = modalityRaw === 'audio' || modalityRaw === 'mixed'
        ? modalityRaw
        : 'text';
      const ok = await createLayer('translation', {
        languageId,
        ...(alias ? { alias } : {}),
      }, modality);
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
        const exists = currentTranscriptionLayers.some((layer) => layer.id === requestedLayerId)
          || currentTranslationLayers.some((layer) => layer.id === requestedLayerId);
        if (!exists) {
          return { ok: false, message: `未找到目标层：${requestedLayerId}` };
        }
        await deleteLayer(requestedLayerId);
        return { ok: true, message: `已删除层：${requestedLayerId}` };
      }

      const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
      const languageQuery = String(call.arguments.languageQuery ?? '').trim();
      if (!layerType || !languageQuery) {
        return { ok: false, message: '缺少 layerId，删除层必须显式指定 layerId，或提供 layerType + languageQuery。' };
      }

      const pool = layerType === 'translation'
        ? currentTranslationLayers
        : layerType === 'transcription'
          ? currentTranscriptionLayers
          : [];
      if (pool.length === 0) {
        return { ok: false, message: `未找到可删除的${layerType === 'translation' ? '翻译' : '转写'}层。` };
      }

      const matched = pool.filter((layer) => layerMatchesLanguage(layer, languageQuery));
      if (matched.length === 0) {
        return { ok: false, message: `未找到匹配“${languageQuery}”的${layerType === 'translation' ? '翻译' : '转写'}层。` };
      }
      if (matched.length > 1) {
        return { ok: false, message: `匹配到多个${layerType === 'translation' ? '翻译' : '转写'}层，请改用 layerId 精确指定。` };
      }

      const targetLayer = matched[0]!;
      await deleteLayer(targetLayer.id);
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

      const trcLayer = resolveTranscriptionLayerForLink();
      if (!trcLayer) {
        return { ok: false, message: '未找到可用转写层，无法设置链接。' };
      }
      const trlLayer = resolveTranslationLayerForLink();
      if (!trlLayer) {
        return { ok: false, message: '未找到可用翻译层，无法设置链接。' };
      }

      const exists = currentLayerLinks.some(
        (link) => link.transcriptionLayerKey === trcLayer.key && link.tierId === trlLayer.id,
      );
      const shouldLink = call.name === 'link_translation_layer';
      if (exists !== shouldLink) {
        await toggleLayerLink(trcLayer.key, trlLayer.id);
      }

      const trcLabel = trcLayer.name.zho ?? trcLayer.name.eng ?? trcLayer.key;
      const trlLabel = trlLayer.name.zho ?? trlLayer.name.eng ?? trlLayer.key;
      return {
        ok: true,
        message: shouldLink
          ? `已链接：${trcLabel} -> ${trlLabel}`
          : `已取消链接：${trcLabel} -> ${trlLabel}`,
      };
    }

    if (call.name === 'auto_gloss_utterance') {
      const requestedId = String(call.arguments.utteranceId ?? '').trim();
      if (requestedId.length === 0) {
        return { ok: false, message: '缺少 utteranceId，自动标注必须显式指定目标句段。' };
      }

      const targetUtterance = resolveRequestedUtterance();
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
    }

    return { ok: false, message: `暂不支持的工具调用：${call.name}` };
  }, [
    createLayer,
    createNextUtterance,
    deleteLayer,
    deleteUtterance,
    toggleLayerLink,
    saveTextTranslationForUtterance,
    saveUtteranceText,
    utterancesRef,
    selectedUtteranceRef,
    selectedUtteranceMediaRef,
    selectedLayerIdRef,
    transcriptionLayersRef,
    translationLayersRef,
    layerLinksRef,
  ]);
}
