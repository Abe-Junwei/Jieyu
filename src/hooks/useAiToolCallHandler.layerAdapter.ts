import { LinguisticService } from '../services/LinguisticService';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { createLogger } from '../observability/logger';
import { t, tf } from '../i18n';
import { formatLayerTypeLabel } from './useAiToolCallHandler.helpers';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

const log = createLogger('useAiToolCallHandler');

export const layerAdapter: ToolObjectAdapter = {
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
      const languageId = LinguisticService.resolveLanguageQuery(rawLang);
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
      const languageId = LinguisticService.resolveLanguageQuery(rawLang);
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
        const newLayer = ctx.translationLayersRef.current.find((l) => !prevLayerIds.has(l.id));
        if (newLayer) {
          ctx.compensationRef.current.set(call.requestId ?? 'default', {
            layerId: newLayer.id,
            layerType: 'translation',
            createdAt: Date.now(),
          });
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

        const hint = ctx.parseLayerHintFromOpaqueId(requestedLayerId);
        if (!hint) {
          return { ok: false, message: tf(locale, 'transcription.aiTool.layer.targetNotFound', { layerId: requestedLayerId }) };
        }

        const pool = hint.layerType === 'translation' ? ctx.translationLayers : ctx.transcriptionLayers;
        const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, hint.languageQuery));
        if (matched.length === 0) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
              languageQuery: hint.languageQuery,
              layerType: formatLayerTypeLabel(hint.layerType, locale),
            }),
          };
        }
        if (matched.length > 1) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
              layerType: formatLayerTypeLabel(hint.layerType, locale),
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
            layerType: formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
          }),
        };
      }

      const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, languageQuery));
      if (matched.length === 0) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
            languageQuery,
            layerType: formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
          }),
        };
      }
      if (matched.length > 1) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
            layerType: formatLayerTypeLabel(layerType === 'translation' ? 'translation' : 'transcription', locale),
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
          return { ok: false, message: t(locale, 'transcription.aiTool.layer.unlinkRequiresFallbackParent') };
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
        const transcriptionLayer = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
        const translationLayer = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
        const fallbackLayer = readAnyMultiLangLabel(fallbackParent.name) ?? fallbackParent.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.unlinkDoneWithFallback', {
            transcriptionLayer,
            translationLayer,
            fallbackLayer,
          }),
        };
      }

      try {
        if (exists !== shouldLink) {
          await ctx.toggleLayerLink(trcLayer.key, trlLayer.id);
        }
      } catch (linkError) {
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

      compensationRef.current.delete(call.requestId ?? 'default');
      const trcLabel = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
      const trlLabel = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
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
