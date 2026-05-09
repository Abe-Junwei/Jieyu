#!/usr/bin/env node
/**
 * 代码规模基线报告脚本
 * 输出 JSON 到 stdout，供文档引用和 CI 趋势追踪。
 *
 * 使用：node scripts/report-code-scale-baseline.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(rootDir, 'src');

function walkDir(dir, predicate) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, predicate));
    } else if (predicate(entry.name, fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split(/\r?\n/).length;
}

function isTsTsx(name) {
  return name.endsWith('.ts') || name.endsWith('.tsx');
}

function isTestFile(name) {
  return name.includes('.test.') || name.includes('.spec.');
}

function isGeneratedFile(name) {
  return name.includes('.generated.');
}

function countScripts() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    return Object.keys(pkg.scripts ?? {}).length;
  } catch {
    return 0;
  }
}

function countFlatFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && isTsTsx(e.name))
    .length;
}

const allTsFiles = walkDir(SRC_ROOT, (name) => isTsTsx(name));
const prodTsFiles = allTsFiles.filter((p) => !isTestFile(path.basename(p)));

const allFilesWithLines = allTsFiles.map((p) => ({ path: path.relative(rootDir, p), lines: countLines(p) }));
const prodFilesWithLines = allFilesWithLines
  .filter((f) => !isTestFile(path.basename(f.path)) && !isGeneratedFile(path.basename(f.path)))
  .sort((a, b) => b.lines - a.lines);

const baseline = {
  generatedAt: new Date().toISOString(),
  totals: {
    tsTsxFileCount: allTsFiles.length,
    tsTsxLineCount: allTsFiles.reduce((sum, p) => sum + countLines(p), 0),
    prodTsTsxFileCount: prodTsFiles.length,
    prodTsTsxLineCount: prodTsFiles.reduce((sum, p) => sum + countLines(p), 0),
    scriptCount: countScripts(),
  },
  directories: {
    hooks: {
      flatFileCount: countFlatFiles(path.join(SRC_ROOT, 'hooks')),
    },
    'ai/chat': {
      flatFileCount: countFlatFiles(path.join(SRC_ROOT, 'ai', 'chat')),
    },
  },
  topFiles: {
    production: prodFilesWithLines.slice(0, 20),
    all: allFilesWithLines.sort((a, b) => b.lines - a.lines).slice(0, 10),
  },
};

console.log(JSON.stringify(baseline, null, 2));
