import { AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS, AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS, AI_LOCAL_TOOL_RESULT_CHAR_BUDGET } from '../../hooks/useAiChat.config';
import { createMetricTags, recordMetric } from '../../observability/metrics';
import type { LocalContextToolResult } from './localContextToolTypes';
import { normalizeProjectMetric, normalizeUnitScope } from './localContextToolScopeNormalize';

/** @see AI_LOCAL_TOOL_RESULT_CHAR_BUDGET in `useAiChat.config.ts` */
const LOCAL_TOOL_RESULT_CHAR_BUDGET = AI_LOCAL_TOOL_RESULT_CHAR_BUDGET;

const TOOL_RESULT_TRUNCATION_WARNING = '\n\nNote: some internal details were omitted because the result was too long. 如需更具体结果，请告诉我缩小查询范围。';

function applyLocalToolResultCharBudget(
  payload: string,
  meta: { scope: 'single' | 'batch' | 'agent_loop'; toolName?: string },
): { limitedPayload: string; truncated: boolean } {
  const truncated = payload.length > LOCAL_TOOL_RESULT_CHAR_BUDGET;
  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: meta.scope,
        ...(meta.toolName !== undefined ? { toolName: meta.toolName } : {}),
        payloadChars: payload.length,
      }),
    });
  }
  const limitedPayload = truncated
    ? `${payload.slice(0, LOCAL_TOOL_RESULT_CHAR_BUDGET)}...`
    : payload;
  return { limitedPayload, truncated };
}

function isZhLocale(locale?: string): boolean {
  return (locale ?? '').toLowerCase().startsWith('zh');
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isSpeakerCountQuestion(userText?: string): boolean {
  return /(speaker|speakers|说话人|发言人)/i.test(userText ?? '');
}

function humanizeScope(scope: unknown, locale?: string): string {
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

function summarizeCurrentSelectionResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const currentTrackCount = asFiniteNumber(body.currentMediaUnitCount);
  const currentScopeCount = asFiniteNumber(body.currentScopeUnitCount);
  const projectCount = asFiniteNumber(body.projectUnitCount);

  if (isSpeakerCountQuestion(userText)) {
    const knownBits: string[] = [];
    if (currentTrackCount !== undefined) {
      knownBits.push(zh ? `当前音频里有 ${currentTrackCount} 条语段` : `the current audio has ${currentTrackCount} segments`);
    }
    if (projectCount !== undefined && projectCount !== currentTrackCount) {
      knownBits.push(zh ? `整个项目共有 ${projectCount} 条语段` : `the whole project has ${projectCount} segments`);
    }
    const knownSummary = knownBits.length > 0
      ? (zh ? `我先确认到这些上下文：${knownBits.join('；')}。` : `I confirmed this context first: ${knownBits.join('; ')}.`)
      : (zh ? '我先确认了当前上下文。' : 'I checked the current context first.');
    return zh
      ? `${knownSummary}不过这一步还没有直接的说话人统计。你是想问当前音频，还是整个项目的说话人数？`
      : `${knownSummary} This step does not include a direct speaker count yet. Do you mean the current audio or the whole project speaker count?`;
  }

  const details: string[] = [];
  if (currentTrackCount !== undefined) details.push(zh ? `当前音频共有 ${currentTrackCount} 条语段` : `${currentTrackCount} segments are on the current audio`);
  if (currentScopeCount !== undefined) details.push(zh ? `当前范围共有 ${currentScopeCount} 条语段` : `${currentScopeCount} segments are in the current scope`);
  if (projectCount !== undefined && projectCount !== currentTrackCount) details.push(zh ? `整个项目共有 ${projectCount} 条语段` : `${projectCount} segments exist in the whole project`);

  if (details.length === 0) {
    return zh ? '我已读取当前上下文。' : 'I checked the current context.';
  }
  return zh
    ? `我已读取当前上下文：${details.join('；')}。`
    : `I checked the current context: ${details.join('; ')}.`;
}

function summarizeProjectStatsResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const scopeLabel = humanizeScope(body.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric);
  const requestedMetricRaw = typeof body.requestedMetric === 'string' ? body.requestedMetric : '';
  const unitCount = asFiniteNumber(body.unitCount);
  const speakerCount = asFiniteNumber(body.speakerCount);
  const translationLayerCount = asFiniteNumber(body.translationLayerCount);
  const aiConfidenceAvg = typeof body.aiConfidenceAvg === 'number' && Number.isFinite(body.aiConfidenceAvg)
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
    const conclusion = requestedMetricRaw === 'speaker_count' && speakerCount !== undefined
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
    if (aiConfidenceAvg !== undefined) evidenceBits.push(`平均置信度 ${aiConfidenceAvg.toFixed(3)}`);
    const readModel = asObject(body._readModel);
    const isComplete = readModel?.unitIndexComplete === true;
    const uncertainty = isComplete
      ? '当前读模型快照完整，暂无明显不确定项。'
      : '当前读模型可能未完全同步，建议在最新范围下复查一次。';
    const nextStep = requestedMetricRaw === 'speaker_count'
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
  if (speakerCount !== undefined) bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
  if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
  if (translationLayerCount !== undefined) bits.push(zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`);
  if (aiConfidenceAvg !== undefined) bits.push(zh ? `平均置信度 ${aiConfidenceAvg.toFixed(3)}` : `average confidence ${aiConfidenceAvg.toFixed(3)}`);

  if (bits.length === 0) {
    return zh ? `我已读取${scopeLabel}的统计信息。` : `I checked the stats for ${scopeLabel}.`;
  }
  return zh
    ? `我已读取${scopeLabel}的统计：${bits.join('，')}。`
    : `I checked the stats for ${scopeLabel}: ${bits.join(', ')}.`;
}

function summarizeListLikeResult(result: LocalContextToolResult, locale?: string): string {
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

function summarizeDetailResult(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  const unitId = typeof body?.id === 'string' ? body.id : '';
  const startTime = asFiniteNumber(body?.startTime);
  const endTime = asFiniteNumber(body?.endTime);
  const timeLabel = startTime !== undefined && endTime !== undefined
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

function isUntranscribedQuestion(userText?: string): boolean {
  return /(未转写|未完成转写|空文本|还没转写|还剩|剩余|unfinished|untranscribed|remaining)/i.test(userText ?? '');
}

function isMissingSpeakerQuestion(userText?: string): boolean {
  return /(缺少说话人|未标说话人|missing\s+speaker|speaker\s+missing)/i.test(userText ?? '');
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function findCategoryCount(body: Record<string, unknown>, category: string): number | undefined {
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

function summarizeDiagnoseQualityResult(body: Record<string, unknown>, locale?: string, userText?: string): string {
  const zh = isZhLocale(locale);
  const meta = asObject(body.meta);
  const scopeLabel = humanizeScope(body.scope ?? meta?.scope, locale);
  const metric = normalizeProjectMetric(body.requestedMetric ?? meta?.requestedMetric);
  const breakdown = asObject(body.breakdown) ?? asObject(meta?.breakdown);
  const valueFromPayload = asFiniteNumber(body.value) ?? asFiniteNumber(meta?.value);
  const untranscribedCount = valueFromPayload
    ?? asFiniteNumber(breakdown?.emptyTextCount)
    ?? findCategoryCount(body, 'empty_text');
  const missingSpeakerCount = valueFromPayload
    ?? asFiniteNumber(breakdown?.missingSpeakerCount)
    ?? findCategoryCount(body, 'missing_speaker');

  if (metric === 'untranscribed_count' || (metric === undefined && isUntranscribedQuestion(userText))) {
    if (untranscribedCount !== undefined) {
      return zh
        ? `${scopeLabel}还有 ${untranscribedCount} 条未转写语段。`
        : `There are ${untranscribedCount} untranscribed segments in ${scopeLabel}.`;
    }
  }

  if (metric === 'missing_speaker_count' || (metric === undefined && isMissingSpeakerQuestion(userText))) {
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

function summarizeLocalContextToolResult(
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
      return zh ? `我已读取当前工作区层清单，共 ${count} 个层。` : `I checked the workspace layer list: ${count} layers.`;
    }
    case 'list_layer_links': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取层链接关系，共 ${count} 条链接。` : `I checked layer links: ${count} links.`;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前未保存草稿，共 ${count} 条。` : `I checked current unsaved drafts: ${count}.`;
    }
    case 'list_speakers': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前说话人清单，共 ${count} 位。` : `I checked the speaker list: ${count} speakers.`;
    }
    case 'list_notes': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取当前笔记摘要，共 ${count} 条。` : `I checked note summary: ${count} notes.`;
    }
    case 'list_notes_detail': {
      const count = asFiniteNumber(body?.count) ?? 0;
      return zh ? `我已读取范围内最近笔记明细，共 ${count} 条。` : `I checked recent scoped notes: ${count} entries.`;
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
      return zh ? '我已读取当前音频的波形分析信息。' : 'I checked the waveform analysis for the current audio.';
    }
    case 'get_acoustic_summary': {
      const unavailable = body?.ok === false && body?.reason === 'no_playable_media';
      if (unavailable) {
        return zh
          ? '当前没有可播放媒体，暂时无法读取声学摘要。'
          : 'There is no playable media right now, so the acoustic summary is unavailable.';
      }
      return zh ? '我已读取当前选中范围的声学摘要。' : 'I checked the acoustic summary for the current selection.';
    }
    default:
      return zh ? '我已完成这一步本地查询。' : 'I completed this local lookup.';
  }
}

function previewPlainText(value: unknown, maxChars = 48): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed;
}

function joinStructuredBits(bits: string[], locale?: string): string {
  const zh = isZhLocale(locale);
  return bits.length > 0
    ? bits.join(zh ? '；' : '; ')
    : (zh ? '当前没有额外的结构化证据。' : 'There is no additional structured evidence in this result.');
}

function buildLocalToolEvidenceText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  if (!body) {
    return zh ? '当前结果没有返回结构化字段。' : 'The current result did not return structured fields.';
  }

  const bits: string[] = [];
  const scopeLabel = result.name === 'get_current_selection'
    ? (zh ? '当前上下文' : 'current context')
    : humanizeScope(body.scope, locale);

  switch (result.name) {
    case 'get_project_stats': {
      const unitCount = asFiniteNumber(body.unitCount);
      const speakerCount = asFiniteNumber(body.speakerCount);
      const translationLayerCount = asFiniteNumber(body.translationLayerCount);
      const value = asFiniteNumber(body.value);
      if (speakerCount !== undefined) bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
      if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
      if (translationLayerCount !== undefined) bits.push(zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`);
      if (value !== undefined && value !== unitCount && value !== speakerCount && value !== translationLayerCount) {
        bits.push(zh ? `目标指标值 ${value}` : `target metric value ${value}`);
      }
      break;
    }
    case 'list_layers': {
      const count = asFiniteNumber(body.count);
      const layers = Array.isArray(body.layers) ? body.layers : [];
      if (count !== undefined) bits.push(zh ? `${count} 个层` : `${count} layers`);
      const selected = layers.find((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).isSelected === true);
      if (selected && typeof selected === 'object' && !Array.isArray(selected)) {
        const row = selected as Record<string, unknown>;
        const label = previewPlainText(row.label ?? row.key ?? row.id);
        if (label) bits.push(zh ? `当前选中层 ${label}` : `selected layer ${label}`);
      }
      break;
    }
    case 'list_layer_links': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条层链接` : `${count} layer links`);
      const links = Array.isArray(body.links) ? body.links : [];
      const preferredCount = links.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, unknown>).isPreferred === true).length;
      if (preferredCount > 0) bits.push(zh ? `${preferredCount} 条首选链接` : `${preferredCount} preferred links`);
      break;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body.count);
      const unitDraftCount = asFiniteNumber(body.unitDraftCount);
      const translationDraftCount = asFiniteNumber(body.translationDraftCount);
      if (count !== undefined) bits.push(zh ? `${count} 条未保存草稿` : `${count} unsaved drafts`);
      if (unitDraftCount !== undefined) bits.push(zh ? `转写/语段草稿 ${unitDraftCount}` : `${unitDraftCount} unit drafts`);
      if (translationDraftCount !== undefined) bits.push(zh ? `译文草稿 ${translationDraftCount}` : `${translationDraftCount} translation drafts`);
      break;
    }
    case 'list_speakers': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 位说话人` : `${count} speakers`);
      const speakers = Array.isArray(body.speakers) ? body.speakers : [];
      const first = speakers[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const name = previewPlainText(row.name ?? row.id);
        if (name) bits.push(zh ? `示例 ${name}` : `example ${name}`);
      }
      break;
    }
    case 'list_notes': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条笔记` : `${count} notes`);
      const byCategory = asObject(body.byCategory);
      if (byCategory) {
        const top = Object.entries(byCategory).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        if (top && Number.isFinite(Number(top[1]))) {
          bits.push(zh ? `最多类别 ${top[0]}=${top[1]}` : `top category ${top[0]}=${top[1]}`);
        }
      }
      break;
    }
    case 'list_notes_detail': {
      const count = asFiniteNumber(body.count);
      if (count !== undefined) bits.push(zh ? `${count} 条明细` : `${count} detail rows`);
      const notes = Array.isArray(body.notes) ? body.notes : [];
      const first = notes[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const preview = previewPlainText(row.contentPreview);
        const cat = previewPlainText(row.category);
        if (preview || cat) {
          bits.push(zh ? `最新 ${cat || 'note'}：${preview || '…'}` : `latest ${cat || 'note'}: ${preview || '…'}`);
        }
      }
      break;
    }
    case 'get_visible_timeline_state': {
      const mediaFilename = previewPlainText(body.currentMediaFilename);
      const focusedLayerId = previewPlainText(body.focusedLayerId);
      const selectedUnitCount = asFiniteNumber(body.selectedUnitCount);
      if (mediaFilename) bits.push(zh ? `当前媒体 ${mediaFilename}` : `current media ${mediaFilename}`);
      if (focusedLayerId) bits.push(zh ? `焦点层 ${focusedLayerId}` : `focused layer ${focusedLayerId}`);
      if (selectedUnitCount !== undefined) bits.push(zh ? `已选 ${selectedUnitCount} 条` : `${selectedUnitCount} selected`);
      const zoomPercent = asFiniteNumber(body.zoomPercent);
      if (zoomPercent !== undefined) bits.push(zh ? `缩放 ${zoomPercent}%` : `zoom ${zoomPercent}%`);
      break;
    }
    case 'get_speaker_breakdown': {
      const distinct = asFiniteNumber(body.distinctLabeledSpeakers);
      const unlabeled = asFiniteNumber(body.unlabeledRowCount);
      if (distinct !== undefined) bits.push(zh ? `已标注说话人 ${distinct} 位` : `${distinct} labeled speakers`);
      if (unlabeled !== undefined && unlabeled > 0) {
        bits.push(zh ? `未标注 ${unlabeled} 行` : `${unlabeled} unlabeled rows`);
      }
      const breakdown = Array.isArray(body.breakdown) ? body.breakdown : [];
      const top = breakdown[0];
      if (top && typeof top === 'object' && !Array.isArray(top)) {
        const row = top as Record<string, unknown>;
        const label = previewPlainText(row.displayName);
        const n = asFiniteNumber(row.unitCount);
        if (label && n !== undefined) bits.push(zh ? `最多 ${label} ${n} 行` : `top ${label} ${n} rows`);
      }
      break;
    }
    case 'list_units':
    case 'search_units': {
      const count = asFiniteNumber(body.count) ?? asFiniteNumber(body.total);
      if (count !== undefined) bits.push(zh ? `${scopeLabel}命中 ${count} 条` : `${count} matches in ${scopeLabel}`);
      const matches = Array.isArray(body.matches) ? body.matches : [];
      const first = matches[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const firstId = typeof row.id === 'string' ? row.id : '';
        const textPreview = previewPlainText(row.transcription ?? row.text);
        if (firstId || textPreview) {
          bits.push(zh
            ? `示例 ${firstId || '首条'}${textPreview ? `：${textPreview}` : ''}`
            : `example ${firstId || 'first item'}${textPreview ? `: ${textPreview}` : ''}`);
        }
      }
      break;
    }
    case 'get_unit_detail': {
      const unitId = typeof body.id === 'string' ? body.id : '';
      const startTime = asFiniteNumber(body.startTime);
      const endTime = asFiniteNumber(body.endTime);
      const transcription = previewPlainText(body.transcription);
      if (unitId) bits.push(zh ? `语段 ID ${unitId}` : `segment ID ${unitId}`);
      if (startTime !== undefined && endTime !== undefined) {
        bits.push(zh ? `时间 ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s` : `time ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`);
      }
      if (transcription) bits.push(zh ? `文本“${transcription}”` : `text “${transcription}”`);
      break;
    }
    case 'get_unit_linguistic_memory': {
      const coverage = asObject(body.coverage);
      const tokenCount = asFiniteNumber(coverage?.tokenCount);
      const translationCount = asFiniteNumber(coverage?.translationCount);
      if (translationCount !== undefined) bits.push(zh ? `${translationCount} 条译文` : `${translationCount} translations`);
      if (tokenCount !== undefined) bits.push(zh ? `${tokenCount} 个词项` : `${tokenCount} tokens`);
      break;
    }
    case 'diagnose_quality': {
      const count = asFiniteNumber(body.count);
      const breakdown = asObject(body.breakdown) ?? asObject(asObject(body.meta)?.breakdown);
      const emptyTextCount = asFiniteNumber(breakdown?.emptyTextCount);
      const missingSpeakerCount = asFiniteNumber(breakdown?.missingSpeakerCount);
      const completionRate = asFiniteNumber(body.completionRate) ?? asFiniteNumber(asObject(body.meta)?.completionRate);
      if (count !== undefined) bits.push(zh ? `${count} 类质量问题` : `${count} quality issue categories`);
      if (emptyTextCount !== undefined) bits.push(zh ? `${emptyTextCount} 条未转写` : `${emptyTextCount} untranscribed`);
      if (missingSpeakerCount !== undefined) bits.push(zh ? `${missingSpeakerCount} 条缺少说话人` : `${missingSpeakerCount} missing speakers`);
      if (completionRate !== undefined) bits.push(zh ? `完成率 ${(completionRate * 100).toFixed(1)}%` : `completion ${(completionRate * 100).toFixed(1)}%`);
      break;
    }
    case 'get_current_selection': {
      const currentScopeUnitCount = asFiniteNumber(body.currentScopeUnitCount);
      const currentMediaUnitCount = asFiniteNumber(body.currentMediaUnitCount);
      const projectUnitCount = asFiniteNumber(body.projectUnitCount);
      if (currentScopeUnitCount !== undefined) bits.push(zh ? `当前范围 ${currentScopeUnitCount} 条` : `${currentScopeUnitCount} segments in the current scope`);
      if (currentMediaUnitCount !== undefined) bits.push(zh ? `当前音频 ${currentMediaUnitCount} 条` : `${currentMediaUnitCount} segments in the current audio`);
      if (projectUnitCount !== undefined) bits.push(zh ? `整个项目 ${projectUnitCount} 条` : `${projectUnitCount} segments in the whole project`);
      break;
    }
    default:
      bits.push(zh ? `已完成 ${scopeLabel} 的本地读取` : `local read completed for ${scopeLabel}`);
      break;
  }

  const readModel = asObject(body._readModel);
  const source = typeof readModel?.source === 'string' ? readModel.source.trim() : '';
  if (source) {
    bits.push(zh ? `读取来源 ${source}` : `read source ${source}`);
  }

  return joinStructuredBits(bits, locale);
}

function buildLocalToolScopeText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  if (result.name === 'get_current_selection') {
    return zh ? '当前上下文（选区、当前音频与项目级状态）。' : 'Current context (selection, current audio, and project-level state).';
  }
  return zh
    ? `本次查询范围：${humanizeScope(body?.scope, locale)}。`
    : `This query used ${humanizeScope(body?.scope, locale)}.`;
}

function buildLocalToolUncertaintyText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  if (!result.ok) {
    const reason = result.error ?? 'unknown_error';
    return zh
      ? `这一步尚未成功，错误原因为 ${reason}。`
      : `This step did not complete successfully. Reported reason: ${reason}.`;
  }

  const body = asObjectRecord(result.result);
  const readModel = asObject(body?._readModel);
  if (readModel?.unitIndexComplete === false) {
    return zh
      ? '当前时间轴索引仍在加载，数量类结果可能偏少。'
      : 'The timeline index is still loading, so count-like results may be low.';
  }
  if (result.name === 'search_units' || result.name === 'list_units') {
    const count = asFiniteNumber(body?.count) ?? 0;
    if (count === 0) {
      return zh
        ? '本次没有命中结果，可能是关键词过窄，或当前范围内确实为空。'
        : 'This lookup returned no hits; the keyword may be narrow, or the current scope may truly be empty.';
    }
  }
  if (result.name === 'get_project_stats' && asFiniteNumber(body?.speakerCount) === undefined) {
    return zh
      ? '说话人数依赖已标注的说话人信息；未标注部分不会被计入。'
      : 'Speaker counts depend on existing speaker labels; unlabeled items are not counted.';
  }
  return zh
    ? '当前结果基于本地快照；如果你刚修改过内容，我可以继续复核明细。'
    : 'This answer is based on the local snapshot; if you edited content just now, I can re-check the details.';
}

function buildLocalToolNextStepText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  switch (result.name) {
    case 'get_project_stats':
    case 'diagnose_quality':
      return zh
        ? '我可以继续列出具体语段、缺失项，或只看当前范围。'
        : 'I can next list the exact segments, the missing items, or narrow this to the current scope.';
    case 'list_units':
    case 'search_units':
      return zh
        ? '告诉我第几个语段或直接给语段 ID，我就继续展开详情。'
        : 'Tell me which segment number or ID you want, and I can open the details.';
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return zh
        ? '如果需要，我可以继续查看译文、词法标注或相关质量问题。'
        : 'If needed, I can continue with translations, linguistic annotations, or related quality issues.';
    case 'get_current_selection':
      return zh
        ? '你可以继续指定想看的指标，例如语段数、说话人数或缺失项。'
        : 'You can now name the exact metric you want, such as segment count, speaker count, or missing items.';
    case 'list_layers':
      return zh
        ? '我可以继续查看层链接、每层语段，或未保存草稿。'
        : 'I can next check layer links, per-layer segments, or unsaved drafts.';
    case 'list_layer_links':
      return zh
        ? '我可以继续按翻译层列出宿主关系，或检查孤儿/首选链接。'
        : 'I can next list host relationships by translation layer or check orphan/preferred links.';
    case 'get_unsaved_drafts':
      return zh
        ? '我可以继续定位这些草稿对应的语段或层。'
        : 'I can next locate the segment or layer for these drafts.';
    case 'list_speakers':
      return zh
        ? '我可以继续按说话人统计语段，或只看当前媒体。'
        : 'I can next break down segments by speaker or scope this to the current media.';
    case 'list_notes':
      return zh
        ? '我可以继续展开各类别笔记，或定位到当前焦点语段。'
        : 'I can next expand note categories or locate the focused target unit.';
    case 'get_visible_timeline_state':
      return zh
        ? '我可以继续按当前焦点层/选区读取更细的语段详情。'
        : 'I can next read finer segment details for the focused layer or current selection.';
    case 'list_notes_detail':
      return zh
        ? '如果需要，我可以按语段 ID 展开单条笔记或改用摘要统计。'
        : 'If needed, I can open a single note by segment ID or switch back to the summary counts.';
    case 'get_speaker_breakdown':
      return zh
        ? '我可以继续列出某一说话人的具体语段，或切换到整个项目的语段列表。'
        : 'I can next list concrete segments for one speaker, or switch to a project-wide segment list.';
    default:
      return zh ? '告诉我你想继续到哪一步，我会沿着当前结果往下做。' : 'Tell me the next step you want, and I will continue from this result.';
  }
}

function formatStructuredLocalToolAnswer(
  result: LocalContextToolResult,
  locale: string,
  userText: string,
): string {
  const zh = isZhLocale(locale);
  const summary = summarizeLocalContextToolResult(result, locale, userText);
  const sections = [
    `${zh ? '结论：' : 'Conclusion: '}${summary}`,
    `${zh ? '证据：' : 'Evidence: '}${buildLocalToolEvidenceText(result, locale)}`,
    `${zh ? '范围：' : 'Scope: '}${buildLocalToolScopeText(result, locale)}`,
    `${zh ? '不确定项：' : 'Uncertainty: '}${buildLocalToolUncertaintyText(result, locale)}`,
    `${zh ? '建议下一步：' : 'Suggested next step: '}${buildLocalToolNextStepText(result, locale)}`,
  ];
  return sections.join('\n');
}

export function formatLocalContextToolResultMessage(
  result: LocalContextToolResult,
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = result.ok
    ? JSON.stringify(result.result, null, 2)
    : JSON.stringify({ error: result.error ?? 'unknown_error', result: result.result }, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, {
    scope: 'single',
    toolName: result.name,
  });
  const summary = formatStructuredLocalToolAnswer(result, locale, userText);
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}

export function formatLocalContextToolBatchResultMessage(
  results: LocalContextToolResult[],
  locale: string = 'en-US',
  userText = '',
): string {
  const payload = JSON.stringify(results, null, 2);
  const { truncated } = applyLocalToolResultCharBudget(payload, { scope: 'batch' });
  const zh = isZhLocale(locale);
  const successCount = results.filter((item) => item.ok).length;
  const failedCount = results.length - successCount;
  const evidence = results
    .slice(0, 2)
    .map((item) => summarizeLocalContextToolResult(item, locale, userText).replace(/[。.]$/, ''))
    .join(zh ? '；' : '; ');
  const scopeLabels = Array.from(new Set(results.map((item) => {
    const body = asObjectRecord(item.result);
    return item.name === 'get_current_selection'
      ? (zh ? '当前上下文' : 'current context')
      : humanizeScope(body?.scope, locale);
  })));
  const summary = [
    `${zh ? '结论：' : 'Conclusion: '}${zh ? `已完成 ${results.length} 项本地查询，其中成功 ${successCount} 项。` : `Completed ${results.length} local lookups, with ${successCount} successful.`}`,
    `${zh ? '证据：' : 'Evidence: '}${evidence || (zh ? '当前批次没有返回更多细节。' : 'This batch did not return extra detail.')}`,
    `${zh ? '范围：' : 'Scope: '}${scopeLabels.join(zh ? '、' : ', ')}`,
    `${zh ? '不确定项：' : 'Uncertainty: '}${failedCount > 0
      ? (zh ? `仍有 ${failedCount} 项需要进一步澄清或重试。` : `${failedCount} items still need clarification or retry.`)
      : (zh ? '当前批次未发现明显冲突。' : 'No obvious conflict was found in this batch.')}`,
    `${zh ? '建议下一步：' : 'Suggested next step: '}${failedCount > 0
      ? (zh ? '先缩小范围或补充关键词，我可以继续处理失败项。' : 'First narrow the scope or add a keyword, and I can continue with the failed items.')
      : (zh ? '如果需要，我可以继续展开某一项的详情。' : 'If needed, I can now expand the details of any one result.')}`,
  ].join('\n');
  return truncated ? `${summary}${TOOL_RESULT_TRUNCATION_WARNING}` : summary;
}

function cloneLocalToolResultsForAgentLoop(results: LocalContextToolResult[]): LocalContextToolResult[] {
  return JSON.parse(JSON.stringify(results)) as LocalContextToolResult[];
}

function agentLoopContinuationPayloadJson(
  cappedUserRequest: string,
  results: LocalContextToolResult[],
  step: number,
): string {
  return JSON.stringify({
    type: 'local_tool_result',
    step,
    originalUserRequest: cappedUserRequest,
    results,
  });
}

function truncateMatchTranscriptionsForAgentLoop(results: LocalContextToolResult[]): boolean {
  let changed = false;
  for (const item of results) {
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const body = item.result as Record<string, unknown>;
    const matches = body.matches;
    if (!Array.isArray(matches)) continue;
    for (const m of matches) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      const row = m as Record<string, unknown>;
      const t = row.transcription;
      if (typeof t === 'string' && t.length > AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS) {
        row.transcription = `${t.slice(0, AI_AGENT_LOOP_MATCH_TRANSCRIPTION_PREVIEW_MAX_CHARS)}…`;
        changed = true;
      }
    }
  }
  return changed;
}

function popLongestMatchesRowForAgentLoop(results: LocalContextToolResult[]): boolean {
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i]!;
    if (!item.ok || item.result === null || typeof item.result !== 'object' || Array.isArray(item.result)) continue;
    const matches = (item.result as Record<string, unknown>).matches;
    if (Array.isArray(matches) && matches.length > bestLen) {
      bestLen = matches.length;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestLen <= 0) return false;
  const matches = (results[bestIdx]!.result as Record<string, unknown>).matches as unknown[];
  matches.pop();
  return true;
}

function truncateDeepStringsForAgentLoop(value: unknown, maxLen: number): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const el of value) truncateDeepStringsForAgentLoop(el, maxLen);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > maxLen) {
      obj[key] = `${v.slice(0, maxLen)}…`;
    } else {
      truncateDeepStringsForAgentLoop(v, maxLen);
    }
  }
}

/**
 * Fits `local_tool_result` JSON (agent loop continuation) under {@link LOCAL_TOOL_RESULT_CHAR_BUDGET}
 * while keeping valid JSON: trim `matches[].transcription`, drop tail `matches`, then deep-string trim.
 * Records `ai.local_tool_result_truncated` when any shrink was applied.
 */
export function buildAgentLoopContinuationToolPayload(
  originalUserText: string,
  localToolResults: LocalContextToolResult[],
  step: number,
  charBudget = LOCAL_TOOL_RESULT_CHAR_BUDGET,
): { payloadJson: string; truncated: boolean; originalPayloadChars: number; cappedUserRequest: string } {
  const cappedUserRequest = originalUserText.length <= AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS
    ? originalUserText
    : `${originalUserText.slice(0, AI_AGENT_LOOP_USER_REQUEST_MAX_CHARS)}…`;
  const userRequestWasCapped = cappedUserRequest !== originalUserText;

  const working = cloneLocalToolResultsForAgentLoop(localToolResults);
  const originalPayloadChars = agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length;
  if (originalPayloadChars <= charBudget) {
    if (userRequestWasCapped) {
      recordMetric({
        id: 'ai.local_tool_result_truncated',
        value: 1,
        tags: createMetricTags('localContextTools', {
          scope: 'agent_loop',
          payloadChars: originalPayloadChars,
        }),
      });
    }
    return {
      payloadJson: agentLoopContinuationPayloadJson(cappedUserRequest, working, step),
      truncated: userRequestWasCapped,
      originalPayloadChars,
      cappedUserRequest,
    };
  }

  let truncated = userRequestWasCapped;
  let steps = 0;
  while (
    agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget
    && steps < AI_AGENT_LOOP_PAYLOAD_SHRINK_MAX_STEPS
  ) {
    steps += 1;
    truncated = true;
    if (truncateMatchTranscriptionsForAgentLoop(working)) continue;
    if (popLongestMatchesRowForAgentLoop(working)) continue;
    break;
  }

  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncated = true;
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS1);
  }
  if (agentLoopContinuationPayloadJson(cappedUserRequest, working, step).length > charBudget) {
    truncateDeepStringsForAgentLoop(working, AI_AGENT_LOOP_DEEP_STRING_MAX_CHARS_PASS2);
  }

  const finalJson = agentLoopContinuationPayloadJson(cappedUserRequest, working, step);
  if (finalJson.length > charBudget) {
    truncated = true;
    const minimal: LocalContextToolResult[] = working.map((r) => ({
      ok: r.ok,
      name: r.name,
      result: r.ok ? { _agentLoopPayloadTooLarge: true, tool: r.name } : r.result,
      ...(r.error !== undefined ? { error: r.error } : {}),
    }));
    const fallbackJson = agentLoopContinuationPayloadJson(cappedUserRequest, minimal, step);
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
    return { payloadJson: fallbackJson, truncated, originalPayloadChars, cappedUserRequest };
  }

  if (truncated) {
    recordMetric({
      id: 'ai.local_tool_result_truncated',
      value: 1,
      tags: createMetricTags('localContextTools', {
        scope: 'agent_loop',
        payloadChars: originalPayloadChars,
      }),
    });
  }

  return { payloadJson: finalJson, truncated, originalPayloadChars, cappedUserRequest };
}

