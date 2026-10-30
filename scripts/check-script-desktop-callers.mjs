import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scriptsRoot = path.join(root, 'scripts');
const importScript = 'scripts/import-desktop-file.mjs';
const allowedDesktopModule = '/src/db/desktop/foreignImport.ts';
const sessionTokens = ['openDesktopSession', 'callDesktopSession', 'projectSession'];
const writeStepTokens = [
  'writeRequiredFieldValues(',
  'writeUnitFieldValues(',
  'ensureProjectIdentity(',
  'createUnit(',
];

export function scriptCallerViolations(files) {
  const violations = [];
  for (const file of files) {
    for (const token of sessionTokens) {
      if (file.text.includes(token)) violations.push(`${file.name} opens a desktop session`);
    }
    if (file.text.includes('importForeignFile') && file.name !== importScript) {
      violations.push(`${file.name} imports a desktop folder`);
    }
    const loaded = file.text.match(/ssrLoadModule\('(\/src\/db\/desktop\/[^']+)'\)/);
    if (loaded && !(file.name === importScript && loaded[1] === allowedDesktopModule)) {
      violations.push(`${file.name} loads a desktop module`);
    }
    for (const token of writeStepTokens) {
      if (file.text.includes(token)) violations.push(`${file.name} calls a desktop write step`);
    }
  }
  return violations;
}

function listScripts(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listScripts(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const name = path.relative(root, full).split(path.sep).join('/');
    if (name === 'scripts/check-script-desktop-callers.mjs') continue;
    files.push({
      name,
      text: fs.readFileSync(full, 'utf8'),
    });
  }
  return files;
}

function selfCheck() {
  const opened = scriptCallerViolations([
    { name: 'scripts/example.mjs', text: 'openDesktopSession(folder)' },
  ]);
  const allowed = scriptCallerViolations([
    {
      name: importScript,
      text: "ssrLoadModule('/src/db/desktop/foreignImport.ts'); importForeignFile({",
    },
  ]);
  const listed = scriptCallerViolations([
    {
      name: 'scripts/i18n-hardcoded-allowlist.json',
      text: '"pathPrefix": "src/db/desktop/foreignImport.ts"',
    },
  ]);
  const other = scriptCallerViolations([
    { name: 'scripts/other.mjs', text: 'importForeignFile({' },
  ]);
  const loaded = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: "ssrLoadModule('/src/db/desktop/units.ts')",
    },
  ]);
  const step = scriptCallerViolations([
    { name: 'scripts/other.mjs', text: 'createUnit(db, input)' },
  ]);
  if (
    opened.length !== 1 ||
    allowed.length !== 0 ||
    listed.length !== 0 ||
    other.length !== 1 ||
    loaded.length !== 1 ||
    step.length !== 1
  ) {
    console.error('[check-script-desktop-callers] self-check failed');
    process.exit(1);
  }
}

selfCheck();
const violations = scriptCallerViolations(listScripts(scriptsRoot, []));
if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  process.exit(1);
}
console.log('[check-script-desktop-callers] OK');
