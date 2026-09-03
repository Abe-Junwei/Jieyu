/**
 * A9 local semantic guard — Model Armor-shaped inbound block / outbound redact.
 * Rules are regex-only (no cloud, no NLP dependency). Pipeline must call inspect
 * explicitly: callback handlers are void and cannot rewrite outbound text.
 */

import { featureFlags } from '../config/featureFlags';
import {
  getDefaultAgentCallbackRegistry,
  type AgentCallbackContext,
} from '../runtime/agentCallbacks';
import {
  maskSensitiveStringKeepTail,
  scrubSensitiveQueryParams,
} from '../../observability/sensitiveKeyPolicy';
import type { SemanticGuardTrustTier } from '../vertical/corpusScopeTypes';

export type { SemanticGuardTrustTier };

export type InboundGuardResult =
  | { action: 'allow'; reasons: readonly string[] }
  | { action: 'block'; reasons: readonly string[] };

export type OutboundGuardResult =
  | { action: 'allow'; text: string; reasons: readonly string[] }
  | { action: 'redact'; text: string; reasons: readonly string[] };

const INBOUND_INJECTION_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  {
    id: 'ignore_previous',
    re: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  },
  {
    id: 'ignore_your_instructions',
    re: /ignore\s+your\s+(system\s+)?(instructions|prompt|rules)/i,
  },
  {
    id: 'you_are_now',
    re: /\byou are now\b[\s\S]{0,40}\b(dan|jailbroken|unrestricted|without restrictions)\b/i,
  },
  {
    id: 'reveal_system_prompt',
    re: /\b(reveal|dump|print|show)\b[\s\S]{0,24}\b(system|hidden)\s+prompt\b/i,
  },
  { id: 'jailbreak', re: /\bjailbreak\b/i },
  { id: 'disable_safety', re: /disable\s+(your\s+)?(safety|guardrails|content filters?)/i },
  { id: 'zh_ignore', re: /忽略\s*(之前|以上|先前|上面)的?\s*(指令|提示|规则)/ },
  { id: 'zh_defy', re: /无视\s*(以上|之前)的?\s*(指令|规则)/ },
  { id: 'zh_reveal', re: /(揭示|透露|打印|展示)\s*(你的)?系统提示/ },
  { id: 'zh_jailbreak', re: /越狱模式|请越狱/ },
];

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PROVIDER_SECRET_RE = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const INLINE_SECRET_ASSIGN_RE =
  /(^|[\s;])((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)([^\s&]+)/gi;

export class SemanticGuardBlockedError extends Error {
  readonly code = 'semantic_guard_blocked' as const;
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super('semantic_guard_blocked');
    this.name = 'SemanticGuardBlockedError';
    this.reasons = reasons;
  }
}

function collectInjectionReasons(text: string): string[] {
  const reasons: string[] = [];
  for (const rule of INBOUND_INJECTION_PATTERNS) {
    if (rule.re.test(text)) {
      reasons.push(rule.id);
    }
    rule.re.lastIndex = 0;
  }
  return reasons;
}

export function inspectInbound(input: {
  text: string;
  snippets?: readonly string[];
  trustTier?: SemanticGuardTrustTier;
}): InboundGuardResult {
  const reasons = collectInjectionReasons(input.text);
  const scanSnippets = input.trustTier === 'untrusted';
  if (scanSnippets) {
    for (const snippet of input.snippets ?? []) {
      reasons.push(...collectInjectionReasons(snippet).map((id) => `snippet:${id}`));
    }
  }
  const unique = [...new Set(reasons)];
  if (unique.length > 0) {
    return { action: 'block', reasons: unique };
  }
  return { action: 'allow', reasons: [] };
}

export function inspectOutbound(input: { text: string }): OutboundGuardResult {
  let text = input.text;
  const reasons: string[] = [];

  const scrubbedUrls = scrubSensitiveQueryParams(text);
  if (scrubbedUrls !== text) {
    reasons.push('secret_query_param');
    text = scrubbedUrls;
  }

  const nextEmail = text.replace(EMAIL_RE, '[REDACTED_EMAIL]');
  if (nextEmail !== text) {
    reasons.push('email');
    text = nextEmail;
  }
  EMAIL_RE.lastIndex = 0;

  const nextAssign = text.replace(
    INLINE_SECRET_ASSIGN_RE,
    (full, delimiter: string, prefix: string, value: string) => {
      if (value.startsWith('[REDACTED') || value.startsWith('***')) return full;
      reasons.push('credential_assignment');
      return `${delimiter}${prefix}${maskSensitiveStringKeepTail(value)}`;
    },
  );
  if (nextAssign !== text) {
    text = nextAssign;
  }
  INLINE_SECRET_ASSIGN_RE.lastIndex = 0;

  const nextSk = text.replace(PROVIDER_SECRET_RE, (value) => {
    reasons.push('provider_secret');
    return maskSensitiveStringKeepTail(value);
  });
  if (nextSk !== text) {
    text = nextSk;
  }
  PROVIDER_SECRET_RE.lastIndex = 0;

  const unique = [...new Set(reasons)];
  if (unique.length > 0) {
    return { action: 'redact', text, reasons: unique };
  }
  return { action: 'allow', text, reasons: [] };
}

let callbacksInstalled = false;

function beforeModelHandler(ctx: AgentCallbackContext): void {
  if (!featureFlags.aiSemanticGuardEnabled) return;
  if (typeof ctx.text !== 'string' || ctx.text.length === 0) return;
  const result = inspectInbound({
    text: ctx.text,
    ...(ctx.snippets ? { snippets: ctx.snippets } : {}),
    ...(ctx.trustTier ? { trustTier: ctx.trustTier } : {}),
  });
  if (result.action === 'block') {
    throw new SemanticGuardBlockedError(result.reasons);
  }
}

export function installSemanticGuardCallbacks(): void {
  if (callbacksInstalled) return;
  callbacksInstalled = true;
  const registry = getDefaultAgentCallbackRegistry();
  registry.register('before_model', beforeModelHandler);
  registry.register('before_client', () => {});
}

export async function runInboundSemanticGuard(input: {
  text: string;
  snippets?: readonly string[];
  trustTier?: SemanticGuardTrustTier;
  agentRunId?: string;
}): Promise<void> {
  if (!featureFlags.aiSemanticGuardEnabled) return;
  installSemanticGuardCallbacks();
  const result = inspectInbound(input);
  await getDefaultAgentCallbackRegistry().run('before_model', {
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    resultOk: result.action === 'allow',
  });
  if (result.action === 'block') {
    throw new SemanticGuardBlockedError(result.reasons);
  }
}

export async function applyOutboundSemanticGuard(input: {
  text: string;
  agentRunId?: string;
}): Promise<string> {
  if (!featureFlags.aiSemanticGuardEnabled) return input.text;
  installSemanticGuardCallbacks();
  const result = inspectOutbound({ text: input.text });
  await getDefaultAgentCallbackRegistry().run('before_client', {
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
    resultOk: true,
  });
  return result.text;
}
