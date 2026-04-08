import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STYLES_DIR = path.join(ROOT, 'src', 'styles');
const args = new Set(process.argv.slice(2));
const strict = !args.has('--no-strict');

const SHARED_CSS_REL = 'src/styles/shared.css';
const TRANSCRIPTION_ENTRY_REL = 'src/styles/transcription-entry.css';
const APP_FOUNDATION_REL = 'src/styles/app-foundation.css';

const FOUNDATION_FORBIDDEN = [
  /(?:^|\s)\.ai-/m,
  /(?:^|\s)\.note-(?:panel|popover)/m,
  /(?:^|\s)\.pdf-viewer-panel/m,
  /(?:^|\s)\.shortcuts-panel/m,
  /(?:^|\s)\.language-metadata-workspace/m,
  /(?:^|\s)\.transcription-side-pane/m,
  /(?:^|\s)\.layer-action-dialog/m,
  /(?:^|\s)\.voice-agent/m,
  /(?:^|\s)\.undo-history/m,
  /(?:^|\s)\.search-replace/m,
  /(?:^|\s)\.grounding-context/m,
];

const PANELS_FORBIDDEN = [
  /(?:^|\s)\.app-shell-/m,
  /(?:^|\s)\.transcription-layout/m,
  /(?:^|\s)\.transcription-waveform/m,
  /(?:^|\s)\.transcription-toolbar/m,
  /(?:^|\s)\.timeline-/m,
  /(?:^|\s)\.language-metadata-workspace/m,
  /(?:^|\s)\.lexicon-workspace/m,
  /(?:^|\s)\.orthography-workspace/m,
  /(?:^|\s)\.feature-availability/m,
];

const PAGES_FORBIDDEN = [
  /(?:^|\s)\.dialog-shell/m,
  /(?:^|\s)\.context-menu/m,
  /(?:^|\s)\.media-controls?/m,
  /(?:^|\s)\.waveform-display/m,
];

const ALLOWED_EXCEPTIONS = {
  foundation: new Set([
    'src/styles/foundation/panel-design-presets.css',
  ]),
  panels: new Set([
    'src/styles/panels/action-dialogs.css',
    'src/styles/panels/note-popover.css',
  ]),
  pages: new Set([
    'src/styles/pages/orthography-manager-panel.css',
  ]),
};

function walkFiles(dirPath, matcher) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath, matcher));
      continue;
    }
    if (entry.isFile() && matcher(nextPath)) files.push(nextPath);
  }
  return files.sort();
}

function collectImportTargets(content) {
  const imports = [];
  const re = /^@import\s+['\"]([^'\"]+)['\"];?/gm;
  let match;
  while ((match = re.exec(content))) {
    imports.push(match[1]);
  }
  return imports;
}

function main() {
  const failures = [];

  if (fs.existsSync(path.join(ROOT, SHARED_CSS_REL))) {
    failures.push(`${SHARED_CSS_REL} should be removed after split migration`);
  }

  const cssFiles = walkFiles(STYLES_DIR, (p) => p.endsWith('.css'));

  for (const filePath of cssFiles) {
    const relPath = path.relative(ROOT, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    if (relPath.startsWith('src/styles/foundation/') && !ALLOWED_EXCEPTIONS.foundation.has(relPath)) {
      for (const rule of FOUNDATION_FORBIDDEN) {
        if (rule.test(content)) {
          failures.push(`${relPath}: forbidden business selector pattern ${rule}`);
          break;
        }
      }
    }

    if (relPath.startsWith('src/styles/panels/') && !ALLOWED_EXCEPTIONS.panels.has(relPath)) {
      for (const rule of PANELS_FORBIDDEN) {
        if (rule.test(content)) {
          failures.push(`${relPath}: forbidden page-shell selector pattern ${rule}`);
          break;
        }
      }
    }

    if (relPath.startsWith('src/styles/pages/') && !ALLOWED_EXCEPTIONS.pages.has(relPath)) {
      for (const rule of PAGES_FORBIDDEN) {
        if (rule.test(content)) {
          failures.push(`${relPath}: forbidden foundation selector pattern ${rule}`);
          break;
        }
      }
    }

    if (content.includes("@import './shared.css'") || content.includes('@import "./shared.css"')) {
      failures.push(`${relPath}: shared.css import is no longer allowed`);
    }
  }

  const transcriptionEntry = fs.readFileSync(path.join(ROOT, TRANSCRIPTION_ENTRY_REL), 'utf8');
  for (const imported of collectImportTargets(transcriptionEntry)) {
    const allowed = imported === './panel-blocks.css'
      || imported === './ai-sidebar-entry.css'
      || imported.startsWith('./foundation/')
      || imported.startsWith('./panels/')
      || imported.startsWith('./pages/');
    if (!allowed) {
      failures.push(`${TRANSCRIPTION_ENTRY_REL}: invalid import target ${imported}`);
    }
  }

  const appFoundation = fs.readFileSync(path.join(ROOT, APP_FOUNDATION_REL), 'utf8');
  for (const imported of collectImportTargets(appFoundation)) {
    const allowed = imported === './global.css'
      || imported.startsWith('./foundation/')
      || imported === './pages/app-shell-layout.css';
    if (!allowed) {
      failures.push(`${APP_FOUNDATION_REL}: invalid import target ${imported}`);
    }
  }

  if (failures.length === 0) {
    console.log('[check-css-layer-boundary] OK: css layering boundaries are respected');
    return;
  }

  console.error(`[check-css-layer-boundary] Found ${failures.length} boundary violation(s):`);
  for (const item of failures) {
    console.error(`  - ${item}`);
  }

  if (strict) process.exit(1);
}

main();
