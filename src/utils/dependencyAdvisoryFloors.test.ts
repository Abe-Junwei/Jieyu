/**
 * JY-22：依赖告警修复后的版本下限（锁文件中实际解析的版本）。
 * JY-22: version floors for fixed dependency advisories (versions actually resolved in the lockfile).
 *
 * maplibre-gl（GHSA-jrc7-96c5-q579，critical，<=6.4.0）只在 6.x 修复，已升到 6.13。
 * maplibre-gl (GHSA-jrc7-96c5-q579, critical, <=6.4.0) is only fixed in 6.x; upgraded to 6.13.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function versionTuple(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function atLeast(version: string, minimum: string): boolean {
  const [a, b] = [versionTuple(version), versionTuple(minimum)];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

const FLOORS: ReadonlyArray<{ name: string; minimum: string; advisory: string }> = [
  { name: 'react-router', minimum: '7.18.2', advisory: 'GHSA-qwww-vcr4-c8h2' },
  { name: 'react-router-dom', minimum: '7.18.2', advisory: 'GHSA-qwww-vcr4-c8h2' },
  { name: 'vitest', minimum: '4.1.11', advisory: 'GHSA-82fw-gwwq-j7x9' },
  { name: '@vitest/mocker', minimum: '4.1.11', advisory: 'GHSA-82fw-gwwq-j7x9' },
  { name: '@vitest/coverage-v8', minimum: '4.1.11', advisory: 'GHSA-82fw-gwwq-j7x9' },
  { name: 'maplibre-gl', minimum: '6.5.0', advisory: 'GHSA-jrc7-96c5-q579' },
];

describe('JY-22: dependency advisory floors', () => {
  const lock = JSON.parse(readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { version?: string }>;
  };

  it.each(FLOORS)('$name resolves to ≥ $minimum ($advisory fixed)', ({ name, minimum }) => {
    const entries = Object.entries(lock.packages).filter(
      ([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [, entry] of entries) {
      expect(atLeast(entry.version ?? '0', minimum)).toBe(true);
    }
  });
});
