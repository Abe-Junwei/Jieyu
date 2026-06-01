/**
 * Axe-core 扫描：稳定壳层子树（见 `docs/execution/release-gates/e2e-a11y-axe-policy-2026-04-24.md`）。
 * 刻意收窄范围，避免第三方整页组件导致 flake。
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

  test('transcription: workspace + project hub regions have no axe violations', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    const { violations } = await new AxeBuilder({ page })
      .include('[data-testid="transcription-workspace-screen"]')
      .include('.left-rail-project-hub-root')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('transcription: ai chat composer has no axe violations when attached', async ({ page }) => {
    await expandTranscriptionAiPanel(page);
    await expect(page.getByTestId('ai-chat-composer-input')).toBeAttached({ timeout: 60_000 });
    const { violations } = await new AxeBuilder({ page })
      .include('[data-testid="ai-chat-composer-input"]')
      .analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
