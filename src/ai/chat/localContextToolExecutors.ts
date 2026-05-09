import type { AiPromptContext } from './chatDomain.types';
import { generateTraceId, startAiTraceSpan } from '../../observability/aiTrace';
import { createMetricTags } from '../../observability/metrics';
import { batchApply, diagnoseQuality, findIncompleteUnits, suggestNextAction } from './intentTools';
import type {
  LocalContextToolCall,
  LocalContextToolResult,
  LocalToolExecutionTraceOptions,
} from './localContextToolTypes';
import {
  listLayers,
  listLayerLinks,
  getUnsavedDrafts,
  listSpeakers,
  listNotes,
  getVisibleTimelineState,
} from './executors/coreExecutors';
import { listNotesDetail, getSpeakerBreakdown } from './executors/noteExecutors';
import {
  getProjectStats,
  findIncompleteUnitsWithSnapshots,
  diagnoseQualityWithSnapshots,
  batchApplyWithSnapshots,
} from './executors/projectStats';
import { listUnits, searchUnits } from './executors/searchAndList';
import { getUnitDetail, getUnitLinguisticMemory } from './executors/linguisticMemory';
import {
  finalizeLocalContextToolResult,
  buildAcousticUnavailablePayload,
} from './executors/toolPayload';

export async function executeLocalContextToolCall(
  call: LocalContextToolCall,
  context: AiPromptContext | null,
  callCountRef: { current: number },
  maxCalls = 20,
  traceOptions?: LocalToolExecutionTraceOptions,
): Promise<LocalContextToolResult> {
  const traceId = traceOptions?.traceId ?? generateTraceId();
  const toolSpan = startAiTraceSpan({
    kind: 'tool-execution',
    traceId,
    tags: createMetricTags('localContextTools', {
      toolName: call.name,
      ...(traceOptions?.step !== undefined ? { step: traceOptions.step } : {}),
    }),
  });

  if (!context) {
    const out = {
      ok: false,
      name: call.name,
      result: null,
      error: 'context is unavailable',
    };
    toolSpan.endWithError(out.error);
    return out;
  }

  if (callCountRef.current >= maxCalls) {
    const out = {
      ok: false,
      name: call.name,
      result: null,
      error: 'local tool call limit exceeded',
    };
    toolSpan.endWithError(out.error);
    return out;
  }
  callCountRef.current += 1;

  let out: LocalContextToolResult;
  try {
    switch (call.name) {
      case 'get_current_selection': {
        const {
          localUnitIndex: _stripped,
          timelineUnitsByLayerId: _timelineByLayer,
          layerIndex: _layerIndex,
          layerLinkIndex: _layerLinkIndex,
          unsavedDrafts: _unsavedDrafts,
          ...visibleShortTerm
        } = context.shortTerm ?? {};
        out = {
          ok: true,
          name: call.name,
          result: {
            ...visibleShortTerm,
            ...(context.longTerm?.projectStats?.unitCount !== undefined
              ? { projectUnitCount: context.longTerm.projectStats.unitCount }
              : context.longTerm?.projectStats?.unitCount !== undefined
                ? { projectUnitCount: context.longTerm.projectStats.unitCount }
                : {}),
          },
        };
        break;
      }
      case 'list_layers':
        out = listLayers(context, call.arguments);
        break;
      case 'list_layer_links':
        out = listLayerLinks(context);
        break;
      case 'get_unsaved_drafts':
        out = getUnsavedDrafts(context);
        break;
      case 'list_speakers':
        out = listSpeakers(context);
        break;
      case 'list_notes':
        out = listNotes(context);
        break;
      case 'list_notes_detail':
        out = await listNotesDetail(context, call.arguments);
        break;
      case 'get_visible_timeline_state':
        out = getVisibleTimelineState(context);
        break;
      case 'get_speaker_breakdown':
        out = getSpeakerBreakdown(context, call.arguments);
        break;
      case 'get_project_stats':
        out = await getProjectStats(context, call.arguments);
        break;
      case 'get_waveform_analysis': {
        const waveformAnalysis = context.longTerm?.waveformAnalysis;
        out = {
          ok: true,
          name: call.name,
          result: waveformAnalysis ?? buildAcousticUnavailablePayload(context.shortTerm?.locale),
        };
        break;
      }
      case 'get_acoustic_summary': {
        const acousticSummary = context.longTerm?.acousticSummary;
        out = {
          ok: true,
          name: call.name,
          result: acousticSummary ?? buildAcousticUnavailablePayload(context.shortTerm?.locale),
        };
        break;
      }
      case 'find_incomplete_units': {
        const snapshotIncomplete = await findIncompleteUnitsWithSnapshots(context, call.arguments);
        out = snapshotIncomplete ?? {
          ok: true,
          name: call.name,
          result: findIncompleteUnits(context, call.arguments),
        };
        break;
      }
      case 'diagnose_quality': {
        const snapshotResult = await diagnoseQualityWithSnapshots(context, call.arguments);
        out = snapshotResult ?? {
          ok: true,
          name: call.name,
          result: diagnoseQuality(context, call.arguments),
        };
        break;
      }
      case 'batch_apply': {
        const snapshotBatch = await batchApplyWithSnapshots(context, call.arguments);
        out = snapshotBatch ?? {
          ok: true,
          name: call.name,
          result: batchApply(context, call.arguments),
        };
        break;
      }
      case 'suggest_next_action':
        out = { ok: true, name: call.name, result: suggestNextAction(context) };
        break;
      case 'list_units':
        out = {
          ...(await listUnits(context, call.arguments)),
          name: call.name,
        };
        break;
      case 'search_units':
        out = {
          ...(await searchUnits(context, call.arguments)),
          name: call.name,
        };
        break;
      case 'get_unit_detail':
        out = {
          ...(await getUnitDetail(call.arguments, context)),
          name: call.name,
        };
        break;
      case 'get_unit_linguistic_memory':
        out = {
          ...(await getUnitLinguisticMemory(call.arguments, context)),
          name: call.name,
        };
        break;
      default:
        out = {
          ok: false,
          name: call.name,
          result: null,
          error: `unsupported local context tool: ${call.name}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toolSpan.endWithError(message);
    throw error;
  }

  const finalized = finalizeLocalContextToolResult(context, out);
  if (finalized.ok) {
    toolSpan.end();
  } else {
    toolSpan.endWithError(finalized.error ?? 'local context tool failed');
  }
  return finalized;
}
