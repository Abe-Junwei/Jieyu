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
    const asset = rows.find((row) => budget.pattern.test(row.name));
    if (!asset) {
      return { label: budget.label, status: 'missing', maxBytes: budget.maxBytes };
    }
    return {
      label: budget.label,
      status: asset.size > budget.maxBytes ? 'over' : 'ok',
      asset,
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
    console.log(`- ${row.label}: ${formatKiB(row.asset.size)} / budget ${formatKiB(row.maxBytes)} ${statusLabel}`);
  }
}

main().catch((error) => {
  console.error('[build-profile] Failed to summarize dist/assets', error);
  process.exitCode = 1;
});