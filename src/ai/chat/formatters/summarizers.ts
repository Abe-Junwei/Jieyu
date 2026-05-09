/**
 * summarizers — Tool result summary generators and locale guards
 * Extracted from localContextToolFormatters.ts
 */

import type { LocalContextToolResult } from '../localContextToolTypes';
import { normalizeProjectMetric, normalizeUnitScope } from '../localContextToolScopeNormalize';

export function isZhLocale(locale?: string): boolean {
  return (locale ?? '').toLowerCase().startsWith('zh');
}

export function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function isSpeakerCountQuestion(userText?: string): boolean {
  return /(speaker|speakers|说话人|发言人)/i.test(userText ?? '');
}

export function humanizeScope(scope: unknown, locale?: string): string {
  const normalized = normalizeUnitScope(scope, 'project');
  const zh = isZhLocale(locale);
  switch (normalized) {
    case 'current_track':
      return zh ? '当前音频' : 'the current audio';
    case 'current_scope':
      return zh ? '当前范围' : 'the current scope';
    case 'project':
    default:
      return zh ? '整个项目' : 'the whole project';
  }
}

export function summarizeCurrentSelectionResult(
  body: Record<string, unknown>,
  locale?: string,
  userText?: string,
): string {
  const zh = isZhLocale(locale);
  const currentTrackCount = asFiniteNumber(body.currentMediaUnitCount);
  const currentScopeCount = asFiniteNumber(body.currentScopeUnitCount);
  const projectCount = asFiniteNumber(body.projectUnitCount);

  if (isSpeakerCountQuestion(userText)) {
    const knownBits: string[] = [];
    if (currentTrackCount !== undefined) {
      knownBits.push(
        zh
          ? `当前音频里有 ${currentTrackCount} 条语段`
          : `the current audio has ${currentTrackCount} segments`,
      );
    }
    if (projectCount !== undefined && projectCount !== currentTrackCount) {
      knownBits.push(
        zh
          ? `整个项目共有 ${projectCount} 条语段`
          : `the whole project has ${projectCount} segments`,
      );
    }
    const knownSummary =
      knownBits.length > 0
        ? zh
          ? `我先确认到这些上下文：${knownBits.join('；')}。`
          : `I confirmed this context first: ${knownBits.join('; ')}.`
        : zh
          ? '我先确认了当前上下文。'
          : 'I checked the current context first.';
    return zh
      ? `${knownSummary}不过这一步还没有直接的说话人统计。你是想问当前音频，还是整个项目的说话人数？`
      : `${knownSummary} This step does not include a direct speaker count yet. Do you mean the current audio or the whole project speaker count?`;
  }

  const details: string[] = [];
  if (currentTrackCount !== undefined)
    details.push(
      zh
        ? `当前音频共有 ${currentTrackCount} 条语段`
        : `${currentTrackCount} segments are on the current audio`,
    );
  if (currentScopeCount !== undefined)
    details.push(
      zh
        ? `当前范围共有 ${currentScopeCount} 条语段`
        : `${currentScopeCount} segments are in the current scope`,
    );
  if (projectCount !== undefined && projectCount !== currentTrackCount)
    details.push(
      zh
        ? `整个项目共有 ${projectCount} 条语段`
        : `${projectCount} segments exist in the whole project`,
    );

  if (details.length === 0) {
    return zh ? '我已读取当前上下文。' : 'I checked the current context.';
  }
  return zh
    ? `我已读取当前上下文：${details.join('；')}。`
    : `I checked the current context: ${details.join('; ')}.`;
}

export function summarizeProjectStatsResult(
  body: Record<string, unknown>,
  locale?: string,
  userText?: string,
): string {
  const zh = isZhLocale(locale);
  const scopeLabel = humanizeScope(body.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric);
  const requestedMetricRaw = typeof body.requestedMetric === 'string' ? body.requestedMetric : '';
  const unitCount = asFiniteNumber(body.unitCount);
  const speakerCount = asFiniteNumber(body.speakerCount);
  const translationLayerCount = asFiniteNumber(body.translationLayerCount);
  const aiConfidenceAvg =
    typeof body.aiConfidenceAvg === 'number' && Number.isFinite(body.aiConfidenceAvg)
      ? body.aiConfidenceAvg
      : undefined;

  if (metric === 'speaker_count' || isSpeakerCountQuestion(userText)) {
    if (speakerCount !== undefined) {
      return zh
        ? `我查到${scopeLabel}共有 ${speakerCount} 位说话人。`
        : `I found ${speakerCount} speakers in ${scopeLabel}.`;
    }
    return zh
      ? `我已查看${scopeLabel}的统计，但目前还没有可直接确认的说话人人数。你可以告诉我是当前音频还是整个项目。`
      : `I checked the stats for ${scopeLabel}, but there is no confirmed speaker count yet. You can tell me whether you mean the current audio or the whole project.`;
  }

  if (metric === 'unit_count' && unitCount !== undefined) {
    return zh
      ? `${scopeLabel}目前共有 ${unitCount} 条语段。`
      : `${scopeLabel} currently has ${unitCount} segments.`;
  }

  if (metric === 'untranscribed_count') {
    const value = asFiniteNumber(body.value);
    if (value !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${value} 条未转写语段。`
        : `There are ${value} untranscribed segments in ${scopeLabel}.`;
    }
  }

  if (metric === 'missing_speaker_count') {
    const value = asFiniteNumber(body.value);
    if (value !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${value} 条语段缺少说话人。`
        : `There are ${value} segments missing speakers in ${scopeLabel}.`;
    }
  }

  if (zh) {
    const conclusion =
      requestedMetricRaw === 'speaker_count' && speakerCount !== undefined
        ? `${scopeLabel}共有 ${speakerCount} 位说话人。`
        : metric === 'unit_count' && unitCount !== undefined
          ? `${scopeLabel}共有 ${unitCount} 条语段。`
          : metric === 'translation_layer_count' && translationLayerCount !== undefined
            ? `${scopeLabel}共有 ${translationLayerCount} 个翻译层。`
            : metric === 'ai_confidence_avg' && aiConfidenceAvg !== undefined
              ? `${scopeLabel}平均置信度为 ${aiConfidenceAvg.toFixed(3)}。`
              : `${scopeLabel}统计已读取。`;
    const evidenceBits: string[] = [];
    if (unitCount !== undefined) evidenceBits.push(`语段数 ${unitCount}`);
    if (speakerCount !== undefined) evidenceBits.push(`说话人数 ${speakerCount}`);
    if (translationLayerCount !== undefined) evidenceBits.push(`翻译层 ${translationLayerCount}`);
    if (aiConfidenceAvg !== undefined)
      evidenceBits.push(`平均置信度 ${aiConfidenceAvg.toFixed(3)}`);
    const readModel = asObject(body._readModel);
    const isComplete = readModel?.unitIndexComplete === true;
    const uncertainty = isComplete
      ? '当前读模型快照完整，暂无明显不确定项。'
      : '当前读模型可能未完全同步，建议在最新范围下复查一次。';
    const nextStep =
      requestedMetricRaw === 'speaker_count'
        ? '如需细分，请继续问“按说话人分别有多少条语段”。'
        : '如需深入，请继续问“按说话人/层级细分统计”。';
    return [
      `结论：${conclusion}`,
      `证据：${evidenceBits.length > 0 ? evidenceBits.join('，') : '暂无可结构化统计字段。'}`,
      `范围：${scopeLabel}。`,
      `不确定项：${uncertainty}`,
      `建议下一步：${nextStep}`,
    ].join('\n');
  }

  const bits: string[] = [];
  if (speakerCount !== undefined)
    bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
  if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
  if (translationLayerCount !== undefined)
    bits.push(
      zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`,
    );
  if (aiConfidenceAvg !== undefined)
    bits.push(
      zh
        ? `平均置信度 ${aiConfidenceAvg.toFixed(3)}`
        : `average confidence ${aiConfidenceAvg.toFixed(3)}`,
    );

  if (bits.length === 0) {
    return zh ? `我已读取${scopeLabel}的统计信息。` : `I checked the stats for ${scopeLabel}.`;
  }
  return zh
    ? `我已读取${scopeLabel}的统计：${bits.join('，')}。`
    : `I checked the stats for ${scopeLabel}: ${bits.join(', ')}.`;
}

export function summarizeListLikeResult(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  const scopeLabel = humanizeScope(body?.scope, locale);
  const count = asFiniteNumber(body?.count) ?? asFiniteNumber(body?.total) ?? 0;
  const query = typeof body?.query === 'string' ? body.query.trim() : '';

  if (result.name === 'search_units' && query) {
    return zh
      ? `我在${scopeLabel}里找到了 ${count} 条与“${query}”相关的语段。`
      : `I found ${count} matching segments for “${query}” in ${scopeLabel}.`;
  }
  return zh
    ? `我已查看${scopeLabel}的语段，共找到 ${count} 条。`
    : `I checked the segments in ${scopeLabel} and found ${count}.`;
}

export function summarizeDetailResult(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  const unitId = typeof body?.id === 'string' ? body.id : '';
  const startTime = asFiniteNumber(body?.startTime);
  const endTime = asFiniteNumber(body?.endTime);
  const timeLabel =
    startTime !== undefined && endTime !== undefined
      ? `${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`
      : '';
  if (result.name === 'get_unit_linguistic_memory') {
    const coverage = asObjectRecord(body?.coverage);
    const translationCount = asFiniteNumber(coverage?.translationCount) ?? 0;
    const tokenCount = asFiniteNumber(coverage?.tokenCount) ?? 0;
    return zh
      ? `我已读取语段 ${unitId || ''}${timeLabel ? `（${timeLabel}）` : ''} 的语言学信息，包含 ${translationCount} 条译文、${tokenCount} 个词项。`
      : `I loaded the linguistic details for segment ${unitId || ''}${timeLabel ? ` (${timeLabel})` : ''}, including ${translationCount} translations and ${tokenCount} tokens.`;
  }
  return zh
    ? `我已定位到语段 ${unitId || ''}${timeLabel ? `（${timeLabel}）` : ''}。`
    : `I located segment ${unitId || ''}${timeLabel ? ` (${timeLabel})` : ''}.`;
}

export function isUntranscribedQuestion(userText?: string): boolean {
  return /(未转写|未完成转写|空文本|还没转写|还剩|剩余|unfinished|untranscribed|remaining)/i.test(
    userText ?? '',
  );
}

export function isMissingSpeakerQuestion(userText?: string): boolean {
  return /(缺少说话人|未标说话人|missing\s+speaker|speaker\s+missing)/i.test(userText ?? '');
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function findCategoryCount(
  body: Record<string, unknown>,
  category: string,
): number | undefined {
  const items = Array.isArray(body.items) ? body.items : [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (row.category === category) {
      return asFiniteNumber(row.count);
    }
  }
  return undefined;
}

export function summarizeDiagnoseQualityResult(
  body: Record<string, unknown>,
  locale?: string,
  userText?: string,
): string {
  const zh = isZhLocale(locale);
  const meta = asObject(body.meta);
  const scopeLabel = humanizeScope(body.scope ?? meta?.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric ?? meta?.requestedMetric);
  const breakdown = asObject(body.breakdown) ?? asObject(meta?.breakdown);
  const valueFromPayload = asFiniteNumber(body.value) ?? asFiniteNumber(meta?.value);
  const untranscribedCount =
    valueFromPayload ??
    asFiniteNumber(breakdown?.emptyTextCount) ??
    findCategoryCount(body, 'empty_text');
  const missingSpeakerCount =
    valueFromPayload ??
    asFiniteNumber(breakdown?.missingSpeakerCount) ??
    findCategoryCount(body, 'missing_speaker');

  if (
    metric === 'untranscribed_count' ||
    (metric === undefined && isUntranscribedQuestion(userText))
  ) {
    if (untranscribedCount !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${untranscribedCount} 条未转写语段。`
        : `There are ${untranscribedCount} untranscribed segments in ${scopeLabel}.`;
    }
  }

  if (
    metric === 'missing_speaker_count' ||
    (metric === undefined && isMissingSpeakerQuestion(userText))
  ) {
    if (missingSpeakerCount !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${missingSpeakerCount} 条语段缺少说话人。`
        : `There are ${missingSpeakerCount} segments missing speakers in ${scopeLabel}.`;
    }
  }

  const issueCount = asFiniteNumber(body.count) ?? 0;
  if (issueCount === 0) {
    return zh
      ? `${scopeLabel}目前没有明显质量问题。`
      : `There are no obvious quality issues in ${scopeLabel}.`;
  }
  return zh
    ? `我已检查${scopeLabel}的质量问题，共发现 ${issueCount} 类异常。`
    : `I checked quality issues in ${scopeLabel} and found ${issueCount} categories.`;
}

export function summarizeLocalContextToolResult(
  result: LocalContextToolResult,
  locale?: string,
  userText?: string,
): string {
  const zh = isZhLocale(locale);
  if (!result.ok) {
    const reason = result.error ?? 'unknown_error';
    return zh
      ? `我尝试读取相关上下文，但这一步没有成功：${reason}。请再说明一下你想查询当前音频、当前范围，还是整个项目。`
      : `I tried to read the relevant context, but this step did not succeed: ${reason}. Please tell me whether you mean the current audio, the current scope, or the whole project.`;
  }

  const body = asObjectRecord(result.result);
  switch (result.name) {
    case 'get_current_selection':
      return summarizeCurrentSelectionResult(body ?? {}, locale, userText);
    case 'list_layers': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取当前工作区层清单，共 ${count} 个层。`
        : `I checked the workspace layer list: ${count} layers.`;
    }
    case 'list_layer_links': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取层链接关系，共 ${count} 条链接。`
        : `I checked layer links: ${count} links.`;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取当前未保存草稿，共 ${count} 条。`
        : `I checked current unsaved drafts: ${count}.`;
    }
    case 'list_speakers': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取当前说话人清单，共 ${count} 位。`
        : `I checked the speaker list: ${count} speakers.`;
    }
    case 'list_notes': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取当前笔记摘要，共 ${count} 条。`
        : `I checked note summary: ${count} notes.`;
    }
    case 'list_notes_detail': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh
        ? `我已读取范围内最近笔记明细，共 ${count} 条。`
        : `I checked recent scoped notes: ${count} entries.`;
    }
    case 'get_visible_timeline_state':
      return zh ? '我已读取当前可见时间轴状态。' : 'I checked the current visible timeline state.';
    case 'get_speaker_breakdown': {
      const total = asFiniteNumber(body?.totalRows);
      return zh
        ? `我已按说话人汇总语段行数${total !== undefined ? `（共 ${total} 行）` : ''}。`
        : `I summarized per-speaker row counts${total !== undefined ? ` (${total} rows)` : ''}.`;
    }
    case 'get_project_stats':
      return summarizeProjectStatsResult(body ?? {}, locale, userText);
    case 'list_units':
    case 'search_units':
      return summarizeListLikeResult(result, locale);
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return summarizeDetailResult(result, locale);
    case 'diagnose_quality':
      return summarizeDiagnoseQualityResult(body ?? {}, locale, userText);
    case 'get_waveform_analysis': {
      const unavailable = body?.ok === false && body?.reason === 'no_playable_media';
      if (unavailable) {
        return zh
          ? '当前没有可播放媒体，暂时无法读取波形分析信息。'
          : 'There is no playable media right now, so waveform analysis is unavailable.';
      }
      return zh
        ? '我已读取当前音频的波形分析信息。'
        : 'I checked the waveform analysis for the current audio.';
    }
    case 'get_acoustic_summary': {
      const unavailable = body?.ok === false && body?.reason === 'no_playable_media';
      if (unavailable) {
        return zh
          ? '当前没有可播放媒体，暂时无法读取声学摘要。'
          : 'There is no playable media right now, so the acoustic summary is unavailable.';
      }
      return zh
        ? '我已读取当前选中范围的声学摘要。'
        : 'I checked the acoustic summary for the current selection.';
    }
    default:
      return zh ? '我已完成这一步本地查询。' : 'I completed this local lookup.';
  }
}
