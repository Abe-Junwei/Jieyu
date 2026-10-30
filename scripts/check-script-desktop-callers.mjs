/**
 * Desktop script entry check.
 *
 * Uses the TypeScript parser on scripts/*.mjs, *.js, *.cjs, *.ts, and *.tsx.
 * It sees static imports, export-from, import(), and ssrLoadModule string
 * literals, including a second load in the same file. It follows one local
 * alias: import { createUnit as make }, const { createUnit: make }, and
 * const make = ns.createUnit. Quote style and space before "(" do not matter.
 * Data files are not parsed, so a path string in JSON is not an import.
 *
 * Not covered: import(variable), eval, computed property names, and aliases
 * copied through a second variable. A non-literal ssrLoadModule() is reported
 * because that call is the desktop loader. SQLite constructors require a literal
 * driver-specific read-only option, a runtime-checked synthetic file, or the
 * existing named legacy import. This checks connection capability, not SQL text.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const scriptsRoot = path.join(root, 'scripts');
const importScript = 'scripts/import-desktop-file.mjs';
const allowedDesktopModule = '/src/db/desktop/foreignImport.ts';
const sessionNames = new Set(['openDesktopSession', 'callDesktopSession']);
const folderEntry = 'importForeignFile';
const sqliteNames = new Set(['Database', 'DatabaseSync']);
// Existing named legacy import writes only into its validated empty staging destination.
const writableImport = 'scripts/apply-legacy-plan.mjs';
const writeStepNames = new Set([
  'writeRequiredFieldValues',
  'writeUnitFieldValues',
  'ensureProjectIdentity',
  'createUnit',
]);

function isScript(name) {
  return /\.(?:mjs|cjs|js|jsx|ts|tsx)$/.test(name);
}

function scriptKind(name) {
  if (name.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (name.endsWith('.ts')) return ts.ScriptKind.TS;
  if (name.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function isDesktopSpecifier(spec) {
  return spec.includes('/src/db/desktop/');
}

function allowedLoad(fileName, spec) {
  return fileName === importScript && spec === allowedDesktopModule;
}

function remember(bindings, local, canonical) {
  if (
    sessionNames.has(canonical) ||
    canonical === folderEntry ||
    writeStepNames.has(canonical) ||
    sqliteNames.has(canonical)
  ) {
    bindings.set(local, canonical);
  }
}

function bindDeclaration(node, bindings) {
  if (
    ts.isIdentifier(node.name) &&
    node.initializer &&
    ts.isPropertyAccessExpression(node.initializer) &&
    ts.isIdentifier(node.initializer.name)
  ) {
    remember(bindings, node.name.text, node.initializer.name.text);
  }
  if (!ts.isObjectBindingPattern(node.name)) return;
  for (const element of node.name.elements) {
    if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name)) continue;
    const imported =
      element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
    remember(bindings, element.name.text, imported);
  }
}

function literalSpecifier(node) {
  const arg = node.arguments[0];
  if (arg && ts.isStringLiteral(arg)) return arg.text;
  return undefined;
}

function isImportCall(node) {
  return node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function isSsrLoad(node) {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text === 'ssrLoadModule';
  return (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.name) &&
    expr.name.text === 'ssrLoadModule'
  );
}

function noteCall(expression, bindings, calls, fileName) {
  let canonical;
  if (ts.isIdentifier(expression)) canonical = bindings.get(expression.text) ?? expression.text;
  else if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
    canonical = expression.name.text;
  } else {
    return;
  }
  if (sessionNames.has(canonical)) calls.add('session');
  if (canonical === folderEntry && fileName !== importScript) calls.add('folder');
  if (writeStepNames.has(canonical)) calls.add('step');
}

function sqliteConnection(node, bindings, syntheticFiles, fileName) {
  const expression = node.expression;
  const name = ts.isIdentifier(expression)
    ? (bindings.get(expression.text) ?? expression.text)
    : ts.isPropertyAccessExpression(expression)
      ? expression.name.text
      : undefined;
  if (!sqliteNames.has(name) || fileName === writableImport) return false;
  const [file, options] = node.arguments ?? [];
  if (file && ts.isStringLiteral(file) && file.text === ':memory:') return false;
  if (
    file &&
    ts.isCallExpression(file) &&
    ts.isIdentifier(file.expression) &&
    syntheticFiles.has(file.expression.text)
  )
    return false;
  const flag = name === 'DatabaseSync' ? 'readOnly' : 'readonly';
  if (
    options &&
    ts.isObjectLiteralExpression(options) &&
    options.properties.every(ts.isPropertyAssignment)
  ) {
    const flags = options.properties.filter(
      (property) => property.name.getText().replace(/['"]/g, '') === flag,
    );
    if (flags.at(-1)?.initializer.kind === ts.SyntaxKind.TrueKeyword) return false;
  }
  return true;
}

function inspect(file) {
  const calls = new Set();
  const bindings = new Map();
  const syntheticFiles = new Set();
  let loads = false;
  if (!isScript(file.name)) return { loads, calls };
  const source = ts.createSourceFile(
    file.name,
    file.text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file.name),
  );
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (
        !allowedLoad(file.name, node.moduleSpecifier.text) &&
        isDesktopSpecifier(node.moduleSpecifier.text)
      ) {
        loads = true;
      }
      const spec = node.moduleSpecifier.text;
      const rawSqlite = spec === 'node:sqlite' || spec === 'better-sqlite3';
      const trustedSynthetic =
        path.posix.normalize(path.posix.join(path.posix.dirname(file.name), spec)) ===
        'scripts/lib/synthetic-write-target.mjs';
      if (rawSqlite && node.importClause?.name)
        bindings.set(
          node.importClause.name.text,
          spec === 'node:sqlite' ? 'DatabaseSync' : 'Database',
        );
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          if (element.isTypeOnly) continue;
          const imported = (element.propertyName ?? element.name).text;
          remember(bindings, element.name.text, imported);
          if (trustedSynthetic && imported === 'syntheticWriteFile')
            syntheticFiles.add(element.name.text);
        }
      }
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isDesktopSpecifier(node.moduleSpecifier.text) &&
      !allowedLoad(file.name, node.moduleSpecifier.text)
    ) {
      loads = true;
    }
    if (ts.isVariableDeclaration(node)) {
      bindDeclaration(node, bindings);
      if (ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
        const spec = literalSpecifier(node.initializer);
        if (spec === 'better-sqlite3') bindings.set(node.name.text, 'Database');
      }
    }
    if (
      (ts.isNewExpression(node) || ts.isCallExpression(node)) &&
      sqliteConnection(node, bindings, syntheticFiles, file.name)
    )
      calls.add('sql-write');
    if (ts.isCallExpression(node)) {
      noteCall(node.expression, bindings, calls, file.name);
      if (isImportCall(node) || isSsrLoad(node)) {
        const spec = literalSpecifier(node);
        if (spec === undefined && isSsrLoad(node)) loads = true;
        else if (spec && isDesktopSpecifier(spec) && !allowedLoad(file.name, spec)) loads = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { loads, calls };
}

export function scriptCallerViolations(files) {
  const violations = [];
  for (const file of files) {
    const found = inspect(file);
    if (found.calls.has('session')) violations.push(`${file.name} opens a desktop session`);
    if (found.calls.has('folder')) violations.push(`${file.name} imports a desktop folder`);
    if (found.loads) violations.push(`${file.name} loads a desktop module`);
    if (found.calls.has('sql-write'))
      violations.push(
        `${file.name} opens writable SQLite outside an authorized entry or synthetic target`,
      );
    if (found.calls.has('step')) violations.push(`${file.name} calls a desktop write step`);
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
  const quoted = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: 'const m = await server.ssrLoadModule("/src/db/desktop/units.ts"); m.createUnit (db, input);',
    },
  ]);
  const dynamic = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: "const m = await import('../src/db/desktop/units.ts'); m.createUnit (db, input);",
    },
  ]);
  const allowedQuotes = scriptCallerViolations([
    {
      name: importScript,
      text: 'ssrLoadModule("/src/db/desktop/foreignImport.ts")',
    },
  ]);
  const alias = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: "import { createUnit as makeUnit } from '../src/db/desktop/units.ts';\nmakeUnit(db, input);",
    },
  ]);
  const rebound = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: "const { createUnit: makeUnit } = await import('../src/db/desktop/units.ts');\nmakeUnit(db, input);",
    },
  ]);
  const hidden = scriptCallerViolations([
    { name: 'scripts/other.mjs', text: 'server.ssrLoadModule(moduleName);' },
  ]);
  const secondLoad = scriptCallerViolations([
    {
      name: importScript,
      text: "ssrLoadModule('/src/db/desktop/foreignImport.ts');\nssrLoadModule('/src/db/desktop/units.ts');",
    },
  ]);
  const imported = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: "import { createUnit } from '../src/db/desktop/units.ts';",
    },
  ]);
  const readonly = scriptCallerViolations([
    {
      name: 'scripts/other.mjs',
      text: 'const db = new DatabaseSync(file, { readOnly: true });\ndb.prepare("SELECT id FROM manuscripts").get();',
    },
  ]);
  const realSqlWrite = scriptCallerViolations([
    {
      name: 'scripts/real-project-write.mjs',
      text: "import { DatabaseSync as DB } from 'node:sqlite'; const db = new DB(process.argv[2]); db.exec('DELETE FROM units');",
    },
  ]);
  for (const [text, allowed] of [
    ["import DB from 'better-sqlite3'; new DB(file, { readonly: true });", true],
    ["const DB = require('better-sqlite3'); new DB(process.argv[2]);", false],
    ['new DatabaseSync(file, { readonly: true });', false],
    ['new DatabaseSync(file, { readOnly: true, ...options });', false],
    ['const syntheticWriteFile = x => x; new DatabaseSync(syntheticWriteFile(file));', false],
    [
      "import { syntheticWriteFile as checked } from './lib/synthetic-write-target.mjs'; new DatabaseSync(checked(file));",
      true,
    ],
  ]) {
    const found = scriptCallerViolations([{ name: 'scripts/connection-example.mjs', text }]);
    if ((found.length === 0) !== allowed)
      throw new Error('SQLite connection capability self-check failed');
  }
  if (realSqlWrite.length === 0) {
    throw new Error('a writable SQLite connection needs an authorized entry or a synthetic target');
  }
  if (
    opened.length !== 1 ||
    allowed.length !== 0 ||
    listed.length !== 0 ||
    other.length !== 1 ||
    loaded.length !== 1 ||
    step.length !== 1 ||
    quoted.length === 0 ||
    dynamic.length === 0 ||
    allowedQuotes.length !== 0 ||
    alias.length === 0 ||
    rebound.length === 0 ||
    hidden.length === 0 ||
    secondLoad.length === 0 ||
    imported.length === 0 ||
    readonly.length !== 0
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
