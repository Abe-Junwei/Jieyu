/**
 * coreExecutors — Simple list/query local context tool executors
 * Extracted from localContextToolExecutors.ts
 */

import type { AiPromptContext } from '../chatDomain.types';
import type { LocalContextToolResult } from '../localContextToolTypes';
import { buildReadModelMetaWithSource } from './readModelMeta';
import { normalizeLayerTypeFilter } from './argNormalizers';

export function listLayers(
  context: AiPromptContext,
  args: Record<string, unknown>,
): LocalContextToolResult {
  const layerType = normalizeLayerTypeFilter(args.layerType);
  const layers = [...(context.shortTerm?.layerIndex ?? [])]
    .filter((layer) => !layerType || layer.layerType === layerType)
    .map((layer) => ({
      id: layer.id,
      ...(layer.key ? { key: layer.key } : {}),
      ...(layer.label ? { label: layer.label } : {}),
      ...(layer.layerType ? { layerType: layer.layerType } : {}),
      ...(layer.languageId ? { languageId: layer.languageId } : {}),
      ...(layer.modality ? { modality: layer.modality } : {}),
      ...(layer.textId ? { textId: layer.textId } : {}),
      ...(layer.treeHostLayerId ? { treeHostLayerId: layer.treeHostLayerId } : {}),
      ...(layer.constraint ? { constraint: layer.constraint } : {}),
      ...(typeof layer.unitCount === 'number' ? { unitCount: layer.unitCount } : {}),
      ...(layer.isSelected ? { isSelected: true } : {}),
      ...(layer.isActiveEditLayer ? { isActiveEditLayer: true } : {}),
      ...(layer.isDefaultTranscriptionLayer ? { isDefaultTranscriptionLayer: true } : {}),
    }));
  return {
    ok: true,
    name: 'list_layers',
    result: {
      count: layers.length,
      ...(layerType ? { layerType } : {}),
      layers,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export function listLayerLinks(context: AiPromptContext): LocalContextToolResult {
  const links = [...(context.shortTerm?.layerLinkIndex ?? [])];
  return {
    ok: true,
    name: 'list_layer_links',
    result: {
      count: links.length,
      links,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export function getUnsavedDrafts(context: AiPromptContext): LocalContextToolResult {
  const drafts = [...(context.shortTerm?.unsavedDrafts ?? [])];
  const unitDraftCount = drafts.filter((draft) => draft.draftType === 'unit').length;
  const translationDraftCount = drafts.filter((draft) => draft.draftType === 'translation').length;
  return {
    ok: true,
    name: 'get_unsaved_drafts',
    result: {
      count: drafts.length,
      unitDraftCount,
      translationDraftCount,
      drafts,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export function listSpeakers(context: AiPromptContext): LocalContextToolResult {
  const speakers = [...(context.shortTerm?.speakerIndex ?? [])];
  return {
    ok: true,
    name: 'list_speakers',
    result: {
      count: speakers.length,
      speakers,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export function listNotes(context: AiPromptContext): LocalContextToolResult {
  const summary = context.shortTerm?.noteSummary;
  const count =
    typeof summary?.count === 'number' && Number.isFinite(summary.count) ? summary.count : 0;
  return {
    ok: true,
    name: 'list_notes',
    result: {
      count,
      ...(summary?.byCategory ? { byCategory: summary.byCategory } : {}),
      ...(summary?.focusedLayerId ? { focusedLayerId: summary.focusedLayerId } : {}),
      ...(summary?.currentTargetUnitId ? { currentTargetUnitId: summary.currentTargetUnitId } : {}),
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}

export function getVisibleTimelineState(context: AiPromptContext): LocalContextToolResult {
  const state = context.shortTerm?.visibleTimelineState ?? {};
  return {
    ok: true,
    name: 'get_visible_timeline_state',
    result: {
      ...state,
      _readModel: buildReadModelMetaWithSource(context, 'timeline_index'),
    },
  };
}
