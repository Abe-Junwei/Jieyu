#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const EXPECTED_FILES = new Set([
  'src/hooks/ai/useAiChat.backgroundMemory.ts',
  'src/hooks/ai/useAiChat.messagePinning.ts',
  'src/hooks/ai/useAiChat.sendTurnPreflight.ts',
]);

const REQUIRED_GUARDS = new Map([
  ['src/hooks/ai/useAiChat.backgroundMemory.ts', /resolveAiChatBackgroundMemorySandboxPolicy\(/],
  ['src/hooks/ai/useAiChat.messagePinning.ts', /resolveAiChatSessionSidecarSandboxPolicy\(/],
  ['src/hooks/ai/useAiChat.sendTurnPreflight.ts', /resolveAiChatSessionSidecarSandboxPolicy\(/],
]);

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runListCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
      return '';
    }
    throw error;
  }
}

function listDirectiveCallFiles() {
  const output = commandExists('rg')
    ? runListCommand('rg -l "applyUserDirectivesToSessionMemory\\(" src/hooks')
    : commandExists('git')
      ? runListCommand('git grep -l -E "applyUserDirectivesToSessionMemory\\(" -- src/hooks')
      : runListCommand('grep -R -l -E "applyUserDirectivesToSessionMemory\\(" src/hooks');

  if (!output) return [];
  return output
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((filePath) => !/\.test\./.test(filePath))
    .filter((filePath) => !/\.spec\./.test(filePath));
}

function run() {
  const foundFiles = listDirectiveCallFiles();
  const foundSet = new Set(foundFiles);

  const unexpectedFiles = foundFiles.filter((filePath) => !EXPECTED_FILES.has(filePath));
  const missingFiles = Array.from(EXPECTED_FILES).filter((filePath) => !foundSet.has(filePath));
  const missingGuards = [];

  for (const [filePath, guardRegex] of REQUIRED_GUARDS) {
    if (!foundSet.has(filePath)) continue;
    const source = readFileSync(filePath, 'utf8');
    if (!guardRegex.test(source)) {
      missingGuards.push(filePath);
    }
  }

  if (unexpectedFiles.length > 0 || missingFiles.length > 0 || missingGuards.length > 0) {
    if (unexpectedFiles.length > 0) {
      console.error('[session-sidecar-entrypoints] Found unregistered directive write entrypoints:');
      for (const filePath of unexpectedFiles) {
        console.error(`- ${filePath}`);
      }
      console.error('Action: add matrix row and sandbox wiring before merging (F4 Batch B governance).');
    }

    if (missingFiles.length > 0) {
      console.error('[session-sidecar-entrypoints] Expected directive write entrypoints missing from scan:');
      for (const filePath of missingFiles) {
        console.error(`- ${filePath}`);
      }
      console.error('Action: verify refactor did not remove required paths or update this guard intentionally.');
    }

    if (missingGuards.length > 0) {
      console.error('[session-sidecar-entrypoints] Missing sandbox policy guard in directive write entrypoint file(s):');
      for (const filePath of missingGuards) {
        console.error(`- ${filePath}`);
      }
      console.error('Action: ensure resolveAiChat*SandboxPolicy is wired before session memory mutation.');
    }

    process.exit(1);
  }

  console.log(`[session-sidecar-entrypoints] OK (${foundFiles.length} directive write entrypoint files registered)`);
}

run();