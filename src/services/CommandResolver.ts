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
import { resolveLanguageQuery } from '../utils/langMapping';

// ── 辅助：创建层命令的语言解析 | Helper: resolve language for layer-create commands ──

function buildLayerCreateCall(
  name: 'create_transcription_layer' | 'create_translation_layer',
  rawLang: string,
): { name: AiChatToolName; arguments: Record<string, unknown> } {
  const trimmed = rawLang.trim();
  // 直接查数据库，未命中则返回空参数交由澄清流程 | Query database directly; if no match, return empty args for clarify flow.
  const languageId = trimmed ? resolveLanguageQuery(trimmed) : undefined;
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

  // "把转写改为XXX" / "转写写入XXX" / "设置转写文本为XXX"
  {
    pattern: /^(?:请?(?:帮我)?)?(?:把|将)?(?:转写|transcription)?\s*(?:改[为成]|写入|填[写入]|设[置为])\s*[""「]?(.+?)[""」]?\s*$/i,
    build: (m) => ({ name: 'set_transcription_text', arguments: { text: m[1]?.trim() ?? '' } }),
    priority: 75,
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
