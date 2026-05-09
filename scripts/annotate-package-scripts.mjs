import fs from 'node:fs';
import path from 'node:path';

const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const scripts = pkg.scripts;
const ordered = {};

// 定义分组顺序和匹配规则（前缀匹配）
const groups = [
  { name: 'Dev \u0026 Build', prefixes: ['dev', 'build', 'preview', 'regression:vite'] },
  { name: 'Type Check \u0026 Lint', prefixes: ['typecheck', 'lint', 'format'] },
  { name: 'Test', prefixes: ['test:', 'test:e2e'] },
  { name: 'Data \u0026 Seeds', prefixes: ['data:', 'verify:', 'acoustic:'] },
  { name: 'CSS Checks', prefixes: ['check:css', 'lint:css', 'test:visual-css', 'check:css-architecture', 'check:panel'] },
  { name: 'i18n Checks', prefixes: ['check:i18n', 'check:locale'] },
  { name: 'Architecture Guard', prefixes: ['check:architecture', 'check:panel-foundation'] },
  { name: 'Docs Governance', prefixes: ['check:docs', 'report:docs'] },
  { name: 'Release Evidence', prefixes: ['report:release', 'export:release'] },
  { name: 'Agent Evals', prefixes: ['check:agent', 'report:agent'] },
  { name: 'Plan \u0026 Execute', prefixes: ['check:plan', 'report:plan'] },
  { name: 'Performance', prefixes: ['perf:', 'report:perf'] },
  { name: 'Code Scale', prefixes: ['report:code', 'check:code'] },
  { name: 'Gate', prefixes: ['gate:'] },
  { name: 'Cleanup', prefixes: ['clean', 'check:knip', 'check:depcheck'] },
  { name: 'Other', prefixes: [] }, // 兜底
];

// 收集已分配的 key
const assigned = new Set();

for (const group of groups) {
  const groupKeys = [];
  for (const key of Object.keys(scripts)) {
    if (assigned.has(key)) continue;
    if (group.prefixes.length === 0) {
      // 兜底：所有未分配的
      groupKeys.push(key);
    } else if (group.prefixes.some((p) => key.startsWith(p))) {
      groupKeys.push(key);
    }
  }
  if (groupKeys.length === 0) continue;

  // 添加分组注释
  ordered[`// === ${group.name} ===`] = '';
  for (const key of groupKeys) {
    ordered[key] = scripts[key];
    assigned.add(key);
  }
}

// 处理遗漏
for (const key of Object.keys(scripts)) {
  if (!assigned.has(key)) {
    ordered[key] = scripts[key];
  }
}

pkg.scripts = ordered;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✅ 已重新组织 ${Object.keys(scripts).length} 条 scripts，按 ${groups.filter((g) => g.name !== 'Other').length} 个功能域分组。`);
console.log('⚠️  请 review diff 后提交。运行 `git diff package.json` 确认格式正确。');
