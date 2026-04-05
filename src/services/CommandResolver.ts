/**
 * CommandResolver — 本地指令解析器（纯函数，不依赖 React）
 * Local command resolver (pure function, no React dependency)
 *
 * 将明确的用户文本指令直接解析为 AiChatToolCall，跳过 LLM 往返。
 * 语音通道（useVoiceAgent）和文本通道（useAiChat）共享同一套规则。
 *
 * 设计原则：
 *   - 只匹配意图明确、无歧义的指令（宁可漏判，不可误判）
 *   - ID 参数由下游 planToolCallTargets 从上下文填充，这里只构造骨架
 *   - 未命中的输入返回 null，由调用方回退到 LLM
 */

import type { AiChatToolCall, AiChatToolName } from '../hooks/useAiChat';
import { LinguisticService } from './LinguisticService';

function parseChineseInteger(raw: string): number | null {
  const normalized = raw.trim().replace(/两/g, '二');
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const digitMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (normalized === '十') return 10;
  const parts = normalized.split('十');
  if (parts.length === 2) {
    const tens = parts[0] ? (digitMap[parts[0]] ?? NaN) : 1;
    const ones = parts[1] ? (digitMap[parts[1]] ?? NaN) : 0;
    if (Number.isFinite(tens) && Number.isFinite(ones)) {
      return tens * 10 + ones;
    }
  }

  return digitMap[normalized] ?? null;
}

function parseEnglishOrdinal(raw: string): number | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  const wordMap: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
  };
  if (normalized in wordMap) return wordMap[normalized] ?? null;
  const parsed = Number(normalized.replace(/(?:st|nd|rd|th)$/i, ''));
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

const SEGMENT_NOUN_PATTERN = '(?:句段|分段|句子?|句|段|segment|segments?)';

function extractSegmentSelectorArgs(rawText: string): Record<string, unknown> {
  const text = rawText.trim();
  if (!text) return {};

  if (new RegExp(`(最后(?:一[个条段句]?|一个)?|(?:the\\s+)?last)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(text)) {
    return { segmentPosition: 'last' };
  }

  if (new RegExp(`(前一个|上一个|(?:the\\s+)?previous|(?:the\\s+)?prev)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(text)) {
    return { segmentPosition: 'previous' };
  }

  if (new RegExp(`(后一个|下一个|(?:the\\s+)?next)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(text)) {
    return { segmentPosition: 'next' };
  }

  if (new RegExp(`(倒数第二(?:个|条|句|段)?|(?:the\\s+)?penultimate)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(text)) {
    return { segmentPosition: 'penultimate' };
  }

  if (new RegExp(`(中间那(?:个|条|句|段)|中间(?:那)?个|(?:the\\s+)?middle)\\s*${SEGMENT_NOUN_PATTERN}`, 'i').test(text)) {
    return { segmentPosition: 'middle' };
  }

  const chineseMatch = text.match(new RegExp(`第\\s*([0-9]+|[一二三四五六七八九十两]+)\\s*(?:个|条|句|段)?\\s*${SEGMENT_NOUN_PATTERN}?`, 'i'));
  if (chineseMatch?.[1]) {
    const parsed = parseChineseInteger(chineseMatch[1]);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  const englishMatch = text.match(/(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d+(?:st|nd|rd|th))\s+segments?/i);
  if (englishMatch?.[1]) {
    const ordinal = englishMatch[1].toLowerCase();
    if (ordinal === 'last') return { segmentPosition: 'last' };
    const parsed = parseEnglishOrdinal(ordinal);
    if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 1) {
      return { segmentIndex: parsed };
    }
  }

  return {};
}

function mergeSegmentSelectorArgs(rawSelectorText: string, args: Record<string, unknown>): Record<string, unknown> {
  return {
    ...extractSegmentSelectorArgs(rawSelectorText),
    ...args,
  };
}

// ── 辅助：创建层命令的语言解析 | Helper: resolve language for layer-create commands ──

function buildLayerCreateCall(
  name: 'create_transcription_layer' | 'create_translation_layer',
  rawLang: string,
): { name: AiChatToolName; arguments: Record<string, unknown> } {
  const trimmed = rawLang.trim();
  // 直接查数据库，未命中则返回空参数交由澄清流程 | Query database directly; if no match, return empty args for clarify flow.
  const languageId = trimmed ? LinguisticService.resolveLanguageQuery(trimmed) : undefined;
  return {
    name,
    arguments: {
      ...(languageId ? { languageId, languageQuery: trimmed } : {}),
    },
  };
}



// ── 指令规则定义 | Command rule definition ──────────────────────────────────

interface CommandRule {
  /** 正则匹配模式 | Regex pattern */
  pattern: RegExp;
  /** 从匹配结果构造 tool call | Build tool call from match */
  build: (match: RegExpMatchArray) => { name: AiChatToolName; arguments: Record<string, unknown> };
  /** 优先级，数值越大越先匹配 | Priority, higher = matched first */
  priority: number;
}

/**
 * 指令规则表 | Command rule table
 *
 * 规则设计：
 *   - pattern 使用 ^ 锚定开头，避免子串误匹配
 *   - 中英文双语覆盖
 *   - 不提取 ID 参数（由 planToolCallTargets 填充）
 *   - 只处理语义明确的指令
 */
const COMMAND_RULES: CommandRule[] = [
  // ── 句段操作 | Segment operations ──

  {
    pattern: /^(?:请?(?:帮我)?)?(?:(?:把|将)?(?:当前|这个|此)?(?:句段|分段|segment)?\s*(?:与|和)\s*(?:前一个|上一个|前一句段|上一句段|previous(?:\s+segment)?)\s*(?:合并|merge)|(?:向前|往前)\s*合并(?:句段|分段|segment)?|(?:合并|merge)\s*(?:前一个|上一个|前一句段|上一句段|previous(?:\s+segment)?))/i,
    build: () => ({ name: 'merge_prev', arguments: {} }),
    priority: 94,
  },

  {
    pattern: /^(?:请?(?:帮我)?)?(?:(?:把|将)?(?:当前|这个|此)?(?:句段|分段|segment)?\s*(?:与|和)\s*(?:后一个|下一个|后一句段|下一句段|next(?:\s+segment)?)\s*(?:合并|merge)|(?:向后|往后)\s*合并(?:句段|分段|segment)?|(?:合并|merge)\s*(?:后一个|下一个|后一句段|下一句段|next(?:\s+segment)?))/i,
    build: () => ({ name: 'merge_next', arguments: {} }),
    priority: 94,
  },

  {
    pattern: /^(?:请?(?:帮我)?)?(?:(?:把|将)?(?:选中|已选中|这些|这几个|selected|these)?\s*(?:句段|分段|segments?)\s*(?:合并|merge)|(?:合并|merge)\s*(?:选中|已选中|这些|这几个|selected|these|多个|两个|两[个条]?|multiple)?\s*(?:句段|分段|segments?))/i,
    build: () => ({ name: 'merge_transcription_segments', arguments: {} }),
    priority: 93,
  },

  // "删除第五个句段" / "删除最后一个句段"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:删除|删掉|移除|remove|delete)\s*(?:第\s*(?:[0-9]+|[一二三四五六七八九十两]+)\s*(?:个|条|句|段)?|最后(?:一[个条段句]?|一个)?|前一个|上一个|后一个|下一个|倒数第二(?:个|条|句|段)?|中间那(?:个|条|句|段)|中间(?:那)?个|(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|previous|prev|next|penultimate|middle|\d+(?:st|nd|rd|th)))\s*(?:句段|分段|句子?|句|段|segment|segments?)/i,
    build: (m) => ({ name: 'delete_transcription_segment', arguments: extractSegmentSelectorArgs(m[0] ?? '') }),
    priority: 92,
  },

  // "删除当前所有句段" / "移除全部分段"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:删除|删掉|移除|remove|delete)\s*(?:当前|现在|本页)?\s*(?:所有|全部|全体|选中的|selected|all)\s*(?:句段|分段|segment|segments)/i,
    build: () => ({ name: 'delete_transcription_segment', arguments: {} }),
    priority: 95,
  },

  // "删除当前句段" / "删除这个句段" / "删掉这条"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:删除|删掉|移除|remove|delete)\s*(?:当前|这个|这条|此|这一[条个行]|current|this)?\s*(?:句段|段落|segment|这[条个行一])/i,
    build: () => ({ name: 'delete_transcription_segment', arguments: {} }),
    priority: 90,
  },

  // "新建句段" / "创建句段" / "插入句段"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:新建|创建|新增|插入|添加|create|add|insert|new)\s*(?:一[个条])?(?:句段|段落|segment)/i,
    build: () => ({ name: 'create_transcription_segment', arguments: {} }),
    priority: 85,
  },

  // "切分句段" / "分割当前句段"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:切分|分割|拆分|split)\s*(?:当前|这个|此)?\s*(?:句段|段落|segment)?/i,
    build: () => ({ name: 'split_transcription_segment', arguments: {} }),
    priority: 85,
  },

  // ── 文本操作 | Text operations ──

  // "set the fifth segment transcription to XXX"
  {
    pattern: /^(?:set|write)\s+((?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|previous|prev|next|penultimate|middle|\d+(?:st|nd|rd|th))\s+segments?)\s+(?:segment\s+)?transcription\s+(?:to|as)\s*[""「]?(.*?)[""」]?\s*$/i,
    build: (m) => ({
      name: 'set_transcription_text',
      arguments: mergeSegmentSelectorArgs(m[1] ?? '', { text: m[2]?.trim() ?? '' }),
    }),
    priority: 79,
  },

  // "把第五个句段转写改为XXX" / "set the fifth segment transcription to XXX"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:把|将)?\s*((?:第\s*(?:[0-9]+|[一二三四五六七八九十两]+)\s*(?:个|条)?|最后(?:一[个条]?|一个)?|前一个|上一个|后一个|下一个|倒数第二(?:个|条)?|中间那(?:个|条)|中间(?:那)?个|(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|previous|prev|next|penultimate|middle|\d+(?:st|nd|rd|th)))\s*(?:句段|分段|segment|segments?))(?:的)?\s*(?:转写|transcription)\s*(?:改[为成]|写入|填[写入]|设[置为])\s*[""「]?(.+?)[""」]?\s*$/i,
    build: (m) => ({
      name: 'set_transcription_text',
      arguments: mergeSegmentSelectorArgs(m[1] ?? '', { text: m[2]?.trim() ?? '' }),
    }),
    priority: 78,
  },

  // "把转写改为XXX" / "转写写入XXX" / "设置转写文本为XXX"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:把|将)?(?:转写|transcription)?\s*(?:改[为成]|写入|填[写入]|设[置为])\s*[""「]?(.+?)[""」]?\s*$/i,
    build: (m) => ({ name: 'set_transcription_text', arguments: { text: m[1]?.trim() ?? '' } }),
    priority: 75,
  },

  // "clear translation of the last segment"
  {
    pattern: /^(?:clear)\s+(?:the\s+)?translation(?:\s+(?:text|content))?\s+of\s+((?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|previous|prev|next|penultimate|middle|\d+(?:st|nd|rd|th))\s+segments?)\s*$/i,
    build: (m) => ({
      name: 'clear_translation_segment',
      arguments: mergeSegmentSelectorArgs(m[1] ?? '', {}),
    }),
    priority: 83,
  },

  // "清空最后一个句段翻译" / "clear translation of the last segment"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:清空|清除|clear)\s*((?:第\s*(?:[0-9]+|[一二三四五六七八九十两]+)\s*(?:个|条)?|最后(?:一[个条]?|一个)?|前一个|上一个|后一个|下一个|倒数第二(?:个|条)?|中间那(?:个|条)|中间(?:那)?个|(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|previous|prev|next|penultimate|middle|\d+(?:st|nd|rd|th)))\s*(?:句段|分段|segment|segments?))(?:的)?\s*(?:翻译|translation)\s*(?:文本|内容|text)?/i,
    build: (m) => ({
      name: 'clear_translation_segment',
      arguments: mergeSegmentSelectorArgs(m[1] ?? '', {}),
    }),
    priority: 82,
  },

  // "清空翻译" / "清除翻译文本"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:清空|清除|clear)\s*(?:当前|这个|此)?\s*(?:翻译|translation)\s*(?:文本|内容|text)?/i,
    build: () => ({ name: 'clear_translation_segment', arguments: {} }),
    priority: 80,
  },

  // ── 自动标注 | Auto gloss ──

  // "自动标注" / "自动gloss" / "auto gloss"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:自动|auto)\s*(?:标注|gloss|注释|glossing)/i,
    build: () => ({ name: 'auto_gloss_utterance', arguments: {} }),
    priority: 85,
  },

  // ── 层操作 | Layer operations ──

  // "创建XX转写层" / "新建日语转写层"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:新建|创建|新增|create|add)\s*(?:一[个条层])?\s*(.+?)\s*(?:转写层|transcription\s*layer)/i,
    build: (m) => buildLayerCreateCall('create_transcription_layer', m[1]?.trim() ?? ''),
    priority: 80,
  },

  // "创建XX翻译层" / "新建英语翻译层"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:新建|创建|新增|create|add)\s*(?:一[个条层])?\s*(.+?)\s*(?:翻译层|translation\s*layer)/i,
    build: (m) => buildLayerCreateCall('create_translation_layer', m[1]?.trim() ?? ''),
    priority: 80,
  },

  // "删除转写层" / "删除翻译层" / "删除XX层"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:删除|删掉|移除|remove|delete)\s*(?:当前|这个)?(.+?)?\s*(?:转写层|翻译层|(?:transcription|translation)\s*layer|层)/i,
    build: (m) => {
      const hint = m[1]?.trim() ?? '';
      const args: Record<string, unknown> = {};
      if (hint) args.languageQuery = hint;
      // 从匹配全文推断层类型 | Infer layer type from full match text
      const full = m[0] ?? '';
      if (/转写|transcription/i.test(full)) args.layerType = 'transcription';
      else if (/翻译|translation/i.test(full)) args.layerType = 'translation';
      return { name: 'delete_layer', arguments: args };
    },
    priority: 80,
  },

  // "关联翻译层" / "链接翻译层"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:关联|链接|link)\s*(?:翻译层|translation\s*layer)/i,
    build: () => ({ name: 'link_translation_layer', arguments: {} }),
    priority: 75,
  },

  // "解除关联" / "断开翻译层"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:解除|断开|取消关联|unlink)\s*(?:翻译层|translation\s*layer)?/i,
    build: () => ({ name: 'unlink_translation_layer', arguments: {} }),
    priority: 75,
  },
];

const SORTED_COMMAND_RULES = [...COMMAND_RULES].sort((a, b) => b.priority - a.priority);

// ── 公开 API | Public API ───────────────────────────────────────────────────

export interface CommandResolveResult {
  /** 构造的工具调用骨架（ID 待 planner 填充）| Tool call skeleton (IDs filled by planner) */
  call: AiChatToolCall;
  /** 是否由本地规则命中（用于跳过 LLM intent 评估）| Whether matched by local rule */
  localMatch: true;
}

/**
 * 尝试将用户文本解析为明确的工具调用。
 * Try to resolve user text into an unambiguous tool call.
 *
 * @returns 命中返回 CommandResolveResult，未命中返回 null（回退 LLM）
 */
export function resolveCommand(text: string): CommandResolveResult | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // 去除语音指令前缀（useVoiceAgent 添加）| Strip voice command prefix
  const cleaned = trimmed.replace(/^\[语音指令\]\s*/, '');

  for (const rule of SORTED_COMMAND_RULES) {
    const match = cleaned.match(rule.pattern);
    if (match) {
      const { name, arguments: args } = rule.build(match);
      return {
        call: { name, arguments: args },
        localMatch: true,
      };
    }
  }

  return null;
}
