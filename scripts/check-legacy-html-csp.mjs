import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const templatePattern = /<template id="jieyu-csp">[\s\S]*?<\/template>/;
const startupPattern = /<script>[\s\S]*?<\/script>/;

export function cspParts(html) {
  return {
    template: html.match(templatePattern)?.[0] ?? '',
    startup: html.match(startupPattern)?.[0] ?? '',
  };
}

export function legacyHtmlCspMismatch(desktopHtml, legacyHtml) {
  const desktop = cspParts(desktopHtml);
  const legacy = cspParts(legacyHtml);
  const errors = [];
  if (!desktop.template || !legacy.template) errors.push('missing csp template');
  else if (desktop.template !== legacy.template) errors.push('csp template differs');
  if (!desktop.startup || !legacy.startup) errors.push('missing csp startup script');
  else if (desktop.startup !== legacy.startup) errors.push('csp startup script differs');
  return errors;
}

function main() {
  const repoRoot = process.cwd();
  const desktopHtml = readFileSync(join(repoRoot, 'index.html'), 'utf8');
  const legacyHtml = readFileSync(join(repoRoot, 'legacy/index.html'), 'utf8');
  const errors = legacyHtmlCspMismatch(desktopHtml, legacyHtml);
  if (errors.length === 0) {
    console.log('legacy html csp: match');
    return;
  }
  for (const error of errors) console.error(error);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
