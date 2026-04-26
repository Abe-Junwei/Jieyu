import { loadRecentVoiceSessions } from '../services/VoiceSessionStore';
import { t, tf } from '../i18n';
import { formatVoiceHistoryActorLabel, formatVoiceLayerKinds } from './useAiToolCallHandler.helpers';
import { glossAdapter } from './useAiToolCallHandler.annotationAdapters';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

export const voiceAdapter: ToolObjectAdapter = {
  handles: [
    'play_pause',
    'undo',
    'redo',
    'search_segments',
    'toggle_notes',
    'mark_segment',
    'delete_segment',
    'auto_gloss_segment',
    'focus_segment',
    'zoom_to_segment',
    'nav_to_segment',
    'nav_to_time',
    'split_at_time',
    'merge_prev',
    'merge_next',
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
    const executeTargetedMerge = async (
      merge: typeof ctx.mergeWithPrevious | typeof ctx.mergeWithNext,
      successMessage: string,
    ) => {
      const requestedSegmentId = String(call.arguments.segmentId ?? '').trim();
      if (requestedSegmentId.length > 0) {
        const targetSegment = ctx.resolveRequestedSegmentTarget();
        if (!targetSegment) {
          return { ok: false as const, message: tf(locale, 'transcription.aiTool.voice.segmentNotFound', { segmentId: requestedSegmentId }) };
        }
        if (!merge) {
          return { ok: false as const, message: t(locale, 'transcription.aiTool.voice.actionUnsupported') };
        }
        await merge(targetSegment.id);
        return { ok: true as const, message: successMessage };
      }

      const requestedUnitId = String(call.arguments.unitId ?? '').trim();
      if (requestedUnitId.length > 0) {
        const targetUnit = ctx.resolveRequestedUnit();
        if (!targetUnit) {
          return {
            ok: false as const,
            message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: requestedUnitId }),
          };
        }
        if (!merge) {
          return { ok: false as const, message: t(locale, 'transcription.aiTool.voice.actionUnsupported') };
        }
        await merge(targetUnit.id);
        return { ok: true as const, message: successMessage };
      }

      return executeMappedAction(
        call.name === 'merge_prev' ? 'mergePrev' : 'mergeNext',
        successMessage,
      );
    };

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
              scope: formatVoiceLayerKinds(rawLayers, locale),
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
    if (call.name === 'auto_gloss_segment') {
      return glossAdapter.execute(ctx);
    }
    if (call.name === 'nav_to_segment') {
      const idx = Number(call.arguments.segmentIndex);
      if (!Number.isFinite(idx) || idx < 1) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentInvalidIndex') };
      const segments = ctx.getSegments?.();
      if (!segments || segments.length === 0) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navSegmentEmpty') };
      const target = segments[idx - 1];
      if (!target) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.navSegmentOutOfRange', { index: idx, total: segments.length }) };
      if (!ctx.navigateTo) return { ok: false, message: t(locale, 'transcription.aiTool.voice.navigateUnsupported') };
      const previousFocusId = ctx.selectedUnit?.id;
      const targetId = target.id;
      const nav = ctx.navigateTo;
      nav(targetId);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.navSegmentDone', { index: idx, total: segments.length }),
        ...(previousFocusId !== undefined && previousFocusId !== targetId
          ? {
              rollback: async () => {
                nav(previousFocusId);
              },
            }
          : {}),
      };
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
      return executeTargetedMerge(ctx.mergeWithPrevious, t(locale, 'transcription.aiTool.voice.mergePrevDone'));
    }
    if (call.name === 'merge_next') {
      return executeTargetedMerge(ctx.mergeWithNext, t(locale, 'transcription.aiTool.voice.mergeNextDone'));
    }
    if (call.name === 'focus_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      if (!segId) return { ok: false, message: t(locale, 'transcription.aiTool.voice.focusSegmentMissingId') };
      const found = ctx.units.find((u) => u.id === segId);
      if (!found) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.segmentNotFound', { segmentId: segId }) };
      if (!ctx.navigateTo) return { ok: false, message: tf(locale, 'transcription.aiTool.voice.focusSegmentUnsupported', { segmentId: segId }) };
      const previousFocusId = ctx.selectedUnit?.id;
      const nav = ctx.navigateTo;
      nav(segId);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.focusSegmentDone', {
          segmentId: segId,
          startTime: found.startTime.toFixed(2),
          endTime: found.endTime.toFixed(2),
        }),
        ...(previousFocusId !== undefined && previousFocusId !== segId
          ? {
              rollback: async () => {
                nav(previousFocusId);
              },
            }
          : {}),
      };
    }
    if (call.name === 'zoom_to_segment') {
      const segId = String(call.arguments.segmentId ?? '').trim();
      const zoomLevel = typeof call.arguments.zoomLevel === 'number' ? call.arguments.zoomLevel : undefined;
      if (!segId) return { ok: false, message: t(locale, 'transcription.aiTool.voice.zoomSegmentMissingId') };
      const found = ctx.units.find((u) => u.id === segId);
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
    if (call.name === 'get_current_segment') {
      const utt = ctx.selectedUnit;
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
          const label = formatVoiceHistoryActorLabel(e.intent.type, locale);
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
      const total = ctx.units.length;
      const done = ctx.units.filter((u) => u.annotationStatus && u.annotationStatus !== 'raw').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.voice.projectSummaryDone', {
          total,
          done,
          pct,
          selected: ctx.selectedUnit ? 1 : 0,
        }),
      };
    }
    return { ok: false, message: tf(locale, 'transcription.aiTool.voice.unknownTool', { toolName: call.name }) };
  },
};
