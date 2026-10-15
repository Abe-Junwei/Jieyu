import { resolveLanguageQuery } from '../../utils/langMapping';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import { createLogger } from '../../observability/logger';
import { t, tf } from '../../i18n';
import { persistedLayerIds, tierRowExists } from './aiWriteReadback';
import { formatLayerTypeLabel } from './useAiToolCallHandler.helpers';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';
import {
  getAiToolLayerLinkActionKind,
  getAiToolLayerLinkExecutionToolNames,
  isAiToolLayerLinkWithExplicitTarget,
} from '../../ai/policy/aiToolPolicyMatrix';

const log = createLogger('useAiToolCallHandler');

type CreateLayerOutcome = 'created' | 'rejected' | 'absent' | { landedId: string };

/** 建层抛错后按 contentType + languageId 读新行。返回 false 仍是调用方拒绝，不读库。 */
async function createLayerObserved(
  create: () => Promise<boolean>,
  contentType: 'transcription' | 'translation',
  languageId: string,
): Promise<CreateLayerOutcome> {
  const before = await persistedLayerIds(contentType, languageId);
  try {
    const ok = await create();
    return ok ? 'created' : 'rejected';
  } catch (error) {
    if (before === undefined) throw error;
    const after = await persistedLayerIds(contentType, languageId);
    if (after === undefined) throw error;
    const known = new Set(before);
    const created = after.filter((id) => !known.has(id));
    if (created.length === 1) return { landedId: created[0]! };
    if (created.length === 0) return 'absent';
    throw error;
  }
}

/** 删层抛错后读 tier 行：行已不在则删除已落地，行还在则未删除，读不了则把原错误抛回去。 */
async function deleteLayerObserved(
  deleteLayer: (layerId: string) => Promise<void>,
  layerId: string,
): Promise<'deleted' | 'still-there'> {
  try {
    await deleteLayer(layerId);
    return 'deleted';
  } catch (error) {
    const exists = await tierRowExists(layerId);
    if (exists === false) return 'deleted';
    if (exists === true) return 'still-there';
    throw error;
  }
}

export const layerAdapter: ToolObjectAdapter = {
  handles: [
    'create_transcription_layer',
    'create_translation_layer',
    'delete_layer',
    ...getAiToolLayerLinkExecutionToolNames(),
  ],
  async execute(ctx) {
    const { call, compensationRef, COMPENSATION_TTL_MS, locale } = ctx;

    if (call.name === 'create_transcription_layer') {
      const rawLang = String(
        call.arguments.languageId ?? call.arguments.languageQuery ?? '',
      ).trim();
      if (!rawLang) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.createTranscriptionMissingLanguageId'),
        };
      }
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.languageUnrecognized', { rawLang }),
        };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const outcome = await createLayerObserved(
        () =>
          ctx.createLayer('transcription', {
            languageId,
            ...(alias ? { alias } : {}),
          }),
        'transcription',
        languageId,
      );
      if (outcome === 'rejected') {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.createTranscriptionFailed'),
        };
      }
      if (outcome === 'absent') {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.createNotWritten') };
      }
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.layer.createTranscriptionDone', {
          languageId,
          aliasSuffix: alias ? ` / ${alias}` : '',
        }),
      };
    }

    if (call.name === 'create_translation_layer') {
      const rawLang = String(
        call.arguments.languageId ?? call.arguments.languageQuery ?? '',
      ).trim();
      if (!rawLang) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.createTranslationMissingLanguageId'),
        };
      }
      const languageId = resolveLanguageQuery(rawLang);
      if (!languageId) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.languageUnrecognized', { rawLang }),
        };
      }
      const alias = String(call.arguments.alias ?? '').trim();
      const modalityRaw = String(call.arguments.modality ?? 'text')
        .trim()
        .toLowerCase();
      const modality: 'text' | 'audio' | 'mixed' =
        modalityRaw === 'audio' || modalityRaw === 'mixed' ? modalityRaw : 'text';
      const prevLayerIds = new Set(ctx.translationLayers.map((l) => l.id));
      const outcome = await createLayerObserved(
        () =>
          ctx.createLayer(
            'translation',
            {
              languageId,
              ...(alias ? { alias } : {}),
            },
            modality,
          ),
        'translation',
        languageId,
      );
      if (outcome === 'rejected') {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.createTranslationFailed'),
        };
      }
      if (outcome === 'absent') {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.createNotWritten') };
      }
      const landedId = typeof outcome === 'object' ? outcome.landedId : undefined;
      const newLayer =
        ctx.translationLayersRef.current.find((l) => !prevLayerIds.has(l.id)) ??
        (landedId ? { id: landedId } : undefined);
      if (newLayer) {
        ctx.compensationRef.current.set(call.requestId ?? 'default', {
          layerId: newLayer.id,
          layerType: 'translation',
          createdAt: Date.now(),
        });
      }
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.layer.createTranslationDone', {
          languageId,
          aliasSuffix: alias ? ` / ${alias}` : '',
          modality,
        }),
      };
    }

    if (call.name === 'delete_layer') {
      const requestedLayerId = String(call.arguments.layerId ?? '').trim();
      if (requestedLayerId.length > 0) {
        const exists =
          ctx.transcriptionLayers.some((layer) => layer.id === requestedLayerId) ||
          ctx.translationLayers.some((layer) => layer.id === requestedLayerId);
        if (exists) {
          const deleted = await deleteLayerObserved(ctx.deleteLayer, requestedLayerId);
          if (deleted === 'still-there') {
            return {
              ok: false,
              message: tf(locale, 'transcription.aiTool.layer.deleteNotWritten', {
                layerId: requestedLayerId,
              }),
            };
          }
          return {
            ok: true,
            message: tf(locale, 'transcription.aiTool.layer.deleteDone', {
              layerId: requestedLayerId,
            }),
          };
        }

        const hint = ctx.parseLayerHintFromOpaqueId(requestedLayerId);
        if (!hint) {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.targetNotFound', {
              layerId: requestedLayerId,
            }),
          };
        }

        const pool =
          hint.layerType === 'translation' ? ctx.translationLayers : ctx.transcriptionLayers;
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
        const deleted = await deleteLayerObserved(ctx.deleteLayer, targetLayer.id);
        if (deleted === 'still-there') {
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.deleteNotWritten', {
              layerId: targetLayer.id,
            }),
          };
        }
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.deleteDone', { layerId: targetLayer.id }),
        };
      }

      const layerType = String(call.arguments.layerType ?? '')
        .trim()
        .toLowerCase();
      const languageQuery = String(call.arguments.languageQuery ?? '').trim();
      if (!layerType || !languageQuery) {
        return { ok: false, message: t(locale, 'transcription.aiTool.layer.deleteMissingTarget') };
      }
      if (layerType !== 'translation' && layerType !== 'transcription') {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.invalidLayerType', { layerType }),
        };
      }

      const pool =
        layerType === 'translation'
          ? ctx.translationLayers
          : layerType === 'transcription'
            ? ctx.transcriptionLayers
            : [];
      if (pool.length === 0) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.noAvailableByType', {
            layerType: formatLayerTypeLabel(
              layerType === 'translation' ? 'translation' : 'transcription',
              locale,
            ),
          }),
        };
      }

      const matched = pool.filter((layer) => ctx.layerMatchesLanguage(layer, languageQuery));
      if (matched.length === 0) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
            languageQuery,
            layerType: formatLayerTypeLabel(
              layerType === 'translation' ? 'translation' : 'transcription',
              locale,
            ),
          }),
        };
      }
      if (matched.length > 1) {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
            layerType: formatLayerTypeLabel(
              layerType === 'translation' ? 'translation' : 'transcription',
              locale,
            ),
          }),
        };
      }

      const targetLayer = matched[0]!;
      const deleted = await deleteLayerObserved(ctx.deleteLayer, targetLayer.id);
      if (deleted === 'still-there') {
        return {
          ok: false,
          message: tf(locale, 'transcription.aiTool.layer.deleteNotWritten', {
            layerId: targetLayer.id,
          }),
        };
      }
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.layer.deleteDone', { layerId: targetLayer.id }),
      };
    }

    if (isAiToolLayerLinkWithExplicitTarget(call.name)) {
      const layerLinkAction = getAiToolLayerLinkActionKind(call.name);
      const isAddHostAction = layerLinkAction === 'add_host';
      const isRemoveHostAction = layerLinkAction === 'remove_host';
      const isSwitchPreferredHostAction = layerLinkAction === 'switch_preferred_host';
      const requestedTranscriptionLayerId = String(
        call.arguments.transcriptionLayerId ?? '',
      ).trim();
      const requestedTranscriptionLayerKey = String(
        call.arguments.transcriptionLayerKey ?? '',
      ).trim();
      if (!requestedTranscriptionLayerId && !requestedTranscriptionLayerKey) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.linkMissingTranscriptionTarget'),
        };
      }

      const requestedTranslationLayerId = String(
        call.arguments.translationLayerId ?? call.arguments.layerId ?? '',
      ).trim();
      if (!requestedTranslationLayerId) {
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.linkMissingTranslationTarget'),
        };
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
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.linkMissingTranscriptionRollback', {
              layerId: comp.layerId,
            }),
          };
        }
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.linkMissingTranscription'),
        };
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
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.linkMissingTranslationRollback', {
              layerId: comp.layerId,
            }),
          };
        }
        return {
          ok: false,
          message: t(locale, 'transcription.aiTool.layer.linkMissingTranslation'),
        };
      }

      const matchedLink = ctx.layerLinks.find((link) => {
        if (link.layerId !== trlLayer.id) return false;
        const hostTranscriptionLayerId =
          typeof link.hostTranscriptionLayerId === 'string'
            ? link.hostTranscriptionLayerId.trim()
            : '';
        if (hostTranscriptionLayerId.length > 0) {
          return hostTranscriptionLayerId === trcLayer.id;
        }
        return link.transcriptionLayerKey === trcLayer.key;
      });
      const exists = Boolean(matchedLink);
      const alreadyPreferred = Boolean(matchedLink?.isPreferred);

      if (isRemoveHostAction && !exists) {
        compensationRef.current.delete(call.requestId ?? 'default');
        const transcriptionLayer = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
        const translationLayer = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.unlinkDone', {
            transcriptionLayer,
            translationLayer,
          }),
        };
      }

      if (isRemoveHostAction && exists) {
        const fallbackParent = ctx.transcriptionLayers.find(
          (layer) =>
            layer.id !== trcLayer.id &&
            (layer.constraint ?? 'independent_boundary') === 'independent_boundary',
        );
        if (!fallbackParent) {
          return {
            ok: false,
            message: t(locale, 'transcription.aiTool.layer.unlinkRequiresFallbackParent'),
          };
        }
        try {
          if (ctx.rebindTranslationLayerHost) {
            await ctx.rebindTranslationLayerHost({
              translationLayerId: trlLayer.id,
              removeTranscriptionLayerId: trcLayer.id,
              fallbackTranscriptionLayerKey: fallbackParent.key,
            });
          } else {
            await ctx.toggleLayerLink(fallbackParent.key, trlLayer.id);
          }
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
            const errMsg =
              linkError instanceof Error
                ? linkError.message
                : t(locale, 'transcription.aiTool.layer.unlinkFailed');
            return {
              ok: false,
              message: tf(locale, 'transcription.aiTool.layer.linkRollbackAfterError', {
                errMsg,
                layerId: comp.layerId,
              }),
            };
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

      if (isAddHostAction && exists) {
        compensationRef.current.delete(call.requestId ?? 'default');
        const trcLabel = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
        const trlLabel = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.linkDone', {
            transcriptionLayer: trcLabel,
            translationLayer: trlLabel,
          }),
        };
      }

      if (isSwitchPreferredHostAction && exists && alreadyPreferred) {
        compensationRef.current.delete(call.requestId ?? 'default');
        const trcLabel = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
        const trlLabel = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.layer.linkDone', {
            transcriptionLayer: trcLabel,
            translationLayer: trlLabel,
          }),
        };
      }

      try {
        const shouldToggle = isSwitchPreferredHostAction ? !alreadyPreferred : !exists;
        if (shouldToggle) {
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
          const errMsg =
            linkError instanceof Error
              ? linkError.message
              : t(locale, 'transcription.aiTool.layer.linkFailed');
          return {
            ok: false,
            message: tf(locale, 'transcription.aiTool.layer.linkRollbackAfterError', {
              errMsg,
              layerId: comp.layerId,
            }),
          };
        }
        throw linkError;
      }

      compensationRef.current.delete(call.requestId ?? 'default');
      const trcLabel = readAnyMultiLangLabel(trcLayer.name) ?? trcLayer.key;
      const trlLabel = readAnyMultiLangLabel(trlLayer.name) ?? trlLayer.key;
      return {
        ok: true,
        message: isRemoveHostAction
          ? tf(locale, 'transcription.aiTool.layer.unlinkDone', {
              transcriptionLayer: trcLabel,
              translationLayer: trlLabel,
            })
          : tf(locale, 'transcription.aiTool.layer.linkDone', {
              transcriptionLayer: trcLabel,
              translationLayer: trlLabel,
            }),
      };
    }

    return {
      ok: false,
      message: tf(locale, 'transcription.aiTool.layer.unsupportedTool', { toolName: call.name }),
    };
  },
};
