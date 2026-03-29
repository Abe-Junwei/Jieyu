import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildBudgets } from './build-budget-config.mjs';

const workspaceRoot = process.cwd();
const assetsDir = path.join(workspaceRoot, 'dist', 'assets');

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

async function listAssets() {
  const names = await readdir(assetsDir);
  return Promise.all(names.map(async (name) => {
    const filePath = path.join(assetsDir, name);
    const info = await stat(filePath);
    return { name, size: info.size };
  }));
}

async function main() {
  const assets = await listAssets();
  const failures = [];

  console.log('[build-budget] Checking critical bundle budgets');

  for (const budget of buildBudgets) {
    const matched = assets.find((asset) => budget.pattern.test(asset.name));
    if (!matched) {
      console.log(`- ${budget.label}: skipped (asset not found)`);
      continue;
    }

    const line = `- ${budget.label}: ${formatKiB(matched.size)} / budget ${formatKiB(budget.maxBytes)}`;
    if (matched.size > budget.maxBytes) {
      console.error(`${line} [FAIL]`);
      failures.push(`${budget.label} exceeded budget with ${matched.name}`);
      continue;
    }

    console.log(`${line} [OK]`);
  }

  if (failures.length > 0) {
    console.error('[build-budget] Budget check failed');
    failures.forEach((item) => console.error(`- ${item}`));
    process.exitCode = 1;
    return;
  }

  console.log('[build-budget] All critical bundle budgets passed');
}

main().catch((error) => {
  console.error('[build-budget] Failed to inspect dist/assets', error);
  process.exitCode = 1;
});