import assert from 'node:assert/strict';
import { test } from 'node:test';
import { excessLegacyViolations } from './check-segmentation-storage-boundary.mjs';

test('legacy limits allow existing accesses but reject the next one', () => {
  const accesses = [
    { file: 'legacy.ts' },
    { file: 'legacy.ts' },
    { file: 'new.ts' },
  ];
  assert.deepEqual(excessLegacyViolations(accesses, new Map([['legacy.ts', 1]])), [
    accesses[1],
    accesses[2],
  ]);
});
