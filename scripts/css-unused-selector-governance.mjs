import fs from 'node:fs';
import path from 'node:path';
import * as csstree from 'css-tree';

function walkFiles(dirPath, matcher) {
  if (!fs.existsSync(dirPath)) return [];
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

function recordClassToken(raw, used, knownCssClasses) {
  for (const match of raw.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)) {
    const token = match[0]?.trim();
    if (!token || !knownCssClasses.has(token)) continue;
    used.add(token);
  }
}

function recordTemplateLiteral(raw, used, knownCssClasses, dynamicPrefixes) {
  const staticOnly = raw.replace(/\$\{[^}]+\}/g, ' ');
  recordClassToken(staticOnly, used, knownCssClasses);

  for (const expressionMatch of raw.matchAll(/\$\{([^}]+)\}/g)) {
    for (const tokenMatch of (expressionMatch[1] ?? '').matchAll(/['"]([^'"]+)['"]/g)) {
      recordClassToken(tokenMatch[1], used, knownCssClasses);
    }
  }

  for (const match of raw.matchAll(/([A-Za-z_][A-Za-z0-9-]*)-\$\{/g)) {
    dynamicPrefixes.add(`${match[1]}-`);
  }
}

function recordQuotedAndTemplateTokens(raw, used, knownCssClasses, dynamicPrefixes) {
  for (const tokenMatch of raw.matchAll(/['"]([^'"]+)['"]/g)) {
    recordClassToken(tokenMatch[1], used, knownCssClasses);
  }

  for (const templateMatch of raw.matchAll(/`([^`]+)`/g)) {
    recordTemplateLiteral(templateMatch[1], used, knownCssClasses, dynamicPrefixes);
  }
}

function recordClassNamePrefix(raw, used, knownCssClasses) {
  const prefix = raw.trim();
  if (!prefix) return;
  for (const className of knownCssClasses) {
    if (className === prefix || className.startsWith(`${prefix}__`)) {
      used.add(className);
    }
  }
}

function isTestLikeFile(filePath) {
  const normalized = filePath.replaceAll(path.sep, '/');
  return /(?:^|\/)(?:tests|__tests__)\//.test(normalized)
    || /\.(?:test|spec)\.[jt]sx?$/.test(normalized);
}

function collectUsedClassesFromContent(content, used, knownCssClasses, dynamicPrefixes) {
  for (const match of content.matchAll(/className\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
    recordClassToken((match[1] ?? match[2] ?? '').trim(), used, knownCssClasses);
  }

  for (const match of content.matchAll(/className\s*=\s*\{`([\s\S]*?)`\}/g)) {
    recordTemplateLiteral((match[1] ?? '').trim(), used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/\b[A-Za-z0-9_]+ClassName\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
    recordClassToken((match[1] ?? match[2] ?? '').trim(), used, knownCssClasses);
  }

  for (const match of content.matchAll(/\b[A-Za-z0-9_]+ClassName\s*=\s*\{`([\s\S]*?)`\}/g)) {
    recordTemplateLiteral((match[1] ?? '').trim(), used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/\b(?:[A-Za-z0-9_]+ClassName|className)\s*=\s*\{([^{}]+)\}/g)) {
    recordQuotedAndTemplateTokens(match[1] ?? '', used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/className\s*=\s*\{\s*\[([\s\S]*?)\]\s*(?:\.filter\(\s*Boolean\s*\))?\s*\.join\(\s*['"][^'"]*['"]\s*\)\s*\}/g)) {
    recordQuotedAndTemplateTokens(match[1] ?? '', used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/\b(?:[A-Za-z0-9_]+ClassName|className)\s*:\s*(?:"([^"]+)"|'([^']+)'|`([\s\S]*?)`)/g)) {
    if (match[1] ?? match[2]) {
      recordClassToken((match[1] ?? match[2] ?? '').trim(), used, knownCssClasses);
      continue;
    }
    recordTemplateLiteral((match[3] ?? '').trim(), used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/\b(?:clsx|cn|joinClassNames)\(([^)]*)\)/g)) {
    recordQuotedAndTemplateTokens(match[1] ?? '', used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/classList\.(?:add|remove|toggle)\(([^\)]*)\)/g)) {
    const raw = match[1] ?? '';
    for (const tokenMatch of raw.matchAll(/['"]([^'"]+)['"]/g)) {
      recordClassToken(tokenMatch[1], used, knownCssClasses);
    }
  }

  for (const match of content.matchAll(/\.className\s*=\s*(?:"([^"]+)"|'([^']+)'|`([\s\S]*?)`)/g)) {
    if (match[1] ?? match[2]) {
      recordClassToken((match[1] ?? match[2] ?? '').trim(), used, knownCssClasses);
      continue;
    }
    recordTemplateLiteral((match[3] ?? '').trim(), used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/classNamePrefix\s*=\s*(?:"([^"]+)"|'([^']+)')/g)) {
    recordClassNamePrefix((match[1] ?? match[2] ?? '').trim(), used, knownCssClasses);
  }

  for (const match of content.matchAll(/querySelector(?:All)?\(([^\)]*)\)/g)) {
    recordClassToken(match[1] ?? '', used, knownCssClasses);
  }

  for (const match of content.matchAll(/closest\(([^\)]*)\)/g)) {
    recordClassToken(match[1] ?? '', used, knownCssClasses);
  }
}

function collectUsedClassesFromTestContent(content, used, knownCssClasses, dynamicPrefixes) {
  for (const match of content.matchAll(/['"]([^'"\n]+)['"]/g)) {
    recordClassToken(match[1] ?? '', used, knownCssClasses);
  }

  for (const match of content.matchAll(/`([^`]+)`/g)) {
    recordTemplateLiteral(match[1] ?? '', used, knownCssClasses, dynamicPrefixes);
  }

  for (const match of content.matchAll(/\/((?:\\.|[^\/\n])+?)\/[dgimsuvy]*/g)) {
    recordClassToken(match[1] ?? '', used, knownCssClasses);
  }
}

function collectUsedClassesFromBroadSourceStrings(content, used, knownCssClasses, dynamicPrefixes) {
  for (const match of content.matchAll(/['"]([^'"\n]+)['"]/g)) {
    recordClassToken(match[1] ?? '', used, knownCssClasses);
  }

  for (const match of content.matchAll(/`([^`]+)`/g)) {
    recordTemplateLiteral(match[1] ?? '', used, knownCssClasses, dynamicPrefixes);
  }
}

function isAutoAllowed(className) {
  return className.startsWith('is-')
    || className.startsWith('has-')
    || className.startsWith('maplibregl-')
    || className.startsWith('jieyu-material--')
    || className.startsWith('glass')
    || className.startsWith('skeleton-')
    || className === 'no-scrollbar'
    || className === 'spinner'
    || className.startsWith('spinner--')
    || className === 'active'
    || className === 'primary'
    || className === 'secondary';
}

function matchesDynamicPrefix(className, dynamicPrefixes) {
  for (const prefix of dynamicPrefixes) {
    if (className.startsWith(prefix)) return true;
  }
  return false;
}

export function collectUnusedSelectorStats({ rootDir, stylesDir, sourceRoots }) {
  const cssFiles = walkFiles(stylesDir, (filePath) => filePath.endsWith('.css'));
  const cssClasses = new Set();

  for (const filePath of cssFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ast = csstree.parse(content, { positions: false, parseValue: false });
    csstree.walk(ast, (node) => {
      if (node.type === 'ClassSelector') cssClasses.add(node.name);
    });
  }

  const used = new Set();
  const dynamicPrefixes = new Set();
  const sourceFiles = sourceRoots.flatMap((dirPath) => walkFiles(dirPath, (filePath) => /\.(ts|tsx|js|jsx|html)$/.test(filePath)));

  for (const filePath of sourceFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    collectUsedClassesFromContent(content, used, cssClasses, dynamicPrefixes);
    collectUsedClassesFromBroadSourceStrings(content, used, cssClasses, dynamicPrefixes);
    if (isTestLikeFile(filePath)) {
      collectUsedClassesFromTestContent(content, used, cssClasses, dynamicPrefixes);
    }
  }

  const unused = [...cssClasses]
    .sort()
    .filter((className) => !used.has(className) && !matchesDynamicPrefix(className, dynamicPrefixes) && !isAutoAllowed(className));

  return {
    cssClasses: [...cssClasses].sort(),
    usedClasses: used,
    dynamicPrefixes,
    unused,
  };
}