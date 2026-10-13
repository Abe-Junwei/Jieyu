/**
 * Axe-core 扫描：稳定壳层子树（见 `docs/execution/release-gates/e2e-a11y-axe-policy-2026-04-24.md`)。
 * 刻意收窄范围，避免第三方整页组件导致 flake。
 *
 * 未覆盖（需复杂交互或临时状态）：
 * - Toast（临时出现，难以稳定捕获）
 * - Voice agent widget（需 feature flag + 录音权限 + 展开状态）
 * - Segment list 侧边栏面板（需展开对应 tab + 存在 segment 数据）
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openTranscriptionChatWindow } from './_helpers/openTranscriptionChatWindow';
import { setupFieldProjectWithMediaAndSegments } from './_helpers/transcriptionProjectFlow';

test.describe('Accessibility smoke | Axe', () => {
  test('major routes reflow at a 200%-equivalent desktop viewport with no full-page axe violations', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 450 });
    const routes = [
      ['/', '.home-page'],
      ['/transcription', '[data-testid="transcription-workspace-screen"]'],
      ['/annotation', '.feature-availability-panel, .annotation-workspace'],
      ['/analysis', '.analysis-workspace'],
      ['/lexicon', '[data-testid="catalog-project-gate"]'],
      ['/assets/orthographies', '[data-testid="catalog-project-gate"]'],
    ] as const;

    for (const [route, readySelector] of routes) {
      await page.goto(route);
      await expect(page.locator(readySelector).first()).toBeVisible({ timeout: 25_000 });
      if (route === '/') await expect(page.locator('.home-page-loading')).toHaveCount(0);
      await expect(page.locator('main h1')).toHaveCount(1);
      const { clientWidth, scrollWidth } = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(scrollWidth, `${route}: document horizontal overflow`).toBeLessThanOrEqual(
        clientWidth + 2,
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations, `${route}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    }
  });

  test('project workspaces remain accessible at a 200%-equivalent desktop viewport', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.setViewportSize({ width: 640, height: 450 });
    for (const [route, readySelector] of [
      [
        `/transcription?textId=${project.textId}&mediaId=${project.mediaId}`,
        '[data-testid="transcription-workspace-screen"]',
      ],
      ['/lexicon', '.lexicon-workspace'],
      ['/assets/orthographies', '.om-shell'],
    ] as const) {
      await page.goto(route);
      await expect(page.locator(readySelector)).toBeVisible({ timeout: 25_000 });
      const { clientWidth, scrollWidth } = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(scrollWidth, `${route}: document horizontal overflow`).toBeLessThanOrEqual(
        clientWidth + 2,
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations, `${route}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
    }
  });

  test('home and transcription expose a page heading and no unnamed image icons', async ({
    page,
  }) => {
    for (const route of ['/', '/transcription']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(
        page.locator(
          'svg[role="img"]:not([aria-hidden="true"]):not([aria-label]):not(:has(title))',
        ),
      ).toHaveCount(0);
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    }
  });

  test('home: primary nav has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
    const { violations } = await new AxeBuilder({ page }).include('nav').analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('home: main landmark has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    const { violations } = await new AxeBuilder({ page }).include('main').analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('home: settings modal has no axe violations when open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
    const settingsButton = page.getByRole('button', { name: /Settings|设置/i });
    await expect(settingsButton).toBeVisible({ timeout: 10_000 });
    await settingsButton.click();
    await expect(page.locator('.pnl-settings-modal')).toBeVisible({ timeout: 10_000 });
    const { violations } = await new AxeBuilder({ page }).include('.pnl-settings-modal').analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('transcription: workspace + project hub regions have no axe violations', async ({
    page,
  }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    const { violations } = await new AxeBuilder({ page })
      .include('[data-testid="transcription-workspace-screen"]')
      .include('.left-rail-project-hub-root')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('transcription: ai chat window has no axe violations when open', async ({ page }) => {
    await openTranscriptionChatWindow(page);
    await expect(page.locator('.transcription-chat-window')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ai-chat-composer-input')).toHaveAttribute('aria-label', /.+/);
    const { violations } = await new AxeBuilder({ page })
      .include('.transcription-chat-window')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
