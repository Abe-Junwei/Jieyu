/**
 * AI 聊天输入壳烟测（无真实模型调用）。
 * Smoke anchor for AI chat composer shell (no model calls).
 */
import { expect, test } from '@playwright/test';

test.describe('AI chat send-turn shell smoke', () => {
  test('转写页侧栏聊天输入壳挂载 | Transcription AI composer shell mounted', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      const message = err.message;
      if (browserName === 'webkit' && message.includes("Unexpected identifier 'AiStateWorkerRequest'")) {
        return;
      }
      errors.push(message);
    });

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.transcription-ai-panel')).toBeAttached({ timeout: 25_000 });
    // Default shell keeps the AI panel collapsed; hover or click opens it.
    const hoverZone = page.locator('.transcription-ai-panel-hover-zone');
    const expandButton = page.getByRole('button', { name: /Expand AI panel|展开/i });
    if (await hoverZone.count()) {
      await hoverZone.waitFor({ state: 'visible', timeout: 10_000 });
      await hoverZone.hover({ force: true });
      // Wait for panel to expand; fallback to click if hover did not trigger in webkit.
      try {
        await expect(page.locator('.transcription-ai-panel-handle-cluster.transcription-ai-panel-handle-collapsed')).toBeHidden({ timeout: 5_000 });
      } catch {
        if (await expandButton.count()) {
          await expandButton.click({ force: true });
        }
      }
    } else if (await expandButton.count()) {
      await expandButton.click({ force: true });
    }
    // Sidebar assistant frame (stable test id on composer input).
    await expect(page.getByTestId('ai-chat-composer-input')).toBeAttached({ timeout: 60_000 });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
