import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// 仅这些文件允许直接导入 TierDefinitionDocType | Only these files may directly import TierDefinitionDocType
const ALLOWED_IMPORT_FILES = new Set([
  'src/db/index.ts',
  'src/services/TierBridgeService.ts',
  'src/services/LinguisticService.constraints.ts',
  'src/services/LinguisticService.ts',
]);

const ALLOWED_IMPORT_PREFIXES = [
  'src/db/',
];

function isAllowedImportFile(relPath) {
  if (ALLOWED_IMPORT_FILES.has(relPath)) return true;
  return ALLOWED_IMPORT_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const dot = entry.lastIndexOf('.');
    const ext = dot >= 0 ? entry.slice(dot) : '';
    if (SOURCE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

function getScriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

function findTierTypeImports(content, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );

  const hits = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const clause = statement.importClause;
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;

    const hasTierType = clause.namedBindings.elements.some((element) => {
      if (element.propertyName) return element.propertyName.text === 'TierDefinitionDocType';
      return element.name.text === 'TierDefinitionDocType';
    });
    if (!hasTierType) continue;

    const start = statement.getStart(sourceFile);
    const loc = sourceFile.getLineAndCharacterOfPosition(start);
    hits.push({
      line: loc.line + 1,
      text: statement.getText(sourceFile).replace(/\s+/g, ' ').trim(),
    });
  }

  return hits;
}

function main() {
  const files = walk(SRC_DIR);
  const violations = [];
  const TEST_FILE_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    if (TEST_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix))) continue;
    if (isAllowedImportFile(rel)) continue;

    const content = readFileSync(file, 'utf8');
    const hits = findTierTypeImports(content, file);
    for (const hit of hits) {
      violations.push({
        file: rel,
        line: hit.line,
        text: hit.text,
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-tier-boundary-imports] OK: tier type imports are within allowed boundary files.');
    return;
  }

  console.error('[check-tier-boundary-imports] Forbidden TierDefinitionDocType imports found:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  console.error('\nAllowed files:');
  for (const file of ALLOWED_IMPORT_FILES) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

main();
