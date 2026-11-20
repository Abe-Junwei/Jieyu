#!/usr/bin/env node
/**
 * 桌面渲染层不得到达旧区（ADR-0131）。值导入、动态 import()、以及 `import { type X }` 算边。
 * `import type` 会被删掉，不算。`.js` 源文件在图里。
 * Desktop renderer must not reach the legacy zone. Value imports, dynamic import(), and
 * `import { type X }` count. `import type` is erased and does not. `.js` sources are in the graph.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

function relPosix(root, file) {
  return relative(root, file).split(sep).join('/');
}

function isSourceName(name) {
  return /\.(tsx?|js)$/.test(name) && !name.endsWith('.d.ts');
}

function isTestPath(rel) {
  return /\.(test|spec)\.(tsx?|js)$/.test(rel);
}

function listSources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSources(full));
      continue;
    }
    if (!isSourceName(name)) continue;
    out.push(full);
  }
  return out;
}

export function desktopRoots(repoRoot) {
  const pages = readdirSync(join(repoRoot, 'src/pages'))
    .filter((name) => /^(Desktop|useDesktop).*\.tsx?$/.test(name) && !isTestPath(name))
    .map((name) => `src/pages/${name}`);
  const dirs = ['src/desktop', 'src/db/desktop', 'src/hooks/desktop'].flatMap((dir) =>
    listSources(join(repoRoot, dir))
      .map((file) => relPosix(repoRoot, file))
      .filter((rel) => !isTestPath(rel)),
  );
  return [...new Set([...pages, ...dirs])].sort();
}

export function readLegacyRoots(repoRoot = process.cwd()) {
  const zone = JSON.parse(readFileSync(join(repoRoot, 'scripts/legacy-zone.json'), 'utf8'));
  return zone.roots;
}

export function missingLegacyRoots(repoRoot, roots) {
  return roots.filter((root) => root.includes('/') && !existsSync(join(repoRoot, root)));
}

function isValueImport(node) {
  // `import type` is erased. `import { type X }` still emits `import {}` under verbatimModuleSyntax.
  if (node.isTypeOnly) return false;
  return node.importClause?.isTypeOnly !== true;
}

function isValueExport(node) {
  if (node.isTypeOnly) return false;
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return true;
  return clause.elements.some((element) => !element.isTypeOnly);
}

function specifiersOf(filePath) {
  const kind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.js')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  const specs = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && isValueImport(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && isValueExport(node)
    ) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

function asSource(repoRoot, candidate) {
  const name = candidate.split(sep).pop();
  if (!existsSync(candidate) || !isSourceName(name)) return null;
  const rel = relPosix(repoRoot, candidate);
  return isTestPath(rel) ? null : rel;
}

export function resolveImportSpec(repoRoot, fromFull, spec) {
  if (spec === 'dexie' || spec.startsWith('dexie/')) return 'dexie';
  let base = null;
  if (spec.startsWith('~/')) base = join(repoRoot, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFull), spec);
  if (base === null) return null;
  const direct = asSource(repoRoot, base);
  if (direct) return direct;
  const stripped = base.endsWith('.js') ? base.slice(0, -3) : base;
  for (const suffix of ['.ts', '.tsx', '.js']) {
    const hit = asSource(repoRoot, `${stripped}${suffix}`) ?? asSource(repoRoot, join(stripped, `index${suffix}`));
    if (hit) return hit;
  }
  return null;
}

export function collectImports(repoRoot, roots) {
  const map = new Map();
  const queue = [...roots];
  const seen = new Set();
  while (queue.length > 0) {
    const rel = queue.pop();
    if (rel === undefined || seen.has(rel) || rel === 'dexie') continue;
    seen.add(rel);
    const full = join(repoRoot, rel);
    if (!existsSync(full)) {
      map.set(rel, []);
      continue;
    }
    const deps = specifiersOf(full)
      .map((spec) => resolveImportSpec(repoRoot, full, spec))
      .filter((dep) => dep !== null);
    map.set(rel, deps);
    for (const dep of deps) if (!seen.has(dep)) queue.push(dep);
  }
  return map;
}

/** @returns {string[][]} one import chain per desktop root that reaches the legacy zone */
export function findBoundaryViolations(importsByFile, roots, legacyRoots) {
  const legacy = new Set(legacyRoots);
  const violations = [];
  for (const root of roots) {
    const seen = new Set();
    const queue = [[root]];
    while (queue.length > 0) {
      const chain = queue.shift();
      const file = chain[chain.length - 1];
      if (seen.has(file)) continue;
      seen.add(file);
      if (legacy.has(file)) {
        violations.push(chain);
        break;
      }
      for (const next of importsByFile.get(file) ?? []) {
        if (!seen.has(next)) queue.push([...chain, next]);
      }
    }
  }
  return violations;
}

function main() {
  const repoRoot = process.cwd();
  const roots = desktopRoots(repoRoot);
  const legacy = readLegacyRoots(repoRoot);
  const missing = missingLegacyRoots(repoRoot, legacy);
  if (missing.length > 0) {
    console.error(`legacy zone root missing:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }
  const violations = findBoundaryViolations(collectImports(repoRoot, roots), roots, legacy);
  if (violations.length === 0) {
    console.log(`desktop boundary: 0 (${roots.length} roots)`);
    return;
  }
  for (const chain of violations) console.error(chain.join('\n  → '));
  console.error(`desktop boundary: ${violations.length}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
