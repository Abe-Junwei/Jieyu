/**
 * AI 聊天输入壳烟测（无真实模型调用）。
 * Smoke anchor for AI chat composer shell (no model calls).
 */
import { expect, test } from '@playwright/test';

test.describe('AI chat send-turn shell smoke', () => {
  test('转写页侧栏聊天输入壳挂载 | Transcription AI composer shell mounted', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.transcription-ai-panel')).toBeAttached({ timeout: 25_000 });
    // Default shell keeps the AI panel collapsed; hover opens it (same as handle-cluster mouseenter).
    const hoverZone = page.locator('.transcription-ai-panel-hover-zone');
    if (await hoverZone.count()) {
      await hoverZone.hover({ force: true });
    } else {
      await page.getByRole('button', { name: /Expand AI panel|展开/i }).click({ force: true });
    }
    // Sidebar assistant frame (stable test id on composer input).
    await expect(page.getByTestId('ai-chat-composer-input')).toBeAttached({ timeout: 60_000 });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
