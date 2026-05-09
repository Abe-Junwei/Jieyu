/**
 * intentDetection — User free-text intent inference (regex heuristics)
 * Extracted from localToolSlotResolver.ts
 */

import { isFollowUpIntentText, isUnitListIntentText } from '../intentContracts';
import type { LocalToolMetric, LocalUnitScope } from '../chatDomain.types';

export function inferScopeFromUserText(userText: string): LocalUnitScope | undefined {
  const text = userText.trim();
  if (!text) return undefined;

  if (
    /(全项目|全局|所有音频|所有语段|全部语段|all\s+segments?|whole\s+project|project[-\s]*wide|global)/i.test(
      text,
    )
  ) {
    return 'project';
  }
  if (
    /(当前音频|这条音频|这段音频|当前轨道|本轨|this\s+track|current\s+track|this\s+audio|current\s+audio)/i.test(
      text,
    )
  ) {
    return 'current_track';
  }
  if (
    /(当前语段|当前句段|当前层|本层|这一层|这个语段|这条语段|这里|这儿|selected\s+(segment|layer))/i.test(
      text,
    )
  ) {
    return 'current_scope';
  }
  return undefined;
}

export function inferSearchQueryFromUserText(userText: string): string {
  const normalized = userText
    .replace(/[，。！？,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (
    /^(帮我|请|麻烦)?\s*(搜|搜索|查|查询|找|检索)\s*(一下|下|看看|一条|一些)?$/iu.test(normalized)
  ) {
    return '';
  }
  if (isUnitListIntentText(normalized) || isFollowUpIntentText(normalized)) {
    return '';
  }
  const quoted = normalized.match(/["“”'‘’]([^"“”'‘’]{1,64})["“”'‘’]/u);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }
  return normalized.length <= 2 ? '' : normalized;
}

export function isLinguisticMemoryIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(语言学|词法|词素|词项|token|morpheme|gloss|词性|pos\b|注释|备注|译文|linguistic|annotation)/i.test(
    text,
  );
}

export function normalizeBatchApplyUnitIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const dedup = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id) continue;
    dedup.add(id);
    if (dedup.size >= 200) break;
  }
  return [...dedup];
}

export function inferBatchApplyActionFromUserText(userText: string): string | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(删除|移除|delete|remove)/i.test(text)) return 'delete';
  if (/(说话人|speaker)/i.test(text)) return 'assign_speaker';
  if (/(验证|校验|标记.*完成|设为完成|complete|verify|verified)/i.test(text)) return 'verify';
  if (/(修改|更新|update)/i.test(text)) return 'update';
  return undefined;
}

export function isCountIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(多少|几个|几位|几名|一共|总共|总计|how\s+many|count\b|total\b|number\s+of)/i.test(text);
}

export function inferGapMetricFromUserText(userText: string): LocalToolMetric | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(缺少说话人|未标说话人|missing\s+speaker|speaker\s+missing)/i.test(text))
    return 'missing_speaker_count';
  if (
    /(未转写|未完成转写|未写文本|空文本|还没转写|未完成|还剩|剩余|unfinished|untranscribed|remaining)/i.test(
      text,
    )
  ) {
    return 'untranscribed_count';
  }
  return undefined;
}

export function isGapCountIntentText(userText: string): boolean {
  return inferGapMetricFromUserText(userText) !== undefined;
}

export function shouldReusePreviousMetric(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return (
    isFollowUpIntentText(text) ||
    /^(多少|几个|几位|几名)$/u.test(text) ||
    /^(那|那么)?(当前|当前音频|这条音频|当前轨道|项目里|全项目|这个).*(呢|吗)?$/u.test(text) ||
    /^\s*(what about|how about|and)\b/i.test(text)
  );
}

export function inferMetricFromUserText(userText: string): LocalToolMetric | undefined {
  const text = userText.trim();
  if (!text) return undefined;
  if (/(speaker|speakers|说话人|发言人)/i.test(text)) return 'speaker_count';
  if (/(translation\s*layers?|翻译层|译层|层数)/i.test(text)) return 'translation_layer_count';
  if (/(confidence|置信度|可信度)/i.test(text)) return 'ai_confidence_avg';
  if (/(segments?|units?|units?|rows?|语段|句段|条目)/i.test(text)) return 'unit_count';
  return undefined;
}

export function isLayerListIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (/(层链接|关联.*层|绑定.*层|host|layer\s*links?)/iu.test(text)) return false;
  return /(当前.*层|有哪些层|层.*是什么|层.*内容|新建.*层|看到.*层|list\s+layers?|layers?\b)/iu.test(
    text,
  );
}

export function isLayerLinkIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(层链接|关联.*层|绑定.*层|宿主|首选.*链接|orphan.*layer|host.*layer|layer\s*links?)/iu.test(
    text,
  );
}

export function isUnsavedDraftIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(未保存|草稿|刚.*改|刚.*输入|还没保存|draft|unsaved|dirty)/iu.test(text);
}

export function isSpeakerBreakdownIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (/(有哪些说话人|说话人清单|list\s+speakers?|speaker\s+list)/iu.test(text)) return false;
  return /(按说话人|各说话人|每个说话人|说话人分布|分布.*说话人|语段.*说话人|说话人.*语段|说话人.*统计|统计.*说话人|speaker\s+breakdown|segments?\s+per\s+speaker)/iu.test(
    text,
  );
}

export function isSpeakerListIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (/(多少|几个|总共|count|how\s+many)/iu.test(text)) return false;
  return /(说话人.*有哪些|有哪些说话人|说话人清单|list\s+speakers?|speaker\s+list)/iu.test(text);
}

export function isNoteDetailIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(笔记明细|笔记详情|最近.*笔记|(逐条|具体).*笔记|note\s+(detail|entries)|list_notes_detail)/iu.test(
    text,
  );
}

export function isNoteListIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (isNoteDetailIntentText(userText)) return false;
  return /(笔记|注释|备注|todo|note\s+list|list\s+notes?)/iu.test(text);
}

export function isVisibleTimelineStateIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return /(当前视图|可见状态|可见.*时间轴|时间轴状态|当前界面|当前聚焦|focus(ed)?\s+layer|visible\s+timeline|layout\s+mode|缩放|刻度|ruler|zoom)/iu.test(
    text,
  );
}
