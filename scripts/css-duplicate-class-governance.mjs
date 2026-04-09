import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';

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

function collectClassNamesFromNode(node, classNames) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'ClassSelector' && typeof node.name === 'string') {
    classNames.add(node.name);
    return;
  }

  if (node.type === 'SelectorList' || node.type === 'Selector') {
    for (const child of node.children ?? []) collectClassNamesFromNode(child, classNames);
    return;
  }

  if (node.type === 'PseudoClassSelector' || node.type === 'PseudoElementSelector') {
    if (node.children) {
      for (const child of node.children) collectClassNamesFromNode(child, classNames);
    }
    return;
  }

  if (node.children) {
    for (const child of node.children) collectClassNamesFromNode(child, classNames);
  }
}

function extractRootDefinedClasses(selectorNode) {
  const classNames = new Set();
  for (const node of selectorNode.children ?? []) {
    if (node.type === 'Combinator') break;
    collectClassNamesFromNode(node, classNames);
  }
  return classNames;
}

function shouldIgnoreDuplicateClass(className) {
  return className.startsWith('is-')
    || className.startsWith('has-')
    || className === 'active'
    || className === 'primary'
    || className === 'secondary';
}

export function collectDuplicateClassStats({ rootDir, stylesDir }) {
  const cssFiles = walkFiles(stylesDir, (filePath) => filePath.endsWith('.css'));
  const classMap = new Map();

  for (const filePath of cssFiles) {
    const relPath = path.relative(rootDir, filePath).replaceAll(path.sep, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const ast = csstree.parse(content, { positions: false, parseValue: false });
    const seenInFile = new Set();

    csstree.walk(ast, (node) => {
      if (node.type !== 'Rule' || node.prelude?.type !== 'SelectorList') return;
      for (const selector of node.prelude.children) {
        for (const className of extractRootDefinedClasses(selector)) {
          if (shouldIgnoreDuplicateClass(className) || seenInFile.has(className)) continue;
          seenInFile.add(className);
          if (!classMap.has(className)) classMap.set(className, new Set());
          classMap.get(className).add(relPath);
        }
      }
    });
  }

  const duplicates = [...classMap.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([className, files]) => [className, [...files].sort()])
    .sort((left, right) => left[0].localeCompare(right[0]));

  return {
    duplicates,
    duplicateNames: duplicates.map(([className]) => className),
    classMap,
  };
}