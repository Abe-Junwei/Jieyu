import { useCallback } from 'react';
import type { UtteranceDocType, TranslationLayerDocType, MediaItemDocType } from '../../db';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { useLatest } from './useLatest';

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
      const baseUtterance = resolveTargetUtterance();
      if (!baseUtterance) {
        return { ok: false, message: '当前没有可用句段，无法创建新句段。' };
      }

      const mediaDuration = typeof currentSelectedUtteranceMedia?.duration === 'number'
        ? currentSelectedUtteranceMedia.duration
        : baseUtterance.endTime + 2;
      await createNextUtterance(baseUtterance, mediaDuration);
      if (!currentSelectedUtterance && fallbackUtterance) {
        return { ok: true, message: `未选中句段，已自动基于现有句段（${baseUtterance.id}）创建新区间。` };
      }
      return { ok: true, message: '已在当前句段后创建新区间。' };
    }

    if (call.name === 'delete_transcription_segment') {
      const targetUtterance = resolveTargetUtterance();
      if (!targetUtterance) {
        return { ok: false, message: '当前没有可删除的句段。' };
      }

      await deleteUtterance(targetUtterance.id);
      if (!currentSelectedUtterance) {
        return { ok: true, message: `未选中句段，已自动删除现有句段（${targetUtterance.id}）。` };
      }
      return { ok: true, message: '句段已删除。' };
    }

    if (call.name === 'set_transcription_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: '缺少 text 参数，无法写入转写文本。' };
      }

      const targetUtterance = resolveTargetUtterance();
      if (!targetUtterance) {
        return { ok: false, message: '当前没有可写入的转写行。' };
      }

      await saveUtteranceText(targetUtterance.id, text);
      if (!currentSelectedUtterance) {
        return { ok: true, message: `未选中行，已自动写入现有转写行（${targetUtterance.id}）。` };
      }
      return { ok: true, message: '转写文本已写入。' };
    }

    if (call.name === 'set_translation_text') {
      const text = String(call.arguments.text ?? '').trim();
      if (text.length === 0) {
        return { ok: false, message: '缺少 text 参数，无法写入翻译文本。' };
      }

      const targetUtterance = resolveTargetUtterance();
      if (!targetUtterance) {
        return { ok: false, message: '当前没有可写入翻译的转写行。' };
      }

      const targetLayerId = resolveTargetTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: '当前没有翻译层，请先创建翻译层。' };
      }

      await saveTextTranslationForUtterance(targetUtterance.id, text, targetLayerId);
      if (!currentSelectedUtterance) {
        return { ok: true, message: `未选中行，已自动写入现有转写行（${targetUtterance.id}）的翻译。` };
      }
      return { ok: true, message: '翻译文本已写入。' };
    }

    if (call.name === 'clear_translation_segment') {
      const targetUtterance = resolveTargetUtterance();
      if (!targetUtterance) {
        return { ok: false, message: '当前没有可清空翻译的句段。' };
      }

      const targetLayerId = resolveTargetTranslationLayerId();
      if (!targetLayerId) {
        return { ok: false, message: '当前没有可清空翻译的翻译层。' };
      }

      const targetLayer = currentTranslationLayers.find((layer) => layer.id === targetLayerId);
      if (!targetLayer) {
        return { ok: false, message: `未找到目标翻译层：${targetLayerId}` };
      }

      await saveTextTranslationForUtterance(targetUtterance.id, '', targetLayerId);
      const layerLabel = targetLayer.name.zho ?? targetLayer.name.eng ?? targetLayer.key;
      if (!currentSelectedUtterance) {
        return { ok: true, message: `未选中句段，已清空句段（${targetUtterance.id}）在层 ${layerLabel} 的翻译文本。` };
      }
      if (!currentSelectedLayerId || currentSelectedLayerId !== targetLayerId) {
        return { ok: true, message: `已自动定位层 ${layerLabel} 并清空当前句段的翻译文本。` };
      }
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
      const targetLayerId = resolveTargetLayerId();
      if (!targetLayerId) {
        return { ok: false, message: '缺少 layerId，且当前没有已选中层，无法删除。' };
      }
      await deleteLayer(targetLayerId);
      return { ok: true, message: `已删除层：${targetLayerId}` };
    }

    if (call.name === 'link_translation_layer' || call.name === 'unlink_translation_layer') {
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
