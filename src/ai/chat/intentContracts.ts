import type { LocalContextToolCall } from './localContextTools';
import type { LocalToolIntent } from './chatDomain.types';

const LIST_INTENT_PATTERNS = [
  /列出/u,
  /全部/u,
  /所有/u,
  /哪(些|几个|八个)/u,
  /\b(list|show\s+all|all\s+units?)\b/i,
] as const;

const FOLLOW_UP_PATTERNS = [
  /^继续/u,
  /^接着/u,
  /^再/u,
  /^然后/u,
  /^\s*(continue|next)\b/i,
] as const;

export function isUnitListIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return LIST_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isFollowUpIntentText(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text));
}

export function inferIntentFromToolName(toolName: LocalContextToolCall['name']): LocalToolIntent | null {
  switch (toolName) {
    case 'list_units':
      return 'unit.list';
    case 'search_units':
      return 'unit.search';
    case 'get_unit_detail':
    case 'get_unit_linguistic_memory':
      return 'unit.detail';
    case 'get_project_stats':
      return 'stats.get';
    default:
      return null;
  }
}
