import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SHARED_PATH = join(ROOT, 'src/styles/shared.css');

const FORBIDDEN_RULES = [
  { label: 'note-panel block', pattern: /^\.note-panel/m },
  { label: 'note-popover block', pattern: /^\.note-popover/m },
  { label: 'prompt-lab block', pattern: /^\.ai-chat-prompt-lab/m },
  { label: 'replay-detail block', pattern: /^\.ai-chat-replay-panel/m },
  { label: 'pdf-viewer block', pattern: /^\.pdf-viewer-panel/m },
  { label: 'shortcuts-panel block', pattern: /^\.shortcuts-panel/m },
  { label: 'focus-mode container rule', pattern: /^\.transcription-screen-focus-mode/m },
  { label: 'focus-mode badge', pattern: /^\.focus-mode-badge/m },
];

function main() {
  const content = readFileSync(SHARED_PATH, 'utf8');
  const violations = FORBIDDEN_RULES.filter((rule) => rule.pattern.test(content));

  if (violations.length === 0) {
    console.log('[check-panel-shared-purity-phase1] OK: shared.css is free of phase1 business panel roots.');
    return;
  }

  console.error('[check-panel-shared-purity-phase1] Found forbidden phase1 selectors in shared.css:\n');
  for (const violation of violations) {
    console.error(`- ${violation.label}`);
  }
  process.exit(1);
}

main();