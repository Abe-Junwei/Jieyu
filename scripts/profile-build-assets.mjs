import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoot = process.cwd();
const assetsDir = path.join(workspaceRoot, 'dist', 'assets');
const warningThresholdBytes = 500 * 1024;

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
  const oversized = jsRows.filter((row) => row.size > warningThresholdBytes);

  console.log('[build-profile] Largest assets');
  for (const row of sorted.slice(0, 12)) {
    console.log(`- ${row.name}: ${formatKiB(row.size)}`);
  }

  console.log('[build-profile] Summary');
  console.log(`- js assets: ${jsRows.length}`);
  console.log(`- css assets: ${cssRows.length}`);
  console.log(`- oversized js assets (> ${formatKiB(warningThresholdBytes)}): ${oversized.length}`);

  if (oversized.length > 0) {
    console.log('[build-profile] Oversized js assets');
    for (const row of oversized) {
      console.log(`- ${row.name}: ${formatKiB(row.size)}`);
    }
  }
}

main().catch((error) => {
  console.error('[build-profile] Failed to summarize dist/assets', error);
  process.exitCode = 1;
});