/**
 * Runs all architecture-guard sub-checks and aggregates failures.
 * Unlike shell `&&` chaining, every check runs even when earlier ones fail.
 */
import { spawnSync } from 'node:child_process';

const checks = [
  { label: 'architecture-guard:core', script: 'check:architecture-guard:core' },
  { label: 'doc-code-symbol-parity', script: 'check:doc-code-symbol-parity' },
  { label: 'timeline-single-host-entry', script: 'check:timeline-single-host-entry' },
  { label: 'fire-and-forget-governance', script: 'check:fire-and-forget-governance' },
  { label: 'transcription-text-telemetry-contract', script: 'check:transcription-text-telemetry-contract' },
  { label: 'ready-workspace-timeline-host', script: 'audit:ready-workspace-timeline-host' },
  { label: 'ai-chat-public-surface', script: 'check:ai-chat-public-surface' },
];

const failures = [];

console.log('[check-architecture-guard-aggregate] Running all sub-checks (no early exit)');

for (const check of checks) {
  const result = spawnSync('npm', ['run', '--silent', check.script], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failures.push(check.label);
  }
}

if (failures.length > 0) {
  console.error('[check-architecture-guard-aggregate] FAILED');
  for (const label of failures) {
    console.error(`- ${label}`);
  }
  process.exit(1);
}

console.log('[check-architecture-guard-aggregate] OK: all sub-checks passed');
