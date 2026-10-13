/**
 * Batch 4a 浏览器验证（隔离浏览器，Chromium）：
 * - T54(a) 主库：另一标签页升级 `jieyu` 时，本页关闭连接并提示刷新；刷新后检测到数据比应用新，拒绝打开并可导出原始恢复快照。
 * - T38 / T39 / T54(b) / T55：用合成库在真实 IndexedDB、Web Locks、BroadcastChannel 上验证闸门。
 * Batch 4a browser checks on real IndexedDB / Web Locks / BroadcastChannel.
 */
import { test, expect, type Page } from '@playwright/test';

import { trackPageErrors } from './_helpers/pageErrorFilter';

type Harness = {
  seedV1: (name: string, rows?: number) => Promise<void>;
  runGate: (options: {
    name: string;
    ledger: 'additive' | 'rewriting';
    quota: 'ample' | 'tiny';
    upgradeOpenMs?: number;
  }) => Promise<Record<string, unknown>>;
  nativeVersionOf: (name: string) => Promise<number | null>;
  holdConnection: (name: string) => Promise<void>;
  releaseConnection: (name: string) => void;
  openStaleAware: (name: string) => Promise<void>;
  staleState: (name: string) => { reasons: string[]; isOpen: boolean };
  snapshotWithFault: (
    name: string,
    fault: 'none' | 'quota' | 'abort',
  ) => Promise<Record<string, unknown>>;
  leaveUnverifiedSlot: (name: string) => Promise<void>;
  slots: (name: string) => Promise<Array<{ slot: string; state: string }>>;
  cleanupLeftovers: (name: string) => Promise<string[]>;
  drop: (name: string) => Promise<void>;
};

async function openApp(page: Page): Promise<void> {
  await page.goto('/transcription');
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(
    () => document.documentElement.dataset.jieyuE2eMigrationHarness === '1',
    null,
    {
      timeout: 15_000,
    },
  );
}

function call<K extends keyof Harness>(
  page: Page,
  method: K,
  ...args: Parameters<Harness[K]>
): Promise<Awaited<ReturnType<Harness[K]>>> {
  return page.evaluate(
    async ({ m, a }) => {
      const h = (
        globalThis as unknown as {
          __jieyuE2eMigration__: Record<string, (...x: unknown[]) => unknown>;
        }
      ).__jieyuE2eMigration__;
      return h[m]!(...a);
    },
    { m: method as string, a: args as unknown[] },
  ) as Promise<Awaited<ReturnType<Harness[K]>>>;
}

test.describe('Batch 4a 迁移框架 | Batch 4a migration framework', () => {
  test('T54(a) 主库：另一标签页升级后提示刷新；数据比应用新时拒绝打开并可导出恢复快照', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const errors = trackPageErrors(page);
    await openApp(page);
    // 确保主库连接已经打开 | make sure the main connection is open
    await page.evaluate(async () => {
      const dexie = (globalThis as unknown as { __jieyuDexie__: { open: () => Promise<unknown> } })
        .__jieyuDexie__;
      await dexie.open();
    });

    const pageB = await context.newPage();
    try {
      // 同源静态资源页：不加载应用 | same-origin static asset, the app is not loaded
      await pageB.goto('/favicon.svg');
      const upgraded = await pageB.evaluate(
        () =>
          new Promise<{ blocked: boolean; version: number }>((resolve, reject) => {
            let blocked = false;
            const probe = indexedDB.open('jieyu');
            probe.onsuccess = () => {
              const next = probe.result.version + 10;
              probe.result.close();
              const request = indexedDB.open('jieyu', next);
              request.onblocked = () => {
                blocked = true;
              };
              request.onsuccess = () => {
                const version = request.result.version;
                request.result.close();
                resolve({ blocked, version });
              };
              request.onerror = () => reject(request.error);
            };
            probe.onerror = () => reject(probe.error);
          }),
      );
      // 本页处理了 versionchange：升级没有被阻塞 | this page handled versionchange: not blocked
      expect(upgraded.blocked).toBe(false);
      expect(upgraded.version).toBe(20);
    } finally {
      await pageB.close();
    }

    const overlay = page.getByTestId('db-migration-gate-overlay');
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toHaveAttribute('data-gate-kind', 'stale');
    await expect(overlay).toContainText(/应用已更新|The app was updated/);

    await page.reload();
    await expect(overlay).toBeVisible({ timeout: 25_000 });
    await expect(overlay).toHaveAttribute('data-gate-kind', 'data-newer-than-app');
    // 没有被打开，也没有被降级或改动 | not opened, not downgraded
    expect(
      await page.evaluate(async () => {
        const list = await indexedDB.databases();
        return list.find((info) => info.name === 'jieyu')?.version ?? null;
      }),
    ).toBe(20);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('db-migration-gate-export-raw').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^jieyu-raw-recovery-jieyu-n20-.*\.zip$/);
    await expect(page.getByTestId('db-migration-gate-export-done')).toBeVisible();
    expect(
      errors.filter(
        (message) => !/newer than this app|DatabaseClosed|Database has been closed/i.test(message),
      ),
    ).toHaveLength(0);
  });

  test('T38 / T39：合成 v1 → v2 的 additive 与 rewriting 闸门', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page);
    const additive = 'jieyu-e2e-synth-additive';
    const rewriting = 'jieyu-e2e-synth-rewriting';

    await call(page, 'seedV1', additive);
    const ok = await call(page, 'runGate', { name: additive, ledger: 'additive', quota: 'ample' });
    expect(ok).toMatchObject({
      ok: true,
      path: 'upgraded',
      snapshotStatus: 'verified',
      warning: null,
      nativeAfter: 20,
    });
    await call(page, 'drop', additive);

    await call(page, 'seedV1', additive);
    const warned = await call(page, 'runGate', {
      name: additive,
      ledger: 'additive',
      quota: 'tiny',
    });
    expect(warned).toMatchObject({
      ok: true,
      path: 'upgraded',
      snapshotStatus: 'failed',
      nativeAfter: 20,
    });
    expect(String(warned.warning)).toMatch(/without a verified snapshot/);
    await call(page, 'drop', additive);

    await call(page, 'seedV1', rewriting);
    const blocked = await call(page, 'runGate', {
      name: rewriting,
      ledger: 'rewriting',
      quota: 'tiny',
    });
    expect(blocked).toMatchObject({ ok: false, reason: 'migration-blocked' });
    expect(await call(page, 'nativeVersionOf', rewriting)).toBe(10);
    const passed = await call(page, 'runGate', {
      name: rewriting,
      ledger: 'rewriting',
      quota: 'ample',
    });
    expect(passed).toMatchObject({
      ok: true,
      path: 'upgraded',
      snapshotStatus: 'verified',
      nativeAfter: 20,
    });
    await call(page, 'drop', rewriting);
  });

  test('T54：其他标签页处理 versionchange 时升级继续；不关闭连接时升级中止', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await openApp(page);
    const pageB = await context.newPage();
    try {
      await openApp(pageB);
      const cooperative = 'jieyu-e2e-synth-tabs-a';
      await call(page, 'seedV1', cooperative);
      await call(page, 'openStaleAware', cooperative);
      const upgraded = await call(pageB, 'runGate', {
        name: cooperative,
        ledger: 'additive',
        quota: 'ample',
      });
      expect(upgraded).toMatchObject({ ok: true, path: 'upgraded', nativeAfter: 20 });
      const stale = await call(page, 'staleState', cooperative);
      expect(stale.isOpen).toBe(false);
      expect(stale.reasons.length).toBeGreaterThan(0);
      await call(page, 'drop', cooperative);

      const stubborn = 'jieyu-e2e-synth-tabs-b';
      await call(page, 'seedV1', stubborn);
      await call(page, 'holdConnection', stubborn);
      const aborted = await call(pageB, 'runGate', {
        name: stubborn,
        ledger: 'additive',
        quota: 'ample',
        upgradeOpenMs: 2_000,
      });
      expect(aborted).toMatchObject({ ok: false, reason: 'upgrade-blocked-by-other-tabs' });
      // 关闭“旧标签页”后：挂起的请求被守卫中止，库仍是 v1 | after release the guard aborts the pending request
      await call(page, 'releaseConnection', stubborn);
      await expect.poll(() => call(page, 'nativeVersionOf', stubborn), { timeout: 5_000 }).toBe(10);
      await call(page, 'drop', stubborn);
    } finally {
      await pageB.close();
    }
  });

  test('T55：快照写入中途失败保留上一份已验证快照，残留在下次启动被清理', async ({ page }) => {
    test.setTimeout(60_000);
    await openApp(page);
    const name = 'jieyu-e2e-synth-snapshot';
    await call(page, 'seedV1', name, 30);
    expect(await call(page, 'snapshotWithFault', name, 'none')).toMatchObject({
      status: 'verified',
    });
    expect(await call(page, 'snapshotWithFault', name, 'quota')).toMatchObject({
      status: 'failed',
      kind: 'write-failed',
      storageFailure: 'quota-exceeded',
    });
    expect(await call(page, 'slots', name)).toEqual([{ slot: 'A', state: 'verified' }]);
    expect(await call(page, 'snapshotWithFault', name, 'abort')).toMatchObject({
      status: 'failed',
      storageFailure: 'aborted',
    });
    expect(await call(page, 'slots', name)).toEqual([{ slot: 'A', state: 'verified' }]);

    await call(page, 'leaveUnverifiedSlot', name);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.jieyuE2eMigrationHarness === '1',
    );
    expect(await call(page, 'cleanupLeftovers', name)).toEqual(['B']);
    expect(await call(page, 'slots', name)).toEqual([{ slot: 'A', state: 'verified' }]);
    await call(page, 'drop', name);
  });
});
