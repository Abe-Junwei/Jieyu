import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Labels only: manuscript names and transcript contents require a local, explained exception. */
export function checkSelectors(text, filename = 'flow.ts') {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const bindings = new Map();
  const failures = [];
  const lines = text.split(/\r?\n/);
  function scopeOf(node) {
    while (node && !ts.isBlock(node) && !ts.isSourceFile(node)) node = node.parent;
    return node;
  }
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const scope = scopeOf(node.parent);
      if (!bindings.has(scope)) bindings.set(scope, new Map());
      bindings.get(scope).set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  function literal(node, seen = new Set()) {
    if (!node) return null;
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      seen.add(node.text);
      for (let scope = scopeOf(node.parent); scope; scope = scopeOf(scope.parent)) {
        if (bindings.get(scope)?.has(node.text))
          return literal(bindings.get(scope).get(node.text), seen);
      }
    }
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isRegularExpressionLiteral(node))
      return node.text
        .slice(1, node.text.lastIndexOf('/'))
        .replace(/\\u\{([\da-f]+)\}|\\u([\da-f]{4})/gi, (_, wide, narrow) =>
          String.fromCodePoint(parseInt(wide ?? narrow, 16)),
        )
        .replace(/\\[dDsSwWbB]/g, '');
    return null;
  }
  function property(node, key) {
    return node && ts.isObjectLiteralExpression(node)
      ? node.properties.find(
          (item) =>
            ts.isPropertyAssignment(item) && item.name.getText(source).replace(/['"]/g, '') === key,
        )?.initializer
      : undefined;
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const value =
        method === 'getByRole'
          ? property(node.arguments[1], 'name')
          : ['getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle', 'getByAltText'].includes(
                method,
              )
            ? node.arguments[0]
            : ['filter', 'locator'].includes(method)
              ? property(node.arguments[method === 'filter' ? 0 : 1], 'hasText')
              : undefined;
      const label = literal(value);
      if (label && /\p{Script=Han}/u.test(label) && !/[a-zA-Z]/.test(label)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const note = [lines[line - 1], lines[line]].join('\n');
        if (!/\/\/\s*desktop-selector-(?:data|locale):\s*\S.{3,}/u.test(note)) {
          failures.push(
            `${filename}:${line + 1}: ${method} has a Chinese-only label ${JSON.stringify(label)}; use the en-US label or a bilingual selector. Fixture text / explicit zh-CN assertions need a local desktop-selector-data: / desktop-selector-locale: reason.`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return failures;
}

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const failures = sources('tests/e2e-desktop').flatMap((file) =>
    checkSelectors(readFileSync(file, 'utf8'), file),
  );
  failures.forEach((failure) => console.error(failure));
  console.log(
    `[desktop-selectors] ${failures.length} violation(s); dynamic labels and fixture meaning still require review.`,
  );
  process.exitCode = failures.length ? 1 : 0;
}
