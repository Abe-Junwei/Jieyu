import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TEST_FILE_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];
const SEGMENTATION_TABLES = new Set([
  'layer_segments',
  'layer_segment_contents',
  'segment_links',
  'layer_units',
  'layer_unit_contents',
  'unit_relations',
]);

// 允许直接访问 segmentation 真表的内部基础层文件 | Internal storage-layer files allowed to touch segmentation tables directly
const ALLOWED_FILES = new Set([
  'src/services/LayerUnitSegmentWriteService.ts',
  'src/services/LayerSegmentGraphService.ts',
  'src/services/LayerSegmentQueryService.ts',
  'src/services/LayerUnitRelationQueryService.ts',
  'src/services/LayerUnitSegmentWritePrimitives.ts',
]);

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

function isSegmentationTableAccess(node) {
  if (!ts.isPropertyAccessExpression(node)) return false;
  if (!SEGMENTATION_TABLES.has(node.name.text)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  return node.expression.name.text === 'dexie' || node.expression.name.text === 'collections';
}

/**
 * True when the access sits under a CallExpression `*.transaction(...)` (e.g. Dexie rw transaction).
 * Walk the full parent chain so nested `await db.dexie.layer_units.where(...)` inside the callback
 * is not flagged as a violation.
 */
function isTransactionScopeAccess(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current)
      && ts.isPropertyAccessExpression(current.expression)
      && current.expression.name.text === 'transaction'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function collectViolations(filePath, content) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );

  const violations = [];

  function visit(node) {
    if (isSegmentationTableAccess(node) && !isTransactionScopeAccess(node)) {
      const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        line: loc.line + 1,
        text: node.getText(sourceFile).replace(/\s+/g, ' ').trim(),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function main() {
  const files = walk(SRC_DIR);
  const violations = [];

  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    if (TEST_FILE_SUFFIXES.some((suffix) => rel.endsWith(suffix))) continue;
    if (ALLOWED_FILES.has(rel)) continue;

    const content = readFileSync(file, 'utf8');
    const hits = collectViolations(file, content);
    for (const hit of hits) {
      violations.push({
        file: rel,
        line: hit.line,
        text: hit.text,
      });
    }
  }

  if (violations.length === 0) {
    console.log('[check-segmentation-storage-boundary] OK: direct segmentation storage access is limited to storage-layer files.');
    return;
  }

  console.error('[check-segmentation-storage-boundary] Forbidden direct segmentation storage access found:\n');
  for (const item of violations) {
    console.error(`- ${item.file}:${item.line} -> ${item.text}`);
  }
  console.error('\nAllowed files:');
  for (const file of ALLOWED_FILES) {
    console.error(`- ${file}`);
  }
  console.error('\nNote: transaction scope declarations are allowed outside the whitelist.');
  process.exit(1);
}

main();