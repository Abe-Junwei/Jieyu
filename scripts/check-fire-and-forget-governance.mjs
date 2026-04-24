#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * fireAndForget 治理守卫：调用点必须携带 context 与显式 policy。 | fireAndForget governance guard: callsites must include context and explicit policy.
 */

const HOOKS_USER_VISIBLE_ALLOWLIST = new Set([
  'src/hooks/useKeybindingActions.ts',
  'src/hooks/useLasso.ts',
  'src/hooks/useRecoveryBanner.ts',
  'src/hooks/useSidePaneSidebarDrag.ts',
  'src/hooks/useTimelineLaneTextDraftAutosave.ts',
  'src/hooks/useTimelineResize.ts',
  'src/hooks/useUnitOps.ts',
]);

const PAGES_BACKGROUND_ALLOWLIST = new Set([
  'src/pages/useTranscriptionAiController.ts',
  'src/pages/useTranscriptionSegmentBridgeController.ts',
]);

const VALID_POLICIES = new Set(['user-visible', 'background']);
const CONTEXT_LITERAL_RE = /context\s*:\s*(['"`])([^'"`]+)\1/s;
const POLICY_LITERAL_RE = /policy\s*:\s*(['"`])([^'"`]+)\1/s;
const CONTEXT_FORMAT_RE = /^src\/.+\.(ts|tsx):L\d+$/;

function listRuntimeFiles() {
  const output = execSync(
    'rg -l "fireAndForget\\(" src',
    { encoding: 'utf8' },
  ).trim();

  if (!output) return [];

  return output
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((filePath) => !/\.test\./.test(filePath))
    .filter((filePath) => filePath !== 'src/utils/fireAndForget.ts')
    .filter((filePath) => filePath !== 'src/pages/TranscriptionPage.structure.test.ts');
}

function scanCalls(text) {
  const calls = [];
  let cursor = 0;

  while (true) {
    const start = text.indexOf('fireAndForget(', cursor);
    if (start < 0) break;

    let i = start + 'fireAndForget('.length;
    let depth = 1;
    let quote = '';
    let escaped = false;

    while (i < text.length && depth > 0) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        i += 1;
        continue;
      }

      if (quote) {
        if (ch === quote) quote = '';
        i += 1;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        i += 1;
        continue;
      }

      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;

      i += 1;
    }

    const line = text.slice(0, start).split('\n').length;
    calls.push({
      line,
      callText: text.slice(start, i),
    });

    cursor = i;
  }

  return calls;
}

function isPolicyAllowedByPath(filePath, policy) {
  if (filePath.startsWith('src/hooks/')) {
    if (policy === 'background') return true;
    return policy === 'user-visible' && HOOKS_USER_VISIBLE_ALLOWLIST.has(filePath);
  }

  if (filePath.startsWith('src/pages/')) {
    if (policy === 'user-visible') return true;
    return policy === 'background' && PAGES_BACKGROUND_ALLOWLIST.has(filePath);
  }

  if (filePath.startsWith('src/components/')) {
    return policy === 'user-visible';
  }

  return true;
}

function parseContextAndPolicy(callText) {
  const contextMatch = callText.match(CONTEXT_LITERAL_RE);
  const policyMatch = callText.match(POLICY_LITERAL_RE);
  return {
    context: contextMatch?.[2],
    policy: policyMatch?.[2],
  };
}

function run() {
  const files = listRuntimeFiles();
  const missingContext = [];
  const missingPolicy = [];
  const invalidContext = [];
  const contextFileMismatch = [];
  const invalidPolicyLiteral = [];
  const policyMismatch = [];

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const calls = scanCalls(source);

    for (const call of calls) {
      const { context, policy } = parseContextAndPolicy(call.callText);

      if (!context) {
        missingContext.push(`${filePath}:${call.line}`);
      } else {
        if (!CONTEXT_FORMAT_RE.test(context)) {
          invalidContext.push(`${filePath}:${call.line} -> ${context}`);
        }
        const contextFile = context.split(':L')[0] ?? '';
        if (contextFile !== filePath) {
          contextFileMismatch.push(`${filePath}:${call.line} -> ${context}`);
        }
      }

      if (!policy) {
        missingPolicy.push(`${filePath}:${call.line}`);
      } else {
        if (!VALID_POLICIES.has(policy)) {
          invalidPolicyLiteral.push(`${filePath}:${call.line} -> ${policy}`);
        } else if (!isPolicyAllowedByPath(filePath, policy)) {
          policyMismatch.push(`${filePath}:${call.line} -> ${policy}`);
        }
      }
    }
  }

  if (
    missingContext.length > 0
    || missingPolicy.length > 0
    || invalidContext.length > 0
    || contextFileMismatch.length > 0
    || invalidPolicyLiteral.length > 0
    || policyMismatch.length > 0
  ) {
    if (missingContext.length > 0) {
      console.error('[fireAndForget-governance] Missing context at:');
      for (const v of missingContext) {
        console.error(`- ${v}`);
      }
    }

    if (invalidContext.length > 0) {
      console.error('[fireAndForget-governance] Invalid context format (expect src/**.ts[x]:L<line>) at:');
      for (const v of invalidContext) {
        console.error(`- ${v}`);
      }
    }

    if (contextFileMismatch.length > 0) {
      console.error('[fireAndForget-governance] Context file path does not match callsite file at:');
      for (const v of contextFileMismatch) {
        console.error(`- ${v}`);
      }
    }

    if (missingPolicy.length > 0) {
      console.error('[fireAndForget-governance] Missing explicit policy at:');
      for (const v of missingPolicy) {
        console.error(`- ${v}`);
      }
    }

    if (invalidPolicyLiteral.length > 0) {
      console.error('[fireAndForget-governance] Invalid policy literal (allowed: user-visible/background) at:');
      for (const v of invalidPolicyLiteral) {
        console.error(`- ${v}`);
      }
    }

    if (policyMismatch.length > 0) {
      console.error('[fireAndForget-governance] Policy violates directory whitelist at:');
      for (const v of policyMismatch) {
        console.error(`- ${v}`);
      }
    }

    process.exit(1);
  }

  console.log(`[fireAndForget-governance] OK (${files.length} files scanned)`);
}

run();
