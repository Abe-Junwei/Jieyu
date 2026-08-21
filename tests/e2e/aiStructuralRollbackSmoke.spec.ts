/**
 * 结构性回滚相关 UI 锚点烟测（无真实模型调用）。
 * Smoke anchor for AI structural rollback shell (no model calls).
 */
import { expect, test } from '@playwright/test';

test.describe('AI structural rollback smoke', () => {
  test('转写工作台加载且 AI 侧栏壳挂载 | Transcription workspace and AI panel mounted', async ({ page, browserName }) => {
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
    await expect(page.locator('.transcription-chat-window-trigger')).toBeAttached({ timeout: 25_000 });
    await expect(page.getByTestId('transcription-acoustic-inspector-toggle')).toBeAttached({
      timeout: 25_000,
    });

    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
