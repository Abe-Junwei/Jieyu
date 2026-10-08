/**
 * 切片 2B-B（rev5 4.2-9 / D11 / T48 / T51）浏览器端验收：
 * - 没有活动项目时，词典页只显示“请先选择项目”，不读不写目录表；
 * - 选定项目后新建词条，行归属该项目；另一项目看不到它；
 * - 数据库里没有任何 `system.*` 结构规则行（系统模板只在代码里）。
 * Slice 2B-B browser acceptance: the lexicon shows a project gate without an active project and
 * touches no catalog table; a new entry belongs to the active project and is invisible to another
 * project; the database never holds `system.*` structural rule rows.
 */
import { test, expect, type Page } from '@playwright/test';

import { waitForDexie } from './_helpers/transcriptionProjectFlow';

const RETURN_HINT_KEY = 'jieyu.workspace.transcriptionReturn.v1';

/**
 * 非首页路由上功能侧栏是浮层，1280px 下会盖住词条列表（既有布局，非 2B 引入）；先收起再操作。
 * On non-home routes the feature side pane overlays the main area and covers the entry list at
 * 1280px (pre-existing layout, not introduced by 2B); collapse it before interacting.
 */
async function collapseSidePane(page: Page): Promise<void> {
  const toggle = page.locator('.app-side-pane-collapse-toggle');
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator('.app-shell-side-pane-collapsed')).toHaveCount(1);
  }
}

async function setActiveProject(page: Page, textId: string): Promise<void> {
  await page.evaluate(
    ([key, id]) => sessionStorage.setItem(key, JSON.stringify({ textId: id })),
    [RETURN_HINT_KEY, textId] as const,
  );
}

type CatalogCounts = { lexemes: number; speakers: number; structural: number; systemRows: number };

async function readCatalogCounts(page: Page): Promise<CatalogCounts> {
  return page.evaluate(async () => {
    type Table = {
      count: () => Promise<number>;
      toArray: () => Promise<Array<{ id: string }>>;
    };
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          lexemes: Table;
          speakers: Table;
          structural_rule_profiles: Table;
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const structuralRows = await dexie.structural_rule_profiles.toArray();
    return {
      lexemes: await dexie.lexemes.count(),
      speakers: await dexie.speakers.count(),
      structural: structuralRows.length,
      systemRows: structuralRows.filter((row) => row.id.startsWith('system.')).length,
    };
  });
}

async function readLexemeOwners(page: Page): Promise<Array<{ headword: string; textId: string }>> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          lexemes: {
            toArray: () => Promise<
              Array<{ kind?: string; textId: string; entry?: { headword?: string } }>
            >;
          };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = await dexie.lexemes.toArray();
    return rows
      .filter((row) => row.kind !== 'resource')
      .map((row) => ({ headword: row.entry?.headword ?? '', textId: row.textId }));
  });
}

test.describe('Slice 2B-B catalog ownership | 切片 2B-B 目录归属', () => {
  test('T48: without an active project the lexicon shows the gate and writes nothing', async ({
    page,
  }) => {
    await page.goto('/lexicon');
    await expect(page.getByTestId('catalog-project-gate')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('lexicon-entry-create')).toHaveCount(0);
    await waitForDexie(page);
    expect(await readCatalogCounts(page)).toEqual({
      lexemes: 0,
      speakers: 0,
      structural: 0,
      systemRows: 0,
    });

    await page.getByTestId('catalog-project-gate-select').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('T48/T51: a new entry belongs to the active project only; no system rows are stored', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await setActiveProject(page, 'text-2b-owner-a');
    await page.goto('/lexicon');
    await expect(page.getByTestId('catalog-project-gate')).toHaveCount(0);
    await expect(page.getByTestId('lexicon-entry-create')).toBeVisible({ timeout: 25_000 });
    await collapseSidePane(page);
    await page.getByTestId('lexicon-entry-create').click();
    await page.getByTestId('lexicon-entry-headword').fill('owned-dog');
    await page.getByTestId('lexicon-entry-save').click();
    await expect(page.getByTestId('lexicon-workspace-list')).toContainText('owned-dog', {
      timeout: 20_000,
    });
    await waitForDexie(page);
    expect(await readLexemeOwners(page)).toEqual([
      { headword: 'owned-dog', textId: 'text-2b-owner-a' },
    ]);

    // 另一个项目看不到这个词条，读取也不会写入 | Another project cannot see it; reading writes nothing
    await setActiveProject(page, 'text-2b-owner-b');
    await page.goto('/lexicon');
    await expect(page.getByTestId('lexicon-entry-create')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('lexicon-workspace-list')).not.toContainText('owned-dog');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('lexicon-entry-create')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('lexicon-workspace-list')).not.toContainText('owned-dog');
    expect(await readLexemeOwners(page)).toEqual([
      { headword: 'owned-dog', textId: 'text-2b-owner-a' },
    ]);
    const counts = await readCatalogCounts(page);
    expect(counts.systemRows).toBe(0);
    expect(counts.structural).toBe(0);
  });
});
