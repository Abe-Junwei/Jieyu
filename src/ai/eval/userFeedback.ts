/**
 * PR-16: 用户反馈飞轮 — 数据结构、脱敏引擎、自动分类器
 *
 * 约束：
 * - 所有处理在本地完成，原始数据不脱敏前不上传。
 * - 分类器初版为规则引擎（P2 可深化为低成本 LLM）。
 */

export type UserFeedbackRating = 'thumbs_up' | 'thumbs_down';

export type UserFeedbackCategory =
  | 'hallucination'
  | 'wrong_scope'
  | 'missing_evidence'
  | 'contradiction'
  | 'other';

export interface UserFeedbackEntry {
  id: string;
  messageId: string;
  conversationId: string;
  rating: UserFeedbackRating;
  originalContent: string;
  sanitizedContent: string;
  category: UserFeedbackCategory;
  reason?: string;
  createdAt: string;
  metadata?: {
    workflowId?: string;
    providerId?: string;
    model?: string;
  };
}

const SENSITIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(project|项目名称)\b/gi, replacement: '[PROJECT]' },
  { pattern: /\b(language|语言名称|语族|语支)\b/gi, replacement: '[LANGUAGE]' },
  { pattern: /\b(segment|语段|句段|片段)\b/gi, replacement: '[SEGMENT]' },
  { pattern: /\b(speaker|说话人|发音人|发言人)\b/gi, replacement: '[SPEAKER]' },
  { pattern: /\b(lexeme|词条|词素|词项|lemma)\b/gi, replacement: '[LEXEME]' },
  { pattern: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{3})?Z?/g, replacement: '[TIMESTAMP]' },
];

/**
 * 本地脱敏引擎：替换 project name、language、segment text、speaker、lexeme、timestamp。
 * 规则为简单的正则替换；P2+ 可引入 NER 或低成本模型做更精细的脱敏。
 */
export function sanitizeFeedbackContent(content: string): string {
  let sanitized = content;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

/**
 * 自动分类器：基于关键词规则对 👎 样本做初步分类。
 * 👍 样本固定分类为 'other'。
 */
export function classifyFeedback(content: string, rating: UserFeedbackRating): UserFeedbackCategory {
  if (rating === 'thumbs_up') return 'other';

  const lower = content.toLowerCase();
  if (lower.includes('hallucination') || lower.includes('幻觉') || lower.includes('编造') || lower.includes('虚构')) {
    return 'hallucination';
  }
  if (lower.includes('scope') || lower.includes('范围') || lower.includes('无关') || lower.includes('离题')) {
    return 'wrong_scope';
  }
  if (lower.includes('evidence') || lower.includes('证据') || lower.includes('引用') || lower.includes('来源') || lower.includes('出处')) {
    return 'missing_evidence';
  }
  if (lower.includes('contradict') || lower.includes('矛盾') || lower.includes('冲突') || lower.includes('不一致')) {
    return 'contradiction';
  }
  return 'other';
}

export interface CreateUserFeedbackParams {
  messageId: string;
  conversationId: string;
  rating: UserFeedbackRating;
  originalContent: string;
  reason?: string;
  metadata?: UserFeedbackEntry['metadata'];
}

/**
 * 创建一条完整的用户反馈记录（自动脱敏 + 自动分类）。
 */
export function createUserFeedbackEntry(params: CreateUserFeedbackParams): UserFeedbackEntry {
  const sanitizedContent = sanitizeFeedbackContent(params.originalContent);
  const category = classifyFeedback(params.originalContent, params.rating);
  return {
    id: `ufb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    messageId: params.messageId,
    conversationId: params.conversationId,
    rating: params.rating,
    originalContent: params.originalContent,
    sanitizedContent,
    category,
    ...(params.reason !== undefined ? { reason: params.reason } : {}),
    createdAt: new Date().toISOString(),
    ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
  };
}
