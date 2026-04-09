import {
  collectInlineStyleStats,
  readInlineStyleBaseline,
  writeInlineStyleBaseline,
} from './css-inline-style-governance.mjs';

const args = new Set(process.argv.slice(2));
const writeBaseline = args.has('--write-baseline');
const strict = !args.has('--no-strict');

function main() {
  const stats = collectInlineStyleStats();

  if (writeBaseline) {
    writeInlineStyleBaseline(stats);
    console.log(`[check-css-inline-style] baseline written (raw=${stats.rawTotal}, approved=${stats.approvedTotal}, governed=${stats.effectiveTotal})`);
    return;
  }

  const baseline = readInlineStyleBaseline();
  const failures = [...stats.whitelistFailures];

  if (baseline.total > 0 && stats.effectiveTotal > baseline.total) {
    failures.push(`governed inline style debt increased: ${stats.effectiveTotal} > baseline ${baseline.total}`);
  }

  for (const [file, count] of stats.effectiveFiles) {
    const allowed = typeof baseline.files[file] === 'number' ? baseline.files[file] : 0;
    if (count > allowed) {
      failures.push(`${file}: ${count} > baseline ${allowed}`);
    }
  }

  console.log(`[check-css-inline-style] raw inline style occurrences: ${stats.rawTotal} across ${stats.rawFiles.length} file(s)`);
  for (const [file, count] of stats.rawFiles.slice(0, 12)) {
    console.log(`  - ${file}: ${count}`);
  }

  if (stats.approvedTotal > 0) {
    console.log(`[check-css-inline-style] approved via whitelist: ${stats.approvedTotal} across ${stats.approvedFiles.length} file(s)`);
    for (const [file, count, reason] of stats.approvedFiles.slice(0, 12)) {
      console.log(`  - ${file}: ${count} (${reason})`);
    }
  }

  console.log(`[check-css-inline-style] governed inline debt: ${stats.effectiveTotal} across ${stats.effectiveFiles.length} file(s)`);
  for (const [file, count] of stats.effectiveFiles.slice(0, 12)) {
    console.log(`  - ${file}: ${count}`);
  }

  if (failures.length === 0) {
    console.log('[check-css-inline-style] no regressions vs baseline and whitelist');
    return;
  }

  console.error(`[check-css-inline-style] ${failures.length} regression(s) detected`);
  for (const item of failures.slice(0, 60)) {
    console.error(`  - ${item}`);
  }
  if (strict) process.exit(1);
}

main();
