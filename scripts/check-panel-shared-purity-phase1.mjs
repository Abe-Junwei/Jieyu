import { spawnSync } from 'node:child_process';

function main() {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-css-layer-boundary.mjs'],
    { stdio: 'inherit' },
  );

  if (typeof result.status === 'number') {
    process.exit(result.status);
  }
  process.exit(1);
}

main();
