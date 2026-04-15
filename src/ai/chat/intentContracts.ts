import type { LocalContextToolCall } from './localContextTools';
import type { LocalToolIntent } from './chatDomain.types';

export type IntentContract = {
  intent: LocalToolIntent;
  toolName: LocalContextToolCall['name'];
  requiredSlots: readonly string[];
};

export const LOCAL_TOOL_INTENT_CONTRACTS: readonly IntentContract[] = [
  {
    intent: 'unit.list',
    toolName: 'list_units',
    requiredSlots: [],
  },
  {
    intent: 'unit.search',
    toolName: 'search_units',
    requiredSlots: ['query'],
  },
  {
    intent: 'unit.detail',
    toolName: 'get_unit_detail',
    requiredSlots: ['unitId'],
  },
] as const;

const LIST_INTENT_PATTERNS = [
  /列出/u,
  /全部/u,
  /所有/u,
  /哪(些|几个|八个)/u,
  /\b(list|show\s+all|all\s+utterances?)\b/i,
] as const;

const FOLLOW_UP_PATTERNS = [
  /^继续/u,
  /^接着/u,
  /^再/u,
  /^然后/u,
  /^\s*(continue|next)\b/i,
] as const;

export function isUtteranceListIntentText(userText: string): boolean {
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
      return 'unit.detail';
    default:
      return null;
  }
}
