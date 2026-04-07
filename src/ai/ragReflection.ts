/**
 * ragReflection — Self-RAG 反思判断（规则引擎首阶段）
 * Self-RAG reflection gate (rule-engine first stage, zero LLM cost).
 *
 * 在 RAG 检索调用前判断"是否需要检索"，短路闲聊/纯操作指令，
 * 仅在语义上确实需要语料库上下文时才触发 EmbeddingSearchService。
 *
 * Before invoking RAG retrieval, decide whether retrieval is needed.
 * Short-circuits greetings and pure command inputs so that the embedding
 * service is only invoked when a corpus context is semantically necessary.
 *
 * 决策策略（保守）| Decision strategy (conservative):
 *   SKIP   — 明确闲聊/感谢/纯操作指令，绝不需要检索
 *   FORCE  — 明确需要语料库上下文的关键词
 *   DEFAULT — 默认执行检索（避免漏召回）
 */

import { createLogger } from '../observability/logger';

const log = createLogger('ragReflection');

/** 反思判断结果 | Reflection verdict */
export type RagReflectionVerdict = 'skip' | 'force' | 'retrieve';

/**
 * 判断给定用户输入是否需要执行 RAG 检索。
 * Decide whether the given user input requires a RAG retrieval pass.
 *
 * @param userText  用户原始输入 | Raw user input
 * @returns verdict  `'skip'` = 不触发检索，`'force'` = 强制检索，`'retrieve'` = 默认执行检索
 */
export function shouldRetrieve(userText: string): RagReflectionVerdict {
  const text = userText.trim();
  if (!text) return 'skip';

  // ── SKIP：闲聊 / 感谢 / 纯操作指令 ────────────────────────────────
  // Skip: greetings / thanks / pure UI commands
  if (SKIP_PATTERNS.some((re) => re.test(text))) {
    log.debug('ragReflection: skip (matched skip pattern)', { preview: text.slice(0, 60) });
    return 'skip';
  }

  // ── FORCE：明确需要语料库上下文 ─────────────────────────────────────
  // Force: explicitly needs corpus context
  if (FORCE_PATTERNS.some((re) => re.test(text))) {
    log.debug('ragReflection: force (matched force pattern)', { preview: text.slice(0, 60) });
    return 'force';
  }

  // ── DEFAULT：保守策略，执行检索 ──────────────────────────────────────
  // Default: conservative — always retrieve when uncertain
  return 'retrieve';
}

// ── 跳过检索的模式 | Patterns that indicate retrieval should be skipped ──────

/** 问候语 / 感谢 | Greetings / thanks */
const GREETING_RE =
  /^(你好|您好|hi\s*there|hi|hello|hey|嗨|哈喽|早上好|晚上好|下午好|good\s*(morning|afternoon|evening))[！!。.，,\s]*$/i;

const THANKS_RE =
  /^(谢谢|谢了|感谢|thank(s| you)|thx|多谢|辛苦了|好的谢谢)[！!。.，,\s]*$/i;

/** 纯操作指令：不涉及语料库内容 | Pure UI/operation commands with no corpus dependency */
const COMMAND_RE =
  /^(设置|切换|打开|关闭|开启|停止|暂停|播放|跳转|导航|刷新|保存|删除|撤销|重做|复制|粘贴|缩放|全屏|退出|导出|导入|上传|下载|新建|创建|重置|清空|帮助|取消|确认|返回|后退|前进)(一下|吧|请|，|。|！|!|\s|$)/;

/** 闲聊性短句（短于 6 字且无明确问题标志）| Short chit-chat */
const CHITCHAT_RE =
  /^.{1,5}[吗呢啊哦嗯哈哇唉哎哟][！!？?\s]*$/u;

const SKIP_PATTERNS: RegExp[] = [GREETING_RE, THANKS_RE, COMMAND_RE, CHITCHAT_RE];

// ── 强制检索的模式 | Patterns that force retrieval ────────────────────────────

const FORCE_PATTERNS: RegExp[] = [
  // 检索/查找类关键词 | Retrieve/search keywords
  /查找|搜索|找一下|找找|查一下|检索|look\s*up|search/i,
  // 历史/上下文引用 | Historical / corpus references
  /之前|上次|历史|曾经|earlier|before|last\s*time/i,
  // 文档/笔记/标注 | Document/notes/annotations
  /笔记|note|pdf|PDF|文档|document|参考文献|附件|标注|annotation/i,
  // 语料库内容引用 | Corpus content references
  /语段|utterance|转写|transcription|发音|pronunciation|词汇|vocabulary|词条|glossary/i,
  // 引用/来源 | Citation / source
  /来源|出处|原文|source|citation|cite|引用/i,
];
