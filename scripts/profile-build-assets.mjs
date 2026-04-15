import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildBudgets, profileLargeJsHintThresholdBytes } from './build-budget-config.mjs';

const workspaceRoot = process.cwd();
const assetsDir = path.join(workspaceRoot, 'dist', 'assets');

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function classifyAsset(name) {
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.js')) return 'js';
  return 'other';
}

async function main() {
  const names = await readdir(assetsDir);
  const rows = await Promise.all(
    names.map(async (name) => {
      const fullPath = path.join(assetsDir, name);
      const info = await stat(fullPath);
      return {
        name,
        size: info.size,
        type: classifyAsset(name),
      };
    }),
  );

  const sorted = rows.sort((left, right) => right.size - left.size);
  const jsRows = sorted.filter((row) => row.type === 'js');
  const cssRows = sorted.filter((row) => row.type === 'css');
  const largeJsHints = jsRows.filter((row) => row.size > profileLargeJsHintThresholdBytes);
  const budgetStatuses = buildBudgets.map((budget) => {
    const matched = rows.filter((row) => budget.pattern.test(row.name));
    if (matched.length === 0) {
      return { label: budget.label, status: 'missing', maxBytes: budget.maxBytes };
    }
    const largest = matched.reduce((a, b) => (a.size >= b.size ? a : b));
    const worst = matched.some((row) => row.size > budget.maxBytes) ? 'over' : 'ok';
    return {
      label: budget.label,
      status: worst,
      asset: largest,
      matchedCount: matched.length,
      maxBytes: budget.maxBytes,
    };
  });
  const overBudget = budgetStatuses.filter((row) => row.status === 'over');

  console.log('[build-profile] Largest assets');
  for (const row of sorted.slice(0, 12)) {
    console.log(`- ${row.name}: ${formatKiB(row.size)}`);
  }

  console.log('[build-profile] Summary');
  console.log(`- js assets: ${jsRows.length}`);
  console.log(`- css assets: ${cssRows.length}`);
  console.log(`- large js hint assets (> ${formatKiB(profileLargeJsHintThresholdBytes)}): ${largeJsHints.length}`);
  console.log(`- budget breaches: ${overBudget.length}`);

  if (largeJsHints.length > 0) {
    console.log('[build-profile] Large js hint assets (profile only)');
    for (const row of largeJsHints) {
      console.log(`- ${row.name}: ${formatKiB(row.size)}`);
    }
  }

  console.log('[build-profile] Budget-tracked assets');
  for (const row of budgetStatuses) {
    if (row.status === 'missing') {
      console.log(`- ${row.label}: skipped (asset not found)`);
      continue;
    }
    const statusLabel = row.status === 'over' ? '[OVER]' : '[OK]';
    const multi = row.matchedCount > 1 ? ` (${row.matchedCount} files)` : '';
    console.log(`- ${row.label}: ${formatKiB(row.asset.size)} / budget ${formatKiB(row.maxBytes)} ${statusLabel}${multi}`);
  }
}

main().catch((error) => {
  console.error('[build-profile] Failed to summarize dist/assets', error);
  process.exitCode = 1;
});