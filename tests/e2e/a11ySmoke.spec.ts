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
import { expandTranscriptionAiPanel } from './_helpers/expandTranscriptionAiPanel';

test.describe('Accessibility smoke | Axe', () => {
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
    const { violations } = await new AxeBuilder({ page })
      .include('.pnl-settings-modal')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('transcription: workspace + project hub regions have no axe violations', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    const { violations } = await new AxeBuilder({ page })
      .include('[data-testid="transcription-workspace-screen"]')
      .include('.left-rail-project-hub-root')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('transcription: ai chat panel has no axe violations when expanded', async ({ page }) => {
    await expandTranscriptionAiPanel(page);
    await expect(page.locator('.transcription-ai-panel')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('ai-chat-composer-input')).toHaveAttribute('aria-label', /.+/);
    const { violations } = await new AxeBuilder({ page })
      .include('.transcription-ai-panel')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
