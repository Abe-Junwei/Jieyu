/**
 * 转写页键盘快捷键烟测：确保全局快捷键在可聚焦区域触发时不抛错。
 * Keyboard smoke on transcription: global shortcut path must not throw.
 */
import { test, expect } from '@playwright/test';

test.describe('转写键盘遥测烟测 | Transcription keyboard telemetry smoke', () => {
  test('全局快捷键路径可触发且无未捕获异常 | Global shortcut path fires without page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    // 避开 input/contenteditable，使全局快捷键处理器生效 | Avoid inputs so global keybindings run
    await page.locator('.left-rail-project-hub-root').click({ timeout: 10_000 });

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+N' : 'Control+Shift+N');

    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});
