#!/usr/bin/env node
/**
 * #280 直连 db 棘轮守卫 | Direct-db import ratchet (#280).
 * 统计 src/ 下非测试模块中 `from '…/db'` 桶导入的文件数；只许减少，不许增加。
 * Counts non-test modules under src/ that import the `db` barrel. May only decrease.
 * 迁走模块后运行 `npm run check:direct-db-imports:write-baseline` 下调基线。
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
export const DIRECT_DB_IMPORT_RE = /from\s+['"][^'"]*\/db(?:\/index)?['"]/;
export const BASELINE_PATH = 'scripts/direct-db-imports-baseline.json';

function isTestFile(rel) {
  return /\.(test|spec)\./.test(rel) || rel.includes('/__tests__/');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    const dot = entry.lastIndexOf('.');
    if (dot >= 0 && SOURCE_EXTENSIONS.has(entry.slice(dot))) out.push(full);
  }
  return out;
}

export function listDirectDbModules(root = process.cwd()) {
  return walk(join(root, 'src'))
    .map((f) => relative(root, f).replace(/\\/g, '/'))
    .filter((rel) => !isTestFile(rel))
    .filter((rel) => DIRECT_DB_IMPORT_RE.test(readFileSync(join(root, rel), 'utf8')))
    .sort();
}

export function readBaseline(root = process.cwd()) {
  return JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')).maxDirectDbModules;
}

export function evaluateRatchet(count, baseline) {
  if (count > baseline) return { ok: false, message: `直连 db 模块 ${count} > 基线 ${baseline}：新代码请走存储接口（#274/#280）| direct-db modules increased` };
  if (count < baseline) return { ok: true, message: `直连 db 模块 ${count} < 基线 ${baseline}：请运行 write-baseline 下调基线 | lower the baseline` };
  return { ok: true, message: `直连 db 模块 ${count}（基线 ${baseline}）` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const modules = listDirectDbModules();
  if (process.argv.includes('--write-baseline')) {
    const prev = readBaseline();
    if (modules.length > prev) { console.error(`拒绝上调基线 ${prev} → ${modules.length}`); process.exit(1); }
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ maxDirectDbModules: modules.length, issue: '#280' }, null, 2)}\n`);
    console.log(`基线已写为 ${modules.length}`);
    process.exit(0);
  }
  if (process.argv.includes('--list')) for (const m of modules) console.log(m);
  const result = evaluateRatchet(modules.length, readBaseline());
  (result.ok ? console.log : console.error)(result.message);
  process.exit(result.ok ? 0 : 1);
}
