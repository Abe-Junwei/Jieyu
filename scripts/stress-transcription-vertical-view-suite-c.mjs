#!/usr/bin/env node
/**
 * Stress / bisect helper for `TranscriptionTimelineVerticalView.suite-c.test.tsx`.
 *
 * Usage:
 *   node scripts/stress-transcription-vertical-view-suite-c.mjs
 *   node scripts/stress-transcription-vertical-view-suite-c.mjs --iterations=20 --heap-mb=8192 --pool=threads
 *   node scripts/stress-transcription-vertical-view-suite-c.mjs --per-test --heap-mb=8192
 *
 * Requires repo root cwd; uses `npx vitest` (same as npm scripts).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUITE = 'src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx';

const TEST_NAME_SUBSTRINGS = [
  'switches compact modes',
  'shows enabled recording action',
  'does not show STT',
  'resolves comparison playback',
  'navigateUnitFromInput when Tab',
  'translation stacks only',
  'layerId is missing in multi-transcription',
  'host binding mismatches',
  'layer link host is unresolved',
  'orphan-repair hint',
  'switches target header layer',
  'layer display styles menu',
  'vertical row rail context menu',
];

function parseArgs(argv) {
  let iterations = 10;
  let heapMb = 12288;
  /** @type {'forks' | 'threads'} */
  let pool = 'forks';
  let perTest = false;
  let logHeap = false;

  for (const arg of argv) {
    if (arg === '--per-test') perTest = true;
    if (arg === '--log-heap') logHeap = true;
    const mIt = /^--iterations=(\d+)$/.exec(arg);
    if (mIt) iterations = Number(mIt[1]);
    const mHeap = /^--heap-mb=(\d+)$/.exec(arg);
    if (mHeap) heapMb = Number(mHeap[1]);
    const mPool = /^--pool=(forks|threads)$/.exec(arg);
    if (mPool) pool = mPool[1];
  }

  return { iterations, heapMb, pool, perTest, logHeap };
}

function runVitest(heapMb, extraArgs) {
  const env = { ...process.env, NODE_OPTIONS: `--max-old-space-size=${heapMb}` };
  const args = ['vitest', 'run', SUITE, '--maxWorkers=1', ...extraArgs];
  const r = spawnSync('npx', args, {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const { iterations, heapMb, pool, perTest, logHeap } = parseArgs(process.argv.slice(2));

if (perTest) {
  const poolArgs = pool === 'forks' ? ['--pool=forks'] : [];
  const heapArgs = logHeap ? ['--logHeapUsage'] : [];
  for (const sub of TEST_NAME_SUBSTRINGS) {
    console.log(`\n>>> suite-c single filter: ${sub}\n`);
    runVitest(heapMb, [...poolArgs, ...heapArgs, '-t', sub]);
  }
  console.log('\n[stress-suite-c] per-test runs completed.\n');
  process.exit(0);
}

const poolArgs = pool === 'forks' ? ['--pool=forks'] : [];
const heapArgs = logHeap ? ['--logHeapUsage'] : [];

for (let i = 1; i <= iterations; i += 1) {
  console.log(`\n>>> suite-c stress ${i}/${iterations} (heap=${heapMb}MB pool=${pool})\n`);
  runVitest(heapMb, [...poolArgs, ...heapArgs, '--reporter=dot']);
}

console.log(`\n[stress-suite-c] OK: ${iterations} full-file run(s).\n`);
