/**
 * structuredAnswer — Five-section structured answer assembly
 * Extracted from localContextToolFormatters.ts
 */

import type { LocalContextToolResult } from '../localContextToolTypes';
import {
  isZhLocale,
  asObjectRecord,
  asFiniteNumber,
  asObject,
  summarizeLocalContextToolResult,
  humanizeScope,
} from './summarizers';
import {
  STRUCTURED_ANSWER_EMPTY_EN,
  STRUCTURED_ANSWER_EMPTY_ZH,
} from '../../messages/structuredAnswerCopy';

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
    : zh
      ? STRUCTURED_ANSWER_EMPTY_ZH
      : STRUCTURED_ANSWER_EMPTY_EN;
}

function buildLocalToolEvidenceText(result: LocalContextToolResult, locale?: string): string {
  const zh = isZhLocale(locale);
  const body = asObjectRecord(result.result);
  if (!body) {
    return zh
      ? '当前结果没有返回结构化字段。'
      : 'The current result did not return structured fields.';
  }

  const bits: string[] = [];
  const scopeLabel =
    result.name === 'get_current_selection'
      ? zh
        ? '当前上下文'
        : 'current context'
      : humanizeScope(body.scope, locale);

  switch (result.name) {
    case 'get_project_stats': {
      const unitCount = asFiniteNumber(body.unitCount);
      const speakerCount = asFiniteNumber(body.speakerCount);
      const translationLayerCount = asFiniteNumber(body.translationLayerCount);
      const value = asFiniteNumber(body.value);
      if (speakerCount !== undefined)
        bits.push(zh ? `${speakerCount} 位说话人` : `${speakerCount} speakers`);
      if (unitCount !== undefined) bits.push(zh ? `${unitCount} 条语段` : `${unitCount} segments`);
      if (translationLayerCount !== undefined)
        bits.push(
          zh ? `${translationLayerCount} 个翻译层` : `${translationLayerCount} translation layers`,
        );
      if (
        value !== undefined &&
        value !== unitCount &&
        value !== speakerCount &&
        value !== translationLayerCount
      ) {
        bits.push(zh ? `目标指标值 ${value}` : `target metric value ${value}`);
      }
      break;
    }
    case 'list_layers': {
      const count = asFiniteNumber(body.count);
      const layers = Array.isArray(body.layers) ? body.layers : [];
      if (count !== undefined) bits.push(zh ? `${count} 个层` : `${count} layers`);
      const selected = layers.find(
        (item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          (item as Record<string, unknown>).isSelected === true,
      );
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
      const preferredCount = links.filter(
        (item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          (item as Record<string, unknown>).isPreferred === true,
      ).length;
      if (preferredCount > 0)
        bits.push(zh ? `${preferredCount} 条首选链接` : `${preferredCount} preferred links`);
      break;
    }
    case 'get_unsaved_drafts': {
      const count = asFiniteNumber(body.count);
      const unitDraftCount = asFiniteNumber(body.unitDraftCount);
      const translationDraftCount = asFiniteNumber(body.translationDraftCount);
      if (count !== undefined) bits.push(zh ? `${count} 条未保存草稿` : `${count} unsaved drafts`);
      if (unitDraftCount !== undefined)
        bits.push(zh ? `转写/语段草稿 ${unitDraftCount}` : `${unitDraftCount} unit drafts`);
      if (translationDraftCount !== undefined)
        bits.push(
          zh ? `译文草稿 ${translationDraftCount}` : `${translationDraftCount} translation drafts`,
        );
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
          bits.push(
            zh
              ? `最新 ${cat || 'note'}：${preview || '…'}`
              : `latest ${cat || 'note'}: ${preview || '…'}`,
          );
        }
      }
      break;
    }
    case 'get_visible_timeline_state': {
      const mediaFilename = previewPlainText(body.currentMediaFilename);
      const focusedLayerId = previewPlainText(body.focusedLayerId);
      const selectedUnitCount = asFiniteNumber(body.selectedUnitCount);
      if (mediaFilename)
        bits.push(zh ? `当前媒体 ${mediaFilename}` : `current media ${mediaFilename}`);
      if (focusedLayerId)
        bits.push(zh ? `焦点层 ${focusedLayerId}` : `focused layer ${focusedLayerId}`);
      if (selectedUnitCount !== undefined)
        bits.push(zh ? `已选 ${selectedUnitCount} 条` : `${selectedUnitCount} selected`);
      const zoomPercent = asFiniteNumber(body.zoomPercent);
      if (zoomPercent !== undefined)
        bits.push(zh ? `缩放 ${zoomPercent}%` : `zoom ${zoomPercent}%`);
      break;
    }
    case 'get_speaker_breakdown': {
      const distinct = asFiniteNumber(body.distinctLabeledSpeakers);
      const unlabeled = asFiniteNumber(body.unlabeledRowCount);
      if (distinct !== undefined)
        bits.push(zh ? `已标注说话人 ${distinct} 位` : `${distinct} labeled speakers`);
      if (unlabeled !== undefined && unlabeled > 0) {
        bits.push(zh ? `未标注 ${unlabeled} 行` : `${unlabeled} unlabeled rows`);
      }
      const breakdown = Array.isArray(body.breakdown) ? body.breakdown : [];
      const top = breakdown[0];
      if (top && typeof top === 'object' && !Array.isArray(top)) {
        const row = top as Record<string, unknown>;
        const label = previewPlainText(row.displayName);
        const n = asFiniteNumber(row.unitCount);
        if (label && n !== undefined)
          bits.push(zh ? `最多 ${label} ${n} 行` : `top ${label} ${n} rows`);
      }
      break;
    }
    case 'list_units':
    case 'search_units': {
      const count = asFiniteNumber(body.count) ?? asFiniteNumber(body.total);
      if (count !== undefined)
        bits.push(zh ? `${scopeLabel}命中 ${count} 条` : `${count} matches in ${scopeLabel}`);
      const matches = Array.isArray(body.matches) ? body.matches : [];
      const first = matches[0];
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        const row = first as Record<string, unknown>;
        const firstId = typeof row.id === 'string' ? row.id : '';
        const textPreview = previewPlainText(row.transcription ?? row.text);
        if (firstId || textPreview) {
          bits.push(
            zh
              ? `示例 ${firstId || '首条'}${textPreview ? `：${textPreview}` : ''}`
              : `example ${firstId || 'first item'}${textPreview ? `: ${textPreview}` : ''}`,
          );
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
        bits.push(
          zh
            ? `时间 ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`
            : `time ${startTime.toFixed(1)}s–${endTime.toFixed(1)}s`,
        );
      }
      if (transcription) bits.push(zh ? `文本“${transcription}”` : `text “${transcription}”`);
      break;
    }
    case 'get_unit_linguistic_memory': {
      const coverage = asObject(body.coverage);
      const tokenCount = asFiniteNumber(coverage?.tokenCount);
      const translationCount = asFiniteNumber(coverage?.translationCount);
      if (translationCount !== undefined)
        bits.push(zh ? `${translationCount} 条译文` : `${translationCount} translations`);
      if (tokenCount !== undefined) bits.push(zh ? `${tokenCount} 个词项` : `${tokenCount} tokens`);
      break;
    }
    case 'diagnose_quality': {
      const count = asFiniteNumber(body.count);
      const breakdown = asObject(body.breakdown) ?? asObject(asObject(body.meta)?.breakdown);
      const emptyTextCount = asFiniteNumber(breakdown?.emptyTextCount);
      const missingSpeakerCount = asFiniteNumber(breakdown?.missingSpeakerCount);
      const completionRate =
        asFiniteNumber(body.completionRate) ?? asFiniteNumber(asObject(body.meta)?.completionRate);
      if (count !== undefined)
        bits.push(zh ? `${count} 类质量问题` : `${count} quality issue categories`);
      if (emptyTextCount !== undefined)
        bits.push(zh ? `${emptyTextCount} 条未转写` : `${emptyTextCount} untranscribed`);
      if (missingSpeakerCount !== undefined)
        bits.push(
          zh ? `${missingSpeakerCount} 条缺少说话人` : `${missingSpeakerCount} missing speakers`,
        );
      if (completionRate !== undefined)
        bits.push(
          zh
            ? `完成率 ${(completionRate * 100).toFixed(1)}%`
            : `completion ${(completionRate * 100).toFixed(1)}%`,
        );
      break;
    }
    case 'get_current_selection': {
      const currentScopeUnitCount = asFiniteNumber(body.currentScopeUnitCount);
      const currentMediaUnitCount = asFiniteNumber(body.currentMediaUnitCount);
      const projectUnitCount = asFiniteNumber(body.projectUnitCount);
      if (currentScopeUnitCount !== undefined)
        bits.push(
          zh
            ? `当前范围 ${currentScopeUnitCount} 条`
            : `${currentScopeUnitCount} segments in the current scope`,
        );
      if (currentMediaUnitCount !== undefined)
        bits.push(
          zh
            ? `当前音频 ${currentMediaUnitCount} 条`
            : `${currentMediaUnitCount} segments in the current audio`,
        );
      if (projectUnitCount !== undefined)
        bits.push(
          zh
            ? `整个项目 ${projectUnitCount} 条`
            : `${projectUnitCount} segments in the whole project`,
        );
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
    return zh
      ? '当前上下文（选区、当前音频与项目级状态）。'
      : 'Current context (selection, current audio, and project-level state).';
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
      return zh
        ? '告诉我你想继续到哪一步，我会沿着当前结果往下做。'
        : 'Tell me the next step you want, and I will continue from this result.';
  }
}

export function formatStructuredLocalToolAnswer(
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
