/// <reference types="vitest/config" />
import { mergeConfig } from 'vite';
import os from 'node:os';
import { desktopBundleGuard } from './scripts/vite-plugin-desktop-bundle-guard.ts';
import { createJieyuViteConfig } from './vite.shared.ts';

/** Vitest worker 数：默认取 CPU−1（上限 4）；OOM 时设 `VITEST_MAX_WORKERS=1` | Tune via env for speed vs RAM */
function resolveVitestMaxWorkers(): number {
  const raw = process.env.VITEST_MAX_WORKERS?.trim();
  if (raw !== undefined && raw !== '') {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1) return Math.min(8, n);
  }
  const ap = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return Math.min(4, Math.max(1, ap - 1));
}

/** 本地长跑可加 `VITEST_REPORTER=dot`；CI 自动附加 github-actions 注解 | See Vitest reporter docs */
function resolveVitestReporters(): string | string[] {
  const r = process.env.VITEST_REPORTER?.trim();
  if (r === 'dot' || r === 'verbose' || r === 'basic' || r === 'tap') return r;
  if (process.env.GITHUB_ACTIONS === 'true') return ['default', 'github-actions'];
  return 'default';
}

export default mergeConfig(
  createJieyuViteConfig({
    html: 'index.html',
    outDir: 'dist',
    pwa: false,
  }),
  {
    plugins: [desktopBundleGuard()],
    test: {
      /* Playwright 规格放在 tests/e2e 与 tests/e2e-desktop；勿让 Vitest 收集 | E2E specs run via Playwright only */
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'tests/e2e/**',
        'tests/e2e-desktop/**',
        'tests/e2e-sandbox/**',
        /* node:test script checks run via npm run test:project-files-scripts */
        'scripts/**/*.mjs',
      ],
      /* threads：单进程内跑用例，避免 forks 多进程各拉一份巨型 i18n 导致堆 OOM | Avoid per-fork duplicate heaps for large dict imports */
      pool: 'threads',
      maxWorkers: resolveVitestMaxWorkers(),
      reporters: resolveVitestReporters(),
      slowTestThreshold: 10_000,
      setupFiles: [
        'src/zodJitlessBootstrap.ts',
        'src/test/vitestWebApiPolyfillsSetup.ts',
        'src/test/vitestStoragePortSetup.ts',
        'src/test/vitestLocalStorageSetup.ts',
        'src/test/vitestJestDomSetup.ts',
        'src/test/vitestLanguageGeodataSetup.ts',
        'src/test/vitestI18nPreloadSetup.ts',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/**/*.d.ts',
          'src/data/generated/**',
          'src/main.tsx',
        ],
      },
    },
  },
);
